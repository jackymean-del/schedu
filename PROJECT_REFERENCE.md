# SmartSched / Schedu — Project Reference

> **Purpose:** Single source of truth for the project's architecture, data model,
> timetable subsystem, and the hard-won design rules behind the recent work.
> Keep this file updated whenever a structural decision or non-obvious rule is added.
>
> Last updated: 2026-05-31 (unified time-slot column model + display refinements)

---

## 1. What this is

**Schedu** (repo brand: *SmartSched*) is an AI-assisted academic scheduling platform
for CBSE schools and senior-secondary institutions. It is positioned as an
**"Academic Planning & Scheduling Intelligence Platform"**, not a generic timetable
tool. The key differentiator is deep CBSE **XI/XII** support: optional subjects,
combination groups, parallel blocks, and instructional clusters.

### Tech stack (actual, not the design doc)
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + TanStack Router + Zustand + Vite |
| Backend | Go 1.26 + Fiber v3 + pgx |
| Database | PostgreSQL 17 + Drizzle ORM |
| Solver | Frontend JS CSP (OR-Tools planned, not yet) |
| Auth | JWT (Clerk integration planned) |

---

## 2. Repository layout

```
SmartSched/
├── frontend/               # React app (primary work area)
│   └── src/
│       ├── routes/
│       │   ├── timetable.tsx          # ★ Main timetable page (3300+ LOC)
│       │   └── wizard/                # Multi-step setup wizard
│       │       ├── step-bell.tsx      # ★ Bell schedule + class-wise breaks
│       │       ├── step-resources-v2.tsx
│       │       └── …                  # many step variants (see §10)
│       ├── components/
│       │   ├── CalendarView.tsx       # ★ Calendar/timeline timetable (1600+ LOC)
│       │   ├── modals/EditCellModal.tsx
│       │   ├── resources/             # TeachersPanel, ClassesPanel, etc.
│       │   └── timetable/             # cell sub-components
│       ├── pages/
│       │   └── dashboard.tsx          # ★ Timetable list + per-TT isolation
│       ├── store/
│       │   └── timetableStore.ts      # ★ Zustand store (persist key: schedu-v3)
│       ├── lib/
│       │   ├── schedulingEngine.ts    # Frontend CSP solver (legacy types)
│       │   ├── optionalEngine.ts      # XI/XII optional subject engine
│       │   ├── aiEngine.ts            # rebuildTeacherTT, conflict detection
│       │   └── orgData.ts             # org presets, getSubjectColor()
│       ├── types/index.ts             # Full Schedu data model (Zod + TS)
│       └── api/client.ts              # Axios API client
├── backend/                # Go + Fiber API
├── database/               # Drizzle schema + SQL migrations
└── services/
```

★ = files touched most often / most important for timetable work.

---

## 3. Data model & scheduling modes

### Three scheduling modes (`ProfileType`)
- **fixed** — Nursery/KG/Primary: students stay put, teachers rotate. Simple.
- **standard** — Grade VI–X: subject periods, teacher movement, labs.
- **dynamic** — Grade XI–XII: students move, optional subjects, parallel blocks,
  instructional clusters.

### Four architecture layers
1. **Resource Engine** — organizations, academic_sessions, scheduling_profiles,
   classes, subjects, teachers, classrooms, students.
2. **Academic Engine** — section_subject_strengths, academic_combinations,
   period_allocations, subject_rules.
3. **Dynamic Scheduling Engine** — instructional_clusters, parallel_blocks,
   bell_schedules, time_slots.
4. **Timetable Output** — session_instances, timetables, versions, audit_logs.

### Key design decisions
- **Section ≠ Instructional Group.** Classes are admin units; scheduling uses
  InstructionalClusters.
- **`section_subject_strengths` is THE key table** for XI/XII — students per class
  per subject per category.
- **Parallel blocks** ensure optionals run simultaneously; students split into clusters.
- **Academic Combination Matrix** is the UX layer: users type expressions like
  `PE OR Painting`, `Eng+Phy+Chem`, `NONE`; system resolves to clusters + blocks.
- **Subject expressions:** `AND` = taken together, `OR` = pick one, `NONE` = residual
  (EST/Library/CCA).
