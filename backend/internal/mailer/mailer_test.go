package mailer

import "testing"

func TestIsPlainName(t *testing.T) {
	cases := map[string]bool{
		"Jugal":                           true,
		"Anne-Marie":                      true,
		"O'Neil":                          true,
		"जुगल":                            true,
		"http://spam.example":             false,
		"www.spam.example":                false,
		"me@example.com":                  false,
		"Abcdefghijklmnopqrstuvwxyzabcde": false,
	}
	for in, want := range cases {
		if got := isPlainName(in); got != want {
			t.Errorf("isPlainName(%q) = %v, want %v", in, got, want)
		}
	}
}
