# Claude Code Instructions — Elective Grouping & Subjects Panel Enhancements

> **Scope:** `frontend/src/` only (no backend changes required for these features).  
> **Key files:** `types/index.ts`, `components/resources/SubjectsPanel.tsx`,
> `components/resources/SubjectGroupsSection.tsx`, `routes/wizard/step-student-groups.tsx`,
> `store/timetableStore.ts`

---

## Overview of What We Are Building

Three connected features:

1. **Editable category group headers** in the Subjects panel (click a group title to rename it)
2. **AI Auto-Categorize button** that groups uncategorised subjects into Core / Language / Optional / etc.
3. **Elective toggle** in the subject "More" expanded panel (replaces the Category dropdown there); when ON, the subject auto-appears as a column in the Step 4 Student Groups preference matrix
4. **Three elective grouping scenarios** fully supported end-to-end:
   - **Case 1 — Intra-stream:** Maths vs Bio split within the Science stream only
   - **Case 2 — Cross-stream:** PE vs Painting across Science AND Commerce together
   - **Case 3 — Multi-slot regional language:** R1 / R2 / R3 each independently containing Hindi, Odia, etc.

---

## Part 1 — Type Changes (`frontend/src/types/index.ts`)

### 1.1 Add `electiveSlotId` to `Subject`

Inside the `Subject` interface, after the existing `isOptional?: boolean` line, add:

```ts
/** If set, this subject belongs to a named regional-language / elective slot
 *  (e.g. "R1", "R2", "R3"). Subjects sharing the same slot are mutually exclusive
 *  — students pick exactly one per slot. The slot name is used as the column-group
 *  header in the Student Groups preference matrix. */
electiveSlotId?: string
```

### 1.2 Add `slotLabel` to `SubjectAndOrGroup` (in `SubjectGroupsSection.tsx`)

In `SubjectGroupsSection.tsx` find the `SubjectAndOrGroup` interface and add one field:

```ts
export interface SubjectAndOrGroup {
  id:      string
  name?:   string
  logic:   'AND' | 'OR'
  subjects: string[]
  sections?: string[]
  periodsPerWeek?: number
  /** Named elective slot for multi-slot language groups (R1 / R2 / R3).
   *  When set, subjects in this OR-group that share a name with subjects in OTHER
   *  slots are treated as independent teaching instances. The preference matrix
   *  creates one column per (slotLabel × subjectName) pair. */
  slotLabel?: string
}
```

### 1.3 Add `subjectGroups` to the timetable store snapshot fields (`dashboard.tsx`)

In `dashboard.tsx`, find `TT_SNAPSHOT_FIELDS` and add `'subjectGroups'` to the array if not already present. This ensures the OR/AND combo data survives snapshot save/restore.

---

## Part 2 — Editable Category Group Headers (`SubjectsPanel.tsx`)

### Current state
`CategoryHeaderRow` renders the category name as a plain `<span>`. The user cannot rename a group without going to a separate "Category Manager" popover.

### What to change

**Replace `CategoryHeaderRow`** with a new version that supports inline editing:

```tsx
function CategoryHeaderRow({
  cat, count, collapsed, onToggle, onRename,
}: {
  cat: string
  count: number
  collapsed: boolean
  onToggle: () => void
  onRename?: (oldName: string, newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(cat)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(cat) }, [cat, editing])

  function commit() {
    const v = draft.trim()
    if (v && v !== cat) onRename?.(cat, v)
    setEditing(false)
  }

  return (
    <tr>
      <td colSpan={4} style={{ padding: 0 }}>
        <div
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 7,
            padding: '4px 12px', background: '#F3F1FF',
            borderBottom: '1px solid #E8E4FF',
          }}
        >
          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          >
            {collapsed ? <ChevronDown size={11} color={P} /> : <ChevronUp size={11} color={P} />}
          </button>

          {/* Inline-editable title */}
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') { setDraft(cat); setEditing(false) }
                e.stopPropagation()
              }}
              style={{
                fontSize: 10.5, fontWeight: 800, color: P_D,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                border: `1.5px solid ${P_B}`, borderRadius: 4,
                padding: '1px 6px', outline: 'none', background: '#fff',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              onClick={() => setEditing(true)}
              title="Click to rename category"
              style={{
                fontSize: 10.5, fontWeight: 800, color: P_D,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                cursor: 'text', padding: '1px 4px', borderRadius: 3,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EDE9FF')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {cat}
            </span>
          )}

          {/* Count badge */}
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: P, background: P_L,
            borderRadius: 8, padding: '0 5px', border: `1px solid ${P_B}`,
          }}>{count}</span>
        </div>
      </td>
    </tr>
  )
}
```