- **CBSE aliases:** PCM → Phy+Chem+Maths, PCB → Phy+Chem+Bio.

### Staged solving (not one mega solver)
1. Academic load generation → 2. Teacher allocation → 3. Core timetable →
4. XI/XII synchronization (parallel blocks) → 5. Residual EST/CCA → 6. Optimization.

### Formulas
- `teachersRequired = ceil(totalWeeklyLoad / maxPeriodsPerTeacher)`
- `weeklyPeriods = ceil((requiredHours*60) / (periodDurationMins*workingWeeks))`

### Timetable lifecycle
`draft → generating → ready → (review) → published → locked`

### Legacy vs Schedu types
The Schedu model overhaul (2026-05-15) added Organization, AcademicSession,
SchoolClass, Teacher, Classroom, etc. **Legacy types** (`Section`, `Staff`,
`Period`, `Room`) are kept with `@deprecated` markers — the wizard + timetable
rendering still use them. Don't force-migrate unless refactoring that area.

---

## 4. The Timetable subsystem (most-worked area)

Two render engines display the same underlying `classTT` data:

| Engine | File | Layout |
|--------|------|--------|
| **Traditional** | `routes/timetable.tsx` | HTML `<table>`, period columns |
| **Calendar** | `components/CalendarView.tsx` | Absolute-positioned blocks on a continuous minute axis |

### View modes (both engines)
`Class/Section` · `Teacher` · `Room` · `Subject`
Each (except Class) also has a **Transposed** variant in Traditional, and
`Matrix / Weekly / Monthly` layouts in Calendar.

### Core data
- `classTT[section][day][periodId]` → `{ subject, teacher, room, isClassTeacher?, isLunch? }`
- `teacherTT` is **derived** from `classTT` via `rebuildTeacherTT()` (lib/aiEngine.ts).
- Any edit goes through `commitTT(newClassTT)` which: updates `classTT`, rebuilds
  `teacherTT`, recomputes conflicts, pushes undo history. **All views update
  automatically** because they read from the same store.

### Period model
A `Period` is `{ id, name, duration, type, shiftable }`.
`type ∈ { class, fixed-start, lunch, break, fixed-end }`.
- `class` → a teaching period.
- `fixed-start` → Assembly (always first).
- `fixed-end` → Dispersal (always last).
- `lunch` / `break` → recess periods.

---

## 5. ★ Class-wise breaks & timing (the hardest part)

This is the single most error-prone area. Read carefully before touching timing.

### The concept
Different class groups can have **different break times** (staggered lunches).
Example (MPSK real school):
- Nursery–KG lunch after P3
- Class I lunch after P4
- Class VI–VII lunch after P5
- Class XI–XII lunch after P6

### Data sources
- `config.classwiseBreaks: Array<{id, name, type, classes[], afterPeriod, duration}>`
  - `classes` = list of class **keys** this break applies to.
  - `classes.length === 0` → applies to **all** classes (a full/school-wide break).
  - `afterPeriod` = the teaching-period number after which the break sits.
- `store.breaks` = canonical deduplicated break list (one per `afterPeriod`).
- `periods` (global array) = canonical sequence used for column layout.

### Helper functions (`routes/timetable.tsx`)
| Function | Purpose |
|----------|---------|
| `getSectionClassKey(name)` | "Nursery-A" → "nur", "XI-Com-A" → "xi". Maps a section to its class key. |
| `buildClassPeriods(section, periods, cwBreaks)` | Builds a **section-specific** period sequence — interleaves only the breaks that apply to that section. (Used by the class-section view.) |
| `calcSectionTimes(section, cwBreaks, config, classPeriods)` | Per-section wall-clock **string** times (class-section view). |
| `sectionScheduleMins(section, classPeriods, cwBreaks, config)` | Per-section wall-clock **minutes** for every period+break — the canonical engine behind the unified model (§6). |
| `sectionHasBreak(section, breakId, cwBreaks)` | Does this section have this specific break? |

### ⚠️ The time-accumulation trap
`calcTimes(periods)` walks the array adding each duration sequentially. If you build
a **merged** teacher/subject/room sequence and run `calcTimes` over it, the multiple
staggered break durations **accumulate**, pushing every later period too late.

