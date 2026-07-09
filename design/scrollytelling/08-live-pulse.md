# Beat 8 · Live/Pulse — see who's free, right now

**Caption:** "See who's free. Right now."

**Persists from Beat 7:** the digital grid's period columns become this
beat's time axis (same left-to-right chronology, now expressed as a
wall-clock scrubber instead of discrete period cells). **Hands off to
Beat 9:** the "free" teacher chip that gets highlighted at the end of this
beat is the same teacher who receives the task card in Beat 9.

---

## Composition

Identical structure to the already-shipped Live/Pulse animation: a
teaching/break band scrubber with the gold Pulse knob, "IN SESSION" /
"FREE NOW" columns beneath. Reused near-verbatim; the scrollytelling wrapper
adds scroll-scrubbing and the drag interaction.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–10% | Rest at 10:25, 4 in-session cards, 3 free chips. |
| 10–55% | Scrubbing forward as the visitor scrolls — knob position is a
  **direct function of scroll progress within this beat**, not a timed
  loop (this is the one beat where scroll position = literal clock
  position, reinforcing "you control time passing"). Clock digits and
  "min left" update accordingly. |
| 55–65% | Crossing a period boundary: one session card exits, a chip
  crosses from FREE NOW into IN SESSION (the money detail from the shipped
  animation). |
| 65–90% | Continue scrubbing through a break — IN SESSION count drops,
  FREE NOW swells. |
| 90–100% | A **substitution auto-assigns**: a small toast notification
  slides in ("Mr. Das is out P4 — Ms. Iyer auto-assigned, Room 4"), the
  freed slot's card updates to show the substitute's name. This is new
  versus the shipped animation and directly demonstrates the substitution
  engine, which currently has no visual anywhere on the marketing site. |

## Interaction (bonus layer)

**Visitor can drag the clock/scrubber themselves**, at any scroll position,
overriding the scroll-linked position temporarily (releasing the drag lets
it resume tracking scroll position on the next scroll event). One
`pointerdown`/`pointermove`/`pointerup` handler (reused directly from the
already-planned Beat 1 fader-drag logic — same clamped clientX-delta
pattern), ~0.5 KB, matching the budget already allotted in `00-system.md`.

## Reduced-motion static frame

Frozen at the 55–65% state (mid-crossover), toast notification already
shown and settled — communicates both "live scrubbing" and "substitution"
concepts in one still frame, exactly as the shipped Live/Pulse's
reduced-motion spec already does.

## Honesty

Clock never syncs to the visitor's real time (fixed illustrative start),
names generic. Toast text is clearly a demo notification, not a real alert.
