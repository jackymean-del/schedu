// Package mailer sends transactional email. When SMTP isn't configured
// (no SMTP_HOST), it logs instead — handy for local/dev where there's no
// mail server, and so the flow is fully usable without external services.
package mailer

import (
	"fmt"
	"log/slog"
	"net/smtp"
	"os"
)

func getenv(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

// SendShareCode delivers a one-time access code for a restricted timetable
// share. Returns nil even in dev (logged) so callers don't leak SMTP state.
func SendShareCode(to, code string) {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		// Dev mode — no SMTP. Log the code so it can be read from the API logs.
		slog.Info("share access code (DEV — SMTP not configured)", "email", to, "code", code)
		return
	}

	port := getenv("SMTP_PORT", "587")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := getenv("SMTP_FROM", "no-reply@schedu.bhusku.com")

	msg := []byte(fmt.Sprintf(
		"From: schedU <%s>\r\nTo: %s\r\nSubject: Your schedU access code\r\n\r\n"+
			"Your one-time code to view the shared timetable is:\r\n\r\n    %s\r\n\r\n"+
			"It expires in 10 minutes. If you didn't request this, you can ignore this email.\r\n",
		from, to, code,
	))

	auth := smtp.PlainAuth("", user, pass, host)
	if err := smtp.SendMail(host+":"+port, auth, from, []string{to}, msg); err != nil {
		slog.Error("share code email failed", "err", err, "email", to)
	}
}