> Example bug: XI lunch (10m) + VII lunch (10m) both accumulate → P8 shows
> **2:55–3:35** instead of the correct **2:35–3:15**.

**The fix is structural, not a patch:** never build a merged sequence. Compute
per-section times with `sectionScheduleMins` and assemble distinct columns via
`buildUnifiedColumns` (§6). Earlier "representative-section override" patches and
the `buildTeacherPeriods` merged sequence have been **removed** — don't bring them
back.

---

## 6. ★ Teacher timetable + the unified time-slot column model

This is the most intricate part of the app. Read it fully before editing any
teacher/room/subject render code. Reverse-engineered from real **MPSK PDFs**, then
refined across several rounds of user feedback.

### 6.1 The staggered-break problem
Different class groups take lunch at **different** points in the day, so a single
"Period N" happens at **several wall-clock times**. Worked example
(Demo TT 01 — three tracks):

| Track | Lunch | P5 | P6 | P7 | P8 |
|-------|-------|----|----|----|----|
| Nur–V (8 cls) | after P4, 12:05–12:35 | 12:35 | 1:15 | 1:55 | 2:35–3:15 |
| VI–X (5 cls) | after P5, 12:45–12:55 | 12:05 | 12:55 | 1:35 | 2:15 |
| XI–XII (2 cls) | after P6, 1:25–1:35 | 12:05 | 12:45 | 1:35 | 2:15 |

The **class-section timetable** handles this fine per-section
(`buildClassPeriods` + `calcSectionTimes`) and is left untouched — it was always
correct. The teacher/room/subject views are where it gets hard, because one row
must merge multiple tracks.

### 6.2 Unified columns — TEACHER views only
The teacher views (`renderTeacherTT` + `…Transposed`) build a **unified column
grid**: each distinct **(periodId, start-time)** becomes its own column.

Resulting teacher columns for the example:
`Assembly · Morning Break · P1 · P2 · P3 · P4 · P5@12:05 · P5@12:35 · P6@12:45 ·
P6@12:55 · P6@1:15 · P7@1:35 · P7@1:55 · P8@2:15 · P8@2:35 · Dispersal`.

**Helpers (`timetable.tsx`):**
| Function | Purpose |
|----------|---------|
| `sectionScheduleMins(sec, classPeriods, cwBreaks, config)` | Wall-clock **minutes** for every period+break of one section. The canonical correct timing — never accumulate breaks any other way. |
| `isFullBreakDef(break, allClassKeys)` | Is a break universal (all groups)? |
| `buildUnifiedColumns(sectionNames, classPeriods, periods, cwBreaks, config)` | → `{ columns, schedules, repByGroup }`. Columns = distinct (periodId, startMin) teaching slots + full-break columns. Falls back to plain `periods` when no staggering. |
| `resolveUniCell(section, col, schedules, cwBreaks)` | Per-cell → `teaching` \| `lunch` (overlapping partial break) \| `free`. |
| `buildOwningInfo(allSectionNames, classPeriods, cwBreaks, config)` | School-wide: `isSplit(periodId)` (does this period occur at >1 time?) + `owningLabel(periodId, startMin)` (compressed class names TEACHING in that slot). |

### 6.3 The header / chip rule (canonical)
- A teaching column's header **always** shows the **period name** (`Period 5`),
  never a break name. Period names repeat — expected.
- A small **chip** appears under the period name **only for SPLIT periods**
  (those that occur at >1 time school-wide). It lists the **teaching classes**
  that own that time slot — e.g. `P5@12:05 → "VI to XII"`, `P5@12:35 → "I to V"`.
- **Never** a mixed "Lunch / Period 4" header. One header per slot.
- Full school-wide breaks (Assembly, Morning Break) get their own break columns.

### 6.4 Cell content
- **Teaching cell**: line 1 = full **class-section** (e.g. `I-A`), line 2 = subject.
  (`taughtCell.sectionName` is stamped with the section name; `taughtSec` keeps the
  full section for drag/delete.)
- **Lunch overlay cell** (teacher not teaching, but one of their classes is on a
  partial break overlapping this slot): shows `Lunch Break` + **compressed class
  names** (no section letters, no 🍱 icon).
- **Free cell**: empty, droppable.

