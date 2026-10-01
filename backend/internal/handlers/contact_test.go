package handlers

import "testing"

func TestNormalizeEmail(t *testing.T) {
	cases := map[string]string{
		"r.o.b.e.rtsn.a.t.a.li.eo.5.39.d@gmail.com": "robertsnatalieo539d@gmail.com",
		"Jackymean+test@GMAIL.com":                  "jackymean@gmail.com",
		"john.doe@googlemail.com":                   "johndoe@gmail.com",
		"First.Last+news@Example.com":               "first.last@example.com",
		"hello@bhusku.com":                          "hello@bhusku.com",
	}
	for in, want := range cases {
		if got := normalizeEmail(in); got != want {
			t.Errorf("normalizeEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBotReason(t *testing.T) {
	ms := func(n int) *int { return &n }
	cases := []struct {
		website string
		elapsed *int
		require bool
		isBot   bool
	}{
		{"", ms(8000), true, false},
		{"http://spam.example", ms(8000), true, true},
		{"", ms(900), true, true},
		{"", nil, true, true},
		{"", nil, false, false}, // older forms that don't send a fill time
	}
	for _, tc := range cases {
		if got := botReason(tc.website, tc.elapsed, tc.require) != ""; got != tc.isBot {
			t.Errorf("botReason(%q, %v, %v) bot = %v, want %v", tc.website, tc.elapsed, tc.require, got, tc.isBot)
		}
	}
}

func TestLooksLikeGibberish(t *testing.T) {
	cases := map[string]bool{
		"bkZvHliDjNBLFXeslyumEq": true,
		"Hi":                     false,
		"Thanks!":                false,
		"Can you help with our school timetable?": false,
	}
	for in, want := range cases {
		if got := looksLikeGibberish(in); got != want {
			t.Errorf("looksLikeGibberish(%q) = %v, want %v", in, got, want)
		}
	}
}
