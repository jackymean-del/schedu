# 01 · Hero — "Self-tuning" loop

**Mechanic demonstrated:** the Tuner Console — schedU's signature
constraint-tuning interaction — visibly re-flowing a schedule until it
reaches zero conflicts. This is the product's thesis in one loop:
*you don't build the timetable, you tune it.*

**Budget:** 24 KB raw / ≤ 7 KB gzip · JS ≤ 1 KB (loop sequencer only).

---

## Composition (left → right)

```
┌────────────────────────┐      ┌──────────────────────────────┐
│  TUNER CONSOLE         │      │  SCHEDULE GRID (5 × 6)       │
│  3 vertical faders     │ ───▶ │  30 cells, subject-tinted    │
│  gold knobs (logo DNA) │      │  2 cells flagged red         │
│  labels: Workload ·    │      │                              │
│  Gaps · Double periods │      │  ┌────────────┐              │
└────────────────────────┘      │  │ 0 conflicts│ ← stamp      │
                                │  └────────────┘              │
└─ caption: "Illustrative demo" ─────────────────────────────────┘
```

- Faders are drawn in the exact loader vocabulary: mist rail, ink fill,
  gold knob r=4.5-equivalent. The hero literally contains three copies of
  the logo's right stem.
- Grid cells: 30 rounded rects (via `<use>`), tinted with the app's subject
  accent tints at 20% — recognizably the product's timetable, abstracted.

## Storyboard (loop ≈ 11s)

| t | Beat | Detail |
|---|---|---|
| 0.0–1.2s | **Rest state.** Grid shown with 2 red-outlined conflict cells; a small red "2" badge. Faders idle. | Establishes the problem without text. |
| 1.2–2.0s | **Fader 1 self-nudges.** Knob glides up ~30% (base easing). | `transform: translateY` on knob + dashoffset fill, identical to loader. |
| 2.0–3.4s | **Grid responds, wave 1.** Four cells swap: each fades to 0 opacity (150ms), translates to its new slot (350ms), fades back. One red cell turns neutral; badge ticks 2 → 1. | Cell swaps stagger 120ms apart — reads as ripple, not teleport. |
| 3.4–4.2s | Fader 2 nudges down slightly. | Variation: a tune isn't monotonic. |
| 4.2–5.6s | **Wave 2.** Three more cells reflow; the last red cell resolves; badge 1 → 0. | |
| 5.6–6.4s | **Stamp.** "0 conflicts" pill scales in at grid corner with the settle easing (one gentle overshoot), gold check dot. | The only gold besides knobs — payoff moment. |
| 6.4–9.4s | **Hold.** Everything still; stamp gently pulses opacity 1 → .85 → 1 once. | Let the conclusion breathe (3s). |
| 9.4–11s | **Reset.** Whole right panel cross-fades (600ms) back to the rest state; faders drift home. | Cross-fade, never rewind — rewinding reads as failure. |

## SVG structure sketch

```html
<svg viewBox="0 0 720 400" class="hero-tune">
  <g id="console">              <!-- 3× fader group -->
    <g class="fader f1"><line class="rail"/><path class="fill"/><circle class="knob"/></g>
    ...
  </g>
  <g id="grid">
    <defs><rect id="cell" width="52" height="40" rx="8"/></defs>
    <use href="#cell" class="c r1c1 tint-lang"/> ... ×30
  </g>
  <g id="stamp" class="stamp"><rect/><circle/><text>0 conflicts</text></g>
</svg>
```

- All motion = CSS keyframes on classes; the ≤1 KB JS is only a
  `setTimeout` chain that toggles `.phase-1/.phase-2/...` on the root so
  the beats sequence reliably (pure CSS `animation-delay` chains drift on
  tab-throttle; a class sequencer resets cleanly each loop).
- Cell "swap" = two cells exchanging `transform` values; never re-parent.

## Reduced-motion static frame
The **solved** state: faders at final positions, no red cells, "0 conflicts"
stamp visible. A user who never sees motion still receives the full message:
console + clean grid + zero conflicts.

## Honesty
Generic labels only ("Grade 8A", subject color tints, no school name).
Caption *"Illustrative demo"* bottom-left, 11px, `#8B87AD`.
