# Scene 6 — Step 5, Review & Generate (the solve)

**Caption:** "Every conflict — resolved."
**Duration:** 3400ms
**Source of truth:** `frontend/src/routes/wizard/step6-generate.tsx` —
preflight banner "✓ Every class fits its weekly capacity — ready to
generate." (1058), CTA "✨ Generate Schedule" (1168), progress STEPS labels
(305-317), real-assignment feed (`flattenAssignments`, 325-342: lines like
"IX-A → Maths · Mr. Rao" revealed alongside the ring), completion CTAs
"View Schedule (Draft) →" + "↺ Re-generate" (1185-1192). Solver passes for
honesty cross-check: `frontend/src/lib/schedulingEngine.ts` (Pass 0 optional
blocks, Pass 1 class teachers in P1, Pass 2 constraint fill, teacher
re-optimisation ~1385, penalties/stddev ~1575).

## Real mechanics (verified)

The solve is synchronous; the UI then plays a progress ceremony using the
**real staged labels** and a feed of **real computed assignments** ("instead
of a fabricated animation… genuinely shows the schedule being assembled" —
file comment 319-324). The scene must use those exact on-screen labels, NOT
invented engine jargon. Labels available (subset for time):

1. "Reading school setup…" (8%)
2. "Matching teachers to subjects…" (30%)
3. "Building the weekly schedule…" (55%)
4. "Ensuring no teacher is double-booked…" (65%)
5. "Checking for conflicts and gaps…" (90%)

Each maps to a real engine phase (setup read / teacher matching / Pass 2
fill / clash constraints / conflict scan) — honest by construction.

## Mockup structure

```
┌ preflight ✓ Every class fits its weekly capacity — ready to generate. ┐
│                    ┌────────────┐                                     │
│                    │   ◔ 55%    │   Building the weekly schedule…     │
│                    └────────────┘                                     │
│  ✓ IX-A → Maths · Mr. Rao                                             │
│  ✓ X-B  → Science · Ms. Iyer         ← real-style feed lines,         │
│  ✓ VII-C → G.K. · Art&Craft T.1        green ✓, cascade upward        │
└────────────────────────────────────────────────────────────────────────┘
   → completion: 🎉  0 conflicts   [View Schedule (Draft) →]
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–400 | preflight green line visible; cursor to **✨ Generate Schedule**, **click** at 450 (button press-scale) |
| 600–2500 | ring sweeps 0→98%; the 5 stage labels swap at ~380ms intervals; feed lines cascade (6–8 lines, staggered 220ms) |
| 2600 | **outcome:** ring snaps to 100% → badge stamps in: **"0 conflicts"** (ink pill, gold dot — consistent with the marketing brand stamp) + "View Schedule (Draft) →" button appears |
| 2750–3050 | cursor to "View Schedule (Draft) →", **click** at 3100 — this click IS the transition into scene 7 (causal cut) |

## RM frame

Completed state: ring at 100%, "0 conflicts", View button visible.

## Fidelity notes

- "0 conflicts" is the honest completion for the demo dataset; the real UI
  routes to a full ReviewDashboard with score/penalties — too dense for a
  miniature. Flagged as an acceptable condensation (the dashboard exists;
  we're not inventing capability).
- Use ONLY the verbatim STEPS labels above — they're already user-facing copy.
