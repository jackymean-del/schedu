# Scene 3 — Step 2, Shift & Timing (Bell Schedule)

**Caption:** "Set the start. Every period times itself."
(Deliberately NOT "One click. Every period timed." — see fidelity notes: the
real flow is zero-click, which is a *stronger* claim and the honest one.)
**Duration:** 3000ms
**Source of truth:** `frontend/src/routes/wizard/step-bell.tsx` — Schedule
Rhythm card ~3681, Start/End/Duration/Max fields ~3888-3942, auto-generate
effect ~2377-2401 ("Replaces the explicit 'Generate Bell Schedule' button"),
lunch mode chooser ~4909-4947 (Single Lunch 🕐 / Smart Lunch 🧠), staggered
per-group lunch ~604-704, row colors: lunch `#FEF3C7`/`#D97706` (line 205).

## Real mechanics (verified — IMPORTANT)

There is **no "auto-generate" button** in today's product. With Smart Timing
on, the bell grid regenerates **reactively** whenever start time, end time,
lunch mode, or class groups change (`_autoGenKey` effect, line 2385). A
`Regenerate` button exists only as a manual escape hatch. The original brief
("cursor … clicks auto-generate") would show a button that doesn't exist —
this scene instead shows the real, better behavior: edit a field → the whole
day rebuilds instantly.

Staggered breaks are real: "Smart Lunch — Each age group eats at a different
time. Avoids canteen rush." (line 4937), with per-group lunch periods.

## Mockup structure

```
┌ Schedule Rhythm card ──────────────────────────────────────┐
│ ⧉ Main Shift                                               │
│ Start time   End time      Duration (min)   Max/day        │
│ [08:00]      [02:10 PM ✎]  [40]             [8]            │
│              generation target                              │
│ LUNCH BREAK MODE                                            │
│ ┌ 🕐 Single Lunch ┐  ┌ 🧠 Smart Lunch ────────────┐        │
│ │ one common slot │  │ each age group eats at a   │ ← active│
│ └─────────────────┘  │ different time              │        │
│                      └────────────────────────────┘        │
├ Bell grid (per class-group columns) ───────────────────────┤
│         Pre-Pri      I–V          VI–X                     │
│ 08:00   Assembly     Assembly     Assembly                 │
│ 08:10   P1           P1           P1                       │
│ …       LUNCH 11:00  P4           P4         ← staggered   │
│ …       P5           LUNCH 11:40  P5         ← lunch bands │
│ …       P6           P5           LUNCH 12:20  (#FEF3C7)   │
└────────────────────────────────────────────────────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–500 | cursor to the Start time field |
| 550 | **click** into it; simulated type "08:00" (caret + steps reveal, 550–1050) |
| 1100 | **outcome 1:** the bell grid below rebuilds — rows cascade in with all times recomputed (this is the reactive auto-gen, no button) |
| 1500–1800 | cursor to the 🧠 Smart Lunch card, **click** at 1850 (card gets `#7C6FE0` 2px border + `#F5F3FF` fill — real active style, line 4925-4926) |
| 2000 | **outcome 2:** grid rebuilds again — the single shared lunch band splits into three staggered `LUNCH` bands, one per group, each at a different time slot |
| 2200–3000 | hold on the staggered grid |

## RM frame

Final grid with staggered lunches, Smart Lunch card active, no cursor.

## Fidelity notes / open dependency

- **Flagged per brief:** scene shows NO generate click because none exists;
  the caption was rewritten accordingly. If marketing insists on the
  "one click" line, the honest referent is the Smart Lunch card click.
- "Rhythm Engine" naming: the real card header is **"Schedule Rhythm"**
  (line 3681); the K-12 demo displays "Bell Schedule" per Task 3's
  institution-aware labeling — use "Shift & timing" (the real wizard step
  label) in the step header and "Schedule Rhythm" on the card.