### 6.5 ROOM & SUBJECT views — UNIFIED columns (updated)
Room/subject views now use the **same unified column model** as the teacher view
(`unifiedAllCols = buildUnifiedColumns` over ALL sections). This was changed
because the old simple-column approach used `periodTimes = calcTimes(periods)`,
which walks the canonical `periods` array containing every staggered lunch in
sequence → `calcTimes` **accumulated** them (P5 shown at 12:35 instead of 12:05,
P8 ending past 3:15). The time-accumulation trap (§5).
Now: distinct `(periodId, startMin)` teaching columns + full-break columns, with
owning-class chips on split periods. Cell occupant is found by matching the
section's own schedule slot (`allSectionSchedules[key].get(periodId).startMin ===
col.startMin`). Subject view shows ALL sections teaching the subject in that exact
slot. Applies to normal + transposed.

> ⚠️ **Key-function parity (critical):** `CalendarView.secKey()` MUST stay
> identical to `routes/timetable.tsx getSectionClassKey()` — `classwiseBreaks[].
> classes` arrays are keyed by the latter. A divergence silently drops all
> partial breaks in the calendar (e.g. `"VI-A"→"via"` never matches `"vi"`),
> producing non-staggered, wrong break timing. Also: the calendar's `dayEndMin`
> must be the MAX end across section schedules (`buildSecPeriods`), not the bare
> `periods` sum, or late staggered periods get clipped.

### 6.6 Class-name display helpers
| Function | Example |
|----------|---------|
| `getClassDisplayName(section)` | `"I-A"→"I"`, `"XI-Com-A"→"XI-Com"`, `"Nursery-A"→"Nursery"` |
| `compressClassNames(sections)` | `["I-A","II-B","III-A","IV-C","V-A"]→"I to V"`; streamed grades kept (`"XI-Com, XI-Sci"`) |
| `GRADE_ORDER` | canonical grade sequence used for range compression |

### 6.7 ⚠️ Data-source gotcha (caused the "blank teacher timetable" bug)
`rebuildTeacherTT` (lib/aiEngine.ts) keys `teacherTT[t].schedule` by **periodId**,
which **collapses staggered same-id periods** (two `p5` at different times merge,
one becomes a "conflict"). Consequently `tdata.classes` can be **incomplete**
(it dropped sections like XI-Com-A). **Never iterate `tdata.classes`** for teacher
rendering — derive the teacher's sections by scanning `classTT` directly:
```ts
const teacherSecNames = sections.map(s=>s.name).filter(name =>
  config.workDays.some(d => Object.values(classTT[name]?.[d] ?? {})
    .some((c:any)=>c?.teacher===tn)))
```
The period count (`34/32`) is likewise counted from `classTT`, not the lossy
`tdata.schedule`.

### 6.8 Calendar view
Positions teaching blocks via per-section `buildSecPeriods + calcTimes` (already
correct). Break blocks gate on `isFullBreak(periodId)` — only full school-wide
breaks render as solid blocks; partial breaks are skipped so in-session teaching
blocks fill the time. Full breaks positioned via `repSecTimes()` to dodge the
accumulation trap.

---

## 7. Drag & drop system

Implemented identically across all 8 view combos + Calendar.

### State (timetable.tsx)
- `dragItem {section, day, periodId}` — the cell being dragged.
- `poolDragItem` — a chip dragged from the uncovered/pool panel.
- `dragOverCell` — current hover target key.
- `isSameTeacherDrag` / `isSameRoomDrag` — whether the drag spans the same
  teacher/room (lets all their slots become valid targets).

### Visual feedback
| Cell state | Style |
|------------|-------|
| Empty + safe | green **fill** (`#D1FAE5`) |
| Empty + conflict | red **fill** (`#FEE2E2`) |
| Filled + safe | green **outline** (`#10B981`) |
| Filled + conflict | red **outline** (`#EF4444`) |

> **Why outline, not border:** the traditional tables use `border-collapse`, which
> hides per-cell borders. Use `outline: 2.5px solid …` with `outlineOffset: -2px`
> on filled cells. Empty cells use background fill. Helpers: `dragTdStyle()`,
> `dragInnerStyle()`.

