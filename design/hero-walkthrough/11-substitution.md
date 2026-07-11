# Scene 11 — Substitution: absent teacher → ranked cover

**Caption:** "Absent? Covered — instantly."
**Duration:** 3000ms
**Source of truth:** `frontend/src/pages/calendar.tsx` — per-teacher row
actions "Leave" (UserMinus icon, ~1072) and "Sub" (Repeat icon, ~1074-1076),
leave types list (77: Sick/Casual/Official Duty/Training/Personal/Other),
`candidatesFor` ranked substitute scoring (516-558: eligibility, busy
filter, canSub override, tier, today reg/sub counts, week load, streak,
score), `SubstitutePanel` + `assignSub` (1127-1135, 579), tier badges
(~2055-2059), auto-assign best candidate to every uncovered slot (~586).

## Real mechanics (verified)

In the calendar Day (Teachers lens), each teacher row has `⚑ Leave` and
`⇄ Sub` actions. Marking leave turns the teacher's row/name red
(onLeave → `#DC2626`, 1061-1062) and their slots uncovered. The Sub panel
ranks candidates by a real fairness score (tier + today's load + weekly
load + streak); assigning stamps the covering teacher onto the slot. An
auto-assign-all path exists for the whole day.

## Mockup structure

```
Mrs. Paul   [⚑ Leave] [⇄ Sub]        6 periods
▮▮▮▮ X-B Maths ▮▮ LUNCH ▮▮ IX-A Sci ▮▮▮   ← her day track
        ↓ (after Leave: name red, slots hatched "uncovered")
┌ Substitute — Mrs. Paul · Period 2 · X-B Maths ────────────┐
│ ① Mr. Sharma   Tier 1 · free now · 1 today · light week ✓ │ ← top-ranked
│ ② Mr. Das      Tier 2 · free · 2 today                    │
│ ③ Ms. Iyer     Tier 2 · free · 3 today                    │
│                          [Assign Mr. Sharma]               │
└────────────────────────────────────────────────────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–400 | cursor to Mrs. Paul's **⚑ Leave**, **click** at 450 |
| 600 | **outcome 1:** her name flips red, two lesson blocks get a hatched "uncovered" overlay + red corner flag |
| 800–1050 | cursor to **⇄ Sub**, **click** at 1100 |
| 1250 | Sub panel slides in; three ranked candidate rows cascade (score reasons visible: tier, free now, today count) — rank ① pulses once |
| 1700–1950 | cursor to **Assign Mr. Sharma**, **click** at 2000 |
| 2150 | **outcome 2:** panel closes; the hatched X-B block re-fills solid with "X-B Maths · Mr. Sharma (sub)" in the sub-blue style, red flag → green ✓ |
| 2350–3000 | hold |

## RM frame

Post-assignment state: red-named teacher, covered slot showing the sub
credit, panel closed.

## Fidelity notes

- Ranking factors shown (tier / free now / today's count / week load) are
  the actual `SubCandidate` fields — condense but don't invent (no
  "AI match %" style embellishment).
- The one-click "auto-assign all uncovered" exists; this scene shows the
  single-slot flow because it's more legible at miniature scale. Noted, not
  a fidelity problem.
