# Open Questions & Fidelity Flags

Every deviation between the brief's script and the verified product code,
plus items needing confirmation before build. Nothing here was silently
idealized in the scene docs — each scene shows the real flow.

## 1. Scene 3 (Bell/Rhythm) — no "auto-generate" click exists ✅ resolved in doc

The brief: "cursor sets a start time, clicks auto-generate." Verified
reality (`step-bell.tsx:2377-2401`): the explicit generate button was
**removed**; the grid regenerates reactively on any Smart-Bell setting
change ("Replaces the explicit 'Generate Bell Schedule' button"). A
`Regenerate` button survives only as a manual escape hatch.
**Resolution taken:** scene 3 shows edit-field → instant rebuild (the real,
stronger behavior) and the caption was rewritten to "Set the start. Every
period times itself." **Needs sign-off** if marketing wants the literal
"One click" line back — the only honest one-click referent is the Smart
Lunch card.

## 2. Scene 5 (Groups & Combos) — no typed "Physics AND Chemistry" input ✅ resolved (signed off 2026-07-11)

The brief: "cursor types 'Physics AND Chemistry' then 'Painting OR PE'."
Verified reality (`step-student-groups.tsx`): combos are built via
blocks/cards + AI Suggest + headcount matrices + Same/Cross merge toggles +
"Generate teaching groups". **No free-text combo syntax exists anywhere in
Step 4.** Decision: **show the real UI only** — the scene doc's flow (AI
Suggest → block card → Cross merge → Generate teaching groups) is final.
No typed command-bar will be faked; if one is ever built as a product
feature, revisit the scene then.

## 3. Scene 8 (Print) — no Digital/Print toggle ✅ resolved in doc

The brief (and the current marketing HeroMovie) show a Digital⇄Print
toggle. Verified reality: print is a **format card in the Publish/Export
panel** ("Print / PDF — opens new tab, auto-triggers browser print",
`PublishExportPanel.tsx`). Scene 8 shows the real export-panel flow. The
existing marketing hero's toggle should be retired when this ships.

## 4. Scene 10 (Task assignment) — click-modal, not drag-and-drop ✅ resolved in doc

The brief: "cursor drags a task onto a free teacher." Verified reality:
click `+` on a free-now chip → `AssignTaskModal` → pick/type duty → Assign.
No drag-and-drop task assignment exists. Scene shows the real flow (which
also demos the fairness banner — the stronger differentiator anyway).

## 5. Scene 6 (Solve narration) — use UI labels, not engine internals ✅ resolved in doc

The brief pointed at `schedulingEngine.ts` for stage names. The engine's
internal passes (Pass 0/1/2, re-optimisation) are NOT user-facing; the real
generate screen shows its own staged labels + a feed of genuinely computed
assignments (`step6-generate.tsx:305-342`). The scene uses those verbatim
labels — they're already honest condensations of the engine phases.

## 6. Scene 2 — board is picked in the create modal, not Step 1 ✅ resolved in doc

"Step 1, Resources: cursor picks a curriculum/board" — board chips live in
the **CreateTimetableModal (Step 0)**; Step 1 then auto-creates resources.
Scene 2 stages both beats in sequence (modal pick → Step 1 fill), keeping
the brief's intent with the real screen boundaries.

## 7. Demo dataset consistency — ✅ resolved (defaults accepted 2026-07-11)

One coherent demo school across all scenes: **"Sunrise Public School"**,
classes I–X, teacher cast Mr. Rao / Ms. Iyer / Mr. Das / Mrs. Paul /
Mr. Sharma (the names already established in the marketing animations).
Scene 3's bell groups use I–V / VI–VIII / IX–X (age bands of the same
school).

## 8. Institution-aware labeling (Task 3 dependency)

Scene 3 displays "Shift & timing" (real wizard label) with the "Schedule
Rhythm" card. The brief's "Rhythm Engine / Bell Schedule" naming depends on
Task 3's terminology system (`useTerminology`/`T.schedule` exists in code —
step6 uses `T.schedule` already). **Resolved (defaults accepted
2026-07-11):** the walkthrough uses the real UI strings as designed —
step header "Shift & timing", card title "Schedule Rhythm", CTA
"✨ Generate Schedule".

## 9. Reduced-motion pin scene — ✅ resolved (defaults accepted 2026-07-11)

Reduced-motion pins to **scene 7 (finished timetable)**, with the progress
dots remaining clickable so every scene's static resolved frame stays
reachable.

## 10. Existing HeroMovie replacement scope

This walkthrough **replaces** `HeroMovie.tsx` (11 abstract scenes) with 13
real-screen scenes. The Live scene, Assign modal, and Play-Head work from
the current HeroMovie carries over nearly verbatim (scenes 9–10 reuse those
verified reproductions). Confirm: replace in place at the same slot on
`marketing/app/page.tsx` (movie first, text after — established layout).
