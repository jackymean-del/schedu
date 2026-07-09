# Beat 6 · Optimization — every conflict, found and fixed

**Caption:** "Every conflict — found and fixed."

**Persists from Beat 5:** opens on the exact grid Beat 5 ended on (2 flagged
cells). **Hands off to Beat 7:** the fully-resolved grid is what Beat 7
re-renders in print styling.

---

## Composition

The same grid, now with small red conflict badges appearing then dissolving
one at a time as the "engine" resolves them — no console/faders this time
(that's Beat 1's job); this beat is deliberately quieter, just the grid and
its badges, so it reads as a distinct moment ("now it double-checks itself")
rather than a rerun of Beat 1.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–10% | Both conflict badges visible, gently pulsing (drawing the eye). |
| 10–50% | Badge 1: a small magnifying/scan sweep crosses its cell (a thin
  gold line, 300ms), then the badge dissolves and the cell's tint
  brightens to full opacity (was dimmed while flagged). |
| 50–90% | Same beat for badge 2, offset. |
| 90–100% | Both clear. A small "✓ 0 conflicts" line (text only, no big stamp
  — that's Beat 1/11's motif) fades in bottom-corner, quieter than the hero's
  stamp so it doesn't compete. |

## Interaction (bonus layer)

**Clicking a conflict badge** triggers its resolve animation immediately,
on demand, rather than waiting for scroll position to reach it — a single
`pointerdown` handler per badge (2 total) that adds a `.resolving` class,
identical to the class the scroll-driven path would have added at the
matching percentage. If a visitor clicks both immediately, the beat
"finishes early" and just holds on the clean state until they scroll past —
correct either way.

## Reduced-motion static frame

Both badges already dissolved, both cells full-opacity, "0 conflicts" line
visible — the after-state, never the flagged state (reduced-motion visitors
should see the *resolved* product, not the problem).

## Honesty

No fabricated "conflicts avoided" counter or number — just the two
illustrative badges already established in Beat 5, resolved.
