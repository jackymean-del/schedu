# Scene 12 — Reports & Analytics

**Caption:** "Track it, term over term."
**Duration:** 2200ms
**Source of truth:** `frontend/src/pages/insights.tsx` — PageHeader
"📊 Reports & Analytics" with multi-schedule subtitle ("Combined insight
across all N active schedules", 101), tabs Summary / Faculty / Class /
Trends / Leave Types / Cancelled Lessons / Extra Duties (87-93),
`TrendsChart` inline SVG line chart (200+), coverage-rate stat (96-97),
XLSX export action (102).

## Real mechanics (verified)

The Reports page has a stat-tile summary row (coverage rate, substitutions,
cancelled, duties), a tab rail, and an inline-SVG trends line chart. With
multiple schedules active it aggregates across all of them — worth one
subtitle nod since multi-active is a product differentiator.

## Mockup structure

```
📊 Reports & Analytics                        [Export ⭳]
Combined insight across all 2 active schedules.
[Summary]* [Faculty] [Class] [Trends] [Leave Types] …
┌ stat tiles ────────────────────────────────────────────┐
│  94%           31            4             12          │
│  coverage      substitutions cancelled     extra duties│
└─────────────────────────────────────────────────────────┘
┌ Trends ────────────────────────────────────────────────┐
│      ╭──●                                               │
│   ╭──╯     line draws left→right (stroke-dash reveal),  │
│ ●─╯        last point gold #D4920E                      │
│ Mon  Tue  Wed  Thu  Fri                                 │
└─────────────────────────────────────────────────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–500 | header + tabs settle; stat tiles count up (odometer-style, 500ms) |
| 500–1600 | line chart draws via stroke-dashoffset; points pop in sequence |
| 1600–1850 | cursor hovers the last point — a small `#13111E` tooltip with the value appears (matches the marketing scrolly Beat10 hover behavior AND the app's chart affordance) |
| 1850–2200 | hold |

## RM frame

Fully drawn chart + populated tiles, tooltip hidden.

## Fidelity notes

- Numbers are illustrative; the tab labels, page title, subtitle phrasing,
  and export affordance are verbatim from insights.tsx.
- Keep this scene passive-ish (one hover, no click) — it's the exhale before
  the brand close.
