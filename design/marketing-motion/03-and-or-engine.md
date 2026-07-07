# 03 · AND/OR combination engine (Academic Combination Matrix)

**Mechanic demonstrated:** the Academic Combination Matrix — schedU resolves
expressions like `Eng+Phy+Chem` (AND) and `PE OR Painting` (OR) into
instructional clusters that pool students **across sections**, then regroup
them differently for the next subject. No competitor has this; it deserves
the most distinctive visual.

**Budget:** 18 KB raw / ≤ 5 KB gzip · no JS.

---

## Composition

A horizontal **Sankey-style flow**, three column stops:

```
  SECTIONS            CLUSTER                REGROUPED
  XI-A ● ● ● ●   ╲
  XI-B ● ● ●      ═══▶  ◉ Physics       ╲    ◉ Painting
  XI-C ● ● ● ●   ╱      (one teacher,    ═▶  ◉ PE
                         one room)       ╱    (different split!)
  expression chip:「 Eng + Phy + Chem 」→「 PE OR Painting 」
```

- **Students are dots** (r=5, ink at 80%), grouped in section rows on the
  left with section labels XI-A/B/C.
- **Flow ribbons** are 3 wide paths (one per section) with round caps —
  monoline language, stroke-width 10, mist color; dots travel along them.
- The cluster stop is a circle containing the subject label and a tiny
  teacher glyph — one gold dot marks it (the knob = "this is the tuned
  grouping").
- An **expression chip** (rounded pill, `DM Mono`) floats above the middle,
  showing the actual matrix syntax users type. This is the honest tie to
  the real feature: the animation is a visualization *of that string*.

## Storyboard (loop ≈ 13s)

| t | Beat |
|---|---|
| 0–1s | Rest: three section rows of dots, expression chip types on: `Eng + Phy + Chem` (CSS steps() reveal, caret blink ×2). |
| 1–3.5s | **Merge (AND).** Dots leave their rows and travel the ribbons (offset-path / `offset-distance` animation, 80ms stagger per dot) into the Physics cluster circle, which scales in with settle easing. Label: "Physics · one shared cluster". |
| 3.5–5s | Hold — cluster gently breathes (r ±2%). The point lands: *three sections, one teaching group.* |
| 5–6s | Expression chip morphs: old text wipes, `PE OR Painting` types on. |
| 6–9s | **Split (OR).** The same dots exit the cluster along two diverging ribbons into two smaller circles — but **the split is different from the original sections** (dots that sat in XI-A now land in both PE and Painting). 2–3 dots visibly "choose differently," crossing ribbons mid-flight. |
| 9–11s | Hold on the two groups; small labels "PE · 14" / "Painting · 9" (generic counts). |
| 11–13s | Everything drains back to section rows (reverse travel, faster, 60ms stagger), chip clears. Loop. |

**The money detail:** the mid-flight ribbon-crossing dots at 6–9s. That
single gesture communicates "same students, different grouping per
subject" — the entire Combination Matrix — without a word of copy.

## SVG structure sketch

```html
<svg viewBox="0 0 760 340" class="combo">
  <g id="ribbons"><path id="rb-a"/><path id="rb-b"/>...</g>   <!-- 5 paths total -->
  <g id="dots">
    <circle class="d" style="offset-path: path('M...')" .../> <!-- ×11 dots -->
  </g>
  <g id="cluster" class="node phys"><circle/><text/></g>
  <g id="grp-pe" class="node"/><g id="grp-paint" class="node"/>
  <g id="chip"><rect/><text class="expr"/></g>
</svg>
```

- Dot travel uses CSS `offset-path` + `offset-distance` keyframes (well
  supported; static fallback covers the rest). Two "crossing" dots simply
  reference a different path in phase 2 via a second class.
- Typing effect: `clip-path: inset()` keyframe with `steps(14)` — no JS.

## Reduced-motion static frame
The **split** state (phase 6–11s): dots resting in PE + Painting groups,
both expression chips shown stacked (`Eng+Phy+Chem` above, `PE OR Painting`
below), ribbons visible as faint routes. The full story as a diagram.

## Honesty
Counts are obviously round/generic; caption *"Illustrative demo of the
Academic Combination Matrix"* — this one names the feature, because the
mechanic is the differentiator.
