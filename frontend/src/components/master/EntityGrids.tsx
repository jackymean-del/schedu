/**
 * EntityGrids — shared DataGrid wrappers for the four core entities.
 *
 * Used by:
 *   - Wizard's Resources step (initial setup)
 *   - Master Data page (post-setup live editing)
 *
 * One source of truth. Identical UX everywhere.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Subject, Section, Staff, ScopeMatrix } from '@/types'
import { DataGrid, DataGridColumn } from '@/components/DataGrid/DataGrid'
import { GraduationCap, BookOpen, Users, Building2, X } from 'lucide-react'
import { useNamingMemory } from '@/hooks/useNamingMemory'
import { useDirectoryStore } from '@/store/directoryStore'

// ── Auto-fill helpers ────────────────────────────────────────────────────────

/** "10-A" → "10",  "XI-B" → "XI",  "XI-Sci-A" → "XI",  "10" → "" */
function extractGradeFromSection(name: string): string {
  const trimmed = name.trim()
  const idx = trimmed.lastIndexOf('-')
  if (idx <= 0) return ''
  const suffix = trimmed.slice(idx + 1).trim()
  // Only treat it as a section suffix if it's 1-2 chars (e.g. A, B, 1, 2A)
  if (suffix.length === 0 || suffix.length > 2) return ''
  // Everything before the last "-suffix" — may still contain stream token (e.g. "XI-Sci")
  const middle = trimmed.slice(0, idx).trim()
  // If the middle part also ends in a stream token, strip it to get just the grade
  const streamTokens = /-(sci|com|arts?|hum|gen|pcm|pcb|mpc|mec|cec|biz|law|med)$/i
  return middle.replace(streamTokens, '').trim()
}

// Stream keywords → STREAMS values
// Keys are lowercase tokens that may appear anywhere in the section name
const STREAM_KEYWORDS: Array<{ re: RegExp; stream: string }> = [
  { re: /\b(sci|science|pcm|pcb|mpc|physics|bio|chem)\b/i,           stream: 'Science'    },
  { re: /\b(com|commerce|acc|accountancy|bst|biz|mec|cec)\b/i,       stream: 'Commerce'   },
  { re: /\b(arts?|hum|humanities|hist|history|lit|geo|pol|law)\b/i,  stream: 'Humanities' },
  { re: /\b(gen|general|voc|vocational)\b/i,                          stream: 'General'    },
]

/**
 * Infer stream from section name.
 * "XI-Sci-A" → "Science",  "XII-Com-B" → "Commerce",  "11-Arts" → "Humanities"
 * Returns '' if no stream keyword found.
 */
function inferStreamFromSection(name: string): string {
  for (const { re, stream } of STREAM_KEYWORDS) {
    if (re.test(name)) return stream
  }
  return ''
}

// ── Subject abbreviation lookup (Indian K-12 curriculum) ────────────────────
// Key = lowercase subject name (or common alias).  Value = standard short form.
const SUBJECT_ABBR: Record<string, string> = {
  // Languages
  'english': 'ENG',
  'english language': 'ENG',
  'english literature': 'ENG LIT',
  'hindi': 'HIN',
  'hindi language': 'HIN',
  'hindi literature': 'HIN LIT',
  'sanskrit': 'SANS',
  'urdu': 'URD',
  'punjabi': 'PUN',
  'gujarati': 'GUJ',
  'marathi': 'MAR',
  'tamil': 'TAM',
  'telugu': 'TEL',
  'kannada': 'KAN',
  'bengali': 'BEN',
  'malayalam': 'MAL',
  'odia': 'ODI',
  'french': 'FRE',
  'german': 'GER',
  'spanish': 'SPA',
  'japanese': 'JAP',
  'arabic': 'ARB',
  // Mathematics
  'mathematics': 'MATH',
  'maths': 'MATH',
  'math': 'MATH',
  'applied mathematics': 'APP MATH',
  'statistics': 'STAT',
  'arithmetic': 'ARITH',
  // Sciences
  'science': 'SCI',
  'general science': 'GEN SCI',
  'physics': 'PHY',
  'chemistry': 'CHEM',
  'biology': 'BIO',
  'botany': 'BOT',
  'zoology': 'ZOO',
  'microbiology': 'MICRO',
  'biochemistry': 'BIOCHEM',
  'biotechnology': 'BT',
  'environmental science': 'EVS',
  'environmental studies': 'EVS',
  // Social Sciences
  'social science': 'SSC',
  'social sciences': 'SSC',
  'social studies': 'SOC ST',
  'history': 'HIST',
  'geography': 'GEO',
  'civics': 'CIV',
  'political science': 'POL SC',
  'economics': 'ECO',
  'psychology': 'PSY',
  'sociology': 'SOC',
  'philosophy': 'PHIL',
  'legal studies': 'LEG',
  // Commerce
  'accountancy': 'ACC',
  'accounts': 'ACC',
  'accounting': 'ACC',
  'business studies': 'BST',
  'business mathematics': 'BUS MATH',
  'entrepreneurship': 'ENT',
  'economics and commerce': 'ECO COM',
  // Computer / IT
  'computer science': 'CS',
  'computer applications': 'CA',
  'information technology': 'IT',
  'information practices': 'IP',
  'artificial intelligence': 'AI',
  'data science': 'DS',
  // Arts / Vocational
  'art': 'ART',
  'arts': 'ART',
  'fine arts': 'FA',
  'drawing': 'DRAW',
  'music': 'MUS',
  'dance': 'DAN',
  'theatre': 'THE',
  'drama': 'DRA',
  'home science': 'HOME SC',
  'physical education': 'PHY ED',
  'physical training': 'PT',
  'yoga': 'YOGA',
  'sports': 'SPO',
  // General / Misc
  'moral science': 'MOR SC',
  'value education': 'VAL ED',
  'general knowledge': 'GK',
  'general studies': 'GS',
  'library': 'LIB',
  'work experience': 'WE',
  'vocational': 'VOC',
}