### Wire up `onRename` in `SubjectsPanel`

When `onRename` fires, you need to update the `category` on every subject in that group:

```ts
function renameCategory(oldName: string, newName: string) {
  if (!newName || newName === oldName) return
  // Update subjects that had this category
  setSubjects(subjects.map(s =>
    s.category === oldName ? { ...s, category: newName } : s
  ))
  // Update extraCats list if it was a custom category
  if (extraCats.includes(oldName)) {
    const next = extraCats.map(c => c === oldName ? newName : c)
    setExtraCats(next)
    localStorage.setItem('schedu-subject-extra-cats', JSON.stringify(next))
  }
}
```

Pass `onRename={renameCategory}` to `CategoryHeaderRow` in the `groupedByCategory.map()` loop.

---

## Part 3 — AI Auto-Categorize Button (`SubjectsPanel.tsx`)

### What it does
When clicked, it looks at each subject's name and applies a heuristic map (similar to how the curriculum engine suggests classes) to assign a category:
- Physical Education, Yoga, Sports, NCC → `"Activity"`
- English, Hindi, Odia, Sanskrit, French, German… → `"Language"`
- Physics, Chemistry, Mathematics, Biology, History, Geography, Economics… → `"Compulsory"` (if assigned to a wide range of classes) OR `"Optional"` (if assigned only to XI/XII)
- Computer Science, Informatics Practices → `"Skill"`
- Practical / Lab subjects (`requiresLab = true`) → `"Practical"`

### Implementation

Add this function inside `SubjectsPanel` (or import from `curriculum.ts`):

```ts
function inferCategory(sub: Subject): string {
  const n = sub.name.toLowerCase()
  if (sub.requiresLab) return 'Practical'

  const activityKw = ['physical education', 'pe', 'yoga', 'ncc', 'nss', 'sports', 'gym', 'dance', 'music', 'art', 'painting', 'craft', 'drawing']
  if (activityKw.some(kw => n.includes(kw))) return 'Activity'

  const langKw = ['english', 'hindi', 'odia', 'oriya', 'sanskrit', 'french', 'german', 'spanish', 'arabic', 'bengali', 'tamil', 'telugu', 'marathi', 'gujarati', 'punjabi', 'urdu', 'language']
  if (langKw.some(kw => n.includes(kw))) return 'Language'

  const skillKw = ['computer', 'informatics', 'it ', 'information technology', 'coding', 'ai', 'data science', 'vocational']
  if (skillKw.some(kw => n.includes(kw))) return 'Skill'

  const ccaKw = ['cca', 'co-curricular', 'cocurricular', 'club', 'value education', 'moral', 'library', 'assembly']
  if (ccaKw.some(kw => n.includes(kw))) return 'CCA'

  // If the subject is only assigned to XI/XII streams, treat as Optional
  const classes = getAssignedClasses(sub)
  const isOnlySeniorSecondary = classes.length > 0 &&
    classes.every(c => c.startsWith('XI') || c.startsWith('XII'))
  if (isOnlySeniorSecondary && sub.isOptional) return 'Optional'

  return 'Compulsory'
}
```

### Add the button to the toolbar

In the toolbar action-buttons area (after the `⚙ Category` button), add:

```tsx
<button
  onClick={() => {
    undoHistory.push(subjects)
    setSubjects(subjects.map(s => ({
      ...s,
      category: inferCategory(s),
    })))
  }}
  title="AI auto-assign categories based on subject names"
  style={outlineBtn}
  onMouseEnter={e => { e.currentTarget.style.background = P_L; e.currentTarget.style.borderColor = P_B; e.currentTarget.style.color = P_D }}
  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#DDD8FF'; e.currentTarget.style.color = '#6B6891' }}
>
  ✦ AI Categorize
</button>
```

