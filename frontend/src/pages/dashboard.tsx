/**
 * Dashboard — Page 4
 *
 * Sidebar sections:
 *   WORKSPACE      — Dashboard · Schedules · Calendar · Insights
 *   ADMINISTRATION — Users · Resources · Settings
 *   HELP & SUPPORT — Support Center · Documentation · Book a Demo
 *
 * "New timetable" → opens CreateTimetableModal (Page 5 — Wizard Step 0)
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useTimetableStore } from '@/store/timetableStore'
import { AppFooter } from '@/components/AppFooter'
import {
  Home, CalendarDays, Calendar, BarChart2,
  Users, Database, Settings,
  LifeBuoy, BookOpen, Video,
  Bell, Plus, Sparkles, MoreHorizontal,
  ChevronRight, ArrowRight, ChevronLeft,
  Zap, X, Trash2, Pencil,
} from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── types ──────────────────────────────────────────────────────
type NavTab     = 'dashboard' | 'timetables' | 'resources' | 'reports'
type SideNavKey =
  | 'dashboard' | 'schedules' | 'calendar' | 'insights'
  | 'users' | 'resources' | 'settings'
  | 'support' | 'docs' | 'demo'

type BoardKey = 'CBSE' | 'ICSE' | 'IB' | 'State' | 'Custom'

// ── Grade list ─────────────────────────────────────────────────
const GRADES = [
  'Nursery', 'LKG', 'UKG',
  'Class I', 'Class II', 'Class III', 'Class IV', 'Class V',
  'Class VI', 'Class VII', 'Class VIII', 'Class IX', 'Class X',
  'Class XI', 'Class XII',
]

const BOARD_SUBJECTS: Record<BoardKey, number> = {
  CBSE: 38, ICSE: 42, IB: 30, State: 35, Custom: 30,
}

// Compute approximate section count from grade range
function computeApproxSections(from: string, to: string): number {
  const fi = GRADES.indexOf(from)
  const ti = GRADES.indexOf(to)
  if (fi < 0 || ti < 0 || fi > ti) return 0
  let total = 0
  if (fi <= 2 && ti >= 0) total += Math.min(ti, 2) - fi + 1
  if (fi <= 7 && ti >= 3) total += (Math.min(ti, 7) - Math.max(fi, 3) + 1) * 4
  if (fi <= 12 && ti >= 8) total += (Math.min(ti, 12) - Math.max(fi, 8) + 1) * 4
  if (fi <= 14 && ti >= 13) total += (Math.min(ti, 14) - Math.max(fi, 13) + 1) * 4
  return total
}

// Auto-generate section tags from grade range
function buildSectionTags(from: string, to: string, board: BoardKey): string[] {
  const fi = GRADES.indexOf(from)
  const ti = GRADES.indexOf(to)
  if (fi < 0 || ti < 0 || fi > ti) return []

  const tags: string[] = []
  // Pre-K group
  if (fi <= 2 && ti >= 0) {
    const end = Math.min(ti, 2)
    const names = GRADES.slice(fi, end + 1)
    const label = names.length === 1 ? names[0] : `${names[0]}–${names[names.length - 1]}`
    const cls = names.length
    tags.push(`${label} (${cls} class${cls > 1 ? 'es' : ''})`)
  }
  // Primary I–V
  if (fi <= 7 && ti >= 3) {
    const s = Math.max(fi, 3); const e = Math.min(ti, 7)
    const cnt = e - s + 1
    const rn = `${GRADES[s].replace('Class ', '')}–${GRADES[e].replace('Class ', '')}`
    tags.push(`${rn} (${cnt * 4} sections)`)
  }
  // Middle VI–X
  if (fi <= 12 && ti >= 8) {
    const s = Math.max(fi, 8); const e = Math.min(ti, 12)
    const cnt = e - s + 1
    const rn = `${GRADES[s].replace('Class ', '')}–${GRADES[e].replace('Class ', '')}`
    tags.push(`${rn} (${cnt * 4} sections)`)
  }
  // Senior XI–XII
  if (fi <= 14 && ti >= 13) {
    const s = Math.max(fi, 13); const e = Math.min(ti, 14)
    const cnt = e - s + 1
    const rn = `${GRADES[s].replace('Class ', '')}–${GRADES[e].replace('Class ', '')}`
    tags.push(`${rn} (${cnt * 4} sections)`)
  }

  tags.push(`${BOARD_SUBJECTS[board]} ${board} subjects`)
  tags.push('Bell timings')
  tags.push('Room types')
  return tags
}

// ── Sidebar structure ──────────────────────────────────────────
interface SideItem {
  key: SideNavKey
  icon: React.ElementType
  label: string
  href: string
  external?: boolean
}
interface SideSection {
  heading: string
  items: SideItem[]
}

const SIDE_SECTIONS: SideSection[] = [
  {
    heading: 'WORKSPACE',
    items: [
      { key: 'dashboard', icon: Home,         label: 'Dashboard',  href: '/dashboard' },
      { key: 'schedules', icon: CalendarDays, label: 'Schedules',  href: '/wizard'    },
      { key: 'calendar',  icon: Calendar,     label: 'Calendar',   href: '#'          },
      { key: 'insights',  icon: BarChart2,    label: 'Insights',   href: '#'          },
    ],
  },
  {
    heading: 'ADMINISTRATION',
    items: [
      { key: 'users',     icon: Users,    label: 'Users',     href: '#'           },
      { key: 'resources', icon: Database, label: 'Resources', href: '/master-data' },
      { key: 'settings',  icon: Settings, label: 'Settings',  href: '#'           },
    ],
  },
  {
    heading: 'HELP & SUPPORT',
    items: [
      { key: 'support', icon: LifeBuoy, label: 'Support Center', href: '#'              },
      { key: 'docs',    icon: BookOpen, label: 'Documentation',  href: '#', external: true },
      { key: 'demo',    icon: Video,    label: 'Book a Demo',    href: '#', external: true },
    ],
  },
]

// ── Demo timetable rows ────────────────────────────────────────
const DEMO_TT = [
  {
    id: 'tt1', name: 'AY 2025–26 · Main',
    meta: '52 classes · 84 teachers · Generated 3 days ago',
    status: 'active' as const,
  },
  {
    id: 'tt2', name: 'AY 2025–26 · Revised (Post-annual)',
    meta: '52 classes · 84 teachers · In wizard · Step 3',
    status: 'draft' as const,
  },
  {
    id: 'tt3', name: 'AY 2024–25 · Archive',
    meta: '49 classes · 80 teachers · Archived',
    status: 'archived' as const,
  },
]

const STATUS_META = {
  active:   { label: 'Active',   bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' },
  draft:    { label: 'Draft',    bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
  archived: { label: 'Archived', bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' },
}

// ── Timetable list (persisted in localStorage) ─────────────────
type TTStatus = 'active' | 'draft' | 'archived'

interface TTEntry {
  id:              string
  name:            string
  status:          TTStatus
  wizardStep:      number    // 0 = just named, 1–5 = wizard step reached
  approxClasses:   number
  approxTeachers:  number
  approxSubjects?: number
  approxRooms?:    number
  board:           string
  startDate:       string
  endDate:         string
  createdAt:       number
  fromGrade?:      string
  toGrade?:        string
}

const WIZARD_STEP_LABELS: Record<number, string> = {
  0: 'Named',
  1: 'Resources',
  2: 'Shift & timing',
  3: 'Allocation',
  4: 'Student groups',
  5: 'Complete',
}

const TTLIST_KEY     = 'schedu-tt-list'
const ACTIVE_TT_KEY  = 'schedu-active-tt'
const TT_SNAPSHOT_PFX = 'schedu-tt-snap-'   // + ttId → full store snapshot per timetable

// ── Per-timetable snapshot helpers ─────────────────────────────
// Fields that differ per timetable (everything except auth/UI).
// We save and restore all of these when switching between timetables.
const TT_SNAPSHOT_FIELDS = [
  'step','config','sections','staff','subjects','breaks','periods',
  'classTT','teacherTT','substitutions','conflicts','suggestions',
  'optionalConfigs','subjectPools','participantPools','rooms',
  'facilities','teacherPools',
  // Elective-grouping data — keep OR/AND combos, generated groups, the
  // preference matrix and grouping rules so they survive snapshot save/restore.
  'subjectGroups','subjectCombinations','dynamicLearningGroups',
  'sectionStrengths','subjectGroupingRules','subjectAllocations',
] as const

function saveTTSnapshot(id: string) {
  try {
    const state = useTimetableStore.getState()
    const snap: Record<string, unknown> = {}
    TT_SNAPSHOT_FIELDS.forEach(k => { snap[k] = (state as any)[k] })
    localStorage.setItem(TT_SNAPSHOT_PFX + id, JSON.stringify(snap))
  } catch { /* quota full – silently ignore */ }
}

