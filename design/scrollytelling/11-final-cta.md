# Beat 11 · Final CTA — the mark stamps in, the loop closes

**Caption:** "The last schedule you'll ever fix by hand."
**Button:** "Build yours now"

**Persists from Beat 10:** the chart's final gold data point performs a
short continuity wipe into this beat's opening position (same x/y
coordinate space, cross-fading from "data point" to "knob"). **This is the
last beat** — no further hand-off; instead it hands back to Beat 1
conceptually (see below), closing the loop the page opened with.

---

## Composition

Full-viewport-height, centered, quiet (the calmest beat on the page by
design — after 10 beats of demonstration, this one just needs to land the
promise). The Fader U mark, large, center-stage. Beneath it, in miniature,
a compressed replay of Beat 1's own "0 conflicts" resolve beat (the same
2-conflict-cells-resolving-to-a-stamp animation, at roughly 1/3 scale) —
literally bookending the page: the mark that started the story closes it.

```
                    U  (large Fader U mark)

           [tiny replay: 2 red cells → 0 conflicts]

        "The last schedule you'll ever fix by hand."

              [ Build yours now → ]
```

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–20% | Chart's final point wipes into the Fader U mark's knob position (the
  gold dot IS that data point, having traveled beats 9→10→11). |
| 20–50% | Mark draws in (stroke-dashoffset reveal, matching the mark's own
  established loading-animation language — literally reuse the `loading.svg`
  timing here). |
| 50–75% | Miniature 0-conflicts replay plays once beneath the mark. |
| 75–100% | Caption + button fade/settle in, button gets a subtle persistent
  glow (gold, very restrained — this is the one place on the whole page
  allowed a touch of "look here," since it's the terminal CTA). |

## SVG structure sketch

```html
<section class="beat-final">
  <svg class="mark-large" viewBox="0 0 52 52">…Fader U, stroke-dashoffset draw-in…</svg>
  <svg class="mini-replay" viewBox="0 0 200 100">…2 cells + stamp, 1/3 scale of Beat 1's…</svg>
  <h2>The last schedule you'll ever fix by hand.</h2>
  <a class="cta-button">Build yours now →</a>
</section>
```

## Interaction

Standard button — no special interaction beyond its own hover/focus states
(per the interactivity spec, Beat 11 is explicitly "standard button, no
scene interaction," since piling a gimmick onto the closing CTA would
undercut its job of being the one unambiguous, no-nonsense action on the
page).

## Reduced-motion static frame

Mark fully drawn, mini-replay already at its "0 conflicts" end state,
caption and button visible immediately, no glow pulse (glow is decorative;
button remains fully visible and clickable without it).

## Honesty

No caption needed here — there's no illustrative data left on screen by
this point, just the mark and the promise.
