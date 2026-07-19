package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

// sign produces the signature Razorpay would send for a given body + secret.
func sign(body, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyWebhookSignature(t *testing.T) {
	const secret = "whsec_test_123"
	c := Config{WebhookSecret: secret}
	body := []byte(`{"event":"subscription.charged","payload":{}}`)
	good := sign(string(body), secret)

	cases := []struct {
		name string
		body []byte
		sig  string
		want bool
	}{
		{"valid signature accepted", body, good, true},
		{"tampered body rejected", []byte(`{"event":"subscription.charged","payload":{"x":1}}`), good, false},
		{"wrong signature rejected", body, sign(string(body), "other-secret"), false},
		{"empty signature rejected", body, "", false},
		{"garbage signature rejected", body, "not-hex", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := c.VerifyWebhookSignature(tc.body, tc.sig); got != tc.want {
				t.Fatalf("VerifyWebhookSignature = %v, want %v", got, tc.want)
			}
		})
	}

	// With no secret configured, verification must always fail (never panic,
	// never accept) — a misconfigured deploy can't be tricked into trusting a
	// forged webhook.
	empty := Config{}
	if empty.VerifyWebhookSignature(body, good) {
		t.Fatal("unconfigured secret must reject every signature")
	}
}

func TestEnabled(t *testing.T) {
	if (Config{}).Enabled() {
		t.Fatal("empty config must be disabled")
	}
	if (Config{KeyID: "rzp_test_x"}).Enabled() {
		t.Fatal("key id without secret must be disabled")
	}
	if !(Config{KeyID: "rzp_test_x", KeySecret: "s"}).Enabled() {
		t.Fatal("key id + secret must be enabled")
	}
}

func TestPlanID(t *testing.T) {
	c := Config{PlanMonthly: "plan_month", PlanYearly: "plan_year"}
	if got := c.PlanID("monthly"); got != "plan_month" {
		t.Fatalf("monthly plan id = %q", got)
	}
	if got := c.PlanID("yearly"); got != "plan_year" {
		t.Fatalf("yearly plan id = %q", got)
	}
	// Unknown interval defaults to monthly (matches the handler's normalisation).
	if got := c.PlanID("weekly"); got != "plan_month" {
		t.Fatalf("unknown interval should default to monthly, got %q", got)
	}
}
