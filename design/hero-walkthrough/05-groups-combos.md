# Scene 5 — Step 4, Groups & Combos (AND / OR)

**Caption:** "One teacher, two subjects — handled."
**Duration:** 3000ms
**Source of truth:** `frontend/src/routes/wizard/step-student-groups.tsx` —
tabs "AND Groups / OR Groups" (1047), toolbar "Combination blocks" + **AI
Suggest** (amber, Sparkles icon, 1072-1074) + **New block** (violet, 1075),
Global merge Same/Cross toggles per Section/Grade/Stream/Block (1114-1126),
guide steps incl. "press 'Generate teaching groups'" (1095).

## Real mechanics (verified — IMPORTANT DEVIATION FROM BRIEF)

The brief scripted: *cursor types "Physics AND Chemistry" then "Painting OR
PE"*. **The real Step 4 has no free-text combo input.** Combos are built
as blocks/cards: sections as rows, subjects as columns, headcounts summing
to section totals, then "Generate teaching groups" pools them by the
Same/Cross merge scope. The honest scene uses the real controls:

1. **AI Suggest** click → combination blocks appear pre-built (real:
   `suggestAndComboGroups`, aiSuggested flag).
2. A block card shows `Physics · Chemistry` columns over sections
   `XI-Sci-A / XI-Sci-B` with headcounts and a green ✓ sum rail.
3. Cursor flips one Global-merge toggle **Section: Same → Cross** (real
   toggle pair, amber "Cross" fill #F59E0B when active) → **click
   "Generate teaching groups"** → group chips visibly merge across
   sections (two section-scoped chips collapse into one cross-section
   chip labeled with both sections + headcount).
4. Quick cut to the **OR Groups** tab: an elective slot card
   `Painting OR PE` — "students pick one option" (SubjectGroupsSection).

## Mockup structure

```
[AND Groups]* [OR Groups]                       [✨ AI Suggest] [+ New block]
Combination blocks — each card = one optional group
┌ Block: Science XI ─────────────────────────────────────────┐
│ Section   │ Physics  Chemistry │ Total                     │
│ XI-Sci-A  │   28        24     │  52 ✓                     │
│ XI-Sci-B  │   26        26     │  52 ✓                     │
│ Global merge: Section [Same|Cross*] Grade [Same*|Cross] …  │
│               [Generate teaching groups]                    │
│ → Groups: (Physics · XI-Sci-A+B · 54 · Lab-1)              │
│           (Chemistry · XI-Sci-A+B · 50 · Lab-2)   ← merged │
└─────────────────────────────────────────────────────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–400 | cursor to **✨ AI Suggest**, **click** at 450 |
| 600 | **outcome 1:** block card cascades in with headcounts + green ✓ rail |
| 900–1200 | cursor to the Section merge toggle, **click "Cross"** at 1250 (flips to amber) |
| 1400–1650 | cursor to **Generate teaching groups**, **click** at 1700 |
| 1850 | **outcome 2:** two per-section group chips animate/merge into cross-section chips (translate toward each other + swap to the merged chip) |
| 2200 | cut: **OR Groups** tab flashes active; elective card `Painting OR PE` with note "one runs at a time per student choice" |
| 2500–3000 | hold |

## RM frame

AND tab with merged cross-section group chips visible + the OR card shown
below (both states composited, since RM has no tab-cut).

## Fidelity notes

- **Typed-syntax flag:** replaced per above. If marketing wants a typed
  moment, the only real typed grammar in the product is the allocation-cell
  syntax (scene 4) — do not put a fake combo command bar in this scene.
- Merge scope semantics (Same/Cross per Section/Grade/Stream/Block) match
  `SCOPE_DIMS` exactly — reuse those four axis labels verbatim.
