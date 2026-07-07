# 02 · Multi-building / room allocation

**Mechanic demonstrated:** schedU schedules across physical space — multiple
buildings/blocks, labs, halls — assigning rooms period by period (the
Venues layer + room blocks from Resources → Rooms).

**Budget:** 14 KB raw / ≤ 4 KB gzip · no JS.

---

## Composition

A minimal **isometric campus**: three simple prisms (Main Block ×2 floors,
Science Block, Sports Hall) built from flat iso faces — 3 fills per prism
(top: paper, left: mist, right: slightly darker mist), ink outline 1.5px.
No texture, no shadows beyond a single flat ground ellipse.

Each building face carries a column of **window cells** (rounded rects) —
these are the rooms. A thin **period ticker** runs along the bottom:
`P1 · P2 · P3 · P4` with a gold dot under the active period (the knob again).

```
        ▱ Science Block          ▱▱ Main Block
       [][]                     [][][]
       [][]                     [][][]
                 ▱ Sports Hall  [][][]
                 [    ]
   ────────────────────────────────────────
   P1 ● P2   P3   P4        "Illustrative demo"
```

## Storyboard (loop ≈ 9s, deliberately different length from hero)

| t | Beat |
|---|---|
| 0–0.8s | Campus at rest, all windows unlit (mist). Gold dot under P1. |
| 0.8–2.6s | **P1 assigns.** 5 windows light up in sequence (120ms stagger): fill transitions mist → subject tint, a 2px ink tick appears inside (the "scheduled" mark). Order deliberately hops between buildings — Main, Science, Main, Hall, Main — showing cross-building placement. |
| 2.6–3.2s | Gold dot slides to P2 (base easing, along the ticker line). |
| 3.2–5.0s | **P2 assigns.** Previous windows dim to 60%; a new set lights, including the Sports Hall's single big window (PE period — it gets the lavender tint). |
| 5.0–6.8s | P3 likewise; one Science Block window pulses twice before settling — a lab pairing "negotiating," resolved on the second pulse. |
| 6.8–8.2s | **Wide settle:** all assigned windows return to full tint simultaneously — the campus "lit" like evening windows. |
| 8.2–9s | Fade all to rest, dot returns to P1. |

## SVG structure sketch

```html
<svg viewBox="0 0 640 360" class="campus">
  <g id="b-main">  <path class="face-top"/><path class="face-l"/><path class="face-r"/>
    <use href="#win" class="w m1"/> ... </g>
  <g id="b-sci"> ... </g>
  <g id="b-hall"> ... </g>
  <g id="ticker"><line/><text>P1</text>...<circle class="knob"/></g>
</svg>
```

- Window = one `<defs>` rect, ~14 `<use>` instances with per-instance
  `animation-delay` — the entire sequencing is CSS delays on one keyframe
  (`win-light`), no JS.
- Iso faces are hand-placed paths (3 prisms × 3 faces = 9 paths total).
  Keep coordinates on a 8px iso grid so edges meet crisply.

## Reduced-motion static frame
Campus fully lit (every window at its subject tint, ticks visible), gold
dot on P4 — "everything placed." Plus the caption.

## Honesty
Building labels are generic ("Main Block", "Science Block"). Caption
*"Illustrative demo"* bottom-right.
