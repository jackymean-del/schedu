# Scene 2 — Create modal: pick a board → AI pre-fills → Step 1 Resources

**Caption:** "Pick your board. It fills the rest."
**Duration:** 2800ms
**Sources of truth:** `frontend/src/pages/dashboard.tsx` `CreateTimetableModal`
(board chips ~609-630, auto-create tags ~676-702, footer "Open wizard" ~723);
`frontend/src/routes/wizard/step-resources-v2.tsx` (sidebar layout comment
lines 4-15, TAB_META 44-48, AI status strings ~404-406).

## Real mechanics (verified)

Board selection happens in the **create modal (Step 0)**, not inside Step 1 —
the scene is staged in two beats to stay honest:

1. **In the modal:** cursor clicks the `CBSE` board chip (chips: CBSE · ICSE
   · IB · State · Custom; active = `#059669` green fill, dashboard.tsx:619).
   Outcome: the green "✨ schedU will auto-create editable" panel
   (`#F0FDF9`/`#A7F3D0`) populates with tag pills — `Class I–X · 24 sections`,
   `~38 subjects`, `42 teachers`, `Rooms 101–160` — this is the real
   live-preview behavior (`buildPreview`, dashboard.tsx:442).
2. **Cut to Step 1 Resources:** the wizard shell appears — left sidebar
   (172px) listing `Classes 24 · Subjects 38 · Faculty 42 · Venues 60` with
   counts ticking up from 0, content panel showing the Classes table filling
   with rows. A transient status pill shows the real AI copy:
   *"Applying CBSE curriculum standards…"* → *"✓ CBSE curriculum assigned"*
   (step-resources-v2.tsx:404, 423).

## Mockup structure (beat 2)

```
┌ sidebar ─────┐┌ Classes panel ─────────────────────────────┐
│ ▸ Classes 24 ││ Name      Grade   Room    Class teacher    │
│   Subjects 38││ I-A       I       R-101   (auto)           │
│   Faculty 42 ││ I-B       I       R-102   (auto)           │
│   Venues 60  ││ …rows cascade in (stagger 60ms)…           │
│ [Readiness]  ││                                            │
└──────────────┘└────────────────────────────────────────────┘
[← Back]        Step 1 of 5                    [Next: Shift & timing →]
```

Tab labels exactly as `TAB_META`: Classes / Subjects / **Faculty** / **Venues**
(not "Teachers/Rooms" in the UI). Footer step indicator: "Step 1 of 5".

## Cursor path & timing

| ms | action |
|---|---|
| 0–450 | cursor over the modal, moves to CBSE chip |
| 500 | **click** — chip flips to green fill; tag pills cascade in (550–950) |
| 1000–1250 | glides to "Open wizard →" (ink `#13111E` button), **click** at 1300 |
| 1450 | cut to Step 1 shell; sidebar counts roll up; rows cascade |
| 1600–2400 | AI status pill types/swaps: "Applying CBSE curriculum standards…" → "✓ CBSE curriculum assigned" |

## RM frame

Step 1 shell fully populated, status pill in its final "✓ CBSE curriculum
assigned" state.

## Fidelity notes

- Honest: board → auto-created resources is real (`buildPreview` +
  `runAIAssignment`). The counts used (24/38/42/60) mirror the layout
  comment's own example numbers (52/38/84/60 rounded to demo scale).
- Do not show subjects with periods yet — periods/teacher matching is
  Step 3's story.