function restoreTTSnapshot(id: string): boolean {
  try {
    const raw = localStorage.getItem(TT_SNAPSHOT_PFX + id)
    if (!raw) return false
    const snap = JSON.parse(raw) as Record<string, unknown>
    // Apply snapshot via Zustand set
    const store = useTimetableStore.getState()
    // Use resetWizard to clear first, then patch in saved data
    store.resetWizard()
    useTimetableStore.setState(snap as any)
    return true
  } catch { return false }
}

// Normalise grade tokens like "XI" → "Class XI" to match the GRADES dropdown
function normaliseGrade(g: string): string {
  if (!g) return ''
  if (GRADES.includes(g)) return g
  const withClass = 'Class ' + g
  if (GRADES.includes(withClass)) return withClass
  return g
}

/** Read the saved snapshot for a timetable and derive accurate metadata. */
function derivedFromSnapshot(ttId: string): {
  classes?: number; subjects?: number; teachers?: number; rooms?: number
  fromGrade?: string; toGrade?: string
} | null {
  try {
    const raw = localStorage.getItem(TT_SNAPSHOT_PFX + ttId)
    if (!raw) return null
    const snap = JSON.parse(raw) as Record<string, any>

    const sections: any[] = Array.isArray(snap.sections) ? snap.sections : []
    const staff:    any[] = Array.isArray(snap.staff)    ? snap.staff    : []
    const subjects: any[] = Array.isArray(snap.subjects) ? snap.subjects : []
    const rooms:    any[] = Array.isArray(snap.rooms)    ? snap.rooms    : []

    // Derive grade range from actual section data
    const grades = sections
      .map((s: any) => normaliseGrade(s.grade || ''))
      .filter(Boolean)
    const sortedGrades = grades.sort((a, b) => GRADES.indexOf(a) - GRADES.indexOf(b))
    const fromGrade = sortedGrades[0]
    const toGrade   = sortedGrades[sortedGrades.length - 1]

    return {
      classes:   sections.length > 0 ? sections.length : undefined,
      subjects:  subjects.length > 0 ? subjects.length : undefined,
      teachers:  staff.length    > 0 ? staff.length    : undefined,
      rooms:     rooms.length    > 0 ? rooms.length    : undefined,
      fromGrade: fromGrade || undefined,
      toGrade:   toGrade   || undefined,
    }
  } catch { return null }
}

const SEED_TT: TTEntry[] = [
  {
    id: 'demo-tt1', name: 'AY 2025–26 · Main', status: 'active', wizardStep: 5,
    approxClasses: 52, approxTeachers: 84, board: 'CBSE',
    startDate: '2025-04-01', endDate: '2026-03-31',
    createdAt: Date.now() - 3 * 86_400_000,
  },
  {
    id: 'demo-tt2', name: 'AY 2025–26 · Revised (Post-annual)', status: 'draft', wizardStep: 3,
    approxClasses: 52, approxTeachers: 84, board: 'CBSE',
    startDate: '2025-04-01', endDate: '2026-03-31',
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: 'demo-tt3', name: 'AY 2024–25 · Archive', status: 'archived', wizardStep: 5,
    approxClasses: 49, approxTeachers: 80, board: 'CBSE',
    startDate: '2024-04-01', endDate: '2025-03-31',
    createdAt: Date.now() - 365 * 86_400_000,
  },
]

function loadTTList(): TTEntry[] {
  try {
    const raw = localStorage.getItem(TTLIST_KEY)
    if (raw === null) { saveTTList(SEED_TT); return SEED_TT }
    return JSON.parse(raw) as TTEntry[]
  } catch { return SEED_TT }
}
function saveTTList(list: TTEntry[]) {
  localStorage.setItem(TTLIST_KEY, JSON.stringify(list))
}
function getActiveTTId(): string | null {
  return localStorage.getItem(ACTIVE_TT_KEY)
}
function setActiveTTId(id: string | null) {
  id ? localStorage.setItem(ACTIVE_TT_KEY, id) : localStorage.removeItem(ACTIVE_TT_KEY)
}

function ttMeta(t: TTEntry): string {
  const cls = `${t.approxClasses} classes`
  const tch = `${t.approxTeachers} teachers`
  if (t.status === 'active')   return `${cls} · ${tch} · Generated`
  if (t.status === 'archived') return `${cls} · ${tch} · Archived`
  const stepLabel = WIZARD_STEP_LABELS[t.wizardStep] ?? `Step ${t.wizardStep}`
  if (t.wizardStep === 0) return `${cls} · ${tch} · Just created`
  return `${cls} · ${tch} · Step ${t.wizardStep}: ${stepLabel}`
}

