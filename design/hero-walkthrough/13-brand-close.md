# Scene 13 — Brand close

**Caption:** "The last schedule you'll ever fix by hand."
**Duration:** 2600ms
**Source of truth:** brand system `design/brand/` (Fader U mark: path
`M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22`, stroke 8 round-cap, gold knob
`circle cx=36 cy=12.5 r=4.5`); headline is the site's existing H1 — the loop
ends by landing on the page's own promise.

## Mockup structure

The device frame's stage dims to the brand ink (`#13111E`) — the ONLY dark
moment in the walkthrough, marking "end of demo":

```
┌ stage (ink) ───────────────────────────────┐
│                                            │
│              ╭─╮  ← gold knob (#D4920E)    │
│              │ │                           │
│              ╰─╯  Fader U stroke-draws in  │
│                                            │
│        The last schedule you'll            │
│        ever fix by hand.                   │
│                                            │
│        [ Start free — no credit card ]     │
└────────────────────────────────────────────┘
```

## Timing

| ms | action |
|---|---|
| 0–300 | stage crossfades to ink |
| 300–1200 | U mark stroke-draws (stroke-dashoffset 80→0), knob pops at 1100 with a tiny overshoot scale |
| 1300 | headline fades up |
| 1700 | gold CTA fades up; cursor makes one final glide to it and **hovers** (no click — the visitor's own cursor should take over here; a fake click on a real CTA would be confusing) |
| 2000–2600 | hold → loop wraps to scene 1 with the standard crossfade |

## RM frame

Mark fully drawn + headline + CTA, static.

## Fidelity notes

- The CTA inside the frame mirrors the page's real "Start free" button but
  is decorative (the real one sits below the hero). Ensure it is
  `aria-hidden` / non-focusable to avoid a duplicate-CTA tab stop.
- The cursor deliberately does NOT click — every other scene's clicks show
  product outcomes; this one hands intent back to the visitor.
