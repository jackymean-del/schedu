# Full-page scrollytelling — system doc

> Design exploration only — no React/CSS implementation in this session.
> Ties together `01-hero.md` … `11-final-cta.md`. See `headline-and-highlights.md`
> for copy rationale.

---

## 1. Structure — the hero IS page-start

No badge, no pre-hero paragraph stack above a small animation card. The nav
header is immediately followed by Beat 1 in full: headline + subhead live
**inside** the same visual frame as the Tuner Console scene, not stacked
above it as separate copy blocks. Concretely: H1 and subhead sit to the left
(desktop) or above (mobile) of the console+grid, both fading in with the
scene's own entrance beat — one composition, not "text section, then
animation section." CTA buttons ("Start free", "See how it works") sit
directly under the subhead, inside the same viewport-height frame, so the
very first screen a visitor sees is the complete Beat 1: promise, proof, and
action together.

Beats 2–10 each occupy their own full-viewport-height (or near-height)
section, in-order, no interstitial "normal" marketing sections breaking the
sequence. Beat 11 (final CTA) is the last full-height section before the
existing footer.

## 2. The persistence thread

The requirement is one continuous visual thread, not 11 unrelated widgets.
Concretely, three elements persist and *evolve* rather than reset:

1. **The schedule grid itself.** The exact same abstracted grid (same cell
   size, same corner radius, same 4-tint palette) appears in Beats 1, 2, 5,
   6, 7 — each time picking up conceptually where the last left it (Beat 1
   ends with a resolved grid → Beat 2 shows that grid being *built* via data
   entry, in flashback logic: "here's how we got here" → Beat 5 shows a
   fresh, emptier grid filling cell-by-cell → Beat 6 shows conflict badges
   on a *near-complete* grid resolving → Beat 7 re-renders the same finished
   grid in print styling). The grid is the spine.
2. **The gold knob.** The one recurring "actor" (per the original brand
   motion system) — it's the fader knob in Beat 1, the "now" Pulse in Beat 8,
   the resolve-trigger in Beat 6, and the final stamp's accent in Beat 11.
   Never introduce a second accent color as a competing focal point.
3. **A persistent "chapter rail."** A thin vertical progress rail fixed to
   the viewport edge (like the segmented scrubber from the hero movie, but
   vertical and spanning the whole page) — 11 short ticks, filling as the
   visitor scrolls, each tick's label matching that beat's caption. This is
   the literal, on-screen proof that all 11 beats are one sequence, not 11
   separate decisions — and it does double duty as scroll-position wayfinding
   on a long page.

## 3. Mechanism — CSS scroll-driven, JS fallback

**Primary (supporting browsers):** `animation-timeline: view()` (per-beat,
scoped to that beat's `<section>` as the timeline root) drives all keyframe
animations natively. No JS needed for the animation itself in this path —
`@supports (animation-timeline: view())` gates it on.

```css
@supports (animation-timeline: view()) {
  .beat-4 .campus-window { animation: win-light 1s linear both;
    animation-timeline: view(); animation-range: entry 10% cover 40%; }
}
```

**Fallback (no scroll-timeline support):** one shared, small
`IntersectionObserver` + `scroll` listener (~1.2 KB, page-wide, not
per-beat) computes each beat's scroll progress (0–1, based on the section's
position relative to viewport) and writes it to a CSS custom property on
that section: `section.style.setProperty('--p', progress)`. Fallback CSS
(gated by `@supports not (animation-timeline: view())`) expresses the same
visual states directly from `--p` via `calc()` — e.g.
`transform: translateY(calc((1 - var(--p)) * 40px)); opacity: var(--p);`
— rather than re-declaring the keyframes. This means **the same visual
design** (same start/end states, same easing curve approximated via a
`clamp()`-based easing function on `--p`) ships to both paths without
duplicating the keyframe logic twice — only the *driver* differs.

Each beat doc below specifies its states in percentage terms so both paths
can be authored from the same numbers.

## 4. Interactivity — bonus layer, never a requirement

