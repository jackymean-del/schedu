# Scene 4 — Step 3, Allocation

**Caption:** "Every teacher, matched automatically."
**Duration:** 2600ms
**Source of truth:** `frontend/src/routes/wizard/step-allocation.tsx` — sub-tabs
"Period allocation · Teacher allocation · Validation" (809-811), footer
"Step 3 of 5 · Period allocation → Teacher allocation → Validation" (1019),
validation success copy "All checks passed. Ready to proceed to Student
Groups." (1489); cell syntax from `frontend/src/lib/allocationSyntax.ts`
("5", "5+1", "4+1L", "3(2X)" — real parse grammar).

## Real mechanics (verified)

The Period allocation grid is a spreadsheet: rows = sections, columns =
subjects, cells hold the compact allocation syntax (`5`, `4+1L`, `3(2X)`).
Teacher allocation view maps teacher × section×subject. The Validation tab
runs checks and, when clean, shows a green "Validation passed / All
allocation rules satisfied" panel. AI fill exists (auto-assign teachers with
board-standard caps, step-resources/allocation AI paths) — cells filling
"automatically" is honest.

## Mockup structure

```
[Period allocation]* [Teacher allocation] [Validation]      ← sub-tabs
┌ grid ──────────────────────────────────────────────────────┐
│         Maths   Science  English  Hindi   S.St    Total    │
│ IX-A    5       4+1L     5        4       4       23/24 ✓  │
│ IX-B    5       4+1L     5        4       4       23/24 ✓  │
│ X-A     6       5+1L     5        4       4       25/25 ✓  │
│ …cells type themselves in a cascade, DM Mono…               │
└─────────────────────────────────────────────────────────────┘
Step 3 of 5 · Period allocation → Teacher allocation → Validation
```

Cells use DM Mono; the `+1L` lab suffix renders in a subtler tone. Row
totals tick to green ✓ as each row completes.

## Cursor path & timing

| ms | action |
|---|---|
| 0–900 | grid cells auto-fill in a left→right, top→down cascade (~50ms/cell); no cursor action needed — this is the AI fill |
| 900–1200 | cursor glides to the **Validation** tab, **click** at 1250 |
| 1400 | **outcome:** validation panel swaps in: three check rows tick green in sequence — "Period totals fit weekly capacity ✓" / "Every allocated cell has a teacher ✓" / "No teacher over daily cap ✓" — then the real success line: **"All checks passed. Ready to proceed to Student Groups."** (`#F0FDF4` green panel) |
| 1900–2600 | hold |

## RM frame

Validation tab open, all checks green, success line visible.

## Fidelity notes

- The three check labels are condensed from the real validation categories
  (capacity fit, unassigned-teacher detection, over-cap warnings — lines
  119-330). Keep them as condensations, not inventions.
- Show the real cell syntax (`4+1L`) — it's distinctive and honest; don't
  simplify to bare numbers everywhere.