const W_COLLAPSED = 56
const W_EXPANDED  = 220
const TRANSITION  = 'width 0.22s cubic-bezier(0.4,0,0.2,1)'

// ══════════════════════════════════════════════════════════════
//  CreateTimetableModal  (Page 5 — Wizard Step 0)
// ══════════════════════════════════════════════════════════════
function CreateTimetableModal({
  onClose, onOpenWizard,
}: {
  onClose: () => void
  onOpenWizard: (entry: TTEntry) => void
}) {
  const thisYear  = new Date().getFullYear()
  const nextYear  = thisYear + 1

  const [name,       setName]       = useState(`AY ${thisYear}–${String(nextYear).slice(-2)} · Main Timetable`)
  const [startDate,  setStartDate]  = useState(`${thisYear}-04-01`)
  const [endDate,    setEndDate]    = useState(`${nextYear}-03-31`)
  const [board,      setBoard]      = useState<BoardKey>('CBSE')
  const [fromGrade,  setFromGrade]  = useState('Nursery')
  const [toGrade,    setToGrade]    = useState('Class XII')
  const [classes,    setClasses]    = useState(52)
  const [subjects,   setSubjects]   = useState(38)
  const [teachers,   setTeachers]   = useState(84)
  const [rooms,      setRooms]      = useState(60)

  const handleBoard = (b: BoardKey) => { setBoard(b); setSubjects(BOARD_SUBJECTS[b]) }

  const tags = useMemo(
    () => buildSectionTags(fromGrade, toGrade, board),
    [fromGrade, toGrade, board],
  )

  // Auto-update classes count when grade range changes
  useEffect(() => {
    const n = computeApproxSections(fromGrade, toGrade)
    if (n > 0) setClasses(n)
  }, [fromGrade, toGrade])

  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const BOARDS: BoardKey[] = ['CBSE', 'ICSE', 'IB', 'State', 'Custom']

  const handleOpen = () => {
    const entry: TTEntry = {
      id:              Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name:            name.trim() || 'Untitled Timetable',
      status:          'draft',
      wizardStep:      0,
      approxClasses:   classes,
      approxTeachers:  teachers,
      approxSubjects:  subjects,
      approxRooms:     rooms,
      board,
      startDate,
      endDate,
      createdAt:       Date.now(),
      fromGrade,
      toGrade,
    }
    onOpenWizard(entry)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}
    >
      <style>{`
        .ct-input {
          width: 100%; padding: 9px 12px;
          border: 1px solid #D1D5DB; border-radius: 7px;
          font-size: 14px; font-family: inherit; color: #13111E;
          background: #fff; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ct-input:focus {
          border-color: #7C6FE0;
          box-shadow: 0 0 0 3px rgba(124,111,224,0.12);
        }
        .ct-num {
          width: 100%; padding: 8px 10px;
          border: 1px solid #E5E7EB; border-radius: 7px;
          font-size: 20px; font-weight: 700;
          font-family: 'DM Mono', monospace;
          text-align: center; color: #13111E;
          background: #fff; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ct-num:focus {
          border-color: #7C6FE0;
          box-shadow: 0 0 0 3px rgba(124,111,224,0.12);
        }
        .ct-select {
          width: 100%; padding: 9px 12px;
          border: 1px solid #D1D5DB; border-radius: 7px;
          font-size: 14px; font-family: inherit; color: #13111E;
          background: #fff; outline: none; cursor: pointer;
          appearance: auto;
          transition: border-color 0.15s;
        }
        .ct-select:focus { border-color: #7C6FE0; }
        .ct-board-chip {
          padding: 6px 14px; border-radius: 6px;
          font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit;
          transition: background 0.13s, border-color 0.13s, color 0.13s;
        }
        .ct-cancel {
          transition: background 0.13s, border-color 0.13s;
        }
        .ct-cancel:hover { background: #F9FAFB !important; border-color: #9CA3AF !important; }
        .ct-open {
          transition: background 0.13s;
        }
        .ct-open:hover { background: #1a1730 !important; }
      `}</style>

      {/* Card */}
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid #E5E7EB',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 520,
        maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 28px 24px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>
              Create new timetable
            </h2>
            <p style={{ fontSize: 13, color: '#6B7280' }}>
              AI will generate all defaults — you only refine.
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'none', cursor: 'pointer', color: '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginLeft: 12,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Timetable name ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>
            Timetable name <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            className="ct-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. AY 2025–26 · Main Timetable"
          />
        </div>

        {/* ── Dates row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Start date <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                className="ct-input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{fmt(startDate)}</div>
          </div>
          <div>
            <label style={lbl}>End date <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              className="ct-input"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{fmt(endDate)}</div>
          </div>
        </div>

        {/* ── Board ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Board <span style={{ color: '#EF4444' }}>*</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BOARDS.map(b => (
              <button
                key={b}
                className="ct-board-chip"
                onClick={() => handleBoard(b)}
                style={{
                  background: board === b ? '#059669' : '#fff',
                  color:      board === b ? '#fff' : '#374151',
                  border: board === b
                    ? '1.5px solid #059669'
                    : '1.5px solid #D1D5DB',
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* ── Class range ── */}
        <div style={{ marginBottom: 6 }}>
          <label style={lbl}>Class range <span style={{ color: '#EF4444' }}>*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              className="ct-select"
              list="schedu-grade-options"
              value={fromGrade}
              onChange={e => setFromGrade(e.target.value)}
              placeholder="From — e.g. Nursery"
            />
            <input
              className="ct-select"
              list="schedu-grade-options"
              value={toGrade}
              onChange={e => setToGrade(e.target.value)}
              placeholder="To — e.g. Class XII"
            />
          </div>
          <datalist id="schedu-grade-options">
            {GRADES.map(g => <option key={g} value={g} />)}
          </datalist>
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
            Pick a standard grade or type your own (e.g. “Grade R”, “Form 1”). schedU groups them automatically.
          </p>
        </div>

        {/* ── Approximate counts ── */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...lbl, marginBottom: 8 }}>Approximate counts</label>
          <div style={{
            background: '#F5F3FF', border: '1px solid #DDD8FF', borderRadius: 8,
            padding: '9px 12px', marginBottom: 12,
            fontSize: 12.5, color: '#5B52A8', lineHeight: 1.5,
          }}>
            Enter a count and <strong>schedU</strong> will auto-create initial editable resources for you.{' '}
            <span style={{ color: '#9590BF' }}>Leave blank if you'd like to create them yourself.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Classes',  value: classes,  set: setClasses  },
              { label: 'Teachers', value: teachers, set: setTeachers },
              { label: 'Rooms',    value: rooms,    set: setRooms    },
            ].map(f => (
              <div key={f.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 5 }}>{f.label}</div>
                <input
                  className="ct-num"
                  type="number"
                  min={1}
                  value={f.value}
                  onChange={e => f.set(Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── AI auto-generate tags ── */}
        {tags.length > 0 && (
          <div style={{
            background: '#F0FDF9', border: '1px solid #A7F3D0',
            borderRadius: 9, padding: '11px 14px', marginBottom: 24,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: '#065F46', marginBottom: 9,
            }}>
              <Sparkles size={13} color="#059669" />
              schedU will auto-create editable
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  display: 'inline-block',
                  padding: '3px 10px', borderRadius: 20,
                  background: '#fff', border: '1px solid #6EE7B7',
                  fontSize: 12, color: '#065F46', fontWeight: 500,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, paddingTop: 4,
          borderTop: '1px solid #F3F4F6', marginTop: 4, paddingBottom: 0,
        }}>
          <button onClick={onClose} className="ct-cancel" style={{
            padding: '9px 20px', borderRadius: 8,
            border: '1.5px solid #D1D5DB', background: '#fff',
            fontSize: 14, fontWeight: 600, color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>

          <span style={{ fontSize: 12, color: '#9CA3AF', flex: 1, textAlign: 'center' }}>
            You'll refine everything in the wizard →
          </span>

          <button onClick={handleOpen} className="ct-open" style={{
            padding: '9px 20px', borderRadius: 8,
            border: 'none', background: '#13111E',
            fontSize: 14, fontWeight: 700, color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
            Open wizard <ArrowRight size={15} />
          </button>
        </div>

      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: '#374151', marginBottom: 6,
}

// ══════════════════════════════════════════════════════════════
//  EditTimetableModal — edit step-0 metadata of an existing TT
// ══════════════════════════════════════════════════════════════
function EditTimetableModal({
  tt, onClose, onSave,
}: {
  tt: TTEntry
  onClose: () => void
  onSave: (updated: TTEntry) => void
}) {
  const BOARDS: BoardKey[] = ['CBSE', 'ICSE', 'IB', 'State', 'Custom']

  // Read actual wizard data from snapshot — most accurate source of truth
  const snap = useMemo(() => derivedFromSnapshot(tt.id), [tt.id])

  const [name,      setName]      = useState(tt.name)
  const [startDate, setStartDate] = useState(tt.startDate)
  const [endDate,   setEndDate]   = useState(tt.endDate)
  const [board,     setBoard]     = useState<BoardKey>((tt.board as BoardKey) ?? 'CBSE')

  // Grade range: TTEntry wins — UNLESS it still holds the hardcoded 'Nursery'
  // creation-time default that was never explicitly set by the user, in which
  // case the snapshot (derived from actual sections) is more accurate.
  const [fromGrade, setFromGrade] = useState(
    tt.fromGrade && tt.fromGrade !== 'Nursery'
      ? tt.fromGrade
      : (snap?.fromGrade ?? tt.fromGrade ?? '')
  )
  const [toGrade, setToGrade] = useState(tt.toGrade ?? snap?.toGrade ?? '')

  // Counts: TTEntry always wins — it reflects the user's explicit entries.
  // Snapshot fills only fields that were never saved (null / undefined).
  const [classes,  setClasses]  = useState(String(tt.approxClasses))
  const [subjects, setSubjects] = useState(
    tt.approxSubjects != null ? String(tt.approxSubjects)
    : snap?.subjects  != null ? String(snap.subjects) : ''
  )
  const [teachers, setTeachers] = useState(String(tt.approxTeachers))
  const [rooms,    setRooms]    = useState(
    tt.approxRooms != null ? String(tt.approxRooms)
    : snap?.rooms   != null ? String(snap.rooms) : ''
  )

  // When board changes, only auto-fill subjects if it's still blank or was the previous board's default
  const handleBoard = (b: BoardKey) => {
    setBoard(b)
    if (!subjects || subjects === String(BOARD_SUBJECTS[board])) setSubjects(String(BOARD_SUBJECTS[b]))
  }

  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const parseCount = (s: string) => { const n = parseInt(s); return isNaN(n) || n < 1 ? undefined : n }

  const handleSave = () => {
    onSave({
      ...tt,
      name:           name.trim() || tt.name,
      startDate,
      endDate,
      board,
      fromGrade:      fromGrade  || undefined,
      toGrade:        toGrade    || undefined,
      approxClasses:  parseCount(classes)  ?? tt.approxClasses,
      approxSubjects: parseCount(subjects),
      approxTeachers: parseCount(teachers) ?? tt.approxTeachers,
      approxRooms:    parseCount(rooms),
    })
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    border: '1px solid #D1D5DB', borderRadius: 7,
    fontSize: 14, fontFamily: 'inherit', color: '#13111E',
    background: '#fff', outline: 'none', cursor: 'pointer',
    appearance: 'auto',
  }
  const numInp: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    border: '1px solid #E5E7EB', borderRadius: 7,
    fontSize: 20, fontWeight: 700,
    fontFamily: 'DM Mono, monospace',
    textAlign: 'center', color: '#13111E',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid #E5E7EB',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 520,
        maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 28px 24px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Pencil size={16} color="#7C6FE0" />
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#13111E', margin: 0 }}>Edit timetable</h2>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
              Update the basic setup for <strong>{tt.name}</strong>
              {snap && (
                <span style={{ display: 'block', fontSize: 11.5, color: '#059669', marginTop: 3, fontWeight: 500 }}>
                  ✓ Counts and grade range loaded from your saved wizard data
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'none', cursor: 'pointer', color: '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 12,
          }}><X size={16} /></button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Timetable name <span style={{ color: '#EF4444' }}>*</span></label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. AY 2025–26 · Main Timetable" autoFocus
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 7,
              fontSize: 14, fontFamily: 'inherit', color: '#13111E',
              background: '#fff', outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#7C6FE0'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,111,224,0.12)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          {([
            { label: 'Start date', val: startDate, set: setStartDate },
            { label: 'End date',   val: endDate,   set: setEndDate   },
          ] as const).map(f => (
            <div key={f.label}>
              <label style={lbl}>{f.label} <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="date" value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 14, fontFamily: 'inherit', color: '#13111E', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#7C6FE0')}
                onBlur={e => (e.currentTarget.style.borderColor = '#D1D5DB')}
              />
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{fmt(f.val)}</div>
            </div>
          ))}
        </div>

        {/* Board */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Board <span style={{ color: '#EF4444' }}>*</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BOARDS.map(b => (
              <button key={b} onClick={() => handleBoard(b)} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.13s',
                background: board === b ? '#059669' : '#fff',
                color:      board === b ? '#fff'    : '#374151',
                border:     board === b ? '1.5px solid #059669' : '1.5px solid #D1D5DB',
              }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Class range */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Class range <span style={{ color: '#EF4444' }}>*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              { label: 'From', val: fromGrade, set: setFromGrade },
              { label: 'To',   val: toGrade,   set: setToGrade   },
            ] as const).map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{f.label}</div>
                <input
                  list="schedu-grade-options"
                  value={f.val}
                  onChange={e => f.set(e.target.value)}
                  style={selectStyle}
                  placeholder={f.label === 'From' ? 'e.g. Nursery' : 'e.g. Class XII'}
                />
              </div>
            ))}
          </div>
          <datalist id="schedu-grade-options">
            {GRADES.map(g => <option key={g} value={g} />)}
          </datalist>
          {(!fromGrade || !toGrade) && (
            <p style={{ fontSize: 11.5, color: '#F59E0B', marginTop: 6, fontWeight: 500 }}>
              ⚠ Please set both grade boundaries.
            </p>
          )}
        </div>

        {/* Approximate counts — all 4 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Approximate counts</label>
          </div>
          {/* Hint */}
          <div style={{
            background: '#F5F3FF', border: '1px solid #DDD8FF', borderRadius: 8,
            padding: '9px 12px', marginBottom: 12,
            fontSize: 12.5, color: '#5B52A8', lineHeight: 1.5,
          }}>
            Enter a count and <strong>schedU</strong> will auto-create initial editable resources for you.{' '}
            <span style={{ color: '#9590BF' }}>Leave blank if you'd like to create them yourself.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {([
              { label: 'Classes',  value: classes,  set: setClasses,  req: true  },
              { label: 'Teachers', value: teachers, set: setTeachers, req: true  },
              { label: 'Rooms',    value: rooms,    set: setRooms,    req: false },
            ] as const).map(f => (
              <div key={f.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 5, fontWeight: 500 }}>
                  {f.label}
                  {!f.req && <span style={{ color: '#C0BBDD', fontWeight: 400 }}> *</span>}
                </div>
                <input
                  type="number" min={1}
                  value={f.value}
                  placeholder="—"
                  onChange={e => f.set(e.target.value)}
                  style={{
                    ...numInp,
                    color: f.value ? '#13111E' : '#C4C0DC',
                    borderColor: f.value ? '#E5E7EB' : '#EDE9FF',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#7C6FE0')}
                  onBlur={e => (e.currentTarget.style.borderColor = f.value ? '#E5E7EB' : '#EDE9FF')}
                />
                {!f.value && (
                  <div style={{ fontSize: 10, color: '#B0ABCC', marginTop: 4 }}>manual</div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#B0ABCC', marginTop: 8 }}>
            * blank = you'll add these manually in the wizard
          </p>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: '1.5px solid #D1D5DB',
            background: '#fff', fontSize: 14, fontWeight: 600, color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.borderColor = '#9CA3AF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#D1D5DB' }}
          >Cancel</button>
          <button onClick={handleSave} style={{
            padding: '9px 22px', borderRadius: 8, border: 'none', background: '#7C6FE0',
            fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            boxShadow: '0 2px 10px rgba(124,111,224,0.3)',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#6358C4')}
            onMouseLeave={e => (e.currentTarget.style.background = '#7C6FE0')}
          >Save changes</button>
        </div>

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  DashboardPage
// ══════════════════════════════════════════════════════════════
export function DashboardPage() {
  const { user, logout } = useAuthStore()
  const store = useTimetableStore() as any
  const { sections, staff } = store

  const [activeTab,     setActiveTab]     = useState<NavTab>('dashboard')
  const [activeSideKey, setActiveSideKey] = useState<SideNavKey>('dashboard')
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [showCreate,    setShowCreate]    = useState(false)
  const [ttList,        setTTList]        = useState<TTEntry[]>(loadTTList)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingTT,     setEditingTT]     = useState<TTEntry | null>(null)

  // On dashboard load: auto-save a snapshot of the current timetable so that
  // if the user navigated away from the wizard (sidebar / back button), their
  // work is still captured before they switch to another timetable.
  useEffect(() => {
    const activeId = getActiveTTId()
    if (activeId) saveTTSnapshot(activeId)

    // ── One-time migration: strip "Environmental Studies" from every snapshot ──
    // EST = Extra Study Time (a timetable period slot), NOT a curriculum subject.
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(TT_SNAPSHOT_PFX)) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const snap = JSON.parse(raw) as Record<string, any>
        if (Array.isArray(snap.subjects)) {
          const before = snap.subjects.length
          snap.subjects = snap.subjects.filter((s: any) => s?.name !== 'Environmental Studies')
          if (snap.subjects.length !== before) localStorage.setItem(key, JSON.stringify(snap))
        }
      }
    } catch { /* ignore storage errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // run once on mount

  // Sync the active wizard's step from Zustand store into the list
  useEffect(() => {
    const activeId = getActiveTTId()
    if (!activeId) return
    const storeStep = (store.step as number) ?? 1
    setTTList(prev => {
      const idx = prev.findIndex(t => t.id === activeId)
      if (idx === -1) return prev
      if (prev[idx].wizardStep === storeStep) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], wizardStep: storeStep }
      saveTTList(next)
      return next
    })
  }, [store.step])

  // ── Timetable actions ─────────────────────────────────────────
  const handleTTCreated = (entry: TTEntry) => {
    // Save current timetable's full state before switching away
    const currentId = getActiveTTId()
    if (currentId) saveTTSnapshot(currentId)

    const next = [entry, ...ttList]
    setTTList(next)
    saveTTList(next)
    setActiveTTId(entry.id)
    // New timetable: start fresh
    useTimetableStore.getState().resetWizard()
    useTimetableStore.getState().setConfig({
      timetableName: entry.name,
      fromGrade:   entry.fromGrade   ?? 'Nursery',
      toGrade:     entry.toGrade     ?? 'Class XII',
      numSections: entry.approxClasses,
      numStaff:    entry.approxTeachers,
      numSubjects: entry.approxSubjects,
      numRooms:    entry.approxRooms,
    } as any)
    useTimetableStore.getState().setStep(1)
    window.location.href = '/wizard'
  }

  const handleContinue = (t: TTEntry) => {
    const currentId = getActiveTTId()
    if (currentId === t.id) {
      // Already the active one — just navigate
      window.location.href = '/wizard'
      return
    }
    // Save outgoing timetable's full state
    if (currentId) saveTTSnapshot(currentId)

    setActiveTTId(t.id)
    // Restore incoming timetable's saved state (or start fresh if none)
    const restored = restoreTTSnapshot(t.id)
    if (!restored) {
      useTimetableStore.getState().setConfig({ timetableName: t.name } as any)
      useTimetableStore.getState().setStep(Math.max(1, t.wizardStep))
    }
    window.location.href = '/wizard'
  }

  // ── Snapshot repair ───────────────────────────────────────────
  // Called when user clicks "Restore Data" on a timetable card.
  // Saves the CURRENT store state (which still contains the classTT/staff/
  // sections/periods from the timetable that was last open) as a snapshot
  // for this timetable ID. This lets users recover if a new timetable's
  // config overwrote the active timetable's settings.
  const handleRepairSnapshot = (t: TTEntry) => {
    // Snap whatever is currently in the store as this timetable's data
    saveTTSnapshot(t.id)
    // Mark it as the active timetable
    setActiveTTId(t.id)
    alert(
      `✅ "${t.name}" data has been secured.\n\n` +
      `Your generated timetable, staff, classes and subjects are preserved.\n\n` +
      `Please open the timetable and go through Step 2 (Bell Timing) and ` +
      `Step 3 (Class-wise Breaks) to restore the correct lunch break configuration.`
    )
    // Refresh list UI
    setTTList(prev => [...prev])
  }

  const handleDelete = (id: string) => {
    const next = ttList.filter(t => t.id !== id)
    setTTList(next)
    saveTTList(next)
    if (getActiveTTId() === id) setActiveTTId(null)
    setConfirmDelete(null)
  }

  const handleSaveEdit = (updated: TTEntry) => {
    const next = ttList.map(t => t.id === updated.id ? updated : t)
    setTTList(next)
    saveTTList(next)
    setEditingTT(null)

    const ta = updated.approxTeachers
    const ts = updated.approxSubjects
    const tr = updated.approxRooms
    const tc = updated.approxClasses

    /** Trim an array: if cur.length > target → slice; if < → reset to [] */
    const trimArr = (cur: any[], target: number | undefined) =>
      target == null ? cur : cur.length > target ? cur.slice(0, target) : []

    // ── 1. Patch the persisted snapshot for this timetable directly in
    //       localStorage. This handles BOTH the active-timetable case (where
    //       `handleContinue` just navigates without restoring the snapshot) AND
    //       the non-active case (where `restoreTTSnapshot` is called and would
    //       bring back the old counts).
    try {
      const snapKey = TT_SNAPSHOT_PFX + updated.id
      const raw = localStorage.getItem(snapKey)
      const snap: Record<string, any> = raw ? JSON.parse(raw) : {}
      snap.config = {
        ...(snap.config ?? {}),
        numSections: tc,
        numStaff:    ta,
        numSubjects: ts,
        numRooms:    tr,
      }
      if (Array.isArray(snap.staff))    snap.staff    = trimArr(snap.staff,    ta)
      if (Array.isArray(snap.subjects)) snap.subjects = trimArr(snap.subjects, ts)
      if (Array.isArray(snap.rooms))    snap.rooms    = trimArr(snap.rooms,    tr)
      if (Array.isArray(snap.sections)) snap.sections = trimArr(snap.sections, tc)
      localStorage.setItem(snapKey, JSON.stringify(snap))
    } catch { /* ignore storage errors */ }

    // ── 2. If this timetable is the live active one, also patch the Zustand
    //       store so the Resources page reflects the new counts immediately
    //       (no page reload required for the in-memory state).
    if (getActiveTTId() === updated.id) {
      const s = useTimetableStore.getState() as any
      s.setConfig?.({
        ...s.config,
        numSections: tc,
        numStaff:    ta,
        numSubjects: ts,
        numRooms:    tr,
      })
      const curStaff   = (s.staff as any[])                                ?? []
      const curSubjects= ((s.subjects ?? s.legacySubjects) as any[])       ?? []
      const curRooms   = (s.rooms as any[])                                ?? []
      const curSections= (s.sections as any[])                             ?? []
      s.setStaff?.(trimArr(curStaff,    ta))
      ;(s.setSubjects ?? s.setLegacySubjects)?.(trimArr(curSubjects, ts))
      s.setRooms?.(trimArr(curRooms,   tr))
      s.setSections?.(trimArr(curSections, tc))
    }
    // Navigate into the wizard for this timetable
    handleContinue(updated)
  }

  if (!user) { window.location.href = '/login'; return null }

  const firstName  = user.name?.split(' ')[0] ?? 'there'
  const schoolName = user.schoolName ?? 'Your School'
  const conflicts  = (store.conflicts ?? []).length
  const activeTTs  = ttList.filter(t => t.status === 'active').length
  const draftTTs   = ttList.filter(t => t.status === 'draft').length

  const stats = [
    {
      label: 'Timetables',
      value: ttList.filter(t => t.status !== 'archived').length,
      sub: [activeTTs && `${activeTTs} active`, draftTTs && `${draftTTs} draft`].filter(Boolean).join(' · ') || 'None yet',
      red: false,
    },
    {
      label: 'Total classes',
      value: sections.length || 52,
      sub: sections.length ? `${sections.length} sections` : 'Across I–XII',
      red: false,
    },
    {
      label: 'Teachers',
      value: staff.length || 84,
      sub: staff.length ? `${staff.length} staff` : '78 allocated',
      red: false,
    },
    {
      label: 'Conflicts',
      value: conflicts || 2,
      sub: 'Needs attention',
      red: true,
    },
  ]

  const SW = sidebarOpen ? W_EXPANDED : W_COLLAPSED
  const initials = (user.name ?? 'U')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      background: '#F5F4F0', color: '#13111E',
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .db-tab       { transition: background 0.13s, color 0.13s; }
        .db-tab:hover { background: #F5F4F0 !important; }
        .db-icon-btn  { transition: background 0.13s; border-radius: 9px; }
        .db-icon-btn:hover { background: #EDE9FF !important; }
        .sb-item      { transition: background 0.13s, color 0.13s; text-decoration: none; }
        .sb-item:hover { background: #F0EDFF !important; }
        .db-tt-row    { transition: box-shadow 0.14s, border-color 0.14s; }
        .db-tt-row:hover { border-color: #D1D5DB !important; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
        .db-qa-card   { transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
        .db-qa-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.07); border-color: #D1D5DB !important; }
        .db-act-btn   { transition: background 0.13s, border-color 0.13s; }
        .sb-label     { white-space: nowrap; overflow: hidden; pointer-events: none; }
        .sb-upgrade   { transition: background 0.14s; }
        .sb-upgrade:hover { background: #6655CC !important; }
        .db-new-btn   { transition: background 0.13s, box-shadow 0.13s; }
        .db-new-btn:hover { background: #F9F8FF !important; box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important; }
      `}</style>

      {/* ══ TOP NAV ══════════════════════════════════════════ */}
      <header style={{
        height: 52, background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center',
        padding: '0 16px 0 0',
        flexShrink: 0, zIndex: 100,
        position: 'sticky', top: 0,
      }}>
        <div style={{
          width: SW, height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          borderRight: '1px solid #F0EDFF',
          overflow: 'hidden', transition: TRANSITION,
          paddingLeft: sidebarOpen ? 14 : 0,
          justifyContent: sidebarOpen ? 'flex-start' : 'center',
          gap: 8,
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}
            style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280',
            }}
          >
            {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
          {sidebarOpen && (
            <a href="/" style={{ textDecoration: 'none', lineHeight: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.3px', color: '#13111E' }}>
                sched<span style={{ color: '#7C6FE0', fontFamily: "'Plus Jakarta Sans',Georgia,serif", fontStyle: 'italic' }}>U</span>
              </span>
            </a>
          )}
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 16px', flex: 1 }}>
          {([
            { key: 'dashboard',  label: 'Dashboard'  },
            { key: 'timetables', label: 'Timetables' },
            { key: 'resources',  label: 'Resources'  },
            { key: 'reports',    label: 'Reports'    },
          ] as { key: NavTab; label: string }[]).map(t => (
            <button key={t.key} className="db-tab"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none',
                background: activeTab === t.key ? '#F0EDFF' : 'transparent',
                color: activeTab === t.key ? '#7C6FE0' : '#6B7280',
                fontSize: 13, fontWeight: activeTab === t.key ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{schoolName}</span>
          <button className="db-icon-btn" style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'none', border: 'none',
            cursor: 'pointer', position: 'relative',
          }}>
            <Bell size={17} color="#6B7280" />
            <span style={{
              position: 'absolute', top: 5, right: 6,
              width: 7, height: 7, borderRadius: '50%',
              background: '#EF4444', border: '1.5px solid #fff',
            }} />
          </button>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#7C6FE0', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          }}>
            {initials}
          </div>
          <button onClick={() => { logout(); window.location.href = '/login' }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, color: '#6B7280',
              display: 'flex', alignItems: 'center',
            }}>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* ══ BODY ══════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: SW, flexShrink: 0, background: '#fff',
          borderRight: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column',
          transition: TRANSITION, overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px 0' }}>
            {SIDE_SECTIONS.map((section, si) => (
              <div key={section.heading} style={{ marginBottom: si < SIDE_SECTIONS.length - 1 ? 8 : 0 }}>
                {sidebarOpen && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    color: '#9CA3AF', padding: '10px 10px 4px', userSelect: 'none',
                  }}>
                    {section.heading}
                  </div>
                )}
                {!sidebarOpen && si > 0 && (
                  <div style={{ height: 1, background: '#F3F4F6', margin: '6px 10px' }} />
                )}
                {section.items.map(item => {
                  const isActive = activeSideKey === item.key
                  const Icon = item.icon
                  return (
                    <a
                      key={item.key}
                      href={item.href === '#' ? undefined : item.href}
                      onClick={e => {
                        if (item.href === '#') e.preventDefault()
                        setActiveSideKey(item.key)
                      }}
                      className="sb-item"
                      title={!sidebarOpen ? item.label : undefined}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center',
                        gap: sidebarOpen ? 10 : 0,
                        justifyContent: sidebarOpen ? 'flex-start' : 'center',
                        padding: sidebarOpen ? '8px 10px' : '9px 0',
                        margin: '0 0 1px',
                        borderRadius: 8,
                        background: isActive ? '#EDE9FF' : 'none',
                        color: isActive ? '#7C6FE0' : '#4B5563',
                        cursor: 'pointer', overflow: 'hidden', minWidth: 0,
                      }}
                    >
                      <Icon size={17} style={{ flexShrink: 0, color: isActive ? '#7C6FE0' : '#6B7280' }} />
                      <span className="sb-label" style={{
                        fontSize: 13, fontWeight: isActive ? 600 : 400,
                        opacity: sidebarOpen ? 1 : 0,
                        maxWidth: sidebarOpen ? 160 : 0,
                        transition: 'opacity 0.15s, max-width 0.22s',
                        display: 'flex', alignItems: 'center', gap: 6, flex: 1,
                      }}>
                        {item.label}
                        {item.external && sidebarOpen && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.45, flexShrink: 0 }}>
                            <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    </a>
                  )
                })}
              </div>
            ))}
          </div>

          {/* User + Plan strip */}
          <div style={{
            borderTop: '1px solid #F3F4F6',
            padding: sidebarOpen ? '10px 12px' : '10px 8px',
            flexShrink: 0, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: sidebarOpen ? 10 : 0,
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              marginBottom: sidebarOpen ? 8 : 0,
              overflow: 'hidden',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#7C6FE0', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {initials}
              </div>
              {sidebarOpen && (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name ?? 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email ?? ''}
                  </div>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#F9F8FF', borderRadius: 8,
                border: '1px solid #EDE9FF', padding: '7px 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} color="#7C6FE0" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#7C6FE0' }}>Free Plan</span>
                </div>
                <button className="sb-upgrade" style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none',
                  background: '#7C6FE0', color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Upgrade
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Greeting row */}
          <div style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', marginBottom: 20,
          }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#13111E', marginBottom: 4, letterSpacing: '-0.3px' }}>
                {greeting()}, {firstName}
              </h1>
              <p style={{ fontSize: 13, color: '#6B7280' }}>
                {schoolName} · AY 2025–26 · {(store.config as any)?.boardName ?? 'CBSE'}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="db-new-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #D1D5DB', background: '#fff',
                fontSize: 13, fontWeight: 600, color: '#13111E',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={14} /> New timetable
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: '#fff', borderRadius: 10,
                border: '1px solid #E5E7EB', padding: '14px 16px',
              }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{s.label}</div>
                <div style={{
                  fontSize: 28, fontWeight: 800, lineHeight: 1,
                  color: s.red ? '#EF4444' : '#13111E',
                  fontFamily: "'DM Mono', monospace", marginBottom: 5,
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* AI insight */}
          <div style={{
            background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Sparkles size={16} color="#15803D" style={{ flexShrink: 0 }} />
            <p style={{ flex: 1, fontSize: 13, color: '#166534', lineHeight: 1.55 }}>
              <strong>AI insight:</strong> Mr. Sharma is overloaded by 6 periods in the AY 2025–26 draft.
              Reassigning Chemistry XI to Ms. Nair would balance both workloads within capacity.
            </p>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: '#16A34A', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
              Fix <ChevronRight size={12} />
            </button>
          </div>

          {/* Timetables */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E' }}>Your timetables</h2>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{ttList.length} total</span>
            </div>

            {/* Delete confirmation overlay */}
            {confirmDelete && (
              <div style={{
                background: '#FFF7ED', border: '1px solid #FED7AA',
                borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <span style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>
                  Delete &ldquo;{ttList.find(t => t.id === confirmDelete)?.name}&rdquo;? This cannot be undone.
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setConfirmDelete(null)} style={{
                    padding: '5px 14px', borderRadius: 7, border: '1px solid #D1D5DB',
                    background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Cancel
                  </button>
                  <button onClick={() => handleDelete(confirmDelete)} style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: '#EF4444', color: '#fff', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    Delete
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ttList.length === 0 && (
                <div style={{
                  background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                  padding: '32px 16px', textAlign: 'center',
                }}>
                  <CalendarDays size={28} color="#D1D5DB" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>No timetables yet</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>Click "+ New timetable" to create one</div>
                </div>
              )}
              {ttList.map(tt => {
                const sm        = STATUS_META[tt.status]
                const isActive  = getActiveTTId() === tt.id
                return (
                  <div key={tt.id} className="db-tt-row" style={{
                    background: '#fff', borderRadius: 10,
                    border: `1px solid ${isActive && tt.status === 'draft' ? '#C4B5FD' : '#E5E7EB'}`,
                    padding: '13px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: isActive && tt.status === 'draft' ? '0 0 0 3px rgba(124,111,224,0.08)' : 'none',
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: tt.status === 'draft' ? '#F5F3FF' : '#F5F4F0',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CalendarDays size={16} color={tt.status === 'draft' ? '#7C6FE0' : '#6B7280'} />
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: '#13111E',
                        marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tt.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{ttMeta(tt)}</span>
                        {tt.status === 'draft' && tt.wizardStep > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 7px', borderRadius: 10,
                            background: '#F0EDFF', border: '1px solid #C4B5FD',
                            fontSize: 11, fontWeight: 600, color: '#7C6FE0',
                            flexShrink: 0,
                          }}>
                            Step {tt.wizardStep} · {WIZARD_STEP_LABELS[tt.wizardStep]}
                          </span>
                        )}
                        {tt.status === 'draft' && tt.wizardStep === 0 && (
                          <span style={{
                            padding: '1px 7px', borderRadius: 10,
                            background: '#FEF3C7', border: '1px solid #FDE68A',
                            fontSize: 11, fontWeight: 600, color: '#92400E', flexShrink: 0,
                          }}>
                            Not started
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span style={{
                      padding: '3px 10px', borderRadius: 20,
                      background: sm.bg, color: sm.fg, border: `1px solid ${sm.border}`,
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}>
                      {sm.label}
                    </span>

                    {/* Action buttons */}
                    {tt.status === 'active' && (
                      <>
                        <TtBtn onClick={() => handleContinue(tt)}>Open</TtBtn>
                        <TtBtn onClick={() => {}}>Export</TtBtn>
                      </>
                    )}
                    {tt.status === 'draft' && (
                      <TtBtn primary onClick={() => handleContinue(tt)}>
                        Continue <ArrowRight size={12} />
                      </TtBtn>
                    )}
                    {tt.status === 'archived' && (
                      <TtBtn onClick={() => { window.location.href = '/timetable' }}>View</TtBtn>
                    )}
                    {/* Restore Data — shown when this timetable's data may have been
                        overwritten by another timetable's config (no snapshot yet) */}
                    {!localStorage.getItem(TT_SNAPSHOT_PFX + tt.id) && (
                      <TtBtn onClick={() => handleRepairSnapshot(tt)}>
                        🔧 Restore data
                      </TtBtn>
                    )}

                    {/* Edit button — all rows */}
                    <button
                      onClick={() => setEditingTT(tt)}
                      title="Edit timetable settings"
                      style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: '1px solid transparent',
                        cursor: 'pointer', color: '#D1D5DB', transition: 'all 0.13s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#7C6FE0'; e.currentTarget.style.borderColor = '#C4B5FD'; e.currentTarget.style.background = '#F5F3FF' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Delete button — all rows */}
                    <button
                      onClick={() => setConfirmDelete(confirmDelete === tt.id ? null : tt.id)}
                      title="Delete timetable"
                      style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: confirmDelete === tt.id ? '#FEE2E2' : 'transparent',
                        border: confirmDelete === tt.id ? '1px solid #FECACA' : '1px solid transparent',
                        cursor: 'pointer', color: confirmDelete === tt.id ? '#EF4444' : '#D1D5DB',
                        transition: 'all 0.13s',
                      }}
                      onMouseEnter={e => {
                        if (confirmDelete !== tt.id) e.currentTarget.style.color = '#EF4444'
                        if (confirmDelete !== tt.id) e.currentTarget.style.borderColor = '#FECACA'
                      }}
                      onMouseLeave={e => {
                        if (confirmDelete !== tt.id) e.currentTarget.style.color = '#D1D5DB'
                        if (confirmDelete !== tt.id) e.currentTarget.style.borderColor = 'transparent'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E', marginBottom: 12 }}>Quick actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { icon: <Users size={22} color="#6B7280" />, title: 'Manage teachers', desc: 'Update staff, subjects, and workload limits', href: '/master-data' },
                { icon: <Database size={22} color="#6B7280" />, title: 'Manage resources', desc: 'Add venues, set capacity, configure availability', href: '/master-data' },
                { icon: <BarChart2 size={22} color="#6B7280" />, title: 'View reports', desc: 'Workload analysis, room usage, conflict log', href: '/timetable' },
              ].map(qa => (
                <a key={qa.title} href={qa.href} style={{ textDecoration: 'none' }}>
                  <div className="db-qa-card" style={{
                    background: '#fff', borderRadius: 10,
                    border: '1px solid #E5E7EB', padding: '18px 16px', cursor: 'pointer',
                  }}>
                    <div style={{ marginBottom: 12 }}>{qa.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>{qa.title}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.55 }}>{qa.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <AppFooter style={{ marginTop: 32, marginLeft: -28, marginRight: -28, marginBottom: -24 }} />
        </main>
      </div>

      {/* ══ Create Timetable Modal ══ */}
      {showCreate && (
        <CreateTimetableModal
          onClose={() => setShowCreate(false)}
          onOpenWizard={handleTTCreated}
        />
      )}

      {/* ══ Edit Timetable Modal ══ */}
      {editingTT && (
        <EditTimetableModal
          tt={editingTT}
          onClose={() => setEditingTT(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}

// ── Timetable action button ─────────────────────────────────────
function TtBtn({ children, onClick, primary }: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="db-act-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
        border: primary ? 'none' : '1px solid #E5E7EB',
        background: primary ? '#13111E' : '#fff',
        color: primary ? '#fff' : '#374151',
        fontSize: 13, fontWeight: 600, flexShrink: 0,
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = primary ? '#2D2B45' : '#F3F4F6'
        if (!primary) e.currentTarget.style.borderColor = '#D1D5DB'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = primary ? '#13111E' : '#fff'
        if (!primary) e.currentTarget.style.borderColor = '#E5E7EB'
      }}
    >
      {children}
    </button>
  )
}
