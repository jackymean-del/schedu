# Marketing motion system — shared rules

> Applies to all five animation docs in this folder. Design exploration —
> hand to the next planning session for implementation; no React here.

## Brand inputs (from `design/brand/`)
- Colors: ink `#13111E` · lavender `#7C6FE0` (interactive/accent surfaces
  only) · Mahua Gold `#D4920E` (knobs/highlights, rationed) · paper
  `#FAF9F5` · mist `#EDE9FF`. **No gradients.**
- Stroke language: monoline, round caps, 15% stroke-to-canvas ratio where
  a mark-scale element appears.
- The gold dot/knob is the recurring "actor" across all five animations —
  the same knob that lives in the logo and the app loader. One motion
  vocabulary everywhere.

## Hard budget (the 1.1MB lesson)
The marketing site previously shipped a 1.1MB gzip bundle; that must never
recur. Budgets are per-animation, **raw bytes of inline SVG + CSS (+ optional
tiny JS)**, with a gzip target:

| # | Animation | Raw budget | Gzip target | JS allowed |
|---|---|---|---|---|
| 1 | Hero self-tuning | 24 KB | ≤ 7 KB | ≤ 1 KB (loop sequencer only) |
| 2 | Multi-building | 14 KB | ≤ 4 KB | none |
| 3 | AND/OR engine | 18 KB | ≤ 5 KB | none |
| 4 | Live/Pulse | 16 KB | ≤ 5 KB | ≤ 0.5 KB (list swap) |
| 5 | Multi-timetable | 10 KB | ≤ 3 KB | none |
| **Total** | | **82 KB raw** | **≤ 24 KB gzip** | |

Enforcement rules:
- Pure inline SVG + CSS keyframes. **No video, no canvas, no WebGL, no
  animation libraries** (no Lottie, no GSAP — Lottie runtime alone is
  ~250KB and is exactly how bundles balloon).
- No new font weights/families beyond what the site already loads.
- Repeating elements (grid cells, student dots) generated as SVG `<use>`
  references, not copy-pasted nodes.
- Every animation lazy-renders below the fold via
  `content-visibility: auto` / `IntersectionObserver` (the observer is
  shared, counts once, ~0.3 KB).

## Reduced motion — explicit static fallbacks
`@media (prefers-reduced-motion: reduce)` must swap each animation to a
**designed end state**, not a hidden or frozen-mid-tween frame. Each doc
defines its exact static frame. Pattern:

```css
@media (prefers-reduced-motion: reduce) {
  .anim * { animation: none !important; transition: none !important; }
  .anim { /* class that pins every element to its defined end state */ }
}
```

The static frame is always the *resolved* state (schedule solved, 0
conflicts, lists populated) — reduced-motion users see the conclusion, not
the setup.

## Honesty rule
Every animation is an **illustrative demo of a real product mechanic**,
using obviously-generic content (Grade 8A, "Physics", "Mr. Rao"). Rules:
- A small caption under each: *"Illustrative demo"* — set in 11px mist-gray,
  always visible, not a tooltip.
- Never real school names, never numbers implying live usage ("1,204
  schools scheduling right now" is banned).
- Animation #4 (Live/Pulse) additionally mirrors the real Live board's
  visual structure so it's an honest preview, per its doc.

## Shared timing grammar
- Base easing: `cubic-bezier(.45, 0, .25, 1)` (same as the brand loader).
- "Settle" moments (a cell landing, a stamp): `cubic-bezier(.2, .9, .3, 1.15)`
  — one gentle overshoot, never bouncy.
- Loop lengths 6–14s with a 1.5–2s rest beat before repeating; adjacent
  animations on the page must have different loop lengths (avoids the
  page "breathing" in sync, which reads as templated).
- Nothing moves faster than 150ms or slower than 900ms per discrete step.
