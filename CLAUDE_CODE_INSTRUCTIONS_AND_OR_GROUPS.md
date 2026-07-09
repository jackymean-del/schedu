# Claude Code Instructions — AND Groups + OR Groups (Step 4 Redesign)

> Replaces the old "Student Groups + Subject Combos" two-tab design.  
> **Key files:** `types/index.ts`, `routes/wizard/step-student-groups.tsx`,
> `routes/wizard/step6-generate.tsx`, `store/timetableStore.ts`,
> `lib/schedulingEngine.ts`

---

## The Core Problem with the Current Design

The existing "Student Preference Matrix" treats every optional subject as an independent
column and validates `sum of chosen subjects = total students`. This is **wrong** for
combination-based scheduling because:

- Physics is in both PCM and PCB — "how many took Physics?" is meaningless
- LKG/UKG rows appear even though they have no optional subjects
- Entering Maths=21 + Bio=19 fills 40 students, but then Physics/Chemistry also
  show editable cells — entering anything there breaks the sum validation
- The matrix cannot distinguish between "subjects a student takes together" vs
  "subjects a student picks one from"

---

## New Design: Two Tabs — AND Groups + OR Groups

### Tab 1: AND Groups
**Definition:** A student belongs to exactly **one subject bundle**. The bundle defines
ALL the subjects that student takes together. The split between bundles is
mutually exclusive — the sum of all bundle headcounts = section total.

**Example:**  
Science stream has two bundles: PCM (Physics+Chemistry+Maths) and PCB
(Physics+Chemistry+Biology). XI-Sci-A has 40 students → 21 go to PCM, 19 to PCB.
The scheduler knows every PCM student needs Physics AND Chemistry AND Maths scheduled.

**Room capacity / group splitting:**  
If 4 Science sections produce 85 PCM students total but room capacity = 45, the
scheduler creates 2 PCM teaching groups (45 + 40) scheduled in two parallel slots.
Each parallel slot pairs one PCM group with one PCB group in separate rooms.

### Tab 2: OR Groups
**Definition:** A student picks **one subject** from an elective slot. The slot is
independent of other slots — a student can appear in R1 AND R2 AND R3 because each
is a separate period block.

**Example:**  
R1 = English OR Hindi OR Odia. XI-Sci-A → English: 10, Hindi: 20, Odia: 11 (sum = 41
but section may have 41 students who must all choose exactly one R1 language).

---

## Part 1 — New Type Definitions (`types/index.ts`)

### 1.1 SubjectBundle (one combination option within an AND group)

```ts
/** A subject bundle = all subjects a student takes together.
 *  E.g. PCM = { id: 'pcm', name: 'PCM', subjects: ['Physics','Chemistry','Maths'] } */
export interface SubjectBundle {
  id: string
  name: string        // display name: "PCM", "PCB", "Arts", "Commerce"
  subjects: string[]  // ALL subject names in this bundle
  color?: string      // display color
}
```

### 1.2 AndComboGroup (one AND-group card = one split point)

```ts
/** One AND-group card represents a single split point:
 *  "In these sections, students are divided into these bundles."
 *  E.g. "Science XI-XII: PCM vs PCB" */
export interface AndComboGroup {
  id: string
  name: string                 // user-facing name: "Science XI-XII Combination"
  applicableSections: string[] // which sections this split applies to
  bundles: SubjectBundle[]     // 2+ mutually exclusive options
  /** Student count matrix: sectionName → bundleId → headcount.
   *  Validation: for each section, sum(bundleHeadcounts) === section.totalStudents */
  strengthMatrix: Record<string, Record<string, number>>
  /** AI-suggested? Shows a badge if true, dismissed once user edits */
  aiSuggested?: boolean
  /** Resolved teaching groups (generated, not user-entered) */
  generatedGroups?: AndTeachingGroup[]
}
```

### 1.3 AndTeachingGroup (generated, not user-defined)