/**
 * Returns a standardised short form for a subject name.
 * 1. Exact lookup in SUBJECT_ABBR (case-insensitive).
 * 2. Partial match — if user types "Pol Sc" it matches "political science" prefix — skipped
 *    for now; exact is safer.
 * 3. Fallback: ≤5 char word → as-is uppercase; single long word → first 4 chars;
 *    multi-word → first letter of each word (e.g. "Life Skills" → "LS").
 */
function autoShortName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const key = trimmed.toLowerCase()
  if (SUBJECT_ABBR[key]) return SUBJECT_ABBR[key]
  // Fallback
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    const w = words[0].toUpperCase()
    return w.length <= 4 ? w : w.slice(0, 4)
  }
  // Multi-word: initials, max 6 chars
  return words.map(w => w[0].toUpperCase()).join('').slice(0, 6)
}

export const SUBJECT_CATS = ['Core', 'Language', 'Elective', 'Optional', 'Lab', 'CCA', 'Activity', 'Other']
export const ROOM_TYPES   = ['Classroom', 'Lab', 'Computer Lab', 'Library', 'Hall', 'Gym', 'Staff Room', 'Other']
export const ROLES        = ['Teacher', 'HoD', 'Coordinator', 'Principal', 'Vice Principal', 'Counsellor', 'Lab Incharge', 'Librarian']
export const GENDERS      = ['', 'female', 'male', 'other']
export const STREAMS      = ['', 'Science', 'Commerce', 'Humanities', 'General']

export interface RoomRow {
  id: string
  name: string
  type: string
  capacity: number
  building: string
  floor: string
  scope?: ScopeMatrix
  /** Links this schedule's row to a shared cross-schedule roster entry
   *  (store/directoryStore.ts). Optional — old records simply lack it. */
  directoryId?: string
}

export function makeId() {
  return Math.random().toString(36).slice(2, 8)
}

// ═════════════════════════════════════════════════════════════
// CLASSES GRID
// ═════════════════════════════════════════════════════════════
export function ClassesGrid({
  sections, setSections, staff, onScope, onBulkScope,
}: {
  sections: Section[]
  setSections: (s: Section[]) => void
  staff: Staff[]
  onScope: (s: Section, rect?: DOMRect) => void
  onBulkScope?: (rect?: DOMRect) => void
}) {
  const staffOptions = useMemo(() => ['', ...staff.map((s: any) => s.name)], [staff])
  const columns: DataGridColumn<Section>[] = [
    {
      key: 'name', label: 'Section', type: 'text', sticky: true, width: 120, placeholder: 'e.g. 10-A',
      setValue: (row, v) => {
        const s = String(v)
        const grade  = extractGradeFromSection(s)
        const stream = inferStreamFromSection(s)
        return {
          ...row, name: v,
          grade:  grade  || (row as any).grade  || '',
          stream: stream || (row as any).stream || '',
        } as any
      },
    },
    { key: 'grade', label: 'Grade', type: 'text', width: 100, placeholder: 'e.g. 10' },
    { key: 'room',  label: 'Home Room', type: 'text', width: 110, placeholder: 'e.g. Room 101' },
    {
      key: 'stream', label: 'Stream', type: 'select', options: STREAMS, width: 130,
      placeholder: 'Optional',
      getValue: (r) => (r as any).stream ?? '',
      setValue: (r, v) => ({ ...r, stream: v }) as any,
    },
    { key: 'classTeacher', label: 'Class Teacher', type: 'select', options: staffOptions, width: 180, placeholder: 'Assign...' },
  ]
  return (
    <DataGrid<Section>
      title="Classes & Sections"
      description="One row per section. Stream is optional for Grade XI–XII."
      icon={<GraduationCap size={16} />}
      columns={columns}
      rows={sections}
      rowKey={(r) => r.id}
      onChange={setSections}
      onScope={onScope}
      onBulkScope={onBulkScope}
      newRow={() => ({
        id: makeId(), name: `Section ${sections.length + 1}`,
        room: `Room ${101 + sections.length}`, grade: '', classTeacher: '',
      } as Section)}
      toolbar={{ add: true, importCSV: true, exportCSV: true, paste: true, search: true, transpose: true, bulkActions: true }}
    />
  )
}

