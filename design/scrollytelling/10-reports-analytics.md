# Beat 10 · Reports & analytics — track workload and usage over time

**Caption:** "Track workload and usage over time."

**Persists from Beat 9:** the workload numbers shown on hover in Beat 9
become this beat's chart data points (same teachers, same illustrative
counts, now plotted across a week instead of shown as a single snapshot).
**Hands off to Beat 11:** the chart's final, highest bar/point is what
"settles" into the closing stamp's position (a small continuity wipe).

---

## Composition

A simple, clean bar or line chart (workload per teacher, or room-utilization
% — pick whichever reads more universally across school/college/corporate
contexts; recommend **room utilization %**, since "workload" skews
school-teacher-specific while "room usage" reads the same for a university
department or training center). One clear upward trend line, gold accent on
the final data point.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–10% | Empty axes, chart at 0. |
| 10–85% | Bars/line draw in left-to-right, matching scroll position
  directly (this is a `clip-path: inset()` reveal driven by `--p`, not a
  separate timed animation — cheapest possible implementation and it
  reads as "scrubbing through a week" which fits the page's overall
  motif). |
| 85–100% | Final data point gets the gold accent dot + a small "▲ 12%"
  label, settling with the standard settle easing. |

## Interaction (bonus layer)

**Hovering the chart** reveals exact numbers at that point (a vertical
guide-line + tooltip following the pointer's x-position, snapped to the
nearest data point) — implementable in plain CSS using a row of invisible
hover-target slices (one per data point, `:hover` reveals that slice's
tooltip via a sibling selector) — no charting library, no JS beyond
optionally smoothing the guide-line position (can ship JS-free with
discrete snapping, which is honestly the better, calmer interaction anyway).

## Reduced-motion static frame

Chart fully drawn, final data point's gold accent and label already shown,
no draw-in animation.

## Honesty

Axis labels present and real ("Room utilization, %", "Week"), but data
values are round, generic illustrative numbers — never implying this is a
real customer's live analytics.
