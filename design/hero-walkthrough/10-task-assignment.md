# Scene 10 — Live view: assign a task to a free teacher

**Caption:** "Assigned fairly. Automatically."
**Duration:** 3000ms
**Source of truth:** `frontend/src/pages/calendar.tsx` — free-chip "+"
affordance in LiveBoard (free resources "can be given a task", ~1217),
`AssignTaskModal` (~1160), work-history-powered fairness note (~1152: "Work
history for this resource — powers the fairness note"), task blocks styled
amber/`TASK_COLOR` distinct from lessons (~95-99). Modal copy verified
earlier this project: orange header "Assign a task", field "What should this
slot be used for? *", quick chips (Substitution cover, Exam invigilation,
Library duty, Admin support, Lesson planning, Student counselling), fairness
banner "This would be …'s first extra duty this week — a fair pick. 💪".

## Real mechanics (verified — DEVIATION FROM BRIEF)

The brief scripted "cursor **drags** a task onto a free teacher." **The real
flow is click, not drag:** click the `+` on a free-now chip → the Assign a
task modal opens for that teacher/slot → pick or type the duty → Assign.
The fairness advisory is computed from the teacher's real work history.
The scene uses the real click-modal flow.

## Mockup structure

```
● Free now · 3
  (Mr. Das · 2 today · ⊕)   ← click target
        ↓
┌ Assign a task ─────────────────────────── (orange grad header) ┐
│ 📌 Assign a task                                                │
│ Teacher: Mr. Das · Period 4 · 2026-07-09                        │
│ ┌ green banner ─────────────────────────────────────────────┐  │
│ │ ● This would be Mr. Das's first extra duty this week —    │  │
│ │   a fair pick. 💪                                          │  │
│ └───────────────────────────────────────────────────────────┘  │
│ What should this slot be used for? *                            │
│ [Exam invigilation▊]              ← simulated typing            │
│ (Substitution cover)(Exam invigilation)(Library duty)…          │
│                                   [Cancel] [Assign]             │
└─────────────────────────────────────────────────────────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–400 | cursor to the ⊕ on Mr. Das's free chip, **click** at 450 |
| 600 | modal slides up; fairness banner cascades in at 800 (it's the hero moment — let it land alone) |
| 1000–1250 | cursor to the **Exam invigilation** chip, **click** at 1300 — chip highlights amber AND the input fills via 600ms simulated typing with caret |
| 1900–2150 | cursor to **Assign**, **click** at 2200 |
| 2350 | **outcome:** modal dismisses; back on the board, Mr. Das's chip swaps: `+` → amber task tag "Exam invig. · P4 ✓" (task-amber, visually distinct from lessons — real TASK_COLOR convention) |
| 2500–3000 | hold |

## RM frame

Board after assignment: Mr. Das chip in its assigned state; a static
mini-rendering of the fairness line beneath the caption.

## Fidelity notes

- Drag→click correction flagged in 99-open-questions.md.
- Fairness copy is verbatim product copy — keep the 💪.
