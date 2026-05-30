# SmartSched / Schedu — Project Reference

> **Purpose:** Single source of truth for the project's architecture, data model,
> timetable subsystem, and the hard-won design rules behind the recent work.
> Keep this file updated whenever a structural decision or non-obvious rule is added.
>
> Last updated: 2026-05-31

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
| `buildClassPeriods(section, periods, cwBreaks)` | Builds a **section-specific** period sequence — interleaves only the breaks that apply to that section. |
| `buildTeacherPeriods(classes, periods, cwBreaks)` | Builds a teacher's merged period sequence — includes breaks for any class they teach. |
| `calcSectionTimes(section, cwBreaks, config, classPeriods)` | Per-section wall-clock times. |
| `sectionHasBreak(section, breakId, cwBreaks)` | Does this section have this specific break? |
| `isFullLunchColumn(p, days, sch, classes, cwBreaks)` | Is a column a full lunch for ALL of a teacher's classes? |
| `resolveHeaderPeriod(p, classPeriods, cwBreaks, isPartial)` | For a partial break, returns the **concurrent class period** so the header shows a period name, not a break name. |

### ⚠️ The time-accumulation trap
`calcTimes(periods)` walks the array adding each duration sequentially. When a
teacher's merged sequence contains **multiple staggered breaks**, those durations
**accumulate**, pushing every later period too late.

> Example bug: XI lunch (10m) + VII lunch (10m) both accumulate → P8 shows
> **2:55–3:35** instead of the correct **2:35–3:15**.

**Fix pattern (already applied):** compute each column's time from a
**representative section's actual schedule**, not from the merged sequence:
```ts
const baseSection = tdata.classes[0]
const baseTimes = calcTimes(buildClassPeriods(baseSection, periods, cwBreaks), config)
classPeriods.forEach(cp => { const t = baseTimes.get(cp.id); if (t) result.set(cp.id, t) })
// break columns use each break's representative section similarly
```

---

## 6. ★ Teacher / Room / Subject HEADER RULE (canonical)

> **Display a break name (Break, Lunch Break, …) in a slot header ONLY when ALL
> applicable classes are on that break simultaneously. Otherwise display a Period
> name.**

### Rules
1. If even one class group has a teaching period in a slot → header is a **Period name**.
2. Period names **may repeat** — expected when class groups follow different bells.
3. Applicable classes are shown under each header (amber chip).
4. Teacher timetable = teacher availability/teaching slots, not per-class breaks.
5. Per slot: all-on-break → break name; otherwise → period name.
6. **Never** mixed headers like "Lunch / Period 4". One header per slot.

### Examples
| Scenario | Header |
|----------|--------|
| I–XII all on Lunch | `Lunch Break` |
| I–XII all on Break | `Break` |
| I–V Lunch, VI–X Period 4 | `Period 4` |
| I–V Break, VI–X Period 3 | `Period 3` |

### Implementation
- **Traditional teacher view** (`renderTeacherTT` / `…Transposed`): partial lunch
  columns call `resolveHeaderPeriod()` → show concurrent period name + correct
  times + amber chip of which classes are on break. Full lunch → `BreakCell`.
- **Body cells** in a partial-break column show one of three states:
  - **A.** `🍱 Lunch Break [section]` — the teacher's own class is on break.
  - **B.** the class assignment — teacher teaches a *different* group running
    concurrently with the break.
  - **C.** `Free`.
- **Subject view:** break header only if ALL sections teaching this subject are on
  break; else period name.
- **Room view:** break header only if ALL sections using this room are on break;
  else period name.
- **Calendar view** (`buildTeacherBlocks` / `buildRoomBlocks` / `buildSubjectBlocks`):
  `isFullBreak(periodId)` gate — only **full** (school-wide) breaks render as solid
  break blocks; partial breaks are skipped, so in-session teaching blocks fill the
  time. Full breaks positioned via `repSecTimes()` (representative-section
  wall-clock) to dodge the accumulation trap.

### Reference source
The structure was reverse-engineered from real MPSK PDFs. The real teacher
timetable uses a **fixed global time grid** with a sub-header row
(`B-NUR-KG | B-1 | B-2,6,7 | B-3-5,8-10`) labeling each break band. Our amber chip
under partial-break headers mirrors that.