Every beat's one interaction (drag a slider, hover a cell, click a badge) is
strictly additive: the ambient scroll/autoplay version must read completely
on its own for the ~95% of visitors who scroll past without touching
anything. Implementation rule: interactions are authored as `:hover`,
`:checked` (for toggle switches, via hidden checkbox inputs — zero JS), or a
single lightweight `pointerdown` handler per beat (no shared interaction
framework, no state library) that **only ever accelerates or replays** an
animation already defined for the autoplay path — it never introduces a
visual state that doesn't otherwise exist. This keeps the reduced-motion and
no-JS fallbacks trivially consistent: disable the interaction, the static
frame or autoplay version is still complete and correct.

## 5. Reduced motion

Same rule as the original animation system: `prefers-reduced-motion: reduce`
swaps every beat to its **resolved end-state frame** (specified per-beat
below), never a frozen mid-tween or hidden element. Scroll-position-based
reveal (fade/slide-in on entering the viewport) is also disabled — sections
simply render in their end state immediately, so a reduced-motion visitor
scrolling the page sees 11 static, correct "photographs" of the product
without the JS/CSS-driven scroll linkage at all.

## 6. Honesty

Every beat keeps its own small "Illustrative demo" caption (11px, mist-gray,
always visible — never a tooltip), consistent with the original animation
system. Generic names only (Grade 8A, Mr. Rao, Room 12). Beat 8 (Live/Pulse)
additionally never syncs to the visitor's real clock, exactly as the
original Live/Pulse animation specified.

## 7. KB budget (proposed)

This sequence is **materially bigger in scope** than the original 5-animation
homepage budget (82 KB / 24 KB gzip) — it's now a full-page narrative, not a
hero decoration. Proposed budget, still deliberately lightweight relative to
the 1.1 MB regression this system exists to prevent:

| Beat | Raw budget | Gzip target | JS |
|---|---|---|---|
| Shared chrome (tokens, fallback controller, chapter rail) | 6 KB | 2 KB | ~1.2 KB (shared IntersectionObserver/scroll driver) |
| 1 · Hero | 14 KB | 4 KB | none beyond shared driver |
| 2 · Data feeding | 10 KB | 3 KB | ≤0.3 KB (toggle) |
| 3 · Combination engine | 16 KB | 5 KB | none (hover-only) |
| 4 · Room & building | 14 KB | 4 KB | ≤0.3 KB (click-to-zoom) |
| 5 · Allocation | 10 KB | 3 KB | none (hover tooltip via CSS `:hover` + `title`-style pseudo-element) |
| 6 · Optimization | 9 KB | 3 KB | ≤0.3 KB (click-to-resolve) |
| 7 · Calendar views | 8 KB | 2.5 KB | none (checkbox toggle) |
| 8 · Live/Pulse | 12 KB | 3.5 KB | ≤0.5 KB (drag handler, reused from existing Live/Pulse work) |
| 9 · Task management | 8 KB | 2.5 KB | none (hover-only) |
| 10 · Reports/analytics | 8 KB | 2.5 KB | none (hover-only, CSS-only tooltip) |
| 11 · Final CTA | 6 KB | 2 KB | none |
| **Total** | **~121 KB raw** | **~37.5 KB gzip** | **~2.6 KB JS total** |

Still an order of magnitude under the 1.1 MB lesson this system was built to
avoid, and the shared driver/tokens amortize across all 11 beats rather than
each beat re-declaring its own scroll-detection logic.

## 8. Brand consistency checklist (apply to every beat doc)

- Ink `#13111E` / Lavender `#7C6FE0` (interactive-only) / Mahua Gold
  `#D4920E` (the knob/Pulse only) / Paper `#FAF9F5` / Mist `#EDE9FF`. No
  gradients anywhere.
- 8-unit monoline stroke, round caps, wherever a mark-scale element appears.
- Base easing `cubic-bezier(.45,0,.25,1)`; settle easing
  `cubic-bezier(.2,.9,.3,1.1)` — same as the existing motion system, so nothing
  in the new sequence moves with a different "feel" than beats 1/3/8 which
  already shipped.