This is undoable via Ctrl+Z (the existing `undoHistory` hook is already wired).

---

## Part 4 — Elective Toggle Replacing Category Column in "More" Panel (`SubjectsPanel.tsx`)

### Current state
`ClassSlotsExpanded` already has an "Elective — chosen from options" toggle for `isOptional`. However the per-grade `GradeSlotRow` also shows a Category dropdown in column 4.

### What to change

The design goal: **Remove the Category dropdown from the expanded per-grade/per-section table**. Category is managed via the group header (now editable inline). The expanded "More" panel should focus on:
1. Slots/week per grade
2. Max/day
3. **Elective toggle** (already exists at the top of ClassSlotsExpanded — keep it there)
4. Lab Required checkbox
5. *(Optional)* An "Elective Slot" field (R1 / R2 / R3) — see Part 5

**In `GradeSlotRow`:** Remove the `CategorySelect` from column 4 and remove the "Category" column from `<colgroup>` and `<thead>`. The remaining columns are: Grade | Slots/Wk | Max/day | Lab Req. | Remove.

**In `SectionSubRow`:** Same — remove the `CategorySelect` from column 4.

**In `ClassSlotsExpanded`:** The `<colgroup>` and header `<th>` for "Category" should be removed. The `onAddCategory` prop can be removed from the call chain since category editing now lives in the group header rename flow.

After this change, the per-subject "Category" is effectively set by:
- Smart Create (assigns a category on subject creation)
- AI Categorize button (bulk inference)
- Dragging or moving a subject into a different group (if you add drag support — see optional enhancement below)
- Or from `AddRow` default (`'Compulsory'`)

The inline group header rename already covers "renaming a category group for all its subjects".

### Add Elective Slot ID field (for R1/R2/R3)

In `ClassSlotsExpanded`, below the existing Elective toggle, add a conditional field that only appears when `sub.isOptional` is `true`:

```tsx
{sub.isOptional && (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 8 }}>
    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#8B87AD', whiteSpace: 'nowrap' }}>
      Slot / Group
    </label>
    <input
      value={sub.electiveSlotId ?? ''}
      onChange={e => onChange({ electiveSlotId: e.target.value.trim() || undefined })}
      placeholder="e.g. R1, R2, R3…"
      title="Optional: group this subject into a named elective slot. Subjects in the same slot are mutually exclusive — students pick one."
      style={{
        width: 80, padding: '3px 8px', border: '1.5px solid #E4E0FF',
        borderRadius: 5, fontSize: 11, outline: 'none',
        fontFamily: 'inherit', background: '#FAFAFE',
      }}
    />
    {sub.electiveSlotId && (
      <span style={{ fontSize: 9.5, color: P, background: P_L, borderRadius: 3, padding: '0 5px', border: `1px solid ${P_B}` }}>
        {sub.electiveSlotId}
      </span>
    )}
  </div>
)}
```

The `electiveSlotId` field must be added to `Subject` in `types/index.ts` (done in Part 1 above).

---

## Part 5 — Student Groups Matrix: Multi-Slot Support (`step-student-groups.tsx`)

### The three scenarios and how the matrix handles them

#### Case 1 — Intra-stream parallel (Maths OR Bio within Science)

**Setup:**
- Maths: `isOptional = true`, no `electiveSlotId`
- Biology: `isOptional = true`, no `electiveSlotId`
- Both are assigned ONLY to Science sections (XI-Sci-A, XI-Sci-B, XII-Sci-A, etc.)