```ts
/** One concrete teaching group produced from an AndComboGroup.
 *  Multiple groups per bundle when room capacity < total bundle headcount. */
export interface AndTeachingGroup {
  id: string
  bundleId: string       // which bundle (PCM, PCB)
  bundleName: string
  subjects: string[]     // same as bundle.subjects
  sectionSlices: Array<{
    sectionName: string
    studentCount: number
  }>
  totalStrength: number
  teacher?: string       // one teacher per subject — resolved in Allocation step
  room?: string
  roomCapacity?: number
  capacityWarning?: boolean
}
```

### 1.4 ElectiveSlot (OR group — rename from SubjectAndOrGroup)

```ts
/** One OR-group slot: students pick exactly one subject from this slot.
 *  Separate slots are independent — a student can appear in R1, R2, AND R3. */
export interface ElectiveSlot {
  id: string
  name: string           // "R1 Regional Language", "Physical Activity Elective"
  slotLabel?: string     // short label: "R1", "R2", "PE"
  subjects: string[]     // choices within this slot
  applicableSections: string[]  // empty = all sections
  periodsPerWeek?: number
  /** Student count matrix: sectionName → subjectName → headcount.
   *  Validation: for each section, sum(subjectHeadcounts) === section.totalStudents */
  strengthMatrix: Record<string, Record<string, number>>
  /** Generated teaching groups, one per (slotLabel+subject) combination */
  generatedGroups?: ElectiveTeachingGroup[]
}

export interface ElectiveTeachingGroup {
  id: string
  slotId: string
  slotLabel?: string
  subjectName: string
  sectionNames: string[]
  totalStrength: number
  teacher?: string
  room?: string
}
```

### 1.5 Add to timetable store state

In `store/timetableStore.ts`, add alongside existing `subjectGroups` / `participantPools`:

```ts
andComboGroups:    AndComboGroup[]
electiveSlots:     ElectiveSlot[]
setAndComboGroups: (g: AndComboGroup[]) => void
setElectiveSlots:  (s: ElectiveSlot[]) => void
```

Add both to `TT_SNAPSHOT_FIELDS` in `dashboard.tsx`.

---

## Part 2 — Step 4 Redesign (`step-student-groups.tsx`)

Delete the entire current file content and replace with the architecture below. Keep
the existing helper functions (`guessStream`, `generateGroupId`, `getBehaviors`,
`computeGroupingMode`, `groupColor`, `BEHAVIOR_META`, `MODE_META`) — they are reused
in the group generation logic.

### 2.1 Tab structure

```tsx
const TABS = [
  { key: 'and', label: 'AND Groups', icon: <Layers size={14} />,
    desc: 'Subject combinations — students split by bundle (PCM/PCB, Arts/Commerce)' },
  { key: 'or',  label: 'OR Groups',  icon: <Shuffle size={14} />,
    desc: 'Elective slots — students pick one subject from a list (R1/R2/R3, PE/Art)' },
] as const
type ActiveTab = 'and' | 'or'
```

### 2.2 AND Groups tab layout

