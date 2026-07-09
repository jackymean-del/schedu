# Beat 9 · Task management — assigned fairly, automatically

**Caption:** "Assigned fairly. Automatically."

**Persists from Beat 8:** the substituted teacher's name/chip from Beat 8's
final toast is the same chip this beat's task card slots onto.
**Hands off to Beat 10:** the workload count shown on hover here is the same
number Beat 10's chart visualizes historically.

---

## Composition

A small stack of teacher name-chips (reusing the Free/In-session chip
language from Beat 8) with workload counts. A single task card ("Cover
P4 — Room 4, Grade 8B") slides in and settles onto the least-loaded free
teacher's chip, with a one-line fairness note appearing beside it.

```
  Mr. Rao · 18       Ms. Iyer · 14  ← task card lands here
  Mr. Das · 20       Mrs. Paul · 16
                                     "Ms. Iyer has the lightest
                                      load this week — assigned."
```

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–15% | Chips at rest, task card appears off to the side (unassigned). |
| 15–55% | Card slides/settles onto Ms. Iyer's chip (settle easing, one
  gentle overshoot). Her workload count ticks 14→15. |
| 55–80% | Fairness note fades in beside the card. |
| 80–100% | Hold; a faint highlight ring pulses once around the chosen chip
  to draw the eye back to *why* it was chosen (lightest load), then settles. |

## Interaction (bonus layer)

**Hovering any name chip** reveals that teacher's current workload count as
a small pill (even chips the task *wasn't* assigned to) — pure CSS, count
already present in the DOM via a `data-load` attribute, revealed via
`::after` on `:hover`. This lets a visitor manually verify "yes, Iyer really
did have the lightest load" by checking the others themselves.

## Reduced-motion static frame

Task card already settled on Ms. Iyer's chip, fairness note visible, no
slide/settle motion, no pulse ring (ring is decorative reinforcement, not
load-bearing information).

## Honesty

Workload numbers round, generic; fairness note phrased as an example
("lightest load this week") not a literal live computation claim.