// ═════════════════════════════════════════════════════════════
// SUBJECTS GRID
// ═════════════════════════════════════════════════════════════
export function SubjectsGrid({
  subjects, setSubjects, onScope, onBulkScope,
}: {
  subjects: Subject[]
  setSubjects: (s: Subject[]) => void
  onScope: (s: Subject, rect?: DOMRect) => void
  onBulkScope?: (rect?: DOMRect) => void
}) {
  const { rememberSubjectShort, suggestShort } = useNamingMemory()

  const columns: DataGridColumn<Subject>[] = [
    {
      key: 'name', label: 'Subject', type: 'text', sticky: true, width: 200, placeholder: 'e.g. Mathematics',
      setValue: (row, v) => {
        const name = String(v)
        // Priority: 1) user's own memory  2) built-in table  3) algorithm
        const learnedShort = suggestShort(name)
        const builtinShort = SUBJECT_ABBR[name.trim().toLowerCase()]
        const algoShort = autoShortName(name)
        const short = learnedShort || builtinShort || algoShort
        const current = (row as any).shortName ?? ''
        return { ...row, name: v, shortName: current || short } as any
      },
    },
    {
      key: 'shortName', label: 'Short', type: 'text', width: 90, placeholder: 'e.g. MATH',
      // When user manually edits the short form → train the engine
      setValue: (row, v) => {
        const name = (row as any).name ?? ''
        if (name && v) rememberSubjectShort(String(name), String(v))
        return { ...row, shortName: v } as any
      },
    },
    { key: 'category',  label: 'Category', type: 'select', options: SUBJECT_CATS, width: 140, placeholder: 'Select...' },
    {
      key: 'isOptional', label: 'Optional', type: 'toggle', width: 90, align: 'center',
      getValue: (r) => (r as any).isOptional ?? false,
      setValue: (r, v) => ({ ...r, isOptional: Boolean(v) } as any),
    },
    {
      key: 'requiresLab', label: 'Lab Room', type: 'toggle', width: 90, align: 'center',
      getValue: (r) => (r as any).requiresLab ?? false,
      setValue: (r, v) => ({ ...r, requiresLab: Boolean(v) } as any),
    },
  ]
  return (
    <DataGrid<Subject>
      title="Subjects"
      description="Core, optional, lab — toggle as needed. The engine uses these flags to plan."
      icon={<BookOpen size={16} />}
      columns={columns}
      rows={subjects}
      rowKey={(r) => r.id}
      onChange={setSubjects}
      onScope={onScope}
      onBulkScope={onBulkScope}
      newRow={() => ({
        id: makeId(), name: `Subject ${subjects.length + 1}`,
        shortName: `S${subjects.length + 1}`, category: 'Core',
        periodsPerWeek: 4, sessionDuration: 45, maxPeriodsPerDay: 2,
        isOptional: false, requiresLab: false, color: '#7C6FE0',
        sections: [], classConfigs: [],
      } as any)}
      toolbar={{ add: true, importCSV: true, exportCSV: true, paste: true, search: true, transpose: true, bulkActions: true }}
    />
  )
}

