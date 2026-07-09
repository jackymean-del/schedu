# Beat 2 · Data feeding — the grid, in flashback

**Caption:** "Add teachers, classes, rooms — in seconds."

**Persists from Beat 1:** the exact same grid, now shown *emptying itself*
at the top of this beat's entry (a quick reverse-dissolve of Beat 1's
resolved cells) before refilling — visually: "here's how that grid got
built." **Hands off to Beat 3:** the fully-populated grid from this beat
feeds directly into the Sankey merge of Beat 3 (cells' subject data becomes
the dots/lines in Beat 3).

---

## Composition

Left: four icon chips (Faculty / Class / Venue / Subject), each with a
running count. Right: the same grid, building cell-by-cell as chips
populate. A single toggle switch top-right: **Visual / Data**.

```
 [👤 Faculty 0→42] [🎓 Class 0→24]     [ grid, building… ]
 [🏛 Venue 0→9]    [📘 Subject 0→18]    Visual ⟷ Data
```

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–8% | Grid from Beat 1 reverse-dissolves to empty. Chips at 0. |
| 8–70% | Chips count up (steps-based, not smooth — numbers *tick*), staggered
  Faculty → Class → Venue → Subject, 15% of scroll each. As each chip
  completes, 5 grid cells matching that data type light up (e.g. Venue
  completing lights the room-label column). |
| 70–85% | One chip (Faculty) shows a one-frame "linked ✓" tag next to a name
  that matches an existing record elsewhere — the directory auto-fill
  highlight (see `headline-and-highlights.md` §2.3). |
| 85–100% | Full grid visible in Visual mode, toggle switch flips itself once
  to Data mode and back (demonstrating the toggle exists) before settling on
  Visual mode for the handoff to Beat 3. |

## SVG/DOM structure sketch

```html
<section class="beat-data">
  <div class="chips">…4 chip components, each a number + label…</div>
  <label class="toggle"><input type="checkbox" class="mode-switch"/> Data mode</label>
  <svg class="grid">…same 20-cell grid as Beat 1…</svg>
  <div class="data-table" hidden>…plain rows, shown when checkbox is checked…</div>
</section>
```

`Visual`/`Data` is a real `<input type="checkbox">`-driven CSS toggle (no
JS): `.mode-switch:checked ~ svg.grid { display:none } .mode-switch:checked
~ .data-table { display:block }`.

## Interaction (bonus layer)

**Click toggles Visual ⟷ Data mode** on the same underlying data — the
checkbox above IS the interaction, zero JS. Autoplay already demonstrates
the flip once during scroll (85–100%); a visitor can flip it as many more
times as they like afterward. Degrades perfectly: if never clicked, it's
simply left on Visual mode, which is the complete, correct resting state.

## Reduced-motion static frame

Grid fully populated (Visual mode), all 4 chips at their final counts, no
counting animation — numbers just present.

## Honesty

Chip counts round, generic (42/24/9/18 — matching the illustrative numbers
already used in the shipped `HeroMovie` input scene, for continuity).
