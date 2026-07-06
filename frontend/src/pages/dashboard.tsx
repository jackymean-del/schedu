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

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore, openUserProfile } from '@/store/authStore'
import { CLERK_ENABLED } from '@/lib/clerk'
import { useTimetableStore } from '@/store/timetableStore'
import * as ttRepo from '@/api/timetables'
import { BrandedLoader } from '@/components/BrandedLoader'
import { useOrgProfile } from '@/store/orgProfile'
import { parseGradeLevel, toRoman, tidyGradeLabel } from '@/lib/gradeParse'
import { GradeInput } from '@/components/GradeInput'
import { AppFooter } from '@/components/AppFooter'
import { DashboardTodayPanel } from '@/components/DashboardTodayPanel'
import { DashboardPulse } from '@/components/DashboardPulse'
import { loadLeaves } from '@/lib/leaveUtils'
import { computeTodaySummary } from '@/lib/scheduleToday'
import { loadActiveBundles, computeMultiToday } from '@/lib/activeSchedules'
import {
  Home, CalendarDays, Calendar, BarChart2,
  Users, Database, Settings,
  LifeBuoy, BookOpen, Video,
  Bell, Plus, Sparkles,
  ChevronRight, ArrowRight, ChevronLeft,
  Zap, X, Trash2, Pencil, LogOut, Copy,
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

// ── Adaptive grade parsing ─────────────────────────────────────
// Shared parser (handles "Class I", "Grade 1", "Nursery", "KG1", "PP2", …).
/** Short label for a numeric level, preserving the user's pre-primary names. */
function levelLabel(n: number): string {
  if (n === -2) return 'Nursery'
  if (n === -1) return 'LKG'
  if (n === 0) return 'UKG'
  return toRoman(n)
}
/** Distribute `total` sections across `count` levels as evenly as possible;
 *  any remainder goes to the highest (top) levels. */
function distributeSections(count: number, total: number): number[] {
  if (count <= 0) return []
  if (total <= 0) return Array(count).fill(0)
  const base = Math.floor(total / count)
  let rem = total - base * count
  const arr = Array(count).fill(base)
  for (let i = count - 1; rem > 0; i--, rem--) arr[i] += 1
  return arr
}
/** Band index by numeric level: pre-primary 0 · primary(1–5) 1 · middle(6–10) 2 · senior(11+) 3. */
function bandOf(level: number): number {
  if (level <= 0) return 0
  if (level <= 5) return 1
  if (level <= 10) return 2
  return 3
}
/** Board-aware subject estimate that grows with the highest grade reached. */
function estimateSubjects(toLevel: number | null, board: BoardKey): number {
  if (toLevel === null) return 0
  const base = BOARD_SUBJECTS[board]
  if (toLevel <= 0) return Math.round(base * 0.25)
  if (toLevel <= 5) return Math.round(base * 0.45)
  if (toLevel <= 8) return Math.round(base * 0.7)
  if (toLevel <= 10) return Math.round(base * 0.9)
  return base
}
/** Total sections implied by the entered range + class count (0 if none). */
function previewSectionTotal(fromGrade: string, toGrade: string, classCount: number): number {
  const f = parseGradeLevel(fromGrade); const t = parseGradeLevel(toGrade)
  if (f === null || t === null || f > t || classCount <= 0) return 0
  return classCount
}
/** Dynamic "auto-create" preview chips from the user's range, count and board. */
function buildPreview(fromGrade: string, toGrade: string, classCount: number, board: BoardKey): string[] {
  const f = parseGradeLevel(fromGrade); const t = parseGradeLevel(toGrade)
  if (f === null || t === null || f > t) return []
  const levels: number[] = []
  for (let n = f; n <= t; n++) levels.push(n)

  const tags: string[] = []
  if (classCount > 0) {
    const per = distributeSections(levels.length, classCount)
    // Group consecutive levels into bands, summing their sections.
    const bands: { from: number; to: number; sum: number }[] = []
    levels.forEach((lvl, i) => {
      const b = bandOf(lvl)
      const last = bands[bands.length - 1]
      if (last && bandOf(last.to) === b) { last.to = lvl; last.sum += per[i] }
      else bands.push({ from: lvl, to: lvl, sum: per[i] })
    })
    for (const { from, to, sum } of bands) {
      const label = from === to ? levelLabel(from) : `${levelLabel(from)}–${levelLabel(to)}`
      tags.push(`${label} (${sum} section${sum !== 1 ? 's' : ''})`)
    }
  }
  const subj = estimateSubjects(t, board)
  if (subj > 0) tags.push(`${subj} ${board === 'Custom' ? 'subjects' : board + ' subjects'}`)
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
      { key: 'calendar',  icon: Calendar,     label: 'Calendar',   href: '/calendar'  },
      { key: 'insights',  icon: BarChart2,    label: 'Insights',   href: '/insights'  },
    ],
  },
  {
    heading: 'ADMINISTRATION',
    items: [
      { key: 'users',     icon: Users,    label: 'Users',     href: '/users'       },
      { key: 'resources', icon: Database, label: 'Resources', href: '/master-data' },
      { key: 'settings',  icon: Settings, label: 'Settings',  href: '/settings'    },
    ],
  },
  {
    heading: 'HELP & SUPPORT',
    items: [
      { key: 'support', icon: LifeBuoy, label: 'Support Center', href: '/support'        },
      { key: 'docs',    icon: BookOpen, label: 'Documentation',  href: '/docs'                  },
      { key: 'demo',    icon: Video,    label: 'Book a Demo',    href: '/demo'                  },
    ],
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

// When real auth (Clerk) is active, the backend is the source of truth and
// each user gets their own server-stored timetables. The localStorage entries
// then act only as an offline cache, namespaced per-user so one account can
// never read another's cached snapshots in a shared browser. In mock-auth dev
// (no Clerk), we stay fully local as before.
const SERVER_BACKED = CLERK_ENABLED

// Per-user cache namespace (set by the dashboard once the user is known).
let cacheNS = ''
function setCacheNS(userId: string | undefined) { cacheNS = userId ?? '' }
function snapKey(id: string) { return `${TT_SNAPSHOT_PFX}${cacheNS}:${id}` }

// ── Per-timetable snapshot helpers ─────────────────────────────
// Fields that differ per timetable (everything except auth/UI).
// We save and restore all of these when switching between timetables.
const TT_SNAPSHOT_FIELDS = [
  'step','config','sections','staff','subjects','breaks','periods',
  'classTT','teacherTT','substitutions','substitutionSettings','conflicts','suggestions',
  'optionalConfigs','subjectPools','participantPools','rooms',
  'facilities','teacherPools',
  // Elective-grouping data — keep OR/AND combos, generated groups, the
  // preference matrix and grouping rules so they survive snapshot save/restore.
  'subjectGroups','subjectCombinations','dynamicLearningGroups',
  'sectionStrengths','subjectGroupingRules','subjectAllocations',
] as const

/** Build a plain snapshot object of the current wizard store state. */
function buildSnapshot(): Record<string, unknown> {
  const state = useTimetableStore.getState()
  const snap: Record<string, unknown> = {}
  TT_SNAPSHOT_FIELDS.forEach(k => { snap[k] = (state as any)[k] })
  return snap
}

/** Apply a snapshot object onto the wizard store (reset first, then patch). */
function applySnapshot(snap: Record<string, unknown>) {
  const store = useTimetableStore.getState()
  store.resetWizard()
  useTimetableStore.setState(snap as any)
}

function saveTTSnapshot(id: string) {
  const snap = buildSnapshot()
  try {
    localStorage.setItem(snapKey(id), JSON.stringify(snap))
  } catch { /* quota full – silently ignore */ }
  // Push to the server (best-effort; the local cache already succeeded).
  if (SERVER_BACKED) {
    ttRepo.saveTimetableSnapshot(id, snap).catch(() => { /* offline / transient */ })
  }
}

function restoreTTSnapshot(id: string): boolean {
  try {
    const raw = localStorage.getItem(snapKey(id))
    if (!raw) return false
    applySnapshot(JSON.parse(raw) as Record<string, unknown>)
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
    const raw = localStorage.getItem(snapKey(ttId))
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

// Per-user local cache of the timetable list. In server-backed mode this is a
// resilient mirror so a freshly-created/generated draft is shown immediately
// and never lost if a server round-trip is slow or fails — the server stays
// authoritative and is merged in on load.
function ttListKey() { return `${TTLIST_KEY}:${cacheNS}` }
function loadLocalTTList(): TTEntry[] {
  try {
    const raw = localStorage.getItem(SERVER_BACKED ? ttListKey() : TTLIST_KEY)
    if (raw === null) return SERVER_BACKED ? [] : (saveTTList(SEED_TT), SEED_TT)
    return JSON.parse(raw) as TTEntry[]
  } catch { return SERVER_BACKED ? [] : SEED_TT }
}
function loadTTList(): TTEntry[] {
  // Initial render: server-backed starts empty (the mount effect merges local
  // cache + server once the user — and cache namespace — are known).
  return SERVER_BACKED ? [] : loadLocalTTList()
}
function saveTTList(list: TTEntry[]) {
  localStorage.setItem(SERVER_BACKED ? ttListKey() : TTLIST_KEY, JSON.stringify(list))
}
/** Merge server list (authoritative) with local-only drafts not yet on it. */
function mergeTTLists(server: TTEntry[], local: TTEntry[]): TTEntry[] {
  const ids = new Set(server.map(t => t.id))
  const localOnly = local.filter(t => !ids.has(t.id))
  return [...localOnly, ...server].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/** Build a TTEntry by inspecting the CURRENT wizard store — used to "adopt"
 *  work that exists only because the user reached /wizard directly (e.g. a
 *  sidebar link), bypassing the New-timetable dialog entirely. Without this,
 *  that work has no TTEntry/id and never appears on the dashboard. */
function buildEntryFromCurrentStore(id: string): TTEntry {
  const s = useTimetableStore.getState() as any
  return {
    id,
    name: s.config?.timetableName || 'Recovered timetable',
    status: 'draft',
    wizardStep: s.step || 1,
    approxClasses: (s.sections ?? []).length,
    approxTeachers: (s.staff ?? []).length,
    approxSubjects: (s.subjects ?? s.legacySubjects ?? []).length,
    approxRooms: (s.rooms ?? []).length,
    board: s.config?.board || 'CBSE',
    startDate: s.config?.startDate || '',
    endDate: s.config?.endDate || '',
    createdAt: Date.now(),
    fromGrade: s.config?.fromGrade,
    toGrade: s.config?.toGrade,
  }
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

  const [name,       setName]       = useState('')
  const [startDate,  setStartDate]  = useState(`${thisYear}-04-01`)
  const [endDate,    setEndDate]    = useState(`${nextYear}-03-31`)
  const [board,      setBoard]      = useState<BoardKey>('CBSE')
  const [fromGrade,  setFromGrade]  = useState('')
  const [toGrade,    setToGrade]    = useState('')
  // Counts start blank — nothing is invented until the user enters a number.
  const [classes,    setClasses]    = useState<number | ''>('')
  const [teachers,   setTeachers]   = useState<number | ''>('')
  const [rooms,      setRooms]      = useState<number | ''>('')

  const handleBoard = (b: BoardKey) => setBoard(b)
  const classCount = typeof classes === 'number' ? classes : 0

  // Preview adapts live to the entered range, class count and board.
  const tags = useMemo(
    () => buildPreview(fromGrade, toGrade, classCount, board),
    [fromGrade, toGrade, classCount, board],
  )
  const subjects = useMemo(
    () => estimateSubjects(parseGradeLevel(toGrade), board),
    [toGrade, board],
  )

  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const BOARDS: BoardKey[] = ['CBSE', 'ICSE', 'IB', 'State', 'Custom']

  const handleOpen = () => {
    const entry: TTEntry = {
      id:              Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name:            name.trim() || 'Untitled Schedule',
      status:          'draft',
      wizardStep:      0,
      approxClasses:   classCount,
      approxTeachers:  typeof teachers === 'number' ? teachers : 0,
      approxSubjects:  subjects,
      approxRooms:     typeof rooms === 'number' ? rooms : 0,
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
              Create new schedule
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
            Schedule name <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            className="ct-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. AY 2025–26 · Main Schedule"
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
            <GradeInput className="ct-input" value={fromGrade} onChange={setFromGrade} placeholder="From — e.g. Class-I" />
            <GradeInput className="ct-input" value={toGrade}   onChange={setToGrade}   placeholder="To — e.g. Class-X" />
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
            Type your own naming — “Class-I”, “Grade 1”, “KG1”, “PP2”, “Nursery”, “Form 1”, “Year 7”. schedU adapts to your convention, tidies the spacing, and groups the levels automatically.
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
                  placeholder="—"
                  value={f.value}
                  onChange={e => { const v = e.target.value; f.set(v === '' ? '' : Math.max(0, Number(v))) }}
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
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#13111E', margin: 0 }}>Edit schedule</h2>
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
          <label style={lbl}>Schedule name <span style={{ color: '#EF4444' }}>*</span></label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. AY 2025–26 · Main Schedule" autoFocus
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
              { label: 'From', val: fromGrade, set: setFromGrade, ph: 'e.g. Nursery' },
              { label: 'To',   val: toGrade,   set: setToGrade,   ph: 'e.g. Class XII' },
            ] as const).map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{f.label}</div>
                <GradeInput value={f.val} onChange={f.set} style={selectStyle} placeholder={f.ph} />
              </div>
            ))}
          </div>
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
  const { user, logout, authReady } = useAuthStore()
  const org = useOrgProfile()
  const store = useTimetableStore() as any
  const { sections, staff } = store

  const [activeTab,     setActiveTab]     = useState<NavTab>('dashboard')
  const [activeSideKey, setActiveSideKey] = useState<SideNavKey>('dashboard')
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [userMenuOpen,  setUserMenuOpen]  = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!userMenuOpen) return
    const h = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [userMenuOpen])
  const [showCreate,    setShowCreate]    = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1'
  )
  const [ttList,        setTTList]        = useState<TTEntry[]>(loadTTList)
  // Surfaces a visible banner when the server is unreachable / rejecting our
  // auth, instead of silently degrading to local-only (which looked like data
  // loss with no explanation). Carries the HTTP status when known so a
  // recurring 401 (vs. a network blip) is easy to tell apart at a glance.
  const [syncIssue, setSyncIssue] = useState<string | null>(null)

  // Namespace the local snapshot cache to this user (prevents one account from
  // reading another's cached data in a shared browser). Safe to call on every
  // render — it only sets a module-level string.
  setCacheNS(user?.id)

  // Server-backed: show the local cache instantly, then merge in the server.
  useEffect(() => {
    if (!SERVER_BACKED || !user) return
    let cancelled = false
    // Instant: render any locally-cached drafts so nothing flashes empty.
    const local = loadLocalTTList()
    if (local.length) setTTList(local)
    ttRepo.fetchTimetables()
      .then(async serverList => {
        if (cancelled) return
        let merged = mergeTTLists(serverList as TTEntry[], local)

        const activeId = getActiveTTId()
        const ownsActive = !!activeId && merged.some(t => t.id === activeId)
        const s = useTimetableStore.getState() as any
        const hasRealWork = Boolean(s.config?.timetableName) || (s.sections ?? []).length > 0

        if (!ownsActive && hasRealWork) {
          // Real wizard work with no matching TTEntry (e.g. reached /wizard
          // directly) — adopt it into the list instead of losing it.
          let entry = buildEntryFromCurrentStore(
            activeId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
          )
          if (SERVER_BACKED) {
            try { entry = { ...entry, id: await ttRepo.createTimetable(entry, buildSnapshot()) } }
            catch { /* keep local id; a later save will retry the server sync */ }
          }
          merged = [entry, ...merged]
          setActiveTTId(entry.id)
          saveTTSnapshot(entry.id)
        } else if (!ownsActive && activeId) {
          // Dangling pointer to a deleted/foreign timetable with nothing to
          // recover — safe to clear.
          useTimetableStore.getState().resetAll()
          setActiveTTId(null)
        }

        setTTList(merged)
        saveTTList(merged)
        setSyncIssue(null)
      })
      .catch((err: any) => {
        if (cancelled) return
        const status = err?.response?.status
        setSyncIssue(
          status === 401 ? 'auth-401' : status ? `http-${status}` : 'offline'
        )
        // offline — local cache already shown
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

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
  const handleTTCreated = async (entry: TTEntry) => {
    // Save current timetable's full state before switching away
    const currentId = getActiveTTId()
    if (currentId) saveTTSnapshot(currentId)

    // Server-backed: create the row first so we adopt the server-assigned id
    // as the canonical timetable id (falls back to the local id on failure).
    let saved = entry
    if (SERVER_BACKED) {
      try { saved = { ...entry, id: await ttRepo.createTimetable(entry) } }
      catch { /* offline — keep the local id; snapshot sync will retry later */ }
    }

    const next = [saved, ...ttList]
    setTTList(next)
    saveTTList(next)
    setActiveTTId(saved.id)
    // New timetable: start fresh
    useTimetableStore.getState().resetWizard()
    useTimetableStore.getState().setConfig({
      timetableName: saved.name,
      fromGrade:   saved.fromGrade   ?? 'Nursery',
      toGrade:     saved.toGrade     ?? 'Class XII',
      numSections: saved.approxClasses,
      numStaff:    saved.approxTeachers,
      numSubjects: saved.approxSubjects,
      numRooms:    saved.approxRooms,
    } as any)
    useTimetableStore.getState().setStep(1)
    window.location.href = '/wizard'
  }

  const handleContinue = async (t: TTEntry) => {
    const currentId = getActiveTTId()
    if (currentId === t.id) {
      // Already the active one — just navigate
      window.location.href = '/wizard'
      return
    }
    // Resolve the incoming timetable's state FIRST — only commit the active-id
    // switch once we know what to load. Flipping the pointer before an async
    // restore resolves (as this used to) leaves `schedu-active-tt` pointing at
    // a timetable whose data was never actually loaded into the store — the
    // store still holds the OUTGOING timetable's sections/classTT, so any
    // later save silently overwrites the incoming timetable's real snapshot
    // with the outgoing one's data. That's how one timetable can end up an
    // exact copy of a completely different one.
    let snap: Record<string, unknown> | null = null
    if (SERVER_BACKED) {
      try { snap = (await ttRepo.fetchTimetableSnapshot(t.id)) ?? null } catch { /* fall through to local cache */ }
    }
    if (!snap) {
      try {
        const raw = localStorage.getItem(snapKey(t.id))
        if (raw) snap = JSON.parse(raw)
      } catch { /* ignore */ }
    }

    // Save outgoing timetable's full state
    if (currentId) saveTTSnapshot(currentId)
    setActiveTTId(t.id)
    if (snap) {
      applySnapshot(snap)
    } else {
      // No saved state anywhere for this timetable yet — start fresh rather
      // than leaving the outgoing timetable's data in the store.
      useTimetableStore.getState().resetWizard()
      useTimetableStore.getState().setConfig({ timetableName: t.name } as any)
      useTimetableStore.getState().setStep(Math.max(1, t.wizardStep))
    }
    window.location.href = '/wizard'
  }

  // Open a generated timetable in the full read/edit VIEW (filters, faculty/room
  // toggles, substitution tools) rather than the wizard. Restores the snapshot
  // first so the view is never empty when opened from the dashboard.
  const handleViewTimetable = async (t: TTEntry) => {
    const currentId = getActiveTTId()
    if (currentId !== t.id) {
      // Same ordering fix as handleContinue — resolve state before committing
      // the active-id switch.
      let snap: Record<string, unknown> | null = null
      if (SERVER_BACKED) {
        try { snap = (await ttRepo.fetchTimetableSnapshot(t.id)) ?? null } catch { /* fall through to local cache */ }
      }
      if (!snap) {
        try {
          const raw = localStorage.getItem(snapKey(t.id))
          if (raw) snap = JSON.parse(raw)
        } catch { /* ignore */ }
      }
      if (currentId) saveTTSnapshot(currentId)
      setActiveTTId(t.id)
      if (snap) applySnapshot(snap)
      else useTimetableStore.getState().resetWizard()
    }
    window.location.href = '/timetable'
  }

  // Revert a published timetable back to a draft. Mirrors the publish action:
  // updates the list status (what the dashboard renders) and, if it's the
  // active one, the live store status too.
  const handleUnpublish = (t: TTEntry) => {
    const next = ttList.map(x => x.id === t.id ? { ...x, status: 'draft' as TTStatus } : x)
    setTTList(next)
    saveTTList(next)
    if (SERVER_BACKED) {
      ttRepo.updateTimetableMeta({ ...t, status: 'draft' }).catch(() => { /* best-effort */ })
    }
    if (getActiveTTId() === t.id) useTimetableStore.getState().setTimetableStatus('draft')
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
      `Your generated schedule, staff, classes and subjects are preserved.\n\n` +
      `Please open the schedule and go through Step 2 (Bell Timing) and ` +
      `Step 3 (Class-wise Breaks) to restore the correct lunch break configuration.`
    )
    // Refresh list UI
    setTTList(prev => [...prev])
  }

  const handleDelete = (id: string) => {
    const next = ttList.filter(t => t.id !== id)
    setTTList(next)
    saveTTList(next)
    if (getActiveTTId() === id) {
      setActiveTTId(null)
      // Clear the live store too — leaving its sections/classTT behind (even
      // with no active pointer) makes the "adopt orphaned wizard work" check
      // on the next dashboard load (see the SERVER_BACKED useEffect above)
      // mistake this deleted schedule's leftover in-memory content for real
      // unsaved work and resurrect it as a brand-new phantom schedule.
      useTimetableStore.getState().resetAll()
    }
    setConfirmDelete(null)
    if (SERVER_BACKED) {
      ttRepo.deleteTimetable(id).catch(() => { /* best-effort; row may reappear on next load */ })
    }
  }

  const handleDuplicate = async (tt: TTEntry) => {
    const copy: TTEntry = {
      ...tt,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: `${tt.name} (copy)`,
      status: 'draft',
      createdAt: Date.now(),
    }
    let saved = copy
    if (SERVER_BACKED) {
      try { saved = { ...copy, id: await ttRepo.createTimetable(copy) } } catch { /* keep local id */ }
    }
    // Copy the source timetable's wizard snapshot so the duplicate is a full clone.
    try {
      const raw = localStorage.getItem(snapKey(tt.id))
      if (raw) {
        localStorage.setItem(snapKey(saved.id), raw)
        if (SERVER_BACKED) ttRepo.saveTimetableSnapshot(saved.id, JSON.parse(raw)).catch(() => {})
      }
    } catch { /* ignore */ }
    const next = [saved, ...ttList]
    setTTList(next)
    saveTTList(next)
  }

  const handleSaveEdit = async (updated: TTEntry) => {
    const next = ttList.map(t => t.id === updated.id ? updated : t)
    setTTList(next)
    saveTTList(next)
    if (SERVER_BACKED) ttRepo.updateTimetableMeta(updated).catch(() => { /* best-effort */ })
    setEditingTT(null)

    const ta = updated.approxTeachers
    const ts = updated.approxSubjects
    const tr = updated.approxRooms
    const tc = updated.approxClasses

    /** Trim an array: if cur.length > target → slice; if < → reset to []
     *  (so the wizard's auto-generate step can fill in a fresh count); if
     *  EQUAL, leave it alone. The equal case matters more than it looks —
     *  the modal pre-fills the CURRENT counts, so submitting the form
     *  without changing any number (the common case) must be a no-op, not
     *  silently wipe every resource array to empty. */
    const trimArr = (cur: any[], target: number | undefined) =>
      target == null || cur.length === target ? cur
      : cur.length > target ? cur.slice(0, target)
      : []

    // ── 1. Patch the persisted snapshot for this timetable directly in
    //       localStorage. This handles BOTH the active-timetable case (where
    //       `handleContinue` just navigates without restoring the snapshot) AND
    //       the non-active case (where `restoreTTSnapshot` is called and would
    //       bring back the old counts).
    try {
      const key = snapKey(updated.id)
      const raw = localStorage.getItem(key)
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
      localStorage.setItem(key, JSON.stringify(snap))
      // Awaited (not fire-and-forget): handleContinue below re-fetches this
      // same timetable's snapshot from the server, preferring it over the
      // local cache. If that fetch raced ahead of this save, it could load
      // back the STALE server copy we just corrected — undoing this fix.
      if (SERVER_BACKED) await ttRepo.saveTimetableSnapshot(updated.id, snap).catch(() => { /* best-effort */ })
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
    await handleContinue(updated)
  }

  // Wait for auth to resolve before deciding — otherwise a fresh load (or the
  // OAuth return) briefly sees no user and flashes the login form. Show the
  // branded loader until Clerk has loaded, then redirect only if truly signed out.
  if (!authReady) return <BrandedLoader label="Loading your dashboard…" />
  if (!user) { window.location.href = '/login'; return null }

  const firstName  = user.name?.split(' ')[0] ?? 'there'
  // Generic, type-neutral org identity from the onboarding profile. No
  // 'school'/'CBSE'/year assumptions — only what the user actually entered.
  const orgName = org.name?.trim() || user.schoolName || 'Your organization'
  const orgSubtitle = [orgName, org.kind, org.period].filter(Boolean).join(' · ')
  // Stats are derived from the wizard store, which is per-browser and may hold
  // stale data from a previous account/local testing. Only trust it when the
  // user actually has timetables; otherwise show a clean empty state. This is
  // deterministic (no dependency on the async list fetch / store reset).
  const hasTimetables = ttList.length > 0
  const conflicts     = hasTimetables ? (store.conflicts ?? []).length : 0

  // "Today" stats — actionable, day-specific numbers (what's running, who's
  // out, what still needs a sub) instead of static institution-wide counts
  // that just repeat what the schedules list below already shows.
  //
  // MULTI-ACTIVE: when several schedules are active at once (e.g. I–V and
  // VI–X), aggregate across ALL of them — sums/unions per schedule plus
  // cross-schedule venue clashes on the wall-clock axis. Snapshots are fresh
  // here because the mount effect saves the open schedule's snapshot first.
  const activeBundles = hasTimetables ? loadActiveBundles(user?.id ?? '') : []
  const multiActive = activeBundles.length > 1
  const todaySummary = !hasTimetables ? null
    : multiActive
    ? computeMultiToday(activeBundles, loadLeaves(user?.id ?? ''), conflicts, new Date())
    : computeTodaySummary({
        periods: store.periods ?? [], sections, classTT: store.classTT ?? {}, config: store.config ?? {},
        substitutions: store.substitutions ?? {}, leaves: loadLeaves(user?.id ?? ''),
        conflicts, date: new Date(),
      })
  const onLeaveCount   = todaySummary?.teachersOnLeave.length ?? 0
  const uncoveredCount = todaySummary?.uncoveredSlots.length ?? 0
  const roomClashes    = todaySummary?.roomClashes ?? []
  const fmt12 = (min: number) => { const h = Math.floor(min / 60) % 12 || 12, m = min % 60, ap = Math.floor(min / 60) >= 12 ? 'PM' : 'AM'; return `${h}:${String(m).padStart(2, '0')} ${ap}` }
  const roomClashText = roomClashes[0]
    ? `${roomClashes[0].sections.join(' & ')} share ${roomClashes[0].room} at ${fmt12(roomClashes[0].startMin)}.`
    : undefined

  // "Right now" bridge to the Calendar's Live view: which period is in
  // progress at this minute and how many classes are in session — the
  // dashboard stays a triage surface, Live stays the moment lens.
  const liveNow = (() => {
    if (!hasTimetables || !todaySummary?.isWorkDay) return undefined
    const periods: any[] = store.periods ?? []
    const [sh = 9, sm = 0] = (store.config?.startTime ?? '09:00').split(':').map(Number)
    let mins = sh * 60 + sm
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    for (const p of periods) {
      const end = mins + (p.duration ?? 45)
      if (nowMin >= mins && nowMin < end) {
        if (p.type === 'break') return `${p.name ?? 'Break'} in progress`
        const dk = todaySummary.dayKey
        const inSession = sections.filter((s: any) => store.classTT?.[s.name]?.[dk]?.[p.id]?.subject).length
        return `${p.name ?? 'Period'} · ${inSession} in session`
      }
      mins = end
    }
    return undefined
  })()

  // Distinct venues in play: defined venues unioned with any referenced in the
  // schedule, so the count is truthful even when venues were assigned inline
  // rather than added to the venue list.
  const singleVenueCount = (() => {
    const names = new Set<string>()
    for (const r of (store.rooms ?? [])) {
      const n = r.actualName || r.generatedName || r.name
      if (n) names.add(n)
    }
    for (const days of Object.values(store.classTT ?? {}) as any[]) {
      for (const day of Object.values(days ?? {}) as any[]) {
        for (const cell of Object.values(day ?? {}) as any[]) {
          if (cell?.room) names.add(cell.room)
        }
      }
    }
    return names.size
  })()

  // Union counts across every active schedule when several run at once.
  const multi = multiActive ? (todaySummary as import('@/lib/activeSchedules').MultiToday) : null
  const classCount2   = multi ? multi.classes  : sections.length
  const teacherCount2 = multi ? multi.teachers : staff.length
  const venueCount    = multi ? multi.venues   : singleVenueCount

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

      

      {/* ── Main content ── */}
        <div style={{ padding: '24px 28px' }}>

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
                {orgSubtitle}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setShowCreate(true)}
                className="db-new-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg,#7C6FE0,#5D4FCF)',
                  fontSize: 14, fontWeight: 700, color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 16px rgba(124,111,224,0.28)',
                }}
              >
                <Plus size={16} strokeWidth={2.6} /> New schedule
              </button>
            </div>
          </div>

          {/* Pulse — one plain-language status line + the action that matters */}
          <DashboardPulse
            hasSchedule={hasTimetables}
            isWorkDay={todaySummary?.isWorkDay ?? false}
            periodsToday={todaySummary?.periodsToday ?? 0}
            uncovered={uncoveredCount}
            onLeave={onLeaveCount}
            covered={todaySummary?.coveredSlots.length ?? 0}
            roomClashes={roomClashes.length}
            roomClashText={roomClashText}
            conflicts={conflicts}
            classes={classCount2}
            teachers={teacherCount2}
            venues={venueCount}
            liveNow={liveNow}
            onNewSchedule={() => setShowCreate(true)}
          />

          {/* Timetables */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#13111E' }}>Your schedules</h2>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{ttList.length} total</span>
            </div>

            {syncIssue && (
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
                padding: '10px 14px', marginBottom: 10, fontSize: 12.5, color: '#92400E',
              }}>
                {syncIssue === 'auth-401'
                  ? '⚠️ Couldn’t verify your sign-in with the server (401). Showing locally-saved schedules only — they may not be backed up yet. This usually means the backend auth key is out of date.'
                  : syncIssue === 'offline'
                  ? '⚠️ Couldn’t reach the server — showing locally-saved schedules only.'
                  : `⚠️ Server error (${syncIssue.replace('http-', '')}) — showing locally-saved schedules only.`}
              </div>
            )}

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
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>No schedules yet</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>Click "+ New schedule" to create one</div>
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
                        <TtBtn primary onClick={() => handleViewTimetable(tt)}>View</TtBtn>
                        <TtBtn onClick={() => handleUnpublish(tt)}>Unpublish</TtBtn>
                        <TtBtn onClick={() => {}}>Export</TtBtn>
                      </>
                    )}
                    {tt.status === 'draft' && (
                      <TtBtn primary onClick={() => handleContinue(tt)}>
                        Continue <ArrowRight size={12} />
                      </TtBtn>
                    )}
                    {tt.status === 'archived' && (
                      <TtBtn onClick={() => handleViewTimetable(tt)}>View</TtBtn>
                    )}
                    {/* Restore Data — only when this timetable genuinely has NO saved
                        snapshot (data may have been overwritten by another timetable's
                        config). Active/generated timetables always have one, so this
                        never shows for them. Uses snapKey() — the namespaced key the
                        snapshot is actually stored under. */}
                    {tt.status !== 'active' && !localStorage.getItem(snapKey(tt.id)) && (
                      <TtBtn onClick={() => handleRepairSnapshot(tt)}>
                        🔧 Restore data
                      </TtBtn>
                    )}

                    {/* Edit button — all rows */}
                    <button
                      onClick={() => setEditingTT(tt)}
                      title="Edit schedule settings"
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

                    {/* Duplicate button — all rows */}
                    <button
                      onClick={() => handleDuplicate(tt)}
                      title="Duplicate schedule"
                      style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: '1px solid transparent',
                        cursor: 'pointer', color: '#D1D5DB', transition: 'all 0.13s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#7C6FE0'; e.currentTarget.style.borderColor = '#C4B5FD'; e.currentTarget.style.background = '#F5F3FF' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Copy size={13} />
                    </button>

                    {/* Delete button — all rows */}
                    <button
                      onClick={() => setConfirmDelete(confirmDelete === tt.id ? null : tt.id)}
                      title="Delete schedule"
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

          {/* A calm glance at today's schedule — no toolbar, no filters, just
              today's periods and anything needing attention. The full editor
              (Traditional/Calendar toggle, print, share, substitution, etc.)
              lives at /timetable, one click away, rather than being duplicated
              here. Renders only when an active schedule with data exists. */}
          <DashboardTodayPanel summaryOverride={multiActive ? todaySummary : undefined} />

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
