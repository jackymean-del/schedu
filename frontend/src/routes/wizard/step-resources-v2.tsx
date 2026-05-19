/**
 * Step 1 — Resources (corrected spec flow)
 *
 * Single AI-driven entry screen. User enters per-band student strength,
 * teacher count, scholastic/co-scholastic subject counts, and rooms count.
 * AI auto-generates the underlying entities (classes, teachers, subjects,
 * rooms). User can refine later in Master Data / subsequent wizard steps.
 *
 * Layout:
 *   ┌─ Add Student Courses (AI) ─────────────────┐
 *   │  PrePrimary [30]  Primary [40]  ...         │
 *   ├─ Teachers ──────┬─ Subjects ────────────────┤
 *   │  Count [45]     │  Scholastic [6] / CoSch [4] │
 *   ├─────────────────┴─────────────────────────────┤
 *   │  Rooms / Places of Learning [100]            │
 *   ├──────────────────────────────────────────────┤
 *   │  Progress: classes / teachers / subjects ... │
 *   └──────────────────────────────────────────────┘
 */

import { useState, useMemo, useEffect } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import {
  generateStaff, generateSubjects, GRADE_GROUP_GRADES, generateBreaks,
} from '@/lib/orgData'
import type { Section, Subject, Staff } from '@/types'
import {
  Sparkles, Users, BookOpen, Building2, GraduationCap, CheckCircle2,
  RefreshCw, AlertCircle, Layers, ChevronLeft, ChevronRight, Pencil, Trash2, Plus,
} from 'lucide-react'

const BANDS: { key: string; label: string; sub: string; defaultStrength: number; sectionSize: number }[] = [
  { key: 'pre',       label: 'Pre-Primary',     sub: 'Nursery · LKG · UKG',           defaultStrength:  30, sectionSize: 25 },
  { key: 'primary',   label: 'Primary',         sub: 'I · II · III · IV · V',         defaultStrength:  40, sectionSize: 35 },
  { key: 'middle',    label: 'Upper Primary',   sub: 'VI · VII · VIII',                defaultStrength: 100, sectionSize: 35 },
  { key: 'secondary', label: 'Secondary',       sub: 'IX · X',                          defaultStrength: 200, sectionSize: 40 },
  { key: 'senior',    label: 'Sr. Secondary',   sub: 'XI · XII',                        defaultStrength: 400, sectionSize: 40 },
]

function makeId() { return Math.random().toString(36).slice(2, 8) }

