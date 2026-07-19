package handlers

import (
	"encoding/json"
	"testing"
)

func TestPlanForEvent(t *testing.T) {
	cases := map[string]string{
		// Grant Pro.
		"subscription.activated":     "pro",
		"subscription.charged":       "pro",
		"subscription.resumed":       "pro",
		"subscription.authenticated": "pro",
		// Revoke Pro.
		"subscription.cancelled": "free",
		"subscription.completed": "free",
		"subscription.expired":   "free",
		"subscription.halted":    "free",
		"subscription.paused":    "free",
		// No plan change — status only.
		"subscription.pending": "",
		"subscription.updated": "",
		"payment.captured":     "",
		"":                     "",
	}
	for event, want := range cases {
		if got := planForEvent(event); got != want {
			t.Errorf("planForEvent(%q) = %q, want %q", event, got, want)
		}
	}
}

func TestAnnualDiscountPct(t *testing.T) {
	// ₹333*12 = ₹3,996 vs ₹3,333 → 16.59% → rounds to 17 (must match the
	// frontend's rounded fallback so enabled/disabled states agree).
	if got := annualDiscountPct(); got != 17 {
		t.Fatalf("annualDiscountPct() = %d, want 17", got)
	}
}

// A realistic Razorpay `subscription.charged` webhook body. Parsing this proves
// our named struct matches Razorpay's documented payload shape, so real events
// will map to a user (via subscription id / notes.clerk_id) and to Pro.
const chargedFixture = `{
  "entity": "event",
  "event": "subscription.charged",
  "contains": ["subscription", "payment"],
  "payload": {
    "subscription": {
      "entity": {
        "id": "sub_00000000000001",
        "entity": "subscription",
        "plan_id": "plan_pro_yearly",
        "status": "active",
        "current_start": 1861920000,
        "current_end": 1893456000,
        "notes": { "clerk_id": "user_abc123", "user_id": "11111111-1111-1111-1111-111111111111" }
      }
    },
    "payment": { "entity": { "id": "pay_00000000000001", "amount": 333300, "currency": "INR" } }
  }
}`

func TestWebhookFixtureParsesAndMapsToPro(t *testing.T) {
	var evt razorpayWebhook
	if err := json.Unmarshal([]byte(chargedFixture), &evt); err != nil {
		t.Fatalf("failed to parse Razorpay fixture: %v", err)
	}

	sub := evt.Payload.Subscription.Entity
	if evt.Event != "subscription.charged" {
		t.Errorf("event = %q", evt.Event)
	}
	if sub.ID != "sub_00000000000001" {
		t.Errorf("subscription id = %q", sub.ID)
	}
	if sub.Status != "active" {
		t.Errorf("status = %q", sub.Status)
	}
	if sub.CurrentEnd != 1893456000 {
		t.Errorf("current_end = %d", sub.CurrentEnd)
	}
	if sub.Notes.ClerkID != "user_abc123" {
		t.Errorf("notes.clerk_id = %q — webhook could not map back to a user", sub.Notes.ClerkID)
	}
	if got := planForEvent(evt.Event); got != "pro" {
		t.Errorf("charged event should grant Pro, got %q", got)
	}
}
