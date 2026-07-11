# Scene 7 — Finished timetable (Standard view)

**Caption:** "Your timetable. Done."
**Duration:** 2000ms
**Source of truth:** `frontend/src/pages/timetable.tsx` (the post-generate
destination — "View Schedule (Draft) →" navigates to `/timetable`), grid
cell components in `frontend/src/components/timetable/` (TimetableCell,
PeriodHeader, Toolbar).

## Real mechanics

The draft schedule opens as the class-by-period color-coded grid: rows =
periods with times, columns = weekdays (or the entity variant), each cell =
subject band + teacher + room. Header shows the schedule name and a
🟡 Draft status chip (status naming per step6-generate.tsx:1075).

## Mockup structure

```
AY 2026–27 · Main Schedule            🟡 Draft      IX-A ▾
┌──────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│      │ Mon     │ Tue     │ Wed     │ Thu     │ Fri     │
│ P1   │ Maths   │ English │ Maths   │ Science │ Hindi   │
│ 8:10 │ Mr. Rao │ Mr. Das │ Mr. Rao │ Ms.Iyer │ Mrs.P   │
│ P2   │ Science │ Maths   │ S.St    │ English │ Maths   │
│ …    │ (subject-tinted cells, teacher + room meta)     │
│ LUNCH│ ───────────── #FEF3C7 band ─────────────────────│
│ P5-P8│ …                                               │
└──────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

Subject tints reuse the app's soft pastel families (violet/blue/green/pink),
lunch row uses the real `#FEF3C7`/`#D97706` band.

## Cursor path & timing

| ms | action |
|---|---|
| 0–200 | continuity from scene 6's click: page "loads" |
| 200–1300 | cells cascade in column-by-column (Mon→Fri, ~120ms/column) — the reveal is the payoff of the whole wizard |
| 1300–2000 | hold; no cursor interaction (breathing beat between two interactive scenes) |

## RM frame

Full grid, static. **This is also the global reduced-motion pin scene**
(see 00-frame-and-loop.md §5) — it's the single most informative frame.

## Fidelity notes

- Grid orientation (periods as rows, days as columns) matches the app's
  class Standard view; the marketing hero's hour-column grids are a
  different (calendar Day) surface — don't mix them here.