**Matrix behaviour (existing code handles this correctly):**
- Both appear as columns: `Maths` | `Biology`
- Rows: XI-Sci-A, XI-Sci-B (only — because they're not assigned to Commerce)
- User enters: XI-Sci-A → Maths: 20, Biology: 15 (must sum to total students)

**Grouping rule (set in the grouping rule selector per column):**
- Maths: `SAME_STREAM_ONLY` → group Science-stream students across sections
- Biology: `SAME_STREAM_ONLY`

**AI generates (existing `handleRegenerate`):**
- Group "Maths — Science": [XI-Sci-A maths-students + XI-Sci-B maths-students] → one teaching group
- Group "Biology — Science": [XI-Sci-A bio-students + XI-Sci-B bio-students] → one teaching group

**No code changes needed for Case 1** — the existing system already handles this. The user just needs to set `isOptional = true` on the subjects and pick `SAME_STREAM_ONLY` grouping behavior.

---

#### Case 2 — Cross-stream parallel (PE vs Painting across Science AND Commerce)

**Setup:**
- PE: `isOptional = true`, assigned to XI-Sci-A, XI-Sci-B, XI-Com-A, XI-Com-B
- Painting: `isOptional = true`, assigned to same sections

**Matrix behaviour (existing code handles this correctly):**
- Both appear as columns
- Rows: XI-Sci-A, XI-Sci-B, XI-Com-A, XI-Com-B

**Grouping rule:**
- PE: `CROSS_STREAM_ALLOWED` → one PE group pulling from ALL streams
- Painting: `CROSS_STREAM_ALLOWED`

**AI generates:**
- "PE": [XI-Sci-A PE students + XI-Sci-B PE students + XI-Com-A PE students + XI-Com-B PE students] → one big PE teaching group
- "Painting": all remaining students → one Painting group

**No code changes needed for Case 2** — `CROSS_STREAM_ALLOWED` already exists and maps to mode `'all'` in `computeGroupingMode`.

---

#### Case 3 — Multi-slot regional language (R1/R2/R3) — NEW CODE REQUIRED

**The problem:** Hindi appears in R1, R2, and R3 simultaneously. Each slot needs:
- Its own teacher (Teacher-R1-Hindi ≠ Teacher-R2-Hindi)
- Its own room and time slot
- Its own student headcount

Using the subject name "Hindi" as a column key won't work because the matrix only allows one column per subject name.

**Solution: Slot-prefixed column keys**

When a subject has `electiveSlotId` set, the matrix column key becomes `${electiveSlotId}:${subjectName}` instead of just `subjectName`. This allows "R1:Hindi", "R2:Hindi", "R3:Hindi" as independent columns.

### 5.1 Change `optionalSubjects` derivation to emit slot-aware entries

In `step-student-groups.tsx`, the `subjectList` derivation currently maps subjects to their name. Change it so that subjects with `electiveSlotId` emit slot-prefixed keys:

```ts
// Replace the existing subjectList useMemo
const subjectList = useMemo(() => {
  const entries: Array<{ key: string; label: string; subjectName: string; slotId?: string }> = []

  optionalSubjects
    .filter((s: any) => {
      const fromConfigs = (s.classConfigs ?? []).map((c: any) => c.sectionName).filter(Boolean) as string[]
      if (fromConfigs.length > 0) return true
      if ((s.sections ?? []).length > 0) return true
      return Object.keys(subjectAllocations).some(secName => {
        const raw = (subjectAllocations[secName] as any)?.[s.name]
        return raw && parseAllocation(raw).weeklyTotal > 0
      })
    })
    .forEach((s: any) => {
      const slotId: string | undefined = s.electiveSlotId
      if (slotId) {
        entries.push({
          key: `${slotId}:${s.name}`,
          label: `${s.name}`,   // label without prefix for readability
          subjectName: s.name,
          slotId,
        })
      } else {
        entries.push({ key: s.name, label: s.name, subjectName: s.name })
      }
    })

  return entries
}, [optionalSubjects, subjectAllocations])
```

Update every downstream consumer that currently treats `subjectList` as `string[]` to use the new `{ key, label, subjectName, slotId }` shape. Specifically:

- `allCols` — already uses `subjectList.filter(...).map(s => ({ key: s.key, label: s.label }))` — works with new shape.
- `isApplicableToSection(sub, sectionName, ...)` — must look up by `subjectName`, not `key`.
- `subjectsToAdd` picker — show label + slot badge.

### 5.2 Group columns by slot in the matrix header

When rendering `<thead>`, group slot-keyed columns under a slot header:

```tsx
// Compute slot groups for column headers
const slotGroups = useMemo(() => {
  const groups = new Map<string, typeof displayCols>()
  const noSlot: typeof displayCols = []
  for (const col of displayCols) {
    const slotId = col.key.includes(':') ? col.key.split(':')[0] : null
    if (slotId) {
      if (!groups.has(slotId)) groups.set(slotId, [])
      groups.get(slotId)!.push(col)
    } else {
      noSlot.push(col)
    }
  }
  return { groups, noSlot }
}, [displayCols])
```

Render a two-row `<thead>` when `slotGroups.groups.size > 0`:
- **Row 1:** Empty header for Class/Total columns, then `<th colSpan={cols.length}>R1</th>` (purple/teal background per slot) for each slot group, then individual no-slot column headers
- **Row 2:** Individual subject column headers within each slot

This visually clusters "R1: English | R1: Odia | R1: Hindi" under a single "R1" super-header.

### 5.3 Fix `isApplicableToSection` for slot-keyed columns

The existing function takes a `Subject` object. When we have slot-keyed columns, the key is `"R1:Hindi"` but the subject object has `name = "Hindi"`. Look up subject by `subjectName` field, not `col.key`:

```ts
// In the isApplicableToSection call sites, extract the subject name:
const subjectName = col.key.includes(':') ? col.key.split(':')[1] : col.key
const sub = (subjects as any[]).find(s => s.name === subjectName)
const applicable = isApplicableToSection(sub, row.sectionName, subjectAllocations)
```

### 5.4 Update `handleRegenerate` to emit slot-aware DLGs

When `handleRegenerate` processes a column, it needs to embed the slot context in the generated DLG so the solver knows these are independent teaching instances:

```ts
allCols.forEach((col, si) => {
  // Extract slot and actual subject name from key
  const hasSlot = col.key.includes(':')
  const slotId  = hasSlot ? col.key.split(':')[0] : undefined
  const subjectName = hasSlot ? col.key.split(':')[1] : col.key

  // ... existing grouping logic ...

  generated.push({
    id: `...`,
    subject: subjectName,          // Always use the actual subject name
    slotId,                        // NEW — undefined for non-slot subjects
    slotLabel: slotId ? `${slotId}: ${subjectName}` : undefined,
    sectionNames: groupSections.map(r => r.sectionName),
    // ... rest of fields ...
  })
})
```

Add `slotId?: string` and `slotLabel?: string` to the `DynamicLearningGroup` type in `types/index.ts` so the solver receives slot context.

### 5.5 Update `dlgsToOptionalBlocks` in `step6-generate.tsx`

In `dlgsToOptionalBlocks()`, when converting a DLG to an `OptionalBlock`, include the slot:

```ts
function dlgsToOptionalBlocks(dlgs: DynamicLearningGroup[]): OptionalBlock[] {
  // Group DLGs by (slotId + subject) combo key — each unique combo = one OptionalBlock
  const byKey = new Map<string, DynamicLearningGroup[]>()
  for (const dlg of dlgs) {
    const key = dlg.slotId ? `${dlg.slotId}:${dlg.subject}` : dlg.subject
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(dlg)
  }
  return [...byKey.entries()].map(([key, groups]) => ({
    id: key,
    subjectName: groups[0].subject,
    slotId: groups[0].slotId,
    pools: groups.map(g => ({
      sections: g.sectionNames,
      teacherName: g.teacher,
      roomName: g.room,
    })),
  }))
}
```

This ensures the solver sees THREE separate `OptionalBlock` entries for Hindi when it appears in R1, R2, and R3 — each with independent teacher/room/pool.

---

## Part 6 — Solver Awareness (`lib/schedulingEngine.ts`)

The existing `solveTimetable` function processes `OptionalBlock[]`. The only change needed is to handle the new `slotId` field on `OptionalBlock` to avoid scheduling the same-subject-different-slot groups in the same time period:

```ts
// In the constraint that prevents two groups of the same subject overlapping:
// BEFORE: block teaching groups of the same subject from sharing a slot
// AFTER:  block teaching groups of the same (subject + slotId) from sharing a slot
//         but ALLOW different slotIds of the same subject to run simultaneously

// Change this constraint:
// "no two groups teach subjectName at the same time" 
// To:
// "no two groups with the same (subjectName + slotId) teach at the same time"
// (different slotIds may share a slot — they're independent teaching instances)
```

Specifically, find where the solver builds `subjectGroupMap` or equivalent and change the grouping key from `group.subjectName` to `${group.slotId ?? ''}:${group.subjectName}`.

---

## Part 7 — OR-Group Combo Tab: Slot Label Field (`SubjectGroupsSection.tsx`)

When a user creates an OR-group in the "Subject Combos" tab, they should be able to label it as a slot (R1/R2/R3). Add a "Slot label" field in `GroupModal`:

```tsx
{/* Below the group name input */}
{logic === 'OR' && (
  <div style={{ marginBottom: 14 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Slot label <span style={{ color: '#C4C0DC', fontWeight: 400 }}>(optional — for regional language slots)</span>
    </label>
    <input
      value={slotLabel} onChange={e => setSlotLabel(e.target.value.trim())}
      placeholder="e.g. R1, R2, R3"
      style={{
        width: 100, padding: '6px 10px', borderRadius: 7,
        border: '1.5px solid #E4E0FF', fontSize: 13, outline: 'none',
        fontFamily: 'inherit',
      }}
    />
    <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 10 }}>
      Same subject in different slots = independent teaching groups
    </span>
  </div>
)}
```

Add `const [slotLabel, setSlotLabel] = useState(initial?.slotLabel ?? '')` and include `slotLabel: slotLabel.trim() || undefined` in the saved group.

When the combo is saved with a `slotLabel`, **also set `electiveSlotId` on each subject** in `subjects` array that appears in this combo:

```ts
// In handleSave (SubjectsPanel uses setSubjects which is passed down)
// This link goes through the parent: step-resources-v2.tsx passes subjects + setSubjects to SubjectsPanel
// Add a callback prop: onSlotLabelChange?: (subjectNames: string[], slotId: string) => void
// Call it when a slotLabel combo is saved
```

Alternatively, derive `electiveSlotId` on-the-fly in `step-student-groups.tsx` by checking the `subjectGroups` OR-groups for slot labels, rather than storing it on the subject itself. This avoids a two-way sync problem:

```ts
// In step-student-groups.tsx, add to the subjectList derivation:
const slotMap = useMemo(() => {
  const map = new Map<string, string>()  // subjectName → slotId
  for (const g of (store.subjectGroups ?? []) as SubjectAndOrGroup[]) {
    if (g.slotLabel && g.logic === 'OR') {
      for (const s of g.subjects) map.set(s, g.slotLabel)
    }
  }
  return map
}, [store.subjectGroups])
```

Then use `slotMap.get(s.name)` to determine `electiveSlotId` for each optional subject. **This approach is preferred** because it keeps the slot definition in one place (the OR-group) and derives it into the matrix automatically.

---

## Part 8 — Summary of All File Changes

| File | Change |
|------|--------|
| `types/index.ts` | Add `electiveSlotId?: string` to `Subject`, add `slotId?: string` + `slotLabel?: string` to `DynamicLearningGroup` (find the DLG type in `timetableStore.ts` if not in types) |
| `components/resources/SubjectGroupsSection.tsx` | Add `slotLabel?: string` to `SubjectAndOrGroup`; add Slot label field to `GroupModal` |
| `components/resources/SubjectsPanel.tsx` | 1) Make `CategoryHeaderRow` inline-editable + add `renameCategory()`. 2) Add "AI Categorize" button + `inferCategory()`. 3) Remove Category dropdown from `GradeSlotRow` and `SectionSubRow`. 4) Add Elective Slot ID input field in `ClassSlotsExpanded` (visible only when `isOptional = true`). |
| `routes/wizard/step-student-groups.tsx` | 1) Change `subjectList` to emit `{ key, label, subjectName, slotId }`. 2) Build `slotMap` from `subjectGroups` OR-combo slot labels. 3) Add two-row `<thead>` grouping columns by slot. 4) Fix `isApplicableToSection` calls to extract `subjectName` from slot-prefixed keys. 5) Update `handleRegenerate` to embed `slotId` in generated DLGs. |
| `routes/wizard/step6-generate.tsx` | Update `dlgsToOptionalBlocks()` to group by `(slotId + subjectName)` key and emit one `OptionalBlock` per teaching instance. |
| `lib/schedulingEngine.ts` | Change subject-conflict constraint key from `subjectName` to `${slotId}:${subjectName}` so that R1:Hindi and R2:Hindi can run simultaneously. |