### Conflict detection
`checkSwapConflict(section, day, periodId)` (traditional) /
`getSwapConflict(classTT, …, tgtSection?)` (calendar) checks:
1. **Class-teacher protection** — cannot move a class-teacher's protected period.
2. **Teacher double-booking** — teacher already teaching elsewhere at that slot.
3. **Cross-section displacement** — would the swap evict another section's teacher?

On a conflicting drop → show `ConflictModal` instead of executing the swap.
**Consistent across every view.**

### Calendar specifics
- Blocks are built per day; **virtual free blocks** (one per truly-free period) are
  added so empty slots are droppable. They carry the entity stamp
  (`teacher: tName` / `room: roomName`) so the DropZone filter only highlights the
  dragged entity's own row — not other teachers'.
- A global `dragend` listener unconditionally clears all drag state (prevents the
  old "frozen UI" bug).

---

## 8. ★ Multi-timetable isolation (dashboard.tsx)

**Problem solved:** the app uses ONE Zustand store (`schedu-v3`). Creating/opening
a second timetable used to overwrite the first one's config.

### Solution: per-timetable snapshots
- Key: `schedu-tt-snap-{timetableId}` in localStorage.
- Saved fields: `step, config, sections, staff, breaks, periods, classTT,
  teacherTT, substitutions, conflicts, suggestions, optionalConfigs, subjectPools,
  participantPools, rooms, facilities, teacherPools`.

### Lifecycle
| Event | Action |
|-------|--------|
| Dashboard mounts | auto-save active TT snapshot (captures wizard work) |
| Open another TT (`handleContinue`) | save outgoing → restore incoming |
| Create new TT (`handleTTCreated`) | save outgoing → `resetWizard()` for fresh start |
| "🔧 Restore data" button | manual snapshot for TTs without one yet (recovery) |

Other keys: `schedu-tt-list` (the list), `schedu-active-tt` (active id).

---

## 9. Key files & their responsibilities

| File | Responsibility |
|------|----------------|
| `routes/timetable.tsx` | All traditional render functions, drag/drop, conflict modal, period/timing helpers, header rule. **Largest, most central.** |
| `components/CalendarView.tsx` | Calendar/timeline rendering, block builders, calendar drag/drop, full-break gating. |
| `pages/dashboard.tsx` | Timetable list, per-TT snapshot isolation, create/continue/restore. |
| `store/timetableStore.ts` | Zustand store + persist (`schedu-v3`), `commitTT`, `resetWizard`, partialize. |
| `lib/aiEngine.ts` | `rebuildTeacherTT`, `shiftPeriod`, conflict detection. |
| `lib/orgData.ts` | Org presets, `getSubjectColor`, country configs. |
| `routes/wizard/step-bell.tsx` | Bell schedule editor + class-wise break panel; writes `config.classwiseBreaks` + canonical `breaks`. |
| `types/index.ts` | Full Schedu + legacy type definitions. |

### Notable functions in `timetable.tsx`
**Timing / unified model (see §6):** `calcTimes`, `getSectionClassKey`,
`calcSectionTimes`, `buildClassPeriods`, `sectionScheduleMins`, `isFullBreakDef`,
`buildUnifiedColumns`, `resolveUniCell`, `buildOwningInfo`, `getClassDisplayName`,
`compressClassNames`, `GRADE_ORDER`.
**Cells / chrome:** `LunchCell`, `PeriodCol` (accepts `breakGroupLabel` chip),
`BreakCell`, `SubjectCell`, `TeacherCell`, `dragTdStyle`, `dragInnerStyle`,
`ConflictModal`.
**Render functions:** `renderClassTT(+Transposed)`, `renderTeacherTT(+Transposed)`
(unified columns), `renderSubjectTT(+Transposed)` & `renderRoomTT(+Transposed)`
(simple `classPeriods` columns), `renderCalendarView`, `renderPoolPanel`.

> Deprecated/no longer used for layout: `buildTeacherPeriods`,
> `isFullLunchColumn`, `resolveHeaderPeriod` were the earlier merged-sequence
> approach — superseded by the unified-column model in §6. Don't reintroduce them.

---

## 10. Wizard steps (many variants exist)

