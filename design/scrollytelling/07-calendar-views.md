# Beat 7 · Calendar views — same schedule, screen or paper

**Caption:** "Same schedule. Screen or paper."

**Persists from Beat 6:** literally the same resolved grid, re-skinned, not
regenerated — the whole point of this beat is that it's *not* a new
timetable, just a different render of the one that's existed since Beat 5.
**Hands off to Beat 8:** the digital version's period columns become the
time axis Beat 8's clock scrubs across.

---

## Composition

A physical-looking toggle switch (skeuomorphic, subtle drop-shadow, a real
"click" settle on flip) between **Digital** and **Print**. Digital = the
familiar tinted grid. Print = the exact same data laid out in the real
print-export style (black borders, no color tints, the print-safe mark and
"schedU" wordmark small top-left, matching the actual `buildPrintHTML`
letterhead already shipped in the product).

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–15% | Digital grid, at rest (carried straight over from Beat 6). |
| 15–50% | Toggle switch flips itself (Digital → Print) — a 3D-ish flip
  transform on the switch knob, 400ms, settle easing. |
| 50–75% | The grid cross-fades + desaturates into the print styling
  (tints fade to white/black-border cells; the print letterhead fades in
  top-left). |
| 75–100% | Hold on Print, then flips back to Digital as the beat exits
  (so Beat 8 opens on the familiar digital view again). |

## SVG/DOM structure sketch

```html
<section class="beat-calendar">
  <label class="physical-toggle">
    <input type="checkbox" class="view-switch"/>
    <span class="switch-track"><span class="switch-knob"/></span>
  </label>
  <div class="grid-digital">…</div>
  <div class="grid-print">…</div> <!-- cross-faded via the same checkbox -->
</section>
```

Toggle is a real `<input type="checkbox">` — `:checked` swaps which grid
variant is visible/opaque via a cross-fade transition, zero JS.

## Interaction (bonus layer)

**The toggle switch itself IS the interaction** — a visitor can flip it as
many times as they like after the autoplay demonstrates it once. This is the
cleanest "bonus layer = the same mechanism as autoplay" case of all 11 beats:
autoplay just checks/unchecks the same input the visitor can click.

## Reduced-motion static frame

Split-screen static (both Digital and Print shown side by side, smaller,
instead of one toggling to the other) — the one beat where reduced-motion
gets a genuinely different *layout*, not just a frozen version of the
animated one, because "compare two things" reads better side-by-side than
as a single frozen toggle mid-state.

## Honesty

Print mock uses the real print letterhead design (already shipped in
`timetableExport.ts`) — this is the one beat allowed to look *exactly* like
real product output, since it's demonstrating an export format, not a live
data claim.
