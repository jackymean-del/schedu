# Beat 5 · Allocation — every teacher, every period, auto-assigned

**Caption:** "Every teacher. Every period. Auto-assigned."

**Persists from Beat 4:** the period ticker becomes this grid's column
headers directly (same P1–P4 labels, same position left-to-right).
**Hands off to Beat 6:** the grid this beat ends on (fully filled, 2 cells
flagged) is the exact grid Beat 6 opens on and resolves.

---

## Composition

A larger, cleaner version of the recurring grid (5 rows × 4 columns this
time, to feel like a "real" timetable rather than the abstracted hero
version) filling itself cell-by-cell, each cell landing with a subject tint
+ teacher initials + room code — real-looking data, matching the visual
language already shipped in `ScheduleViews`/`HeroMovie`'s grid scenes.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–6% | Empty grid, headers only (carried over from Beat 4). |
| 6–90% | Cells fill in reading order (row by row), one every ~6% of scroll,
  each landing with the settle easing (`cubic-bezier(.2,.9,.3,1.1)`) — a
  small "stamp" tick, not a fade, so it reads as *placement*, not
  decoration. |
| 90–100% | Final two cells land already flagged red (setting up Beat 6 — these are the two conflicts Beat 6 will resolve). |

## SVG/DOM structure sketch

```html
<section class="beat-allocation">
  <div class="grid-real">
    <!-- 20 cells, each: subject tint, teacher initials, room code -->
    <div class="cell" data-teacher="Mr. Rao" data-reason="Least-loaded match for Maths, Grade 9">…</div>
  </div>
</section>
```

## Interaction (bonus layer)

**Hovering any filled cell** reveals a small tooltip: who's assigned and
*why* (e.g. "Mr. Rao — least-loaded teacher qualified for Maths, Grade 9").
Pure CSS: each cell carries its reason in a `data-reason` attribute,
revealed via `::after { content: attr(data-reason) }` shown on `:hover` —
zero JS, zero extra markup. This is the one beat that answers "why did it
pick this teacher," which is a real trust-building question visitors have
and the current site never answers anywhere.

## Reduced-motion static frame

Grid fully filled, two cells flagged red (the conflicts Beat 6 will
resolve), no per-cell landing animation.

## Honesty

Reasons given in tooltips are illustrative but plausible ("least-loaded,"
"qualified for subject") — phrased as example logic, not a literal claim
about the live algorithm's exact decision path for this demo data.