---

## Part 9 — UI Walkthrough for End Users

### Setting up Case 3 (R1/R2/R3 Regional Languages) step by step:

1. **Resources → Subjects tab:**
   - Add subjects: English, Hindi, Odia, Sanskrit
   - Mark each as Elective (toggle ON in "More" panel)
   - No slot ID needed here — the slot will be defined via OR-groups

2. **Resources → Subjects → Subject OR/AND Combos (bottom of Subjects tab):**
   - Click "New Combo"
   - Logic: OR
   - Name: "Regional Language R1"
   - Slot label: **R1**
   - Subjects: English, Odia, Hindi
   - Save

   - Repeat: Logic OR | Name "Regional Language R2" | Slot **R2** | Subjects: Hindi, Odia, Sanskrit
   - Repeat: Logic OR | Name "Regional Language R3" | Slot **R3** | Subjects: Hindi, Odia

3. **Step 4 → Student Groups → Student Preference Matrix:**
   - Columns auto-appear: `R1: English` | `R1: Odia` | `R1: Hindi` | `R2: Hindi` | `R2: Odia` | `R2: Sanskrit` | `R3: Hindi` | `R3: Odia`
   - Slot headers group these under "R1 ▾", "R2 ▾", "R3 ▾"
   - For each class row, enter how many students chose each option in each slot
   - Row sums must equal total students (validation shown per slot group)

