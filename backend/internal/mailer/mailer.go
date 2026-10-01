// Package mailer sends transactional email, through Resend's HTTPS API when
// RESEND_API_KEY is set, otherwise over SMTP when SMTP_HOST is set. With
// neither configured it logs instead - handy for local/dev where there's no
// mail server, and so the flow is fully usable without external services.
//
// Prefer Resend in production: Railway blocks outbound SMTP ports on
// non-Pro plans, so SMTP connections from there time out.
package mailer

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"
	"unicode"
)

func getenv(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

var errNotConfigured = errors.New("no email provider configured")

type mail struct {
	fromName string
	to       string
	replyTo  string
	subject  string
	body     string
}

// send delivers m via Resend or SMTP, whichever is configured.
func send(m mail) error {
	from := getenv("SMTP_FROM", "no-reply@schedu.bhusku.com")
	// Strip line breaks from anything that lands in a header.
	oneLine := strings.NewReplacer("\r", " ", "\n", " ")
	m.subject = oneLine.Replace(m.subject)
	m.replyTo = oneLine.Replace(m.replyTo)

	if key := os.Getenv("RESEND_API_KEY"); key != "" {
		return sendResend(key, from, m)
	}
	if os.Getenv("SMTP_HOST") != "" {
		return sendSMTP(from, m)
	}
	return errNotConfigured
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

func sendResend(key, from string, m mail) error {
	payload := map[string]any{
		"from":    fmt.Sprintf("%s <%s>", m.fromName, from),
		"to":      []string{m.to},
		"subject": m.subject,
		"text":    m.body,
	}
	if m.replyTo != "" {
		payload["reply_to"] = m.replyTo
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		return fmt.Errorf("resend: %s: %s", res.Status, strings.TrimSpace(string(detail)))
	}
	return nil
}

func sendSMTP(from string, m mail) error {
	host := os.Getenv("SMTP_HOST")
	port := getenv("SMTP_PORT", "587")
	auth := smtp.PlainAuth("", os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASS"), host)

	var hdr strings.Builder
	fmt.Fprintf(&hdr, "From: %s <%s>\r\nTo: %s\r\n", m.fromName, from, m.to)
	if m.replyTo != "" {
		fmt.Fprintf(&hdr, "Reply-To: %s\r\n", m.replyTo)
	}
	fmt.Fprintf(&hdr, "Subject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n", m.subject)
	msg := []byte(hdr.String() + strings.ReplaceAll(m.body, "\n", "\r\n"))

	return smtp.SendMail(host+":"+port, auth, from, []string{m.to}, msg)
}

// SendShareCode delivers a one-time access code for a restricted timetable
// share. Failures are logged, not returned, so callers don't leak mail state.
func SendShareCode(to, code string) {
	err := send(mail{
		fromName: "schedU",
		to:       to,
		subject:  "Your schedU access code",
		body: "Your one-time code to view the shared timetable is:\n\n    " + code + "\n\n" +
			"It expires in 10 minutes. If you didn't request this, you can ignore this email.\n",
	})
	switch {
	case errors.Is(err, errNotConfigured):
		// Dev mode - log the code so it can be read from the API logs.
		slog.Info("share access code (DEV - email not configured)", "email", to, "code", code)
	case err != nil:
		slog.Error("share code email failed", "err", err, "email", to)
	}
}

// SendContactNotification forwards a contact-form submission to the team
// inbox (CONTACT_NOTIFY_TO, default hello@bhusku.com) with Reply-To set to the
// sender, so hitting Reply answers them directly. The message is already
// stored in contact_messages either way.
func SendContactNotification(name, email, message, source string) {
	err := send(mail{
		fromName: "bhusku contact form",
		to:       getenv("CONTACT_NOTIFY_TO", "hello@bhusku.com"),
		replyTo:  email,
		subject:  fmt.Sprintf("New message from %s (%s)", name, source),
		body:     fmt.Sprintf("Name: %s\nEmail: %s\nSource: %s\n\n%s\n", name, email, source, message),
	})
	switch {
	case errors.Is(err, errNotConfigured):
		slog.Info("contact notification (DEV - email not configured)", "email", email, "source", source)
	case err != nil:
		slog.Error("contact notification email failed", "err", err, "email", email)
	default:
		slog.Info("contact notification sent", "email", email, "source", source)
	}
}

// SendContactAcknowledgement thanks the sender of a contact-form message.
// Replies go to the team inbox. The sender's message is deliberately not
// echoed back, so the form can't be used to relay arbitrary text to a
// third-party address.
func SendContactAcknowledgement(name, email, source string) {
	inbox := getenv("CONTACT_NOTIFY_TO", "hello@bhusku.com")
	greeting := "Hi there,"
	if first := strings.Fields(name); len(first) > 0 && isPlainName(first[0]) {
		greeting = "Hi " + first[0] + ","
	}

	fromName, subject, body := "bhusku", "Thanks for getting in touch",
		"Thanks for reaching out to bhusku. Your message has reached us, and a real person will read it and reply within 1-2 working days.\n\n"+
			"In the meantime, you can see what we're building at https://bhusku.com.\n"
	switch source {
	case "marketing-contact":
		fromName, subject = "schedU", "Thanks for contacting schedU"
		body = "Thanks for reaching out about schedU. Your message has reached us, and we'll reply within 1-2 working days.\n\n" +
			"If it's about a timetable you're working on, feel free to reply with any extra details.\n"
	case "pro-waitlist":
		fromName, subject = "schedU", "You're on the schedU Pro list"
		body = "Thanks for your interest in schedU Pro. You're on the list, and we'll email you as soon as it launches.\n"
	}

	err := send(mail{
		fromName: fromName,
		to:       email,
		replyTo:  inbox,
		subject:  subject,
		body: greeting + "\n\n" + body + "\n" +
			"If you need to add anything, just reply to this email.\n\n" +
			"Warm regards,\nJugal\nbhusku - Sambalpur, Odisha\n",
	})
	switch {
	case errors.Is(err, errNotConfigured):
		slog.Info("contact acknowledgement (DEV - email not configured)", "email", email, "source", source)
	case err != nil:
		slog.Error("contact acknowledgement email failed", "err", err, "email", email)
	}
}

// isPlainName reports whether s looks like an ordinary first name, so that a
// link or address typed into the name field never ends up in our email.
func isPlainName(s string) bool {
	if len(s) > 30 {
		return false
	}
	for _, r := range s {
		// Marks cover vowel signs in Indic scripts (e.g. the ु in जुगल).
		if !unicode.IsLetter(r) && !unicode.IsMark(r) && r != '-' && r != '\'' {
			return false
		}
	}
	return true
}
