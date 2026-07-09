# Headline options, missed highlights, and globalization audit

> Companion to the 11-beat scrollytelling design. This doc is the "why we
> wrote it this way" — the actual copy lives in each beat's caption line and
> in `00-system.md`'s hero spec.

---

## 1. Headline — options beyond the decided one

The decided line — **"The last schedule you'll ever fix by hand."** — is
strong: it's a promise, not a feature list, and it bookends the page (hero →
final CTA) which is exactly right for a scrollytelling structure. Recommend
keeping it as the primary. Three alternates, in case you want to A/B test:

| # | Headline | Subhead | Read |
|---|---|---|---|
| ★ (decided) | **The last schedule you'll ever fix by hand.** | Tune it like sound, resolve it like a puzzle — across every building, room, and combination your institution runs. | Promise-first. Best opener. |
| B | **Stop fixing timetables. Start tuning them.** | One live console for every class, faculty member, room, and elective — resolved together, not one clash at a time. | Verb-first, punchier, slightly more aggressive. |
| C | **Zero clashes. Every time.** | schedU tunes your whole institution's schedule live — classes, faculty, rooms, and electives, resolved together. | Shortest, most confident. Risks sounding like a stat claim rather than a mechanic — pair carefully with the "Illustrative demo" honesty captions so it doesn't read as a live guarantee. |
| D | **Your schedule, live-tuned.** | Adjust one thing, watch everything resolve — classes, faculty, rooms, and electives, together. | Most literal tie to the Tuner Console mark. Quietest of the four; better as a subhead than a headline. |

**Recommendation:** keep ★, held in reserve as B for a future test — B is the
only alternate that beats ★ on energy without losing clarity.

**Globalization fix applied:** the decided subhead said "your school has" —
changed to **"your institution runs"** throughout so the same line works for
a K-12 school, a university department, or a corporate training program.
Same fix applied to every caption below (see §3).

---

## 2. Highlights the current 11 beats don't cover

Cross-checked against `PROJECT_REFERENCE.md`'s real feature set. Three real,
already-built differentiators aren't represented anywhere in the storyboard:

1. **Staggered class-wise breaks** — different class/grade groups take their
   break at different points in the day (§5 of PROJECT_REFERENCE calls this
   *the single most error-prone, hardest-won part of the whole product*). It
   doesn't have its own beat, and it's a genuine "nobody else does this"
   claim, stronger than several things that DO have a beat. **Recommend**
   folding one visual beat into Beat 5 (Allocation) or Beat 4 (Room &
   Building): as the grid fills, show two class-groups' break bands landing
   at visibly different times. Cheap to add (reuses the sand-colored break
   block already designed for Beat 4), high differentiation value.
2. **Multi-schedule scale** (several class-groups' schedules live at once,
   each independently editable) — gestured at only in the Beat 11 fanned-card
   nod. If budget allows a 12th beat, this earns one; otherwise the Beat 11
   fan is an acceptable compressed callback.
3. **Directory auto-fill / shared staff & venue reuse across schedules** — a
   real backend feature (type a teacher's name that matches one already used
   in another timetable, it auto-links) — not in any beat. Cheapest fix:
   fold a single micro-detail into Beat 2 (Data feeding) — when a name is
   typed that matches an existing record, show a one-frame "linked ✓" chip.
   Low cost, reinforces "this is a real system with memory," not a toy.

Two more are covered but **underweighted** given how much the current
homepage leans on them — consider whether they deserve a caption mention
even if no dedicated beat:
- **"Works with every curriculum, any board"** (IB, Cambridge, CBSE, etc.) —
  currently a whole homepage section on its own; the scrollytelling redesign
  has no equivalent. If this section is being retired in favor of the
  11-beat sequence, that's a real claim getting quietly dropped. Recommend
  either a light touch in Beat 2's caption (swap subject-name style once,
  mid-scene) or keep the curriculum-badges section as a **12th, calmer**
  section directly after the scrollytelling sequence ends (not competing
  with the movie's pacing, just closing proof).
- **Publish & share (PDF/Excel export, public/private links)** — Beat 7
  covers the print *look* but not the *action* of sharing. A one-word
  addition to Beat 7's caption or an icon-only "share" affordance in the
  scene would close this gap cheaply.

---

## 3. Standardized (institution-agnostic) caption set

Same 11 lines you approved, with "school"/"school day" generalized to
"institution"/"day" so the page reads identically for a school, college, or
training center. Only 3 lines needed a word changed — the rest were already
neutral.

| # | Beat | Caption (as approved) | Changed? |
|---|---|---|---|
| 1 | Hero | Your full timetable. Built in seconds. | No |
| 2 | Data feeding | Add teachers, classes, rooms — in seconds. | No |
| 3 | Combination engine | One teacher, two subjects, zero clash. | No |
| 4 | Room & building | Every building. Every room. Synced. | No |
| 5 | Allocation | Every teacher. Every period. Auto-assigned. | No |
| 6 | Optimization | Every conflict — found and fixed. | No |
| 7 | Calendar views | Same schedule. Screen or paper. | No |
| 8 | Live/Pulse | See who's free. Right now. | *"school day" → "day" in the scene's supporting sub-line, not the caption itself* |
| 9 | Task management | Assigned fairly. Automatically. | No |
| 10 | Reports/analytics | Track workload and usage over time. | No |
| 11 | Final CTA | The last schedule you'll ever fix by hand. + "Build yours now" | No |

Your 11 captions were already almost entirely institution-neutral — good
instinct. The only edits were in the *subhead* (§1) and one internal scene
sub-line (Beat 8), not the headline captions themselves.
