# Beat 3 · Combination engine — merge (AND), then split (OR)

**Caption:** "One teacher, two subjects, zero clash."

**Persists from Beat 2:** the populated grid's subject cells become the
source of this beat's student-dots (a handful of cells visually "lift out"
of the grid and become dots at the start of this beat, a literal continuity
cut). **Hands off to Beat 4:** the resolved cluster's teacher/room labels
carry into Beat 4's first room assignment.

---

## Composition

Same Sankey layout as the already-shipped AND/OR engine animation: three
section rows of dots on the left, merging into parallel subject clusters
(AND), then re-splitting into a choice (OR) on the right. This beat *reuses*
that shipped visual almost exactly — the scrollytelling wrapper's job is to
drive it via scroll instead of a fixed loop, and add the hover interaction.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–8% | A few cells lift out of Beat 2's grid, become dots, settle into section rows. |
| 8–38% | Merge: dots travel into two parallel clusters (Physics / Chemistry) — same timing as shipped animation's merge phase. |
| 38–46% | Expression chip morphs "Phy AND Chem" → "PE OR Painting". |
| 46–88% | Split: dots redistribute into PE / Painting groups, 2–3 crossing visibly. |
| 88–100% | Hold on split state, then dots drain back toward the grid edge (foreshadowing Beat 4 picking them up as room assignments). |

## Interaction (bonus layer)

**Hovering a student dot** re-routes it live into the *other* subject group
for as long as the pointer stays over it (CSS-only: a sibling-selector swap
of the dot's `offset-path` reference via `:hover` toggling a class that
points at the alternate path — no JS). Releasing hover returns it to its
scroll-driven position. This literally demonstrates "a student can be
regrouped" as a direct manipulation, not just narration.

## Reduced-motion static frame

The split state (dots resting in PE + Painting, both expression chips shown
stacked) — identical static frame to the shipped AND/OR animation's
reduced-motion spec, for consistency.

## Honesty

Caption names the real feature ("Academic Combination Matrix") the same way
the shipped animation's caption does — this is the one beat allowed to name
the feature directly, since it's the differentiator.