// ── Shared cross-schedule directory auto-link confirmation ──────────────────
// Master Data's DataGrid text cell only commits on blur/Enter/Tab (not per
// keystroke, unlike a live-typing input) — see DataGrid.tsx's text editor —
// so by the time a name commit reaches here it's final, and matches the
// wizard's Add row: an exact match to the shared directory links immediately
// (role/subjects or type/capacity filled in from the directory entry), no
// separate click required. This banner is just a dismissible confirmation
// with an escape hatch for the rare case the match was wrong.
function DirectoryLinkedBanner({ name, onUnlink, onDismiss }: {
  name: string; onUnlink: () => void; onDismiss: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      padding: '7px 10px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0',
      fontSize: 11.5, color: '#166534',
    }}>
      <span style={{ flex: 1 }}>
        ✓ Linked <strong>{name}</strong> to your cross-schedule directory — details filled in from there.
      </span>
      <button onClick={onUnlink} title="Not the same person/venue — unlink this row"
        style={{ background: 'none', border: '1.5px solid #86EFAC', color: '#166534', borderRadius: 5, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        Not the same? Unlink
      </button>
      <button onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', padding: 2, display: 'inline-flex' }}>
        <X size={13} />
      </button>
    </div>
  )
}

/** Debounced auto-registration into the shared directory: waits for edits to
 *  settle (so per-keystroke commits from DataGrid's live text cell don't spam
 *  the directory with partial names) before registering a row with a real
 *  name and no directoryId as a brand-new directory entry.
 *
 *  Deliberately only creates NEW entries — it never links a row to an
 *  EXISTING match. That's the name column's own setValue's job (see
 *  TeachersGrid/RoomsGrid), which runs at commit time. If this debounce also
 *  linked existing matches, "Unlink" (DirectoryLinkedBanner) would be undone
 *  within 900ms: the row's name is still an exact match right after
 *  unlinking, so a find-or-create here would silently re-attach the same
 *  directoryId the user just asked to remove. */
function useDirectoryAutoRegister<T extends { id: string; name?: string; directoryId?: string }>(
  rows: T[],
  setRows: (r: T[]) => void,
  placeholderPattern: RegExp,
  findByName: (name: string) => { id: string } | undefined,
  register: (name: string) => { id: string },
) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      let changed = false
      const next = rows.map(r => {
        const name = (r.name ?? '').trim()
        if (!name || r.directoryId || placeholderPattern.test(name) || findByName(name)) return r
        changed = true
        return { ...r, directoryId: register(name).id }
      })
      if (changed) setRows(next)
    }, 900)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])
}

