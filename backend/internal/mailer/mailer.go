// Package mailer sends transactional email. When SMTP isn't configured
// (no SMTP_HOST), it logs instead - handy for local/dev where there's no
// mail server, and so the flow is fully usable without external services.
package mailer

import (
	"fmt"
	"log/slog"
	"net/smtp"
	"os"
	"strings"
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
		// Dev mode - no SMTP. Log the code so it can be read from the API logs.
		slog.Info("share access code (DEV - SMTP not configured)", "email", to, "code", code)
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

// SendContactNotification forwards a contact-form submission to the team
// inbox (CONTACT_NOTIFY_TO, default hello@bhusku.com) with Reply-To set to the
// sender, so hitting Reply answers them directly. Logs instead when SMTP isn't
// configured; the message is already stored in contact_messages either way.
func SendContactNotification(name, email, message, source string) {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		slog.Info("contact notification (DEV - SMTP not configured)", "email", email, "source", source)
		return
	}

	port := getenv("SMTP_PORT", "587")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := getenv("SMTP_FROM", "no-reply@schedu.bhusku.com")
	to := getenv("CONTACT_NOTIFY_TO", "hello@bhusku.com")

	// Strip line breaks from anything that lands in a header.
	oneLine := strings.NewReplacer("\r", " ", "\n", " ")
	subject := oneLine.Replace(fmt.Sprintf("New message from %s (%s)", name, source))

	msg := []byte(fmt.Sprintf(
		"From: bhusku contact form <%s>\r\nTo: %s\r\nReply-To: %s\r\nSubject: %s\r\n"+
			"MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"+
			"Name: %s\r\nEmail: %s\r\nSource: %s\r\n\r\n%s\r\n",
		from, to, oneLine.Replace(email), subject, name, email, source, message,
	))

	auth := smtp.PlainAuth("", user, pass, host)
	if err := smtp.SendMail(host+":"+port, auth, from, []string{to}, msg); err != nil {
		slog.Error("contact notification email failed", "err", err, "email", email)
	}
}
