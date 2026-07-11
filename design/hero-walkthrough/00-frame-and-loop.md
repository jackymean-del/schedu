# Hero Walkthrough — Device Frame, Loop Mechanism & System Rules

The hero section fills the viewport immediately below the nav (no section in
between). It is a **simulated product walkthrough**: a browser-frame device
containing miniature but faithful HTML/CSS/SVG reproductions of the real
screens, driven by a simulated cursor, looping continuously.

Every scene doc in this folder was written **after reading the actual source
file it reproduces** — file and line references are given per scene. Anything
the real product does differently from the original brief is listed in
`99-open-questions.md`, not silently idealized.

---

## 1. Device frame

```
┌──────────────────────────────────────────────────────────┐
│ ● ● ●   app.schedu.bhusku.com          ⟳  ⋯   [🔒]       │  ← browser chrome bar
├──────────────────────────────────────────────────────────┤
│                                                          │
│              [ SCENE MOCKUP RENDERS HERE ]               │  ← 16:9-ish stage
│                                                          │
├──────────────────────────────────────────────────────────┤
│  caption text (doubles as accessible live region)        │
│  ○ ○ ● ○ ○ ○ ○ ○ ○ ○ ○ ○ ○   ← progress-dot timeline    │
└──────────────────────────────────────────────────────────┘
```

- Chrome bar: 3 traffic dots (#EF4444 / #F59E0B / #22C55E), URL
  `app.schedu.bhusku.com` in DM Mono 11px, on `#F4F2FE` with a 1px
  `#ECE9FB` bottom border. This frames everything as "the real app."
- Stage: white `#fff` (the app is a light product; do NOT reuse the
  marketing site's dark cinematic stage here — the walkthrough must look
  like the product). Height `clamp(420px, calc(100dvh - 190px), 640px)`.
- Caption: below the frame, 15–19px Plus Jakarta Sans 700, ink `#13111E`,
  centered. Rendered in an `aria-live="polite"` region so the sequence is
  narrated to screen readers. Captions ARE the accessible text.
- Progress dots: 13 dots, 8px, `#D8D3F0` inactive / `#7C6FE0` active with a
  conic-gradient ring that fills over the scene duration. Clickable
  (see §4 Interactivity).

## 2. Loop mechanism

Same substrate already proven in `marketing/components/animations/HeroMovie.tsx`:

- One `setTimeout`-chain sequencer in React state (`sceneIdx`), gated by the
  shared `useInView` hook — never plays off-screen.
- Each scene is a standalone component keyed by `sceneIdx` so its CSS
  animations restart cleanly on entry (`key={sceneIdx}` remount).
- All motion is CSS keyframes with absolute `animation-delay` offsets from
  scene start; the ONLY JS is the sequencer + the real clock (scene 9).
- Loop wraps automatically; a 400ms crossfade (`hm-scene-in` style) covers
  each cut.

### Timing budget (target ≈ 31s/loop, refine by feel)

| # | Scene | dur (ms) | | # | Scene | dur (ms) |
|---|---|---|---|---|---|---|
| 1 | Dashboard → New schedule | 2600 | | 8 | Export → Print/PDF | 2200 |
| 2 | Step 1 Resources | 2800 | | 9 | Live view + scrubber drag | 3200 |
| 3 | Step 2 Bell / Rhythm | 3000 | | 10 | Task assignment | 3000 |
| 4 | Step 3 Allocation | 2600 | | 11 | Substitution | 3000 |
| 5 | Step 4 Groups & Combos | 3000 | | 12 | Reports & Analytics | 2200 |
| 6 | Step 5 Generate (solve) | 3400 | | 13 | Brand close | 2600 |
| 7 | Timetable done | 2000 | | | **Total** | **≈30.6s** |

## 3. Cursor system

Reuse the existing `Cursor` component (HeroMovie.tsx): a white arrow SVG with
ink outline + drop shadow, moved by a per-scene CSS keyframe (`left`/`top` in
% of the scene container), with gold `#D4920E` click-ring pulses at declared
ms offsets. Additions for this walkthrough:

- **Drag state**: while "dragging" (scene 9 scrubber), swap the arrow for a
  grabbing-hand glyph (CSS class toggle at a keyframe boundary via a second
  element + opacity swap — same `hm-swap` grid-stack trick).
- **Click outcomes are mandatory**: every click must visibly change the
  mockup before the scene cuts (state swap via the `hm-swap` pattern or a
  delayed `hm-lane-in` reveal). No click may be cosmetic.

## 4. Interactivity — manual scrub

- Each progress dot is a real `<button aria-label="Scene N: {caption}">`.
- Clicking a dot sets `sceneIdx` and **pauses autoplay for 8s** (resume
  timer), so a visitor can step through at their own pace; any further dot
  click resets the 8s window. Keyboard: dots are tabbable, Enter/Space work
  for free.
- This is the only added JS beyond the sequencer (~0.4 KB).

## 5. prefers-reduced-motion

- Sequencer pins to **scene 7 (finished timetable)** — the most
  informative single resolved frame — with its static caption.
- Progress dots remain fully clickable: reduced-motion users can still
  step through every scene manually; each scene renders its **resolved
  end state** (documented per scene doc as "RM frame") with no cursor, no
  typing carets, no rings.
- One shared media-query block, not per-component copies.

## 6. KB budget

- The whole walkthrough is one component + 13 scene subcomponents, inline
  CSS/SVG, zero images, zero new deps.
- Budget: **≤ 52 KB raw source / ≤ 15 KB gzip** in the built chunk
  (HeroMovie today is ~31 KB raw; 13 richer scenes justify the increase but
  the shared primitives — Cursor, swap, card, grid — amortize).
- Hard bans unchanged: no video, no Lottie/GSAP, no canvas, no new fonts.

## 7. Visual system (must match the app, not the marketing site)

Pulled from the real screens read for this spec:

| Token | Value | Source |
|---|---|---|
| Ink text | `#13111E` | everywhere |
| Brand violet | `#7C6FE0` (gradient `#7C6FE0→#5D4FCF` on primary CTAs) | dashboard.tsx:1555 |
| Page bg | `#F5F2FF` / panels `#FAFAFE` | insights.tsx, step6 |
| Borders | `#E5E7EB` (neutral) / `#E8E4FF` (violet-tint) | modals, wizard |
| Success | `#059669` bg / `#F0FDF9`+`#A7F3D0` banners | board chips, AI tags |
| Warning/amber | `#F59E0B`, `#FFFBEB`+`#FDE68A` | AI Suggest, breaks |
| Lunch band | `#FEF3C7` bg / `#D97706` fg | step-bell.tsx:205 |
| Danger | `#DC2626` / `#EF4444` | leave, conflicts |
| Live teach band | `#B9AFF0`; break band `#F7D9A0`; now-line `#EF4444` | calendar.tsx |
| Fonts | Plus Jakarta Sans (UI), DM Mono (numbers/times) | global |

Component shapes: 7–10px radii on inputs/buttons, 12–14px on cards, chip
buttons are pill or 6px, section labels are 11px 700 uppercase `#8B87AD`.
