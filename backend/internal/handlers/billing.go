package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
)

// Pro pricing (INR, in rupees). These are display values echoed to the client;
// the authoritative charge amount lives in the Razorpay Plan the account owner
// created. Keep the two in sync.
const (
	proMonthlyINR = 333
	proYearlyINR  = 3333

	// Billing cycles Razorpay will charge before a subscription completes.
	// Monthly → ~10 years of months; yearly → 10 years. Effectively "until
	// cancelled" from the user's point of view.
	monthlyTotalCount = 120
	yearlyTotalCount  = 10
)

// annualDiscountPct is derived, not hard-coded, so it can never drift from the
// prices above: monthly*12 vs yearly.
func annualDiscountPct() int {
	full := proMonthlyINR * 12
	if full == 0 {
		return 0
	}
	// Round (not truncate) so it matches the frontend's rounded fallback — a
	// truncating int() would show 16% here but 17% when billing is disabled.
	return int(float64(full-proYearlyINR)/float64(full)*100.0 + 0.5)
}

// razorpayWebhook is the slice of a Razorpay subscription webhook we parse.
// Named (not anonymous) so the parsing can be exercised by a test fixture.
type razorpayWebhook struct {
	Event   string `json:"event"`
	Payload struct {
		Subscription struct {
			Entity struct {
				ID         string `json:"id"`
				Status     string `json:"status"`
				CurrentEnd int64  `json:"current_end"`
				Notes      struct {
					ClerkID string `json:"clerk_id"`
				} `json:"notes"`
			} `json:"entity"`
		} `json:"subscription"`
	} `json:"payload"`
}

// planForEvent maps a Razorpay subscription lifecycle event to the plan it
// should produce. "" means "no plan change — record status only". Pure, so the
// billing decision is unit-testable without a DB or the network.
func planForEvent(event string) string {
	switch event {
	case "subscription.activated", "subscription.charged", "subscription.resumed", "subscription.authenticated":
		return "pro"
	case "subscription.cancelled", "subscription.completed", "subscription.expired", "subscription.halted", "subscription.paused":
		return "free"
	default:
		return ""
	}
}

// BillingConfig is a PUBLIC endpoint the subscription page reads to render
// prices and decide whether the upgrade button is live. The Key ID is a
// publishable value (it ships in Razorpay Checkout on the client), so returning
// it is safe; the secret never leaves the server.
func (h *Handler) BillingConfig(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"enabled":  h.bill.Enabled(),
		"provider": "razorpay",
		"keyId":    h.bill.KeyID,
		"currency": "INR",
		"monthly":  fiber.Map{"amount": proMonthlyINR},
		"yearly":   fiber.Map{"amount": proYearlyINR, "discountPct": annualDiscountPct()},
	})
}

// CreateSubscription (auth) creates a Razorpay subscription for the signed-in
// user and stores its id so the webhook can later map events back to the user.
// Returns the subscription id + publishable key so the client can open Razorpay
// Checkout. The user is NOT Pro yet — that happens on the activation webhook.
func (h *Handler) CreateSubscription(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	if !h.bill.Enabled() {
		return fiber.NewError(fiber.StatusServiceUnavailable, "billing is not configured yet")
	}

	var body struct {
		Interval string `json:"interval"` // 'monthly' | 'yearly'
	}
	_ = c.Bind().JSON(&body)
	if body.Interval != "yearly" {
		body.Interval = "monthly"
	}
	totalCount := monthlyTotalCount
	if body.Interval == "yearly" {
		totalCount = yearlyTotalCount
	}

	ctx := context.Background()

	// Ensure a users row exists (keyed by clerk_id) so the update below lands.
	var userID string
	if err := h.db.QueryRow(ctx, `
		INSERT INTO users (clerk_id) VALUES ($1)
		ON CONFLICT (clerk_id) DO UPDATE SET updated_at = NOW()
		RETURNING id::text
	`, uid).Scan(&userID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "could not prepare your account")
	}

	sub, err := h.bill.CreateSubscription(ctx, body.Interval, totalCount, map[string]string{
		"clerk_id": uid,
		"user_id":  userID,
	})
	if err != nil {
		slog.Error("billing: create subscription failed", "err", err, "clerk_id", uid)
		return fiber.NewError(fiber.StatusBadGateway, "could not start checkout — please try again")
	}

	// Record the pending subscription. plan stays 'free' until the activation
	// webhook confirms payment — never grant Pro on create.
	if _, err := h.db.Exec(ctx, `
		UPDATE users SET
			billing_provider    = 'razorpay',
			subscription_id     = $2,
			subscription_status = $3,
			billing_interval    = $4,
			updated_at          = NOW()
		WHERE clerk_id = $1
	`, uid, sub.ID, sub.Status, body.Interval); err != nil {
		slog.Error("billing: store subscription failed", "err", err, "clerk_id", uid)
		// The subscription exists on Razorpay's side; the webhook will still
		// reconcile via notes. Don't hard-fail the checkout.
	}

	return c.JSON(fiber.Map{
		"subscriptionId": sub.ID,
		"keyId":          h.bill.KeyID,
		"shortUrl":       sub.ShortURL,
		"interval":       body.Interval,
	})
}

