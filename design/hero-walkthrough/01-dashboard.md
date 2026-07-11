# Scene 1 — Dashboard → "New schedule"

**Caption:** "Start here."
**Duration:** 2600ms
**Source of truth:** `frontend/src/pages/dashboard.tsx` (greeting row ~1536,
CTA ~1549, Pulse ~1567, "Your schedules" ~1587, `CreateTimetableModal` ~418).

## Mockup structure

```
┌ stage ─────────────────────────────────────────────────────┐
│ Good morning, Priya                    [ + New schedule ]  │  ← h1 20px/700 + gradient CTA
│ Sunrise Public School · AY 2026–27                         │  ← 13px #6B7280
│ ┌ Pulse strip ─────────────────────────────────────────┐  │
│ │ ● All 24 classes covered today · 2 teachers on leave │  │  ← one status line
│ └──────────────────────────────────────────────────────┘  │
│ Your schedules                                   3 total   │  ← h2 15px/700
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│ │ AY 2026–27   │ │ VI–X TT      │ │ Exam block   │        │  ← schedule cards
│ │ 🟢 Published │ │ 🟡 Draft     │ │ 🟡 Draft     │        │
│ └──────────────┘ └──────────────┘ └──────────────┘        │
└────────────────────────────────────────────────────────────┘
```

Faithful details: "New schedule" button (NOT "New Timetable" — real label,
dashboard.tsx:1561) uses `linear-gradient(135deg,#7C6FE0,#5D4FCF)`, white
text 14px/700, radius 10, `+` icon. Greeting is time-of-day dynamic in the
real app; mockup hardcodes "Good morning".

## Cursor path & timing

| ms | action |
|---|---|
| 0–500 | cursor fades in bottom-left, idles |
| 500–1100 | glides to the "+ New schedule" button (top-right) |
| 1200 | **click** — ring pulse; button plays a 120ms press-scale |
| 1350–2600 | **outcome:** the `CreateTimetableModal` slides up over a dim
  overlay: header "Create new schedule" + sub "AI will generate all defaults
  — you only refine." — establishing where scene 2's board pick happens |

## Click outcome (mandatory)

The modal appearing IS the outcome; scene 2 opens inside this modal, so the
cut is causally continuous (click → modal → scene 2 acts in the modal).

## RM frame (reduced motion)

Dashboard with the modal already open, no cursor.

## Fidelity notes

- Pulse strip is a simplification of `DashboardPulse` (a status line + action
  chip) — same position, same one-line-status idea. OK.
- Schedule cards simplified to name+status chip; real cards also show
  counts/menu icons. Acceptable at miniature scale.
