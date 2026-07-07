# 05 · Multi-timetable scale — the fanned stack

**Mechanic demonstrated:** schedU runs **many schedules at once** — several
active timetables (I–V, VI–X, XI–XII…), each with its own bell, all
coexisting (the multi-active schedules system). The visual: a fanned stack
of timetable cards flipping into place, implying effortless scale.

**Budget:** 10 KB raw / ≤ 3 KB gzip · no JS. The simplest of the five — it
closes the page, it shouldn't compete with the hero.

---

## Composition

Five timetable cards (rounded 16px rects, paper fill, ink 1.5px border),
each carrying an abstracted mini-grid (4×5 tint bars — `<use>` refs) and a
title chip: `Classes I–V` · `VI–VIII` · `IX–X` · `XI Science` · `XI Commerce`.

Rest layout: a **fan** — cards rotated −9°/−4.5°/0°/+4.5°/+9° around a
common bottom pivot, edges peeking like held playing cards. One gold dot
on the front card's chip (the active schedule).

```
        ╱▔▔▔╲ ╱▔▔▔▔╲ ╱▔▔▔╲
      ╱ I–V ╱ VI–VIII ╲ IX–X ╲     ← fanned stack
      ▏  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ▕
          "Illustrative demo"
```

## Storyboard (loop ≈ 8s)

| t | Beat |
|---|---|
| 0–0.6s | Stack closed — cards nearly aligned, slight offsets. |
| 0.6–2.4s | **Fan open.** Cards rotate out to fan positions, 90ms stagger back-to-front, settle easing (single soft overshoot each). |
| 2.4–5.4s | **Roll call.** One at a time (600ms each), each card lifts 8px, comes to front (`z` reorder via opacity trick — the lifted card's twin at top opacity 1, others dim to 85%), its mini-grid bars "fill" left-to-right (scaleX 0→1, 40ms stagger), gold dot hops to its chip. Reads as: each schedule is real and populated. |
| 5.4–6.6s | **Alignment beat.** All five straighten to a tidy row of tabs (rotation → 0, x spreads evenly) — from "a handful of cards" to "a managed system." |
| 6.6–8s | Hold 900ms, then fold back to the closed stack. Loop. |

## SVG structure sketch

```html
<svg viewBox="0 0 680 360" class="stack">
  <defs>
    <g id="card"><rect class="paper"/><rect class="chip"/><use href="#grid"/></g>
    <g id="grid"><rect class="bar"/> ×20</g>
  </defs>
  <use href="#card" class="k k1"/> … ×5
  <circle class="knob"/>
</svg>
```

- Five `<use>` cards → the whole scene is ~2 unique shapes. This is how it
  stays under 10 KB.
- All motion is `transform` (rotate/translate/scaleX) + opacity — GPU-only
  properties, no layout, no paint storms.
- Pivot: `transform-origin: 340px 400px` (below the canvas) gives the
  natural card-fan arc for free.

## Reduced-motion static frame
The **aligned row** state (5.4–6.6s): five straightened cards side by side,
all grids filled, gold dot on the first — "many schedules, under control"
as a still.

## Honesty
Card titles are grade ranges, not school names. Caption *"Illustrative
demo"* bottom-center.
