/**
 * Step — Resources
 *
 * Wizard step that wraps the shared EntityGrids (Classes / Subjects /
 * Teachers / Rooms). Identical to the Master Data page — same code path.
 */

import { useState, useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import {
  generateSections, generateStaff, generateSubjects, generateBreaks,
  GRADE_GROUP_GRADES,
} from '@/lib/orgData'
import type { Subject, Section, Staff } from '@/types'
import { ScopeMatrixModal } from '@/components/DataGrid/ScopeMatrixModal'
import {
  ClassesGrid, SubjectsGrid, TeachersGrid, RoomsGrid,
  type RoomRow, makeId,
} from '@/components/master/EntityGrids'
import {
  Users, BookOpen, Building2, GraduationCap, RefreshCw, ArrowRight,
} from 'lucide-react'

type Tab = 'classes' | 'subjects' | 'teachers' | 'rooms'

export function StepResources() {
  const store = useTimetableStore() as any
  const {
    config, sections, staff, subjects, rooms: storedRooms,
    setSections, setStaff, setBreaks, setRooms: setStoredRooms,
  } = store
  const setSubjects = store.setSubjects ?? store.setLegacySubjects

  const [tab, setTab] = useState<Tab>('classes')

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
    return (sections.length > 0 ? sections : []).map((s: any, i: number) => ({
      id: makeId(), name: s.room ?? `Room ${101 + i}`,
      type: 'Classroom', capacity: 40, building: 'Main Block', floor: 'Ground',
    }))
  })

  const [scopeTarget, setScopeTarget] = useState<{ kind: string; entity: any; rect?: DOMRect } | null>(null)
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const periods = store.periods ?? []

  // Read cycleWeeks from the bell step's localStorage key so the scope popover
  // knows whether to show day rows (1-week) or week rows (multi-week).
  const cycleWeeks = (() => {
    try {
      const raw = localStorage.getItem('schedu-bell-v2')
      if (!raw) return 1
      const parsed = JSON.parse(raw)
      return typeof parsed?.cycleWeeks === 'number' ? parsed.cycleWeeks : 1
    } catch { return 1 }
  })()

  const regenAll = () => {
    const o = config.orgType ?? 'school'
    const c = config.countryCode ?? 'IN'
    const gradeGroups = config.gradeGroups?.length ? config.gradeGroups : undefined
    const newSections = generateSections(o, c, config.numSections, gradeGroups)
    setSections(newSections)
    setStaff(generateStaff(o, c, config.numStaff))
    setSubjects(generateSubjects(o, c, config.numSubjects, gradeGroups) as Subject[])
    setBreaks(generateBreaks(o, config.numBreaks))
    setRooms(newSections.map((s: any, i: number) => ({
      id: makeId(), name: s.room ?? `Room ${101 + i}`,
      type: 'Classroom', capacity: 40, building: 'Main Block', floor: 'Ground',
    })))
  }

  useEffect(() => {
    const countsMismatch =
      sections.length !== config.numSections ||
      staff.length    !== config.numStaff    ||
      subjects.length !== config.numSubjects
    const gg = config.gradeGroups?.length ? config.gradeGroups : null
    const validGrades = gg ? new Set(gg.flatMap((g: any) => GRADE_GROUP_GRADES[g] ?? [])) : null
    const gradesMismatch = validGrades && sections.some((s: any) => s.grade && !validGrades.has(s.grade))
    const staffNamesStale = staff.length > 0 && staff.some((s: any) => !/^.+\s\d+$/.test(s.name))
    if (sections.length === 0 || countsMismatch || gradesMismatch || staffNamesStale) regenAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (setStoredRooms) {
      setStoredRooms(rooms.map(r => ({
        id: r.id, generatedName: r.name, actualName: r.name,
        roomType: (r.type.toLowerCase().replace(/ /g, '-') as any) || 'classroom',
        capacity: r.capacity, scope: r.scope,
      })))
    }
  }, [rooms])

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'classes',  label: 'Classes',  icon: <GraduationCap size={14} />, count: sections.length },
    { key: 'subjects', label: 'Subjects', icon: <BookOpen      size={14} />, count: subjects.length },
    { key: 'teachers', label: 'Teachers', icon: <Users         size={14} />, count: staff.length },
    { key: 'rooms',    label: 'Rooms',    icon: <Building2     size={14} />, count: rooms.length },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Resources
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Classes, Subjects, Teachers, Rooms — all editable like a spreadsheet.
          </div>
        </div>
        <button onClick={regenAll}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 8, border: '1px solid #ECEAFB', background: '#fff', color: '#7C6FE0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <RefreshCw size={13} /> Regenerate all
        </button>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14,
        background: '#F8F7FF', padding: 4, borderRadius: 10,
      }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: '0 1 auto', padding: '7px 14px', borderRadius: 7,
                border: 'none', background: active ? '#fff' : 'transparent',
                color: active ? '#13111E' : '#4B5275',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                boxShadow: active ? '0 1px 3px rgba(124,111,224,0.15)' : 'none',
              }}>
              <span style={{ color: active ? '#7C6FE0' : '#8B87AD' }}>{t.icon}</span>
              {t.label}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                background: active ? '#EDE9FF' : '#fff', color: '#7C6FE0',
              }}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {tab === 'classes'  && <ClassesGrid  sections={sections} setSections={setSections} staff={staff} onScope={(s, rect) => setScopeTarget({ kind: 'Section', entity: s, rect })} />}
      {tab === 'subjects' && <SubjectsGrid subjects={subjects} setSubjects={setSubjects} onScope={(s, rect) => setScopeTarget({ kind: 'Subject', entity: s, rect })} />}
      {tab === 'teachers' && <TeachersGrid staff={staff} setStaff={setStaff} sections={sections} onScope={(t, rect) => setScopeTarget({ kind: 'Teacher', entity: t, rect })} />}
      {tab === 'rooms'    && <RoomsGrid    rooms={rooms} setRooms={setRooms} onScope={(r, rect) => setScopeTarget({ kind: 'Room', entity: r, rect })} />}

      {scopeTarget && (
        <ScopeMatrixModal
          entityName={scopeTarget.entity.name ?? scopeTarget.entity.actualName ?? '—'}
          entityKind={scopeTarget.kind}
          scope={scopeTarget.entity.scope}
          workDays={workDays}
          periods={periods}
          cycleWeeks={cycleWeeks}
          anchorRect={scopeTarget.rect}
          onSave={(nextScope) => {
            const k = scopeTarget.kind
            if (k === 'Section') {
              setSections(sections.map((s: Section) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
            } else if (k === 'Subject') {
              setSubjects(subjects.map((s: Subject) => s.id === scopeTarget.entity.id ? { ...s, scope: nextScope } : s))
            } else if (k === 'Teacher') {
              setStaff(staff.map((t: Staff) => t.id === scopeTarget.entity.id ? { ...t, scope: nextScope } : t))
            } else if (k === 'Room') {
              setRooms(rooms.map(r => r.id === scopeTarget.entity.id ? { ...r, scope: nextScope } : r))
            }
          }}
          onClose={() => setScopeTarget(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button onClick={() => store.setStep((store.step ?? 3) + 1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7C6FE0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Continue to Strengths <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