// ═════════════════════════════════════════════════════════════
// TEACHERS GRID
// ═════════════════════════════════════════════════════════════
export function TeachersGrid({
  staff, setStaff, sections, onScope, onBulkScope,
}: {
  staff: Staff[]
  setStaff: (s: Staff[]) => void
  sections: Section[]
  onScope: (t: Staff, rect?: DOMRect) => void
  onBulkScope?: (rect?: DOMRect) => void
}) {
  const sectionOptions = useMemo(() => ['', ...sections.map((s: any) => s.name)], [sections])
  const directoryStaff = useDirectoryStore(s => s.staff)
  const [linked, setLinked] = useState<{ rowId: string; name: string } | null>(null)

  useDirectoryAutoRegister(staff, setStaff, /^Teacher \d+$/,
    (name) => useDirectoryStore.getState().findStaffByName(name),
    (name) => useDirectoryStore.getState().addStaff({ name }))

  function unlink(rowId: string) {
    setStaff(staff.map(s => s.id === rowId ? { ...s, directoryId: undefined } as Staff : s))
    setLinked(null)
  }

  const columns: DataGridColumn<Staff>[] = [
    {
      key: 'name', label: 'Teacher', type: 'text', sticky: true, width: 180, placeholder: 'e.g. John Smith',
      // Commits on blur/Enter/Tab (DataGrid's text cell), not per keystroke, so
      // an exact match here is already a finished edit — auto-link immediately
      // like the wizard's Add row, rather than requiring a separate click.
      setValue: (row, v) => {
        const trimmed = String(v).trim()
        const match = trimmed ? directoryStaff.find(s => s.name.toLowerCase() === trimmed.toLowerCase()) : undefined
        if (match && (row as any).directoryId !== match.id) {
          setLinked({ rowId: row.id, name: match.name })
          return {
            ...row, name: v, directoryId: match.id,
            shortName: (row as any).shortName || match.shortName || '',
            subjects: (row as any).subjects?.length ? (row as any).subjects : (match.subjects ?? []),
            maxPeriodsPerWeek: (row as any).maxPeriodsPerWeek ?? match.maxPeriodsPerWeek ?? 30,
          } as any
        }
        return { ...row, name: v } as any
      },
    },
    { key: 'role',   label: 'Role',    type: 'select', options: ROLES,    width: 160, placeholder: 'Select role' },
    { key: 'gender', label: 'Gender',  type: 'select', options: GENDERS,  width: 110, placeholder: 'Male/Female/Other' },
    {
      key: 'isClassTeacher', label: 'Class Teacher of', type: 'select', options: sectionOptions, width: 160,
      placeholder: 'None',
      getValue: (r) => r.isClassTeacher ?? '',
      setValue: (r, v) => ({ ...r, isClassTeacher: v ?? '' }),
    },
  ]
  return (
    <div>
      {linked && (
        <DirectoryLinkedBanner name={linked.name} onUnlink={() => unlink(linked.rowId)} onDismiss={() => setLinked(null)} />
      )}
      <DataGrid<Staff>
        title="Teachers"
        description="Subjects = comma-separated list. Click Scope to set per-teacher availability."
        icon={<Users size={16} />}
        columns={columns}
        rows={staff}
        rowKey={(r) => r.id}
        onChange={setStaff}
        onScope={onScope}
        onBulkScope={onBulkScope}
        newRow={() => ({
          id: makeId(), name: `Teacher ${staff.length + 1}`,
          shortName: '', role: 'Teacher', subjects: [], classes: [],
          isClassTeacher: '', maxPeriodsPerWeek: 30,
        } as Staff)}
        toolbar={{ add: true, importCSV: true, exportCSV: true, paste: true, search: true, transpose: true, bulkActions: true }}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// ROOMS GRID
// ═════════════════════════════════════════════════════════════
export function RoomsGrid({
  rooms, setRooms, onScope, onBulkScope,
}: {
  rooms: RoomRow[]
  setRooms: (r: RoomRow[]) => void
  onScope: (r: RoomRow, rect?: DOMRect) => void
  onBulkScope?: (rect?: DOMRect) => void
}) {
  const directoryVenues = useDirectoryStore(s => s.venues)
  const [linked, setLinked] = useState<{ rowId: string; name: string } | null>(null)

  useDirectoryAutoRegister(rooms, setRooms, /^Room \d+$/,
    (name) => useDirectoryStore.getState().findVenueByName(name),
    (name) => useDirectoryStore.getState().addVenue({ name }))

  function unlink(rowId: string) {
    setRooms(rooms.map(r => r.id === rowId ? { ...r, directoryId: undefined } as RoomRow : r))
    setLinked(null)
  }

  const columns: DataGridColumn<RoomRow>[] = [
    {
      key: 'name', label: 'Room', type: 'text', sticky: true, width: 140, placeholder: 'e.g. Room 101',
      // See TeachersGrid's name column for why auto-link-on-commit (no extra
      // click) is the right match for this grid's commit-on-blur/Enter/Tab model.
      setValue: (row, v) => {
        const trimmed = String(v).trim()
        const match = trimmed ? directoryVenues.find(x => x.name.toLowerCase() === trimmed.toLowerCase()) : undefined
        if (match && (row as any).directoryId !== match.id) {
          setLinked({ rowId: row.id, name: match.name })
          return {
            ...row, name: v, directoryId: match.id,
            type: row.type || match.roomType || 'Classroom',
            capacity: row.capacity ?? match.capacity ?? 40,
          } as any
        }
        return { ...row, name: v } as any
      },
    },
    { key: 'type',     label: 'Type',     type: 'select', options: ROOM_TYPES, width: 140 },
    { key: 'capacity', label: 'Capacity', type: 'number', width: 100, align: 'right', placeholder: '40' },
    { key: 'building', label: 'Building', type: 'text',   width: 140, placeholder: 'e.g. Main Block' },
    { key: 'floor',    label: 'Floor',    type: 'text',   width: 100, placeholder: 'e.g. Ground' },
  ]
  return (
    <div>
      {linked && (
        <DirectoryLinkedBanner name={linked.name} onUnlink={() => unlink(linked.rowId)} onDismiss={() => setLinked(null)} />
      )}
      <DataGrid<RoomRow>
        title="Venues"
        description="Any teaching place — classrooms, labs, halls, playgrounds, grounds. Scope a venue to time-window its availability."
        icon={<Building2 size={16} />}
        columns={columns}
        rows={rooms}
        rowKey={(r) => r.id}
        onChange={setRooms}
        onScope={onScope}
        onBulkScope={onBulkScope}
        newRow={() => ({
          id: makeId(), name: `Room ${100 + rooms.length + 1}`,
          type: 'Classroom', capacity: 40, building: 'Main Block', floor: 'Ground',
        })}
        toolbar={{ add: true, importCSV: true, exportCSV: true, paste: true, search: true, transpose: true, bulkActions: true }}
      />
    </div>
  )
}