4. **Click "↻ Regenerate Groups":**
   - Produces 8 teaching groups (one per column that has students):
     - R1-English group, R1-Odia group, R1-Hindi group
     - R2-Hindi group (different teacher/room from R1-Hindi), R2-Odia group, R2-Sanskrit group
     - R3-Hindi group, R3-Odia group

5. **Step 5 → Review & Generate:**
   - Solver receives 8 independent `OptionalBlock` entries
   - Solver schedules them in parallel within the same time slot (per slot label)
   - R1 blocks run at one time, R2 blocks at another, R3 blocks at another

---

## Part 10 — Validation Rules to Add

### In the matrix (Step 4):

1. **Per-slot row sum validation:** For each row and each slot group, the sum of students across slot subjects MUST equal the row total. Show a red warning if a row's R1 sum ≠ totalStudents.

2. **Cross-slot warning:** If a subject appears in multiple slots AND a student shows up in two slots of the same student (impossible to know at setup time), add a tooltip: "Students appear in all slots — ensure each slot runs at a different time."

3. **Minimum group size:** Already enforced by `minGroupSize` slider.

### In the Subjects panel:

1. When `isOptional = true` AND `electiveSlotId` is empty AND the subject appears in a subject OR-group with a `slotLabel`, show an info tooltip: "Slot derived from OR-group: {slotId}".

