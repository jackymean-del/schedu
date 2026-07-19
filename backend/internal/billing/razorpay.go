// Package billing isolates all payment-provider logic. Today the only provider
// is Razorpay; the surface here (Config, CreateSubscription, Cancel, webhook
// verification) is deliberately provider-agnostic so a second provider (e.g.
// Stripe) can be added behind the same handler layer without touching it.
//
// No third-party SDK: Razorpay's REST API is plain HTTPS with HTTP Basic auth,
// and webhook verification is an HMAC-SHA256 of the raw body. Using the stdlib
// keeps go.mod untouched.
package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const razorpayAPI = "https://api.razorpay.com/v1"

// Config is read once from the environment. When KeyID/KeySecret are empty the
// whole billing feature is considered DISABLED and every entry point degrades
// gracefully (the app keeps working, upgrade is simply unavailable) — so the
// service is safe to deploy before the Razorpay account exists.
type Config struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	PlanMonthly   string // Razorpay plan id for Pro Monthly
	PlanYearly    string // Razorpay plan id for Pro Yearly
}

// LoadConfig reads billing config from the environment.
func LoadConfig() Config {
	return Config{
		KeyID:         strings.TrimSpace(os.Getenv("RAZORPAY_KEY_ID")),
		KeySecret:     strings.TrimSpace(os.Getenv("RAZORPAY_KEY_SECRET")),
		WebhookSecret: strings.TrimSpace(os.Getenv("RAZORPAY_WEBHOOK_SECRET")),
		PlanMonthly:   strings.TrimSpace(os.Getenv("RAZORPAY_PLAN_MONTHLY")),
		PlanYearly:    strings.TrimSpace(os.Getenv("RAZORPAY_PLAN_YEARLY")),
	}
}

// Enabled reports whether real billing can run. False → the app hides/greys the
// upgrade action instead of erroring.
func (c Config) Enabled() bool { return c.KeyID != "" && c.KeySecret != "" }

// PlanID maps a billing interval to the configured Razorpay plan id.
func (c Config) PlanID(interval string) string {
	if interval == "yearly" {
		return c.PlanYearly
	}
	return c.PlanMonthly
}

// Subscription is the slice of a Razorpay subscription we care about.
type Subscription struct {
	ID         string `json:"id"`
	Status     string `json:"status"`
	ShortURL   string `json:"short_url"`
	PlanID     string `json:"plan_id"`
	CurrentEnd int64  `json:"current_end"` // unix seconds; 0 until first charge
	CustomerID string `json:"customer_id"`
}

// CreateSubscription creates a Razorpay subscription for the given interval and
// returns it. `totalCount` is the number of billing cycles Razorpay will charge
// before the subscription completes (monthly → many years of months, yearly →
// several years); the caller picks a sensible horizon.
func (c Config) CreateSubscription(ctx context.Context, interval string, totalCount int, notes map[string]string) (*Subscription, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("billing not configured")
	}
	planID := c.PlanID(interval)
	if planID == "" {
		return nil, fmt.Errorf("no Razorpay plan id configured for interval %q", interval)
	}
	body := map[string]any{
		"plan_id":         planID,
		"total_count":     totalCount,
		"customer_notify": 1,
		"notes":           notes,
	}
	var sub Subscription
	if err := c.do(ctx, http.MethodPost, "/subscriptions", body, &sub); err != nil {
		return nil, err
	}
	return &sub, nil
}

// FetchSubscription returns the current provider-side state of a subscription.
func (c Config) FetchSubscription(ctx context.Context, id string) (*Subscription, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("billing not configured")
	}
	var sub Subscription
	if err := c.do(ctx, http.MethodGet, "/subscriptions/"+id, nil, &sub); err != nil {
		return nil, err
	}
	return &sub, nil
}

// CancelSubscription cancels a subscription. atCycleEnd=true lets the user keep
// Pro until the paid period ends; false cancels immediately.
func (c Config) CancelSubscription(ctx context.Context, id string, atCycleEnd bool) (*Subscription, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("billing not configured")
	}
	cae := 0
	if atCycleEnd {
		cae = 1
	}
	var sub Subscription
	if err := c.do(ctx, http.MethodPost, "/subscriptions/"+id+"/cancel", map[string]any{"cancel_at_cycle_end": cae}, &sub); err != nil {
		return nil, err
	}
	return &sub, nil
}

// VerifyWebhookSignature checks the X-Razorpay-Signature header against an
// HMAC-SHA256 of the raw request body keyed by the webhook secret. Constant-time
// comparison. Returns false (never panics) when the secret is unset.
func (c Config) VerifyWebhookSignature(body []byte, signature string) bool {
	if c.WebhookSecret == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(c.WebhookSecret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// do performs an authenticated Razorpay API call and decodes the JSON response
// into out. Non-2xx responses surface the provider error message.
func (c Config) do(ctx context.Context, method, path string, payload any, out any) error {
	var reader io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, razorpayAPI+path, reader)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.KeyID, c.KeySecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Surface Razorpay's { "error": { "description": ... } } if present.
		var e struct {
			Error struct {
				Description string `json:"description"`
			} `json:"error"`
		}
		if json.Unmarshal(respBody, &e) == nil && e.Error.Description != "" {
			return fmt.Errorf("razorpay: %s", e.Error.Description)
		}
		return fmt.Errorf("razorpay: unexpected status %d", resp.StatusCode)
	}
	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return err
		}
	}
	return nil
}