### ★ Unified time-slot column model (STAGGERED breaks)
When class groups lunch at **different** points, a single "Period N" occurs at
several wall-clock times. The teacher/subject/room views build a **unified column
grid** so each distinct (period, start-time) is its own column — matching the real
bell exactly.

**Worked example (Demo TT 01 — three tracks):**
| Track | Lunch | P5 | P6 | P7 | P8 |
|-------|-------|----|----|----|----|
| Nur–V (8 cls) | after P4, 12:05–12:35 | 12:35 | 1:15 | 1:55 | 2:35–3:15 |
| VI–X (5 cls) | after P5, 12:45–12:55 | 12:05 | 12:55 | 1:35 | 2:15 |
| XI–XII (2 cls) | after P6, 1:25–1:35 | 12:05 | 12:45 | 1:35 | 2:15 |

Resulting teacher columns: `P5@12:05` (VI–XII teaching, Nur–V on lunch overlay),
`P5@12:35` (Nur–V), `P6@12:45` (XI–XII), `P6@12:55` (VI–X), `P6@1:15` (Nur–V)…

**Helpers (`timetable.tsx`):**
| Function | Purpose |
|----------|---------|
| `sectionScheduleMins(sec, classPeriods, cwBreaks, config)` | Wall-clock **minutes** for every period+break of one section. The canonical correct timing. |
| `isFullBreakDef(break, allClassKeys)` | Is a break universal (all groups)? |
| `buildUnifiedColumns(sectionNames, classPeriods, periods, cwBreaks, config)` | → `{ columns, schedules, repByGroup }`. Columns = distinct (periodId, startMin) teaching slots + full-break columns; partial breaks overlaid, not columned. Falls back to plain `periods` when no staggering. |
| `resolveUniCell(section, col, schedules, cwBreaks)` | Per-cell → `teaching` \| `lunch` (overlapping partial break) \| `free`. |

**Cell resolution rule:** a section shows *teaching* in column C only if its own
schedule places `C.periodId` at `C.startMin`; otherwise *lunch* if a partial break
overlaps `[C.start,C.end)`, else *free*. Drag/drop: a free cell is a valid target
only when the dragged section's group actually has that slot at that start time.

**All 6 views** (teacher/subject/room × normal/transposed) use this model. The
class-section view is unchanged — it was always correct (`buildClassPeriods` +
`calcSectionTimes`). Calendar view positions teaching blocks via per-section
`buildSecPeriods + calcTimes` (already correct); break blocks gate on `isFullBreak`.

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
`calcTimes`, `getSectionClassKey`, `calcSectionTimes`, `buildClassPeriods`,
`buildTeacherPeriods`, `sectionHasBreak`, `isFullLunchColumn`, `LunchCell`,
`resolveHeaderPeriod`, `dragTdStyle`, `dragInnerStyle`, `ConflictModal`,
`PeriodCol`, `BreakCell`, `SubjectCell`, `TeacherCell`, and the render functions:
`renderClassTT(+Transposed)`, `renderTeacherTT(+Transposed)`,
`renderSubjectTT(+Transposed)`, `renderRoomTT(+Transposed)`,
`renderCalendarView`, `renderPoolPanel`.

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
2. **Never trust `calcTimes` on a merged teacher/subject/room sequence** for column
   times — staggered breaks accumulate. Use a representative section (see §5).
3. **`teacherTT` is derived** — never edit it directly. Edit `classTT` → `commitTT()`.
4. **Header rule is canonical** (§6) — partial breaks show period names, never break
   names; never mixed headers.
5. **Calendar free blocks must carry an entity stamp** or drag highlights leak across
   teachers/rooms.
6. **Per-TT snapshots** must include every config field or switching timetables loses
   data (§8).
7. **Build + typecheck before commit:** `npm run build` and `npx tsc --noEmit` from
   `frontend/`.
8. **Commit message footer:**
   `Co-Authored-By: Claude <noreply@anthropic.com>` (model name as appropriate).
9. **Windows line endings:** git will warn `LF will be replaced by CRLF` — harmless.

---

## 12. Recent work log (timetable focus)

| Commit | What |
|--------|------|
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
