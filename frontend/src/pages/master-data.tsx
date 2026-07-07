/**
 * Master Data — consolidated CRUD for all reference entities.
 *
 * Post-setup landing page where users can live-edit:
 *   - Classes (Sections)
 *   - Subjects
 *   - Teachers
 *   - Rooms
 *   - Section Strengths (the matrix that drives AI inference)
 *
 * Same DataGrid pattern as the wizard. Same scope authoring. Autosave.
 * "If a user understands one table, they understand the whole platform."
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { loadActiveTimetableIntoStore, saveActiveTimetableSnapshot } from '@/lib/ttRegistry'
import type { Subject, Section, Staff, SectionStrength, ScopeMatrix } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { ExportControls } from '@/components/ExportControls'
import type { ExportSheet } from '@/lib/exportData'
import { DataGrid, DataGridColumn } from '@/components/DataGrid/DataGrid'
import { ScopeMatrixModal } from '@/components/DataGrid/ScopeMatrixModal'
import {
  ClassesGrid, SubjectsGrid, TeachersGrid, RoomsGrid,
  type RoomRow, makeId, STREAMS,
} from '@/components/master/EntityGrids'
import { DirectoryPanel } from '@/components/master/DirectoryPanel'
import { useDirectoryStore } from '@/store/directoryStore'
import {
  GraduationCap, BookOpen, Users, Building2, Grid3x3, Sparkles, BookMarked,
} from 'lucide-react'
import { StepGuide } from '@/components/StepGuide'

type Tab = 'classes' | 'subjects' | 'teachers' | 'rooms' | 'strengths' | 'directory'

function guessStream(secName: string): string {
  const u = secName.toUpperCase()
  if (u.includes('SCIENCE') || u.includes('SCI') || u.includes('PCM') || u.includes('PCB')) return 'Science'
  if (u.includes('COMMERCE') || u.includes('COM')) return 'Commerce'
  if (u.includes('HUM') || u.includes('ARTS')) return 'Humanities'
  return 'General'
}

export function MasterDataPage() {
  const { user } = useAuthStore()
  const store = useTimetableStore() as any
  const {
    config, sections, staff, subjects, rooms: storedRooms,
    sectionStrengths, setSectionStrengths,
    setSections, setStaff, setRooms: setStoredRooms,
  } = store
  const setSubjects = store.setSubjects ?? store.setLegacySubjects
  const periods = store.periods ?? []
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  const [tab, setTab] = useState<Tab>('classes')
  const [scopeTarget, setScopeTarget] = useState<{ kind: string; entity: any } | null>(null)

  // Local rooms state mirrored to store (matches wizard behavior)
  const [rooms, setRooms] = useState<RoomRow[]>(() => {
    if (Array.isArray(storedRooms) && storedRooms.length > 0) {
      return storedRooms.map((r: any) => ({
        id: r.id ?? makeId(),
        name: r.actualName ?? r.name ?? r.generatedName ?? 'Room',
        type: r.roomType ?? r.type ?? 'Classroom',
        capacity: r.capacity ?? 40,
        building: r.building ?? 'Main Block',
        floor: r.floor ?? 'Ground',
        scope: r.scope,
      }))
    }
    return (sections ?? []).map((s: any, i: number) => ({
      id: makeId(), name: s.room ?? `Room ${101 + i}`,
      type: 'Classroom', capacity: 40, building: 'Main Block', floor: 'Ground',
    }))
  })

  useEffect(() => {
    if (setStoredRooms) {
      setStoredRooms(rooms.map(r => ({
        id: r.id, generatedName: r.name, actualName: r.name,
        roomType: (r.type.toLowerCase().replace(/ /g, '-') as any) || 'classroom',
        capacity: r.capacity, scope: r.scope,
      })))
    }
  }, [rooms])

  // ── Per-timetable resources ────────────────────────────────────
  // Resources (classes, subjects, teachers, rooms, strengths) are scoped to the
  // ACTIVE timetable, not shared globally. On mount we hydrate this timetable's
  // saved resources; on every edit we autosave them back to that timetable's
  // snapshot so switching timetables never mixes one school's data with another.
  useEffect(() => { loadActiveTimetableIntoStore() }, [])

  const skipFirstSave = useRef(false)
  useEffect(() => {
    // Skip the initial render (post-hydration) — only persist real edits.
    if (!skipFirstSave.current) { skipFirstSave.current = true; return }
    const t = setTimeout(() => saveActiveTimetableSnapshot(), 600)
    return () => clearTimeout(t)
  }, [sections, staff, subjects, storedRooms, sectionStrengths])

  // Auth gate
  if (!user) { window.location.href = '/login'; return null }

  const directoryStaff = useDirectoryStore(s => s.staff)
  const directoryVenues = useDirectoryStore(s => s.venues)

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'classes',   label: 'Classes',   icon: <GraduationCap size={14} />, count: sections.length },
    { key: 'subjects',  label: 'Subjects',  icon: <BookOpen      size={14} />, count: subjects.length },
    { key: 'teachers',  label: 'Teachers',  icon: <Users         size={14} />, count: staff.length },
    { key: 'rooms',     label: 'Venues',    icon: <Building2     size={14} />, count: rooms.length },
    { key: 'strengths', label: 'Strengths', icon: <Grid3x3       size={14} />, count: sectionStrengths?.length ?? 0 },
    { key: 'directory', label: 'Directory', icon: <BookMarked    size={14} />, count: directoryStaff.length + directoryVenues.length },
  ]

  // One Excel sheet per reference entity (built lazily on export).
  const buildExportSheets = (): ExportSheet[] => [
    { name: 'Classes',  rows: [['Class', 'Grade', 'Strength', 'Room', 'Class Teacher'],
      ...sections.map((s: any) => [s.name ?? '', s.grade ?? '', s.strength ?? '', s.room ?? '', s.classTeacher ?? ''])] },
    { name: 'Subjects', rows: [['Subject', 'Category', 'Periods/Week'],
      ...subjects.map((s: any) => [s.name ?? '', s.category ?? '', s.periodsPerWeek ?? ''])] },
    { name: 'Teachers', rows: [['Teacher', 'Subjects'],
      ...staff.map((t: any) => [t.name ?? '', (t.subjects ?? []).join(', ')])] },
    { name: 'Rooms',    rows: [['Room', 'Type', 'Capacity', 'Building', 'Floor'],
      ...rooms.map((r: any) => [r.name ?? '', r.type ?? '', r.capacity ?? '', r.building ?? '', r.floor ?? ''])] },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>

      <PageHeader
        icon="🗄️"
        title="Master Data"
        description="Live-edit every reference entity. Autosaves on each change."
        status="saved"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: '#EDE9FF', color: '#7C6FE0', border: '1px solid #D8D2FF',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={11} /> Spreadsheet mode
            </div>
            <ExportControls filename="schedu-master-data.xlsx" sheets={buildExportSheets} title="Master Data" />
          </div>
        }
      />

      <div style={{ padding: '20px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Tabs */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16,
          background: '#fff', padding: 5, borderRadius: 12,
          border: '1px solid #ECEAFB',
          boxShadow: '0 1px 2px rgba(124,111,224,0.04)',
        }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flex: '0 1 auto', padding: '8px 16px', borderRadius: 8,
                  border: 'none', background: active ? '#7C6FE0' : 'transparent',
                  color: active ? '#fff' : '#4B5275',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.12s',
                }}>
                <span style={{ color: active ? '#fff' : '#8B87AD' }}>{t.icon}</span>
                {t.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: active ? 'rgba(255,255,255,0.22)' : '#F5F2FF',
                  color: active ? '#fff' : '#7C6FE0',
                  fontFamily: "'DM Mono', monospace",
                }}>{t.count}</span>
              </button>
            )
          })}
        </div>

        {/* Inline guide — content varies per tab */}
        {tab === 'classes' && (
          <StepGuide title="Classes & Sections" tips={[
            'Each row is one section (e.g., Class I-A). Add as many sections as your school has.',
            'The Grade column helps the AI assign age-appropriate subjects automatically.',
            'Use the Scope button (⊞) to restrict a class to certain days or periods.',
            'Paste directly from a spreadsheet using the Paste button in the toolbar.',
          ]} />
        )}
        {tab === 'subjects' && (
          <StepGuide title="Subjects" tips={[
            'Periods/Week sets how many times per week this subject runs for each assigned section.',
            'Short Name is displayed in the timetable grid — keep it 2–4 characters (e.g., MATH, ENG).',
            'Category groups subjects for reporting and AI balancing (Core, Activity, Language…).',
            'Use the Scope button to restrict a subject to specific days or time slots.',
          ]} />
        )}
        {tab === 'teachers' && (
          <StepGuide title="Teachers" tips={[
            'The Subjects column lists which subjects this teacher can teach — comma-separated.',
            'Max Periods/Week is the safe workload cap. The AI will never assign more than this.',
            'Use the Scope button to mark a teacher\'s unavailable slots (e.g., part-time schedules).',
            'If a subject has no available teacher within the cap, you\'ll see a staffing alert in the wizard.',
          ]} />
        )}
        {tab === 'rooms' && (
          <StepGuide title="Venues" tips={[
            'Any teaching place — classroom, lab, hall, playground or sports ground. Lab-type venues are auto-matched to lab subjects by the AI.',
            'Capacity helps the AI avoid over-assigning a venue beyond what it can hold.',
            'Use the Scope button to restrict a venue to certain days or periods (e.g., a shared hall or ground).',
            'You don\'t need a venue per section — one venue can be shared across multiple classes.',
          ]} />
        )}
        {tab === 'strengths' && (
          <StepGuide title="Section Strengths" tips={[
            'Enter student counts per subject per section — only needed when subjects are optional or streamed.',
            'Leave at 0 for subjects that are mandatory for all students in that section.',
            'Non-zero values let the AI detect elective groups and size teacher pools accurately.',
            'The Total column is auto-summed but can be overridden if your section size differs.',
          ]} />
        )}
        {tab === 'directory' && (
          <StepGuide title="Directory" tips={[
            'This is the shared roster every schedule checks when you add a teacher or venue by name.',
            'Renaming an entry here renames it in every active schedule that uses it.',
            '"Merge into…" is for two entries that turn out to be the same real person or room.',
            'Removing an entry only removes it from this shared list — it does not delete rows already in a schedule.',
          ]} />
        )}

        {/* Tab content */}
        {tab === 'classes'   && <ClassesGrid  sections={sections}  setSections={setSections}  staff={staff} onScope={(s) => setScopeTarget({ kind: 'Section', entity: s })} onBulkScope={() => setScopeTarget({ kind: 'BulkSection', entity: { id: '__bulk__', name: 'All Classes' } })} />}
        {tab === 'subjects'  && <SubjectsGrid subjects={subjects}  setSubjects={setSubjects}                onScope={(s) => setScopeTarget({ kind: 'Subject', entity: s })} onBulkScope={() => setScopeTarget({ kind: 'BulkSubject', entity: { id: '__bulk__', name: 'All Subjects' } })} />}
        {tab === 'teachers'  && <TeachersGrid staff={staff}        setStaff={setStaff}        sections={sections} onScope={(t) => setScopeTarget({ kind: 'Teacher', entity: t })} onBulkScope={() => setScopeTarget({ kind: 'BulkTeacher', entity: { id: '__bulk__', name: 'All Teachers' } })} />}
        {tab === 'rooms'     && <RoomsGrid    rooms={rooms}        setRooms={setRooms}                       onScope={(r) => setScopeTarget({ kind: 'Room', entity: r })} onBulkScope={() => setScopeTarget({ kind: 'BulkRoom', entity: { id: '__bulk__', name: 'All Rooms' } })} />}
        {tab === 'strengths' && <StrengthsGrid sections={sections} subjects={subjects} sectionStrengths={sectionStrengths ?? []} setSectionStrengths={setSectionStrengths} />}
        {tab === 'directory' && <DirectoryPanel />}

      </div>

      {/* Scope modal */}
      {scopeTarget && (
        <ScopeMatrixModal
          entityName={scopeTarget.entity.name ?? scopeTarget.entity.actualName ?? '—'}
          entityKind={scopeTarget.kind.replace('Bulk', '')}
          scope={scopeTarget.entity.scope}
          workDays={workDays}
          periods={periods}
          entities={
            scopeTarget.kind === 'BulkSection' ? sections.map((s: Section) => ({ id: s.id, name: s.name }))
            : scopeTarget.kind === 'BulkSubject' ? subjects.map((s: Subject) => ({ id: s.id, name: s.name }))
            : scopeTarget.kind === 'BulkTeacher' ? staff.map((t: Staff) => ({ id: t.id, name: t.name }))
            : scopeTarget.kind === 'BulkRoom'    ? rooms.map(r => ({ id: r.id, name: r.name }))
            : undefined
          }
          onSave={(nextScope: ScopeMatrix | undefined, selectedIds?: string[]) => {
            const k = scopeTarget.kind
            if (k === 'Section')
              setSections(sections.map((s: Section) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
            else if (k === 'Subject')
              setSubjects(subjects.map((s: Subject) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
            else if (k === 'Teacher')
              setStaff(staff.map((t: Staff) => t.id === scopeTarget.entity.id ? { ...t, scope: nextScope } : t))
            else if (k === 'Room')
              setRooms(rooms.map(r => r.id === scopeTarget.entity.id ? { ...r, scope: nextScope } : r))
            else if (k === 'BulkSection')
              setSections(sections.map((s: Section) =>
                (!selectedIds || selectedIds.includes(s.id)) ? { ...s, scope: nextScope } : s))
            else if (k === 'BulkSubject')
              setSubjects(subjects.map((s: Subject) =>
                (!selectedIds || selectedIds.includes(s.id)) ? { ...s, scope: nextScope } : s))
            else if (k === 'BulkTeacher')
              setStaff(staff.map((t: Staff) =>
                (!selectedIds || selectedIds.includes(t.id)) ? { ...t, scope: nextScope } : t))
            else if (k === 'BulkRoom')
              setRooms(rooms.map(r =>
                (!selectedIds || selectedIds.includes(r.id)) ? { ...r, scope: nextScope } : r))
          }}
          onClose={() => setScopeTarget(null)}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// STRENGTHS GRID (Master Data variant)
// ═════════════════════════════════════════════════════════════
function StrengthsGrid({
  sections, subjects, sectionStrengths, setSectionStrengths,
}: {
  sections: Section[]
  subjects: Subject[]
  sectionStrengths: SectionStrength[]
  setSectionStrengths: (s: SectionStrength[]) => void
}) {
  const subjectCols: string[] = useMemo(() => subjects.map((s: any) => s.name), [subjects])

  const rows: SectionStrength[] = useMemo(() => {
    return sections.map((sec: any) => {
      const existing = sectionStrengths.find(r => r.sectionName === sec.name)
      return existing ?? {
        sectionName: sec.name,
        stream: guessStream(sec.name),
        subjectStrengths: Object.fromEntries(subjectCols.map(s => [s, 0])),
      }
    })
  }, [sections, sectionStrengths, subjectCols])

  const columns: DataGridColumn<SectionStrength>[] = useMemo(() => {
    const cols: DataGridColumn<SectionStrength>[] = [
      { key: 'sectionName', label: 'Section', type: 'text', sticky: true, width: 110, readonly: true },
      { key: 'stream',      label: 'Stream',  type: 'select', options: STREAMS, width: 130 },
      {
        key: 'totalStudents', label: 'Total', type: 'number', width: 80, placeholder: 'auto',
        getValue: (r) => r.totalStudents ?? '',
        setValue: (r, v) => ({ ...r, totalStudents: v === '' || v == null ? undefined : Math.max(0, Number(v) || 0) }),
      },
    ]
    subjectCols.forEach(name => {
      cols.push({
        key: `subj:${name}`,
        label: name,
        type: 'number',
        minWidth: 88,
        align: 'right',
        getValue: (r) => r.subjectStrengths?.[name] ?? 0,
        setValue: (r, v) => ({
          ...r,
          subjectStrengths: { ...r.subjectStrengths, [name]: Math.max(0, Number(v) || 0) },
        }),
        cellStyle: (value, row) => {
          if (value === 0 || value === '' || value == null) return undefined
          const vals = Object.values(row.subjectStrengths ?? {}).filter(v => typeof v === 'number' && v > 0) as number[]
          if (!vals.length) return undefined
          const max = Math.max(...vals)
          const isCore = value === max
          return { background: isCore ? '#F0FDF4' : '#FEF3C7' }
        },
      })
    })
    return cols
  }, [subjectCols])

  return (
    <DataGrid<SectionStrength>
      title="Section Strengths"
      description="Per-section student counts per subject. AI derives optional blocks and pooling automatically."
      icon={<Grid3x3 size={16} />}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.sectionName}
      onChange={setSectionStrengths}
      toolbar={{ add: false, importCSV: true, exportCSV: true, paste: true, search: true, transpose: true, bulkActions: true }}
    />
  )
}
