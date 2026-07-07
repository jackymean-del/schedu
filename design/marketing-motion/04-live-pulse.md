# 04 · Live / Pulse — "who's free now"

**Mechanic demonstrated:** the Live board (`/calendar` → Live view): a
wall-clock scrubber over the school day with "In session" and "Free now"
updating as time moves. **This animation must be an honest preview of the
real feature** — it reuses the actual Live board's visual structure
(time scrubber with teaching/break bands, section labels, free-list chips),
not an invented dashboard.

**Budget:** 16 KB raw / ≤ 5 KB gzip · JS ≤ 0.5 KB (list content swap).

---

## Composition (mirrors the real Live board)

```
  10:25 AM   In session · 20 min left            ● Live
  ▐▓▓▓░▓▓▓▓░░▓▓▓▓▓▓░▓▓▓▓▐   ← scrubber: teaching (lavender) / break (sand)
        ▲ playhead (gold knob, of course)
  ─────────────────────────────
  IN SESSION · 4          FREE NOW · 3
  ▢ VIII-A Maths · Mr. Rao   ◦ Ms. Iyer
  ▢ VI-B  Science · ...      ◦ Mr. Das
  ▢ ...                      ◦ Ms. Paul
```

- The scrubber is the real component's language: rounded band segments,
  lavender = teaching, sand `#F5E9C9` = break/free (matching the app's
  Teaching/Break legend).
- The playhead is the gold knob riding the band — the logo knob again, now
  reading as "now."
- Below: two columns exactly like the app's "IN SESSION" / "Free now"
  sections — small cards left, name chips right.

## Storyboard (loop ≈ 12s)

| t | Beat |
|---|---|
| 0–0.5s | Rest at 10:25 AM. 4 session cards, 3 free chips visible. |
| 0.5–4s | **Scrub forward.** Knob glides right across ~2 hours of band (linear — clocks don't ease); the digital clock counts (steps(24)); the "min left" figure ticks down. |
| 4.0s | Knob crosses a band boundary (period change). **List updates:** one session card exits (fade + 6px down), a chip from Free Now crosses over — literally animates from the right column into the left as a new card ("Ms. Iyer → VII-C English"), and a released teacher's chip appears on the right. |
| 4–8s | Continue scrubbing; a sand (break) segment passes — during it, IN SESSION count drops to 1 and FREE NOW swells (chips stack in with 80ms stagger). Recess told purely through the lists. |
| 8–10.5s | Second period change, second cross-over swap. Clock reaches 12:40 PM. |
| 10.5–12s | Playhead eases to a stop; "● Live" badge pulses once; cross-fade back to 10:25 state. |

**The money detail:** the chip that physically travels from FREE NOW into
IN SESSION at 4.0s. That's the product's whole value ("I can see who can
cover right now") as one movement.

## SVG structure sketch

```html
<div class="live-demo">                <!-- HTML wrapper: lists are HTML, cheaper than SVG text -->
  <svg viewBox="0 0 640 64" class="scrub">
    <g id="bands"><rect class="b teach"/><rect class="b break"/>...</g>  <!-- ~9 rects -->
    <circle class="playhead"/>
  </svg>
  <div class="cols">
    <ul class="in-session">…cards…</ul>
    <ul class="free-now">…chips…</ul>
  </div>
</div>
```

- Playhead: single `transform: translateX` keyframe, linear, 0→100%.
- Clock digits: pre-rendered set of time strings toggled by the ≤0.5 KB JS
  sequencer (same class-phase pattern as the hero); the traveling chip is a
  CSS `transform` between two fixed positions with a phase class.
- List rows are HTML (system font stack already loaded) — SVG text here
  would cost more bytes and worse wrapping.

## Reduced-motion static frame
Frozen at the 4–8s state: playhead mid-band at a fixed time (11:35 AM),
both lists populated, one card subtly highlighted as "just started."
Communicates the feature as a screenshot would.

## Honesty
Names are obviously generic (Mr. Rao, Ms. Iyer); the clock never matches
the visitor's real time (fixed 10:25 start — deliberately *not* synced, so
it can't be mistaken for a live feed). Caption: *"Illustrative demo — the
Live board with sample data."*
