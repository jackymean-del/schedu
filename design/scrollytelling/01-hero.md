# Beat 1 · Hero — the Tuner Console resolves live

**Caption (on-screen):** "Your full timetable. Built in seconds."
**Headline (page H1, sits inside this same frame):** "The last schedule
you'll ever fix by hand." / "Tune it like sound, resolve it like a puzzle —
across every building, room, and combination your institution runs."

**Persists from:** nothing before it — this is page start, immediately
below the nav. **Hands off to Beat 2:** the resolved grid this beat ends on
is the *same grid instance* Beat 2 rewinds into "how this got built."

---

## Composition

Two-column frame (stacks on mobile): headline/subhead/CTA buttons on the
left, the Tuner Console + grid scene on the right — one full-viewport-height
frame, no scroll needed to see the whole beat once.

```
┌───────────────────────────┬──────────────────────────────┐
│ The last schedule you'll  │  ⁝⁝⁝ (3 faders)   [grid 5×4] │
│ ever fix by hand.         │                    2 red      │
│                           │                               │
│ Tune it like sound...     │        "0 conflicts" (hidden) │
│ [Start free] [See how]    │                               │
└───────────────────────────┴──────────────────────────────┘
```

## Scroll-progress storyboard (0–100% = scrolling this beat fully into,
through, and out of view)

| % | Beat |
|---|---|
| 0–10% (entry) | Text fades/slides in first (100ms stagger per line), console at rest, grid shows 2 conflict cells. |
| 10–35% | Fader 1 self-nudges; 4 grid cells reflow (fade+translate, 120ms stagger); conflict badge 2→1. |
| 35–55% | Fader 2 nudges; remaining cells resolve; badge 1→0. |
| 55–70% | "0 conflicts" stamp scales in, gold check dot. |
| 70–100% (exit, as visitor scrolls to Beat 2) | Hold, then the whole scene very slightly scales down/dims (0.98 scale, 85% opacity) as it "hands off" — visually cues that Beat 2 is about to take over the same grid. |

Loops once more if the visitor lingers (view-timeline `cover` range repeats
naturally on re-entry from scrolling back up).

## SVG structure sketch

```html
<section class="beat-hero">
  <svg class="console-grid" viewBox="0 0 720 400">
    <g class="console">…3 faders, identical markup to the shipped Hero
       self-tuning animation…</g>
    <g class="grid">…20 cells via <use>, tint classes…</g>
    <g class="stamp">…0 conflicts pill…</g>
  </svg>
</section>
```

Reuses the already-shipped `HeroTuning`/`HeroMovie` tune-scene markup
structure directly — no new visual language invented here, just re-driven by
scroll instead of a fixed loop.

## Interaction (bonus layer)

Visitor can **drag Fader 1** directly. Dragging it manually re-triggers the
same reflow animation the autoplay path already plays at 10–35%, scoped to
just that fader's cells, on a `pointerdown`+`pointermove` handler (no drag
library — three lines of clientX delta math, clamped to the track's range).
Releasing lets it settle back via the existing settle easing. If never
touched, the scroll-driven autoplay above is the entire experience — nothing
is missing for a visitor who never drags anything.

## Reduced-motion static frame

Faders at rest positions, all cells resolved, "0 conflicts" stamp visible,
headline/subhead/CTA all shown immediately (no entrance fade). This is also
the frame search-engine crawlers and no-JS visitors get.

## Honesty

"Illustrative demo" caption, 11px mist-gray, bottom-left of the SVG, always
visible.