// BillingStatus (auth) returns the signed-in user's current billing state for
// the subscription page.
func (h *Handler) BillingStatus(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ctx := context.Background()
	var (
		plan      string
		status    *string
		interval  *string
		subID     *string
		periodEnd *time.Time
	)
	err := h.db.QueryRow(ctx, `
		SELECT COALESCE(plan,'free'), subscription_status, billing_interval,
		       subscription_id, current_period_end
		FROM users WHERE clerk_id = $1
	`, uid).Scan(&plan, &status, &interval, &subID, &periodEnd)
	if err != nil {
		// No row yet → treat as a fresh free user rather than erroring.
		return c.JSON(fiber.Map{"plan": "free", "enabled": h.bill.Enabled()})
	}

	out := fiber.Map{"plan": plan, "enabled": h.bill.Enabled()}
	if status != nil {
		out["status"] = *status
	}
	if interval != nil {
		out["interval"] = *interval
	}
	if subID != nil {
		out["hasSubscription"] = true
	}
	if periodEnd != nil {
		out["currentPeriodEnd"] = periodEnd.UTC().Format(time.RFC3339)
	}
	return c.JSON(out)
}

// CancelSubscription (auth) cancels the user's Razorpay subscription at the end
// of the current cycle, so they keep Pro until the period they've paid for ends.
func (h *Handler) CancelSubscription(c fiber.Ctx) error {
	uid := clerkID(c)
	if uid == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "no user")
	}
	ctx := context.Background()
	var subID *string
	if err := h.db.QueryRow(ctx, `SELECT subscription_id FROM users WHERE clerk_id = $1`, uid).Scan(&subID); err != nil || subID == nil || *subID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "no active subscription to cancel")
	}
	if !h.bill.Enabled() {
		return fiber.NewError(fiber.StatusServiceUnavailable, "billing is not configured")
	}

	sub, err := h.bill.CancelSubscription(ctx, *subID, true /* at cycle end */)
	if err != nil {
		slog.Error("billing: cancel failed", "err", err, "clerk_id", uid, "sub", *subID)
		return fiber.NewError(fiber.StatusBadGateway, "could not cancel — please try again or contact support")
	}
	_, _ = h.db.Exec(ctx, `UPDATE users SET subscription_status = $2, updated_at = NOW() WHERE clerk_id = $1`, uid, sub.Status)

	return c.JSON(fiber.Map{"ok": true, "status": sub.Status, "message": "Your plan stays active until the end of the current billing period."})
}

// BillingWebhook is the PUBLIC Razorpay webhook. It verifies the HMAC signature,
// dedupes by event id, and flips the user's plan based on the subscription's
// lifecycle. This is the ONLY place `plan` is promoted to 'pro' — never on the
// client, never on subscription-create.
func (h *Handler) BillingWebhook(c fiber.Ctx) error {
	raw := c.Body()
	sig := c.Get("X-Razorpay-Signature")
	if !h.bill.VerifyWebhookSignature(raw, sig) {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid signature")
	}

	var evt razorpayWebhook
	if err := json.Unmarshal(raw, &evt); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid payload")
	}

	ctx := context.Background()

	// Idempotency: Razorpay's event id is delivered in the X-Razorpay-Event-Id
	// header. If we've already recorded it, acknowledge and stop.
	eventID := c.Get("X-Razorpay-Event-Id")
	if eventID != "" {
		var exists bool
		_ = h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM billing_events WHERE event_id = $1)`, eventID).Scan(&exists)
		if exists {
			return c.JSON(fiber.Map{"ok": true, "duplicate": true})
		}
	}
	_, _ = h.db.Exec(ctx, `
		INSERT INTO billing_events (provider, event_id, event_type, payload)
		VALUES ('razorpay', NULLIF($1,''), $2, $3)
		ON CONFLICT (event_id) DO NOTHING
	`, eventID, evt.Event, string(raw))

	sub := evt.Payload.Subscription.Entity
	if sub.ID == "" {
		// Not a subscription event we handle (e.g. a payment.* ping) — ack.
		return c.JSON(fiber.Map{"ok": true, "ignored": evt.Event})
	}

	// Decide the resulting plan from the event (pure, unit-tested).
	plan := planForEvent(evt.Event)

	var periodEnd *time.Time
	if sub.CurrentEnd > 0 {
		t := time.Unix(sub.CurrentEnd, 0).UTC()
		periodEnd = &t
	}

	// Match the user by subscription_id first; fall back to the clerk_id in
	// notes if the create-time store lost the row for any reason.
	if plan != "" {
		_, err := h.db.Exec(ctx, `
			UPDATE users SET
				plan                = $2,
				subscription_status = $3,
				current_period_end  = COALESCE($4, current_period_end),
				updated_at          = NOW()
			WHERE subscription_id = $1 OR clerk_id = $5
		`, sub.ID, plan, sub.Status, periodEnd, sub.Notes.ClerkID)
		if err != nil {
			slog.Error("billing: webhook plan update failed", "err", err, "event", evt.Event, "sub", sub.ID)
			return fiber.NewError(fiber.StatusInternalServerError, "update failed")
		}
	} else {
		_, _ = h.db.Exec(ctx, `
			UPDATE users SET subscription_status = $2,
				current_period_end = COALESCE($3, current_period_end), updated_at = NOW()
			WHERE subscription_id = $1 OR clerk_id = $4
		`, sub.ID, sub.Status, periodEnd, sub.Notes.ClerkID)
	}

	slog.Info("billing: webhook processed", "event", evt.Event, "sub", sub.ID, "plan", plan)
	return c.JSON(fiber.Map{"ok": true})
}