The `routes/wizard/` folder has accumulated multiple step iterations. Current/active
flow uses the `step-*` named files (not the `stepN-*` numbered legacy ones) where a
v2 exists. Key ones:
- `step-bell.tsx` — bell schedule + class-wise breaks (timing source of truth).
- `step-resources-v2.tsx` — Teachers → Classes → Subjects → Rooms panels.
- `step-structure`, `step-subjects-timing`, `step-allocation`, `step-combinations`,
  `step-optional-blocks`, `step-section-strengths`, `step-constraints`.

> When unsure which step is wired, check `routes/wizard/index.tsx` for the active
> routing.

---

## 11. Gotchas & conventions (read before editing)

1. **`border-collapse` hides borders** → use `outline` for drag highlights on filled
   cells (see §7).
2. **Never accumulate staggered breaks via `calcTimes` on a merged sequence** —
   every period's time inflates. Use `sectionScheduleMins` (per-section, canonical)
   or `buildUnifiedColumns` (see §6).
3. **Never iterate `tdata.classes` for teacher rendering** — it's lossy/incomplete
   (collapsed staggered periods). Derive sections from `classTT` (§6.7). This was
   the root cause of the "blank teacher timetable" bug.
4. **`teacherTT` is derived** — never edit it directly. Edit `classTT` → `commitTT()`.
5. **Header rule is canonical** (§6.3): teaching columns show period names; the
   class-name chip appears only on SPLIT periods and lists TEACHING classes; never
   mixed headers.
6. **Cell vs chip naming**: teaching cells show the full **class-section** (`I-A`);
   headings/chips/lunch-overlays show **compressed class names** (`I to V`). No
   lunch/break emoji in cells.
7. **Room & subject views use SIMPLE `classPeriods` columns** — no break columns,
   no staggered splits. Only teacher views use the unified model.
8. **Calendar free blocks must carry an entity stamp** or drag highlights leak across
   teachers/rooms.
9. **Per-TT snapshots** must include every config field or switching timetables loses
   data (§8).
10. **Build + typecheck before commit:** `npm run build` and `npx tsc --noEmit` from
    `frontend/`.
11. **Commit message footer:**
    `Co-Authored-By: Claude <noreply@anthropic.com>` (model name as appropriate).
12. **Windows line endings:** git will warn `LF will be replaced by CRLF` — harmless.

---

## 12. Recent work log (timetable focus)

Newest first.

| Commit | What |
|--------|------|
| `d260d3c` | Display refinements: full class-section in cells; chip shows TEACHING classes on split periods only; removed 🍱 icons; room/subject reverted to simple period columns. |
| `45b3df8` | Fixed blank teacher cells (derive sections from `classTT`, not lossy `tdata.classes`); class-name labels; cell content order. |
| `9e1107c` | Docs: unified time-slot column model. |
| `26b3358` | **Unified time-slot column model** for teacher/subject/room (staggered breaks → distinct (period,time) columns). |
| `6cbcd6e` | Header rule applied to all views + calendar (partial break → period name). |
| `8bc569b` | Teacher class-period times match class/section timetable. |
| `97d71b4` | Teacher timetable structure matched to real-school PDF (3-state break cells). |
| `ca944e0` | "Restore data" button + per-TT Open action. |
| `d6628eb` | Per-timetable isolated settings via snapshots. |
| `e95d49d` | Teacher break-column timings match class timetable. |
| `09b3d3f` | Fixed calendar teacher drag highlights leaking to other teachers. |
| `1dda96b`,`cad4c2b`,`545dda3`,`73d7f49` | Calendar drag green/red blank-cell highlighting for teacher/room/subject. |
| `ba87b46` | Consistent lunch cells (always show class name). |
| `1139054`,`77d1cd8`,`a8eb467` | Teacher-view drag: no freeze, all teacher periods highlight, proper conflicts. |
| `9547750`,`70a26a2`,`bbe5645`,`65ea8af` | Outline-based highlights, class-teacher protection, conflict popups. |

---

## 13. How to run

```bash
# Frontend
cd frontend
npm install
npm run dev          # dev server
npm run build        # production build (use before committing)
npx tsc --noEmit     # full typecheck

# Backend (Go + Fiber)
cd backend
go run .             # or see SETUP.md

# Full stack
docker-compose up
```

See `README.md` and `SETUP.md` for environment variables and DB setup.