```
┌─ Header ─────────────────────────────────────────────────────────────────────┐
│  Layers icon  "AND Groups"  subtitle  [+ New AND Group]  [⚡ AI Suggest]     │
└──────────────────────────────────────────────────────────────────────────────┘

[AI suggestion cards — appear when aiSuggested=true, shown before user cards]
┌─ Card: "Science XI–XII: PCM vs PCB" ───────────────── [Edit] [Delete] ────┐
│  Applies to: XI-Sci-A · XI-Sci-B · XII-Sci-A · XII-Sci-B                 │
│                                                                             │
│  ┌────────────────┬────────────┬────────────┬────────────┬──────────────┐  │
│  │ Section        │ Total      │ PCM (🟣)   │ PCB (🟢)   │ Validation   │  │
│  ├────────────────┼────────────┼────────────┼────────────┼──────────────┤  │
│  │ XI-Sci-A       │ 40         │ [21]       │ [19]       │ ✓ 40/40      │  │
│  │ XI-Sci-B       │ 40         │ [  ]       │ [  ]       │ ○ 0/40       │  │
│  │ XII-Sci-A      │ 45         │ [  ]       │ [  ]       │ ○ 0/45       │  │
│  └────────────────┴────────────┴────────────┴────────────┴──────────────┘  │
│                                                                             │
│  [↻ Generate Groups]   → PCM-G1: 21+22=43 students · Room 101             │
│                           PCB-G1: 19+20=39 students · Room 102             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 AI suggestion logic for AND groups

The AI should scan `subjects[]` from the store and suggest AND combo groups when it finds:

**Pattern 1 — Stream-specific combinations:**
- Check if any subjects have `isOptional=true` and are assigned to XI/XII Science/Commerce/Humanities sections
- For Science: if both "Mathematics" and "Biology" are optional and assigned to same Science sections → suggest "PCM vs PCB"
- For Commerce: if "Mathematics" and "Business Studies" are optional → suggest combo cards
- For Humanities: if "History", "Geography", "Psychology" are optional → suggest Humanities combo

```ts
function suggestAndComboGroups(
  subjects: Subject[],
  sections: Section[],
): AndComboGroup[] {
  const suggestions: AndComboGroup[] = []

  // ── Science stream: PCM vs PCB ──────────────────────────────────────────
  const sciSections = sections.filter(s => guessStream(s.name) === 'Science' &&
    (s.name.startsWith('XI') || s.name.startsWith('XII')))

  if (sciSections.length > 0) {
    const hasMaths = subjects.some(s => s.name.toLowerCase().includes('math') && s.isOptional)
    const hasBio   = subjects.some(s => s.name.toLowerCase().includes('bio')  && s.isOptional)
    const hasPhy   = subjects.some(s => s.name.toLowerCase().includes('phys') && s.isOptional)
    const hasChem  = subjects.some(s => s.name.toLowerCase().includes('chem') && s.isOptional)

    if ((hasMaths || hasBio) && hasPhy && hasChem) {
      const bundles: SubjectBundle[] = []
      if (hasMaths) bundles.push({ id: 'pcm', name: 'PCM',
        subjects: ['Physics','Chemistry','Mathematics'].filter(n =>
          subjects.some(s => s.name === n)), color: '#7C6FE0' })
      if (hasBio) bundles.push({ id: 'pcb', name: 'PCB',
        subjects: ['Physics','Chemistry','Biology'].filter(n =>
          subjects.some(s => s.name === n)), color: '#10B981' })

      if (bundles.length >= 2) {
        suggestions.push({
          id: `suggest_sci_${Date.now()}`,
          name: `Science Stream: ${bundles.map(b => b.name).join(' vs ')}`,
          applicableSections: sciSections.map(s => s.name),
          bundles,
          strengthMatrix: {},
          aiSuggested: true,
        })
      }
    }
  }

  // ── Commerce stream: Maths vs Applied Maths ─────────────────────────────
  const comSections = sections.filter(s => guessStream(s.name) === 'Commerce' &&
    (s.name.startsWith('XI') || s.name.startsWith('XII')))
  // ... similar pattern for Commerce optional subjects

  // ── Cross-stream: any two+ optional subjects assigned to same sections ──
  // Group optional subjects by their applicableSections signature
  // If ≥2 share the exact same sections → suggest an AND combo
  const bySig = new Map<string, Subject[]>()
  for (const sub of subjects.filter(s => s.isOptional)) {
    const assigned = [...new Set([
      ...(sub.classConfigs ?? []).map(c => c.sectionName).filter(Boolean) as string[],
      ...(sub.sections ?? []),
    ])].sort().join('|')
    if (!assigned) continue
    if (!bySig.has(assigned)) bySig.set(assigned, [])
    bySig.get(assigned)!.push(sub)
  }
  for (const [sig, subs] of bySig) {
    if (subs.length < 2) continue
    // Skip if already covered by stream-specific suggestion above
    const alreadyCovered = suggestions.some(sg =>
      subs.every(s => sg.bundles.some(b => b.subjects.includes(s.name))))
    if (alreadyCovered) continue
    const secNames = sig.split('|')
    suggestions.push({
      id: `suggest_sig_${sig.slice(0,20)}_${Date.now()}`,
      name: `${subs.map(s => s.name).join(' vs ')} (${secNames[0]}…)`,
      applicableSections: secNames,
      bundles: subs.map((s, i) => ({
        id: s.id,
        name: s.name,
        subjects: [s.name],
        color: ['#7C6FE0','#10B981','#F59E0B','#EF4444'][i % 4],
      })),
      strengthMatrix: {},
      aiSuggested: true,
    })
  }

  return suggestions
}
```

### 2.4 AND Group Card component

```tsx
function AndGroupCard({
  group, sections, onUpdate, onDelete, onGenerateGroups,
}: {
  group: AndComboGroup
  sections: Section[]
  onUpdate: (g: AndComboGroup) => void
  onDelete: () => void
  onGenerateGroups: () => void
}) {
  // Mini-table: rows = applicableSections, cols = bundles + Total + Validation
  // Each cell is an editable number input
  // Validation per row: sum of bundle counts === section.totalStudents

  const getTotal = (secName: string) =>
    sections.find(s => s.name === secName)?.strength ?? 0

  const getCount = (secName: string, bundleId: string) =>
    group.strengthMatrix?.[secName]?.[bundleId] ?? 0

  const setCount = (secName: string, bundleId: string, val: number) => {
    onUpdate({
      ...group,
      strengthMatrix: {
        ...group.strengthMatrix,
        [secName]: { ...(group.strengthMatrix?.[secName] ?? {}), [bundleId]: val },
      },
    })
  }

  return (
    <div style={{
      border: '1.5px solid #E4E0FF', borderRadius: 12, overflow: 'hidden',
      background: '#FAFAFE', marginBottom: 14,
    }}>
      {/* Card header */}
      <div style={{ padding: '12px 16px', background: '#F3F1FF', borderBottom: '1px solid #E8E4FF', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E', flex: 1 }}>
          {group.aiSuggested && (
            <span style={{ fontSize: 9, background: '#7C6FE0', color: '#fff', borderRadius: 3, padding: '1px 6px', marginRight: 8, fontWeight: 700 }}>
              ⚡ AI
            </span>
          )}
          {group.name}
        </span>

        {/* Bundle chips */}
        <div style={{ display: 'flex', gap: 5 }}>
          {group.bundles.map(b => (
            <span key={b.id} style={{
              fontSize: 10, fontWeight: 800, padding: '2px 8px',
              background: b.color ?? '#E8E4FF', color: '#fff',
              borderRadius: 4,
            }}>
              {b.name}: {b.subjects.join('+')}
            </span>
          ))}
        </div>

        <button onClick={() => {/* open edit modal */}} title="Edit" style={iconBtn}>
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} title="Delete" style={{ ...iconBtn, color: '#EF4444' }}>
          <Trash2 size={13} />
        </button>
      </div>

      {/* Mini-table */}
      <div style={{ padding: '12px 16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={miniTH('left', 130)}>Section</th>
              <th style={miniTH('center', 80)}>Total</th>
              {group.bundles.map(b => (
                <th key={b.id} style={{ ...miniTH('center', 90), color: b.color ?? '#7C6FE0' }}>
                  {b.name}
                </th>
              ))}
              <th style={miniTH('center', 80)}>Validation</th>
            </tr>
          </thead>
          <tbody>
            {group.applicableSections.map((secName, ri) => {
              const total = getTotal(secName)
              const sum = group.bundles.reduce((a, b) => a + getCount(secName, b.id), 0)
              const isMatch = total > 0 && sum === total
              const isOver  = sum > total

              return (
                <tr key={secName} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                  <td style={miniTD('left')}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{secName}</span>
                  </td>
                  <td style={miniTD('center')}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{total || '—'}</span>
                  </td>
                  {group.bundles.map(b => (
                    <td key={b.id} style={miniTD('center')}>
                      <input
                        type="number" min={0} max={total || undefined}
                        value={getCount(secName, b.id) || ''}
                        onChange={e => setCount(secName, b.id, Math.max(0, parseInt(e.target.value) || 0))}
                        placeholder="0"
                        style={{
                          width: 64, padding: '4px 6px', borderRadius: 6, textAlign: 'center',
                          border: `1.5px solid ${isOver ? '#FCA5A5' : '#E4E0FF'}`,
                          fontSize: 13, fontWeight: 700, outline: 'none',
                          fontFamily: 'inherit', background: isOver ? '#FEF2F2' : '#F5F2FF',
                          color: '#111028',
                        }}
                      />
                    </td>
                  ))}
                  <td style={miniTD('center')}>
                    {total === 0 ? (
                      <span style={{ fontSize: 10, color: '#C4C0DC' }}>—</span>
                    ) : isMatch ? (
                      <span style={{ color: '#15803D', fontSize: 11, fontWeight: 700 }}>✓ {sum}/{total}</span>
                    ) : isOver ? (
                      <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 700 }}>+{sum - total}</span>
                    ) : sum > 0 ? (
                      <span style={{ color: '#D97706', fontSize: 11, fontWeight: 700 }}>−{total - sum}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#C4C0DC' }}>○ {total}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Generate / generated groups */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={onGenerateGroups} style={generateBtn}>
            <RefreshCw size={11} /> Generate Teaching Groups
          </button>
          {group.generatedGroups && group.generatedGroups.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.generatedGroups.map(g => (
                <span key={g.id} style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px',
                  background: group.bundles.find(b => b.id === g.bundleId)?.color ?? '#EDE9FF',
                  color: '#fff', borderRadius: 5,
                  title: g.sectionSlices.map(s => `${s.sectionName}: ${s.studentCount}`).join(', '),
                }}>
                  {g.bundleName}-G{g.id.split('_').pop()}: {g.totalStrength} students
                  {g.room ? ` · ${g.room}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### 2.5 AND group teaching group generation

```ts
function generateAndGroups(
  group: AndComboGroup,
  rooms: Room[],
  staff: Staff[],
  teacherAllocations: Record<string, any>,
): AndTeachingGroup[] {
  const result: AndTeachingGroup[] = []
  const sortedRooms = [...rooms].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  const biggestRoom = sortedRooms.length > 0
    ? sortedRooms[sortedRooms.length - 1].capacity ?? 0
    : Infinity

  for (const bundle of group.bundles) {
    // Collect all (section, count) pairs for this bundle
    const sectionSlices: Array<{ sectionName: string; studentCount: number }> = []
    for (const secName of group.applicableSections) {
      const count = group.strengthMatrix?.[secName]?.[bundle.id] ?? 0
      if (count > 0) sectionSlices.push({ sectionName: secName, studentCount: count })
    }
    if (sectionSlices.length === 0) continue

    const totalStrength = sectionSlices.reduce((a, s) => a + s.studentCount, 0)

    // Split into room-capacity batches
    if (totalStrength <= biggestRoom || biggestRoom === Infinity) {
      // One group fits
      const room = sortedRooms.find(r => (r.capacity ?? 0) >= totalStrength)
      result.push({
        id: `${group.id}_${bundle.id}_G1`,
        bundleId: bundle.id,
        bundleName: bundle.name,
        subjects: bundle.subjects,
        sectionSlices,
        totalStrength,
        room: room?.name,
        roomCapacity: room?.capacity,
        capacityWarning: false,
      })
    } else {
      // Split greedily across room-sized batches
      let batch: Array<{ sectionName: string; studentCount: number }> = []
      let batchStr = 0
      let gIdx = 1

      const flush = () => {
        if (batch.length === 0) return
        const room = sortedRooms.find(r => (r.capacity ?? 0) >= batchStr)
          ?? sortedRooms[sortedRooms.length - 1]
        result.push({
          id: `${group.id}_${bundle.id}_G${gIdx}`,
          bundleId: bundle.id,
          bundleName: bundle.name,
          subjects: bundle.subjects,
          sectionSlices: [...batch],
          totalStrength: batchStr,
          room: room?.name,
          roomCapacity: room?.capacity,
          capacityWarning: (room?.capacity ?? 0) < batchStr,
        })
        batch = []; batchStr = 0; gIdx++
      }

      for (const slice of sectionSlices) {
        if (batchStr + slice.studentCount > biggestRoom && batch.length > 0) flush()
        batch.push(slice)
        batchStr += slice.studentCount
      }
      flush()
    }
  }

  return result
}
```

### 2.6 AND Group creation/edit modal

The "New AND Group" and "Edit" modal contains:
1. **Group name** — text input
2. **Applicable Sections** — multi-select chip picker (filtered to senior secondary by default)
3. **Bundles** — dynamic list of bundles, each with:
   - Bundle name (text input: "PCM", "PCB", "Arts", "Commerce")
   - Bundle subjects (chip selector from `subjects[]` — only subjects with `isOptional=true`)
   - Bundle color (color swatch)
   - [+ Add Bundle] button, minimum 2 bundles

### 2.7 OR Groups tab

The OR Groups tab replaces the existing Subject Combos tab but keeps the same core structure from `SubjectGroupsSection.tsx` with these upgrades:

1. **Rename** `SubjectAndOrGroup` → `ElectiveSlot` in the component
2. **Remove AND logic entirely** (remove the AND/OR toggle from `GroupModal`)
3. **Add a mini strength matrix** per ElectiveSlot (same pattern as AndGroupCard):
   - Rows = `applicableSections`
   - Columns = subjects in the slot
   - Cells = student counts
   - Validation: sum per row = section total
4. **Add `slotLabel` field** (R1, R2, R3) for regional language grouping
5. **Keep the AI suggestion engine** from `generateSuggestions()` — it already detects language/PE/art patterns correctly for OR logic

---

## Part 3 — Teaching Group Generation Logic

### Combined `handleGenerateAll` 

Replace the existing `handleRegenerate` with a function that processes both AND and OR groups:

```ts
function handleGenerateAll() {
  // ── Process AND combo groups ──────────────────────────────────────────
  const updatedAndGroups = andComboGroups.map(group => ({
    ...group,
    generatedGroups: generateAndGroups(group, storeRooms, storeStaff, teacherAllocations),
  }))
  setAndComboGroups(updatedAndGroups)

  // ── Process OR elective slots ─────────────────────────────────────────
  const updatedElectiveSlots = electiveSlots.map(slot => {
    const groups: ElectiveTeachingGroup[] = []
    const sortedRooms = [...storeRooms].sort((a: any, b: any) => (a.capacity??0)-(b.capacity??0))

    for (const subjectName of slot.subjects) {
      // Collect students across all applicable sections for this subject
      const sectionNames: string[] = []
      let totalStrength = 0

      for (const secName of (slot.applicableSections.length > 0 ? slot.applicableSections : allSectionNames)) {
        const count = slot.strengthMatrix?.[secName]?.[subjectName] ?? 0
        if (count > 0) { sectionNames.push(secName); totalStrength += count }
      }
      if (totalStrength === 0) continue

      const room = sortedRooms.find((r: any) => (r.capacity ?? 0) >= totalStrength)
      groups.push({
        id: `${slot.id}_${subjectName.replace(/\s/g,'_')}_G1`,
        slotId: slot.id,
        slotLabel: slot.slotLabel,
        subjectName,
        sectionNames,
        totalStrength,
        room: room?.name,
      })
    }
    return { ...slot, generatedGroups: groups }
  })
  setElectiveSlots(updatedElectiveSlots)
}
```

---

## Part 4 — Solver Bridge (`step6-generate.tsx`)

### `andGroupsToOptionalBlocks`

```ts
function andGroupsToOptionalBlocks(andGroups: AndComboGroup[]): OptionalBlock[] {
  const blocks: OptionalBlock[] = []

  for (const group of andGroups) {
    for (const bundle of group.bundles) {
      const teachingGroups = (group.generatedGroups ?? []).filter(g => g.bundleId === bundle.id)
      if (teachingGroups.length === 0) continue

      // Each subject in the bundle needs its own optional block
      for (const subjectName of bundle.subjects) {
        blocks.push({
          id: `${group.id}_${bundle.id}_${subjectName}`,
          subjectName,
          bundleId: bundle.id,
          bundleName: bundle.name,
          andGroupId: group.id,
          // Each teaching group becomes a pool
          pools: teachingGroups.map(g => ({
            sections: g.sectionSlices.map(s => s.sectionName),
            studentCount: g.totalStrength,
            teacher: g.teacher,
            room: g.room,
          })),
          // Constraint: all subjects in the same bundle must be scheduled
          // in non-overlapping slots (PCM students need Physics AND Maths
          // AND Chemistry in DIFFERENT periods, not the same period)
          sameBundleSiblings: bundle.subjects.filter(s => s !== subjectName),
        })
      }
    }
  }

  return blocks
}
```

### `electiveSlotsToOptionalBlocks`

```ts
function electiveSlotsToOptionalBlocks(slots: ElectiveSlot[]): OptionalBlock[] {
  const blocks: OptionalBlock[] = []

  for (const slot of slots) {
    for (const group of (slot.generatedGroups ?? [])) {
      blocks.push({
        id: group.id,
        subjectName: group.subjectName,
        slotId: slot.id,
        slotLabel: slot.slotLabel,
        pools: [{
          sections: group.sectionNames,
          studentCount: group.totalStrength,
          teacher: group.teacher,
          room: group.room,
        }],
        // Within same slot label, subjects are mutually exclusive in time
        // (all R1 subjects run at the same time — different rooms)
        // Between slot labels, subjects are independent
        // (R1 and R2 run at different times)
        slotSiblings: slots
          .filter(s => s.id === slot.id)
          .flatMap(s => s.subjects)
          .filter(s => s !== group.subjectName),
      })
    }
  }

  return blocks
}
```

---

## Part 5 — Solver Changes (`lib/schedulingEngine.ts`)

### 5.1 AND group constraint: subjects in the same bundle must NOT share a time slot

```ts
// When placing subject X for bundle PCM group 1,
// the solver must ensure Physics, Chemistry, Maths are all in DIFFERENT periods
// (same students can't be in two rooms at once)

// Add constraint:
// For each AndComboGroup, for each bundle, for each pair of subjects in bundle:
//   NO teaching group of subject A shares a period slot with any teaching group
//   of subject B when they have the same sections/students
```

### 5.2 OR group constraint: within a slot label, run in parallel

```ts
// For each ElectiveSlot with slotLabel "R1":
//   ALL R1 teaching groups must run IN THE SAME period slot
//   (English-R1 group, Hindi-R1 group, Odia-R1 group → same period, different rooms)

// For different slotLabels (R1 vs R2):
//   They MUST run in DIFFERENT period slots
//   (students appear in both R1 and R2)
```

---

## Part 6 — Remove / Deprecate

| Component / Code | Action |
|-----------------|--------|
| `subjectGroupingRules` store key | Remove — grouping behavior is now implicit in AND/OR group structure |
| `sectionStrengths` store key | Remove — strength is now embedded in `strengthMatrix` inside each group |
| `dynamicLearningGroups` store key | Replace with `andComboGroups[].generatedGroups` + `electiveSlots[].generatedGroups` |
| `GroupingBehavior` type + `BEHAVIORS` + `BEHAVIOR_META` | Remove from Step 4 UI (keep in solver internally) |
| Existing `handleRegenerate` | Replace with `handleGenerateAll` |
| `SubjectAndOrGroup` interface | Rename to `ElectiveSlot` and remove AND logic |
| `SubjectGroupsSection` component | Rename to `ElectiveSlotsSection`, remove AND tab |

---

## Part 7 — Implementation Order

1. **`types/index.ts`** — Add `SubjectBundle`, `AndComboGroup`, `AndTeachingGroup`, `ElectiveSlot`, `ElectiveTeachingGroup`. Keep existing types for backward compat during transition (add `@deprecated` JSDoc).
2. **`store/timetableStore.ts`** — Add `andComboGroups`, `electiveSlots`, `setAndComboGroups`, `setElectiveSlots`. Add to `TT_SNAPSHOT_FIELDS`.
3. **`step-student-groups.tsx`** — Full replacement with AND/OR tab architecture. Start with AND Groups tab (card UI + mini-table + generation). OR Groups tab can reuse cleaned-up `ElectiveSlotsSection`.
4. **`step6-generate.tsx`** — Add `andGroupsToOptionalBlocks` and `electiveSlotsToOptionalBlocks`. Wire into the existing solver call.
5. **`lib/schedulingEngine.ts`** — Add bundle-subjects-must-not-overlap constraint and slot-parallel constraint.

---

## Part 8 — What the End User Sees

### Setting up "Science XI-XII: PCM vs PCB"

**Step 2 (Resources → Subjects):**
- Mathematics: `isOptional = true`
- Biology: `isOptional = true`
- Physics, Chemistry: compulsory (still scheduled for all Science students)

**Step 4 → AND Groups tab:**
- AI suggests card: "Science XI-XII: PCM vs PCB"
  - PCM = Physics + Chemistry + Mathematics
  - PCB = Physics + Chemistry + Biology
  - Applies to: XI-Sci-A, XI-Sci-B, XII-Sci-A, XII-Sci-B
- User clicks "Use this suggestion"
- Mini-table appears:
  - XI-Sci-A: PCM = [21], PCB = [19] → ✓ 40/40
  - XI-Sci-B: PCM = [24], PCB = [21] → ✓ 45/45
  - XII-Sci-A: PCM = [  ], PCB = [  ] → ○ 0/45
  - XII-Sci-B: PCM = [  ], PCB = [  ] → ○ 0/45
- User fills in XII rows
- Clicks "↻ Generate Teaching Groups"
- Result chips appear:
  - PCM-G1: 45 students · Room 101
  - PCM-G2: 45 students · Room 103
  - PCB-G1: 40 students · Room 102
  - PCB-G2: 40 students · Room 104

**Step 5 → Solver gets:**
- OptionalBlock for Mathematics: 2 pools (PCM-G1 sections, PCM-G2 sections)
- OptionalBlock for Biology: 2 pools (PCB-G1 sections, PCB-G2 sections)
- Constraint: Maths and Bio never overlap (same students can't be in both rooms)
- Constraint: PCM-G1 Maths slot ≠ PCM-G1 Physics slot ≠ PCM-G1 Chemistry slot

**Timetable result:**
- Period 3: PCM-G1 → Maths(Room 101) | PCB-G1 → Bio(Room 102) [parallel]
- Period 4: PCM-G2 → Maths(Room 103) | PCB-G2 → Bio(Room 104) [parallel]
- Physics and Chemistry are scheduled normally for all Science students (not optional)