export function StepResourcesV2() {
  const store = useTimetableStore() as any
  const {
    config, sections, staff, subjects, setSections, setStaff, setBreaks, setStep,
  } = store
  const setSubjects = store.setSubjects ?? store.setLegacySubjects
  const [previewTab, setPreviewTab] = useState<'classes'|'teachers'|'subjects'|'rooms'>('classes')

  // Local input state — student strengths per band
  const [strengths, setStrengths] = useState<Record<string, number>>(() => {
    const obj: Record<string, number> = {}
    BANDS.forEach(b => { obj[b.key] = (config as any).bandStrengths?.[b.key] ?? 0 })
    return obj
  })

  // Other counts
  const [teacherCount, setTeacherCount]    = useState<number>(config.numStaff ?? 0)
  const [scholasticCount, setScholastic]   = useState<number>((config as any).numScholastic ?? 0)
  const [coScholasticCount, setCoScholastic] = useState<number>((config as any).numCoScholastic ?? 0)
  const [roomsCount, setRoomsCount]        = useState<number>((config as any).numRooms ?? 0)

  // Helper: count current entities per band
  const activeBands = useMemo(() => BANDS.filter(b => strengths[b.key] > 0), [strengths])
  const totalStudents = useMemo(() => Object.values(strengths).reduce((a, b) => a + b, 0), [strengths])

  // Derived: how many sections each band needs based on sectionSize heuristic
  const inferredSections = useMemo(() => {
    const map: Record<string, number> = {}
    BANDS.forEach(b => {
      const s = strengths[b.key] ?? 0
      map[b.key] = s > 0 ? Math.max(1, Math.ceil(s / b.sectionSize)) : 0
    })
    return map
  }, [strengths])

  const totalSections = useMemo(() =>
    Object.values(inferredSections).reduce((a, b) => a + b, 0), [inferredSections])

  // ── Generators ─────────────────────────────────────────
  const c    = config.countryCode ?? 'IN'
  const orgT = config.orgType ?? 'school'

  const handleGenerateClasses = () => {
    const gradeGroups = activeBands.map(b => b.key)
    // Build sections from the band-level inferred section counts
    const out: Section[] = []
    activeBands.forEach(band => {
      const grades = GRADE_GROUP_GRADES[band.key] ?? []
      const sectionsForBand = inferredSections[band.key] ?? 0
      if (grades.length === 0 || sectionsForBand === 0) return
      // Distribute sections across grades roughly evenly; min 1 per grade
      const perGrade = Math.max(1, Math.round(sectionsForBand / grades.length))
      grades.forEach((grade, gi) => {
        const sectionsHere = gi === grades.length - 1
          ? Math.max(1, sectionsForBand - perGrade * (grades.length - 1))
          : perGrade
        for (let s = 0; s < sectionsHere; s++) {
          const letter = String.fromCharCode(65 + s) // A, B, C…
          out.push({
            id: makeId(),
            name: `${grade}-${letter}`,
            room: `Room ${101 + out.length}`,
            grade,
            classTeacher: '',
          } as Section)
        }
      })
    })
    setSections(out)

    // Persist band strengths into config
    store.setConfig?.({ ...config, bandStrengths: strengths, gradeGroups })
  }

  const handleGenerateTeachers = () => {
    if (teacherCount <= 0) return
    setStaff(generateStaff(orgT, c, teacherCount))
    store.setConfig?.({ ...config, numStaff: teacherCount })
  }

  const handleGenerateSubjects = () => {
    const total = (scholasticCount ?? 0) + (coScholasticCount ?? 0)
    if (total <= 0) return
    const gradeGroups = activeBands.length > 0 ? activeBands.map(b => b.key) : undefined
    const generated = generateSubjects(orgT, c, total, gradeGroups) as Subject[]
    // Mark first `scholasticCount` as scholastic, rest as co-scholastic
    const tagged = generated.map((s, i) => ({
      ...s,
      category: (i < scholasticCount ? 'Core' : 'CCA') as any,
      isOptional: i >= scholasticCount,
    }))
    setSubjects(tagged)
    store.setConfig?.({ ...config, numSubjects: total, numScholastic: scholasticCount, numCoScholastic: coScholasticCount })
  }

  const handleGenerateRooms = () => {
    if (roomsCount <= 0) return
    const list = Array.from({ length: roomsCount }).map((_, i) => ({
      id: makeId(),
      generatedName: `Room ${101 + i}`,
      actualName: `Room ${101 + i}`,
      roomType: 'classroom' as any,
      capacity: 40,
    }))
    store.setRooms?.(list)
    store.setConfig?.({ ...config, numRooms: roomsCount })
  }

  // Auto-generate breaks if empty
  useEffect(() => {
    if ((store.breaks ?? []).length === 0) {
      setBreaks(generateBreaks(orgT, config.numBreaks ?? 3))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      padding: 24, maxWidth: 1100, margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Resources
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Tell us your school's size. Our <em style={{ color: '#7C6FE0' }}>AI</em> auto-generates the rest — you can refine in the next steps.
          </div>
        </div>
      </div>

      {/* ── Add Student Courses ───────────────────────── */}
      <Card title="Add Student Courses" badge="AI" badgeColor="#7C6FE0" icon={<GraduationCap size={15} />}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {BANDS.map(band => {
            const v = strengths[band.key] ?? 0
            const sec = inferredSections[band.key] ?? 0
            return (
              <div key={band.key} style={{
                background: v > 0 ? '#F5F2FF' : '#FAFAFE',
                border: `1px solid ${v > 0 ? '#D8D2FF' : '#ECEAFB'}`,
                borderRadius: 10, padding: '12px 14px',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 3 }}>
                  {band.label}
                </div>
                <div style={{ fontSize: 9.5, color: '#B8B4D4', marginBottom: 8 }}>
                  {band.sub}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <input
                    type="number" min={0} value={v || ''}
                    placeholder="0"
                    onChange={e => setStrengths(prev => ({ ...prev, [band.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    onFocus={e => e.target.select()}
                    style={inputStyle(v > 0)}
                  />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#4B5275' }}>students</span>
                </div>
                {sec > 0 && (
                  <div style={{
                    marginTop: 7, fontSize: 9.5, color: '#7C6FE0',
                    fontWeight: 700, letterSpacing: '0.02em',
                    fontFamily: "'DM Mono', monospace",
                  }}>
                    → {sec} section{sec !== 1 ? 's' : ''} @ ~{band.sectionSize}/class
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button onClick={handleGenerateClasses} disabled={totalStudents === 0} style={btnPri(totalStudents === 0)}>
            <Sparkles size={13} /> Auto-generate {totalSections > 0 ? `${totalSections} sections` : 'classes'}
          </button>
          <div style={{ fontSize: 11, color: '#8B87AD' }}>
            Total: <strong style={{ color: '#13111E', fontFamily: "'DM Mono', monospace" }}>{totalStudents}</strong> students
          </div>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* ── Teachers + Subjects row ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12 }}>

        <Card title="Teachers" badge="AI" badgeColor="#9B8EF5" icon={<Users size={15} />}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <input
              type="number" min={0} value={teacherCount || ''}
              placeholder="0"
              onChange={e => setTeacherCount(Math.max(0, parseInt(e.target.value) || 0))}
              onFocus={e => e.target.select()}
              style={inputStyleLg(teacherCount > 0)}
            />
            <span style={{ fontSize: 12, color: '#4B5275', fontWeight: 600 }}>teachers</span>
          </div>
          <button onClick={handleGenerateTeachers} disabled={teacherCount === 0} style={{ ...btnPri(teacherCount === 0), marginTop: 12 }}>
            <Sparkles size={12} /> Auto-generate roster
          </button>
        </Card>

        <Card title="Subjects" badge="AI" badgeColor="#7C6FE0" icon={<BookOpen size={15} />}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 6 }}>
                Scholastic
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <input
                  type="number" min={0} value={scholasticCount || ''}
                  placeholder="0"
                  onChange={e => setScholastic(Math.max(0, parseInt(e.target.value) || 0))}
                  onFocus={e => e.target.select()}
                  style={inputStyleMd(scholasticCount > 0)}
                />
                <span style={{ fontSize: 10.5, color: '#4B5275', fontWeight: 600 }}>core</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B87AD', marginBottom: 6 }}>
                Co-Scholastic
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <input
                  type="number" min={0} value={coScholasticCount || ''}
                  placeholder="0"
                  onChange={e => setCoScholastic(Math.max(0, parseInt(e.target.value) || 0))}
                  onFocus={e => e.target.select()}
                  style={inputStyleMd(coScholasticCount > 0)}
                />
                <span style={{ fontSize: 10.5, color: '#4B5275', fontWeight: 600 }}>CCA / PE / Art</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleGenerateSubjects}
            disabled={scholasticCount + coScholasticCount === 0}
            style={{ ...btnPri(scholasticCount + coScholasticCount === 0), marginTop: 12 }}>
            <Sparkles size={12} /> Auto-generate {scholasticCount + coScholasticCount > 0 ? `${scholasticCount + coScholasticCount} subjects` : 'list'}
          </button>
        </Card>
      </div>

      <div style={{ height: 12 }} />

      {/* ── Rooms ─────────────────────────────────────── */}
      <Card title="Rooms / Places of Learning" badge="AI" badgeColor="#D4920E" icon={<Building2 size={15} />}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <input
            type="number" min={0} value={roomsCount || ''}
            placeholder="0"
            onChange={e => setRoomsCount(Math.max(0, parseInt(e.target.value) || 0))}
            onFocus={e => e.target.select()}
            style={inputStyleLg(roomsCount > 0)}
          />
          <span style={{ fontSize: 12, color: '#4B5275', fontWeight: 600 }}>rooms</span>
          <div style={{ flex: 1 }} />
          <button onClick={handleGenerateRooms} disabled={roomsCount === 0} style={btnPri(roomsCount === 0)}>
            <Sparkles size={12} /> Auto-generate rooms
          </button>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      {/* ── Progress section ──────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #ECEAFB', borderRadius: 14,
        padding: '14px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <RefreshCw size={13} color="#7C6FE0" />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4B5275' }}>
            Progress
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <ProgressRow label="Classes / sections" have={sections.length} need={totalSections} />
          <ProgressRow label="Teachers"           have={staff.length}    need={teacherCount} />
          <ProgressRow label="Subjects"           have={subjects.length} need={scholasticCount + coScholasticCount} />
          <ProgressRow label="Rooms"              have={(store.rooms ?? []).length} need={roomsCount} />
        </div>
      </div>

      {/* ── Generated entity preview ──────────────────── */}
      {(sections.length > 0 || staff.length > 0 || subjects.length > 0 || (store.rooms ?? []).length > 0) && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            background: '#fff', border: '1px solid #ECEAFB', borderRadius: 14, overflow: 'hidden',
          }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 4, padding: '8px 12px',
              background: '#F8F7FF', borderBottom: '1px solid #E8E4FF',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#8B87AD', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4 }}>
                Generated
              </span>
              {([
                { key: 'classes', label: `Classes (${sections.length})`, show: sections.length > 0 },
                { key: 'teachers', label: `Teachers (${staff.length})`, show: staff.length > 0 },
                { key: 'subjects', label: `Subjects (${subjects.length})`, show: subjects.length > 0 },
                { key: 'rooms', label: `Rooms (${(store.rooms ?? []).length})`, show: (store.rooms ?? []).length > 0 },
              ] as const).filter(t => t.show).map(t => (
                <button key={t.key} onClick={() => setPreviewTab(t.key)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: previewTab === t.key ? '#7C6FE0' : 'transparent',
                    color: previewTab === t.key ? '#fff' : '#4B5275',
                    fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Table content */}
            <div style={{ padding: '12px 14px', maxHeight: 260, overflowY: 'auto' as const }}>

              {/* Classes table */}
              {previewTab === 'classes' && sections.length > 0 && (
                <EntityTable
                  headers={['Section', 'Grade', 'Room', '']}
                  widths={['140px', '80px', '1fr', '60px']}
                  rows={sections.slice(0, 30).map((sec: Section) => [
                    sec.name,
                    (sec as any).grade ?? '—',
                    (sec as any).room ?? '—',
                  ])}
                  onDelete={(i) => setSections(sections.filter((_: any, j: number) => j !== i))}
                />
              )}

              {/* Teachers table */}
              {previewTab === 'teachers' && staff.length > 0 && (
                <EntityTable
                  headers={['Teacher', 'Subjects', 'Max Periods/Wk', '']}
                  widths={['160px', '1fr', '120px', '60px']}
                  rows={staff.slice(0, 30).map((t: Staff) => [
                    t.name,
                    ((t.subjects ?? []) as string[]).slice(0, 3).join(', ') || '—',
                    String((t as any).maxPeriodsPerWeek ?? 40),
                  ])}
                  onDelete={(i) => setStaff(staff.filter((_: any, j: number) => j !== i))}
                />
              )}

              {/* Subjects table */}
              {previewTab === 'subjects' && subjects.length > 0 && (
                <EntityTable
                  headers={['Subject', 'Category', 'Periods/wk', '']}
                  widths={['160px', '100px', '100px', '60px']}
                  rows={subjects.slice(0, 30).map((s: Subject) => [
                    s.name,
                    (s as any).category ?? 'Core',
                    String(s.periodsPerWeek ?? '—'),
                  ])}
                  onDelete={(i) => {
                    const next = subjects.filter((_: any, j: number) => j !== i)
                    setSubjects(next)
                  }}
                />
              )}

              {/* Rooms table */}
              {previewTab === 'rooms' && (store.rooms ?? []).length > 0 && (
                <EntityTable
                  headers={['Room', 'Type', 'Capacity', '']}
                  widths={['140px', '100px', '100px', '60px']}
                  rows={(store.rooms ?? []).slice(0, 30).map((r: any) => [
                    r.actualName ?? r.generatedName,
                    r.roomType ?? 'classroom',
                    String(r.capacity ?? 40),
                  ])}
                  onDelete={(i) => {
                    const next = (store.rooms ?? []).filter((_: any, j: number) => j !== i)
                    store.setRooms?.(next)
                  }}
                />
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Navigation footer ─────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0EDFF',
      }}>
        {/* Back → Shift & timing (step 1) */}
        <button
          onClick={() => setStep(1)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 8,
            border: '1px solid #E8E4FF', background: '#fff',
            color: '#4B5275', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <ChevronLeft size={14} /> Back
        </button>

        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Step 2 of 5</span>

        {/* Next → Allocation (step 3) */}
        <button
          onClick={() => setStep(3)}
          disabled={sections.length === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: sections.length > 0
              ? 'linear-gradient(135deg, #7C6FE0, #9B8EF5)'
              : '#E8E4FF',
            color: sections.length > 0 ? '#fff' : '#B8B4D4',
            fontSize: 12, fontWeight: 700, cursor: sections.length > 0 ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: sections.length > 0 ? '0 2px 8px rgba(124,111,224,0.35)' : 'none',
          }}>
          Next: Allocation <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ───
function Card({ title, badge, badgeColor, icon, children }: {
  title: string; badge?: string; badgeColor?: string; icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #ECEAFB', borderRadius: 14,
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ color: badgeColor ?? '#7C6FE0', display: 'flex' }}>{icon}</div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E', letterSpacing: '-0.2px' }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            padding: '2px 7px', borderRadius: 10,
            background: `${badgeColor}1A`, color: badgeColor,
            border: `1px solid ${badgeColor}33`,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function ProgressRow({ label, have, need }: { label: string; have: number; need: number }) {
  const done = need > 0 && have >= need
  const partial = have > 0 && have < need
  const empty = have === 0
  const color = done ? '#16A34A' : partial ? '#D4920E' : empty && need === 0 ? '#B8B4D4' : '#DC2626'
  const bg    = done ? '#DCFCE7' : partial ? '#FEF3C7' : empty && need === 0 ? '#F8F7FF' : '#FEE2E2'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 8,
      background: bg, border: `1px solid ${color}22`,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {done ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: '#4B5275', fontFamily: "'DM Mono', monospace", marginTop: 1 }}>
          {have} / {need || '—'}
        </div>
      </div>
    </div>
  )
}

const inputStyle = (active: boolean): React.CSSProperties => ({
  width: 64, padding: '6px 9px', fontSize: 14, fontWeight: 700,
  fontFamily: "'DM Mono', monospace", color: '#13111E',
  background: '#fff',
  border: `1px solid ${active ? '#7C6FE0' : '#ECEAFB'}`,
  borderRadius: 6, outline: 'none', textAlign: 'right' as const,
})
const inputStyleMd = (active: boolean): React.CSSProperties => ({
  ...inputStyle(active), width: 72, fontSize: 15,
})
const inputStyleLg = (active: boolean): React.CSSProperties => ({
  ...inputStyle(active), width: 90, fontSize: 18, padding: '7px 12px',
})
const btnPri = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: disabled ? '#D8D2FF' : '#7C6FE0',
  color: '#fff', fontSize: 12, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
  fontFamily: 'inherit',
})

// ── EntityTable ───────────────────────────────────────────────
function EntityTable({ headers, widths, rows, onDelete }: {
  headers: string[]
  widths: string[]
  rows: string[][]
  onDelete: (i: number) => void
}) {
  const gridCols = widths.join(' ')
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, gap: 8,
        paddingBottom: 6, borderBottom: '1px solid #F0EDFF',
        fontSize: 9, fontWeight: 800, color: '#B8B4D4',
        textTransform: 'uppercase' as const, letterSpacing: '0.08em',
      }}>
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: gridCols, gap: 8,
          alignItems: 'center', padding: '5px 0',
          borderBottom: '1px solid #FAFAFE',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#FAFAFE'}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
        >
          {row.map((cell, ci) => (
            <div key={ci} style={{
              fontSize: 11, color: ci === 0 ? '#13111E' : '#4B5275',
              fontWeight: ci === 0 ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
            }}>
              {cell}
            </div>
          ))}
          <button onClick={() => onDelete(i)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#FCA5A5', padding: 2, display: 'flex', alignItems: 'center',
          }}>
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