---

## Implementation Order (recommended)

1. `types/index.ts` — add fields (no runtime risk)
2. `SubjectGroupsSection.tsx` — add `slotLabel` to interface + GroupModal field
3. `SubjectsPanel.tsx` — editable headers + AI Categorize + remove Category column + elective slot input
4. `step-student-groups.tsx` — slot-aware columns + two-row header + fix applicability + regenerate
5. `step6-generate.tsx` — update `dlgsToOptionalBlocks`
6. `lib/schedulingEngine.ts` — fix same-subject constraint key

Each step is independently deployable — later steps build on earlier ones but earlier ones are already useful standalone.

---

## Key Design Decisions (rationale)

**Why derive `electiveSlotId` from OR-groups instead of storing it on the Subject?**
Because the same subject (Hindi) legitimately lives in R1, R2, and R3 simultaneously. Storing `electiveSlotId` on the Subject would force a single slot assignment. Instead, the slot relationship is defined by the OR-group combo, which is already the right place for "these subjects are mutually exclusive in this slot."

**Why prefix column keys with `slotId:`?**
The existing preference matrix uses subject names as Map keys everywhere. Slot-prefixing is the minimal change that supports duplicate subject names across slots without restructuring the entire matrix data model.

**Why are Cases 1 and 2 already working?**
The existing `GroupingBehavior` system + `SAME_STREAM_ONLY` / `CROSS_STREAM_ALLOWED` modes already handle intra-stream and cross-stream grouping. Users just need to set `isOptional = true` and choose the right grouping behavior — the matrix, DLG generation, and solver already do the right thing.
