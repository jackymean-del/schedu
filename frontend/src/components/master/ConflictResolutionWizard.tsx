/**
 * ConflictResolutionWizard — step-by-step modal that walks through each
 * hard conflict and offers concrete, one-click resolution options.
 *
 * For each `double-booking` conflict (most common engine output) the wizard:
 *   1. Identifies the two conflicting sections sharing a teacher/slot
 *   2. Finds alternative teachers who are free at that slot
 *   3. Ranks them by the same AI scoring heuristics as the solver
 *   4. Presents up to 3 options as clickable cards
 *
 * Non-double-booking conflicts are shown with an explanatory card and a
 * Skip button — they typically require a full re-solve to resolve properly.
 *
 * The wizard maintains a local copy of classTT and calls onApplyFixes()
 * with the final updated timetable when the user finishes.
 */

import { useState, useMemo } from 'react'
import type { Conflict, Section, Staff, Subject, Period, ClassTimetable } from '@/types'
import {
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  Users2, ArrowRight, SkipForward, X, Wand2,
} from 'lucide-react'

interface Props {
  conflicts: Conflict[]
  classTT: ClassTimetable
  sections: Section[]
  staff: Staff[]
  subjects: Subject[]
  periods: Period[]
  workDays: string[]
  onClose: () => void
  /** Called with the modified timetable after the user finishes the wizard. */
  onApplyFixes: (updatedClassTT: ClassTimetable) => void
}

interface ResolutionOption {
  id: string
  label: string
  detail: string
  confidence: 'high' | 'medium' | 'low'
  badge?: string
  apply: (tt: ClassTimetable) => ClassTimetable
}

// ── Conflict type labels ─────────────────────────────────
const CONFLICT_LABEL: Record<string, string> = {
  'double-booking':    'Double-booked Teacher',
  'room-clash':        'Room Clash',
  'overload':          'Teacher Overload',
  'missing-ct':        'Missing Class Teacher',
  'student-clash':     'Student Clash',
  'parallel-sync':     'Parallel Sync Error',
  'capacity-exceeded': 'Capacity Exceeded',
  'rule-violation':    'Rule Violation',
}

const CONFIDENCE_COLOR: Record<string, { bg: string; fg: string }> = {
  high:   { bg: '#DCFCE7', fg: '#15803D' },
  medium: { bg: '#FEF3C7', fg: '#92400E' },
  low:    { bg: '#F1F5F9', fg: '#475569' },
}

// ── Generate resolution options for a double-booking conflict ──
function resolveDoubleBooking(
  conflict: Conflict,
  classTT: ClassTimetable,
  staff: Staff[],
  periods: Period[],
  workDays: string[],
): ResolutionOption[] {
  const options: ResolutionOption[] = []
  if (!conflict.teacher || !conflict.day || !conflict.period) return options

  // Find the period object from its name
  const period = periods.find(p => p.name === conflict.period || p.id === conflict.period)
  if (!period) return options

  const day = conflict.day
  const pid = period.id

  // Identify all sections where this teacher is placed at this slot
  const clashingSections: Array<{ secName: string; subject: string }> = []
  Object.entries(classTT).forEach(([secName, secData]) => {
    const cell: any = secData[day]?.[pid]
    if (cell?.teacher === conflict.teacher && !cell.optionalBlockId && !cell.isClassTeacher) {
      clashingSections.push({ secName, subject: cell.subject ?? '' })
    }
  })
  if (clashingSections.length < 2) return options

  // Build a set of teachers busy at this slot (excluding the conflict teacher)
  const busyTeachers = new Set<string>()
  Object.values(classTT).forEach(secData => {
    const cell: any = secData[day]?.[pid]
    if (cell?.teacher && cell.teacher !== conflict.teacher) {
      busyTeachers.add(cell.teacher)
    }
  })

  // Per-teacher weekly loads
  const weeklyLoad: Record<string, number> = {}
  staff.forEach(t => { weeklyLoad[t.name] = 0 })
  Object.values(classTT).forEach(secData => {
    Object.values(secData).forEach((dayData: any) => {
      Object.values(dayData ?? {}).forEach((cell: any) => {
        if (cell?.teacher) weeklyLoad[cell.teacher] = (weeklyLoad[cell.teacher] ?? 0) + 1
      })
    })
  })

  // Score an alternative teacher (simplified — load balance + subject match)
  const scoreAlt = (t: Staff, subjectName: string, sectionName: string): number => {
    const subs: string[] = (t as any).subjects ?? []
    const matchesExact  = subs.includes(`${sectionName}::${subjectName}`)
    const matchesGlobal = subs.includes(subjectName)
    let s = 0
    if (matchesExact)  s += 30
    else if (matchesGlobal) s += 15
    else s -= 50   // wrong subject — heavily penalised
    const load = weeklyLoad[t.name] ?? 0
    s -= load * 2
    const maxWeek = (t as any).maxPeriodsPerWeek ?? 40
    if (load >= maxWeek * 0.9) s -= 40
    // Scope check
    const scope = (t as any).scope
    if (scope) {
      const st = scope.cells?.[day]?.[pid] ?? 'allowed'
      if (st === 'locked') s -= 999
      if (st === 'disabled') s -= 10
    }
    return s
  }

  // For each clashing section (except the first — first one keeps the teacher),
  // find alternative teachers
  for (let i = 1; i < Math.min(clashingSections.length, 3); i++) {
    const { secName, subject } = clashingSections[i]
    const alts = staff
      .filter(t => t.name !== conflict.teacher && !busyTeachers.has(t.name))
      .map(t => ({ t, s: scoreAlt(t, subject, secName) }))
      .filter(x => x.s > -50)  // skip scope-locked and wrong-subject-only
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)

    alts.forEach(({ t, s }) => {
      const confidence: ResolutionOption['confidence'] =
        s >= 25 ? 'high' : s >= 0 ? 'medium' : 'low'
      const subs: string[] = (t as any).subjects ?? []
      const teachesSubject = subs.includes(subject) || subs.includes(`${secName}::${subject}`)
      options.push({
        id: `alt-${secName}-${t.name}`,
        label: `Assign ${t.name} → ${secName}`,
        detail: teachesSubject
          ? `${t.name} teaches ${subject} · ${weeklyLoad[t.name] ?? 0} periods this week`
          : `${t.name} is free at this slot (no ${subject} match — verify eligibility)`,
        confidence,
        badge: teachesSubject ? 'Subject match' : 'Available',
        apply: (tt: ClassTimetable): ClassTimetable => {
          const next: ClassTimetable = JSON.parse(JSON.stringify(tt))
          if (next[secName]?.[day]?.[pid]) {
            ;(next[secName][day] as any)[pid] = {
              ...(next[secName][day] as any)[pid],
              teacher: t.name,
            }
          }
          return next
        },
      })
    })
  }

  // If we couldn't find any alternatives, suggest moving one section's slot
  if (options.length === 0) {
    const { secName, subject } = clashingSections[1]
    // Find an empty slot for this section
    for (const altDay of workDays) {
      for (const altPeriod of periods.filter(p => p.type === 'class')) {
        if (altDay === day && altPeriod.id === pid) continue
        const existing: any = classTT[secName]?.[altDay]?.[altPeriod.id]
        if (!existing?.subject) {
          // Check if conflict teacher is free at alternative slot
          const teacherFreeAlt = !Object.values(classTT).some(sd => {
            const c: any = sd[altDay]?.[altPeriod.id]
            return c?.teacher === conflict.teacher
          })
          if (teacherFreeAlt) {
            options.push({
              id: `move-${secName}-${altDay}-${altPeriod.id}`,
              label: `Move ${secName} → ${altDay} ${altPeriod.name}`,
              detail: `Move ${subject} for ${secName} from ${day} ${period.name} to ${altDay} ${altPeriod.name} (currently empty)`,
              confidence: 'medium',
              badge: 'Move slot',
              apply: (tt: ClassTimetable): ClassTimetable => {
                const next: ClassTimetable = JSON.parse(JSON.stringify(tt))
                const cell = (next[secName]?.[day] as any)?.[pid]
                if (!cell) return next
                ;(next[secName][altDay] as any)[altPeriod.id] = { ...cell }
                ;(next[secName][day] as any)[pid] = {}
                return next
              },
            })
            if (options.length >= 2) break
          }
        }
      }
      if (options.length >= 2) break
    }
  }

  return options
}

// ── Main wizard component ────────────────────────────────
export function ConflictResolutionWizard({
  conflicts, classTT, sections, staff, subjects, periods, workDays,
  onClose, onApplyFixes,
}: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [localTT, setLocalTT] = useState<ClassTimetable>(() =>
    JSON.parse(JSON.stringify(classTT))
  )
  const [resolvedSet, setResolvedSet] = useState<Set<number>>(new Set())
  const [skippedSet,  setSkippedSet]  = useState<Set<number>>(new Set())
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const conflict = conflicts[currentIdx]
  const isLast   = currentIdx === conflicts.length - 1

  // Generate options for the current conflict
  const options = useMemo<ResolutionOption[]>(() => {
    if (!conflict) return []
    if (conflict.type === 'double-booking') {
      return resolveDoubleBooking(conflict, localTT, staff, periods, workDays)
    }
    return []
  }, [conflict, localTT, staff, periods, workDays])

  const handleApply = () => {
    if (!selectedOpt) return
    const opt = options.find(o => o.id === selectedOpt)
    if (!opt) return
    const updated = opt.apply(localTT)
    setLocalTT(updated)
    setResolvedSet(prev => new Set(prev).add(currentIdx))
    setSelectedOpt(null)
    if (isLast) setFinished(true)
    else setCurrentIdx(i => i + 1)
  }

  const handleSkip = () => {
    setSkippedSet(prev => new Set(prev).add(currentIdx))
    setSelectedOpt(null)
    if (isLast) setFinished(true)
    else setCurrentIdx(i => i + 1)
  }

  const handleFinish = () => {
    onApplyFixes(localTT)
    onClose()
  }

  const progressPct = Math.round(((resolvedSet.size + skippedSet.size) / conflicts.length) * 100)

  // ── Finished screen ──
  if (finished) {
    return (
      <Backdrop onClose={onClose}>
        <div style={{ textAlign: 'center' as const, padding: '8px 0 4px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: resolvedSet.size > 0 ? '#DCFCE7' : '#FEF3C7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            {resolvedSet.size > 0
              ? <CheckCircle2 size={26} color="#15803D" />
              : <AlertTriangle size={26} color="#92400E" />}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#13111E', marginBottom: 6 }}>
            {resolvedSet.size > 0 ? 'Conflicts addressed' : 'All skipped'}
          </div>
          <div style={{ fontSize: 12, color: '#4B5275', marginBottom: 20 }}>
            <strong style={{ color: '#15803D' }}>{resolvedSet.size}</strong> resolved ·{' '}
            <strong style={{ color: '#92400E' }}>{skippedSet.size}</strong> skipped ·{' '}
            {conflicts.length} total
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={onClose} style={btnGhost}>Close without applying</button>
            {resolvedSet.size > 0 && (
              <button onClick={handleFinish} style={btnPrimary}>
                <CheckCircle2 size={13} /> Apply {resolvedSet.size} fix{resolvedSet.size !== 1 ? 'es' : ''}
              </button>
            )}
          </div>
        </div>
      </Backdrop>
    )
  }

  // ── Per-conflict screen ──
  return (
    <Backdrop onClose={onClose}>
      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10.5, color: '#8B87AD' }}>
          <span style={{ fontWeight: 700, color: '#7C6FE0' }}>
            Conflict {currentIdx + 1} of {conflicts.length}
          </span>
          <span>{resolvedSet.size} resolved · {skippedSet.size} skipped</span>
        </div>
        <div style={{ height: 4, background: '#F1EFFF', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #7C6FE0, #A78BFA)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Conflict card */}
      <div style={{
        background: '#FFF5F5', border: '1px solid #FECACA',
        borderRadius: 10, padding: '12px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <AlertTriangle size={13} color="#DC2626" />
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase' as const, color: '#DC2626',
          }}>
            {CONFLICT_LABEL[conflict.type] ?? conflict.type}
          </span>
          {resolvedSet.has(currentIdx) && (
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '1px 7px', borderRadius: 8 }}>
              ✓ Fixed
            </span>
          )}
          {skippedSet.has(currentIdx) && (
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 7px', borderRadius: 8 }}>
              Skipped
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#13111E', marginBottom: 6, lineHeight: 1.45 }}>
          {conflict.message}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {conflict.teacher && (
            <Meta icon={<Users2 size={10} />} label={conflict.teacher} />
          )}
          {conflict.day && (
            <Meta icon={<span style={{ fontSize: 10 }}>📅</span>} label={conflict.day} />
          )}
          {conflict.period && (
            <Meta icon={<span style={{ fontSize: 10 }}>🕐</span>} label={conflict.period} />
          )}
        </div>
      </div>

      {/* Resolution options */}
      {options.length > 0 ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#7C6FE0', marginBottom: 8 }}>
            Resolution Options
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7, marginBottom: 16 }}>
            {options.map(opt => {
              const cc = CONFIDENCE_COLOR[opt.confidence]
              const isSelected = selectedOpt === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedOpt(isSelected ? null : opt.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', borderRadius: 9, textAlign: 'left' as const,
                    border: isSelected ? '2px solid #7C6FE0' : '1.5px solid #ECEAFB',
                    background: isSelected ? '#EDE9FF' : '#FAFAFE',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* Selection indicator */}
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    border: isSelected ? '4px solid #7C6FE0' : '1.5px solid #D8D2FF',
                    background: isSelected ? '#7C6FE0' : '#fff',
                    transition: 'all 0.15s',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#13111E' }}>
                        {opt.label}
                      </span>
                      {opt.badge && (
                        <span style={{
                          fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em',
                          padding: '1px 6px', borderRadius: 8,
                          background: cc.bg, color: cc.fg,
                          textTransform: 'uppercase' as const,
                        }}>
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#4B5275', lineHeight: 1.4 }}>
                      {opt.detail}
                    </div>
                  </div>
                  {isSelected && <ArrowRight size={14} color="#7C6FE0" style={{ flexShrink: 0, marginTop: 2 }} />}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div style={{
          padding: '12px 14px', borderRadius: 9,
          background: '#FFFBEB', border: '1px solid #FDE68A',
          marginBottom: 16, fontSize: 11.5, color: '#92400E', lineHeight: 1.5,
        }}>
          <strong>No automatic fix available.</strong> This conflict type ({CONFLICT_LABEL[conflict.type] ?? conflict.type})
          {' '}requires a full re-solve or manual timetable editing to resolve.
          Use the Skip button to continue reviewing other conflicts.
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {currentIdx > 0 && (
          <button
            onClick={() => { setCurrentIdx(i => i - 1); setSelectedOpt(null) }}
            style={btnGhost}
            title="Go back to previous conflict"
          >
            <ChevronLeft size={13} /> Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSkip}
          style={{ ...btnGhost, gap: 5 }}
          title="Skip this conflict without applying a fix"
        >
          <SkipForward size={12} />
          {isLast ? 'Skip & Finish' : 'Skip'}
        </button>
        {options.length > 0 && (
          <button
            onClick={handleApply}
            disabled={!selectedOpt}
            style={{
              ...btnPrimary,
              opacity: selectedOpt ? 1 : 0.4,
              cursor: selectedOpt ? 'pointer' : 'default',
            }}
            title={selectedOpt ? 'Apply selected fix' : 'Select an option above first'}
          >
            <Wand2 size={12} />
            {isLast ? 'Apply & Finish' : 'Apply & Next'}
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </Backdrop>
  )
}

// ── Sub-components ───────────────────────────────────────

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(19,17,30,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 520,
          padding: '22px 22px 20px',
          boxShadow: '0 24px 60px rgba(19,17,30,0.3)',
          fontFamily: "'Hanken Grotesk', sans-serif",
          maxHeight: '90vh', overflowY: 'auto' as const,
          position: 'relative' as const,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute' as const, top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8B87AD', padding: 4, borderRadius: 6, lineHeight: 1,
          }}
          title="Close wizard"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: '#EDE9FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wand2 size={14} color="#7C6FE0" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#13111E' }}>
            Conflict Resolution
          </span>
        </div>

        {children}
      </div>
    </div>
  )
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 8,
      background: '#FEE2E2', color: '#991B1B',
      fontSize: 10, fontWeight: 600,
    }}>
      {icon}{label}
    </span>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 14px', borderRadius: 8, border: 'none',
  background: '#7C6FE0', color: '#fff',
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 8, border: '1px solid #ECEAFB',
  background: '#fff', color: '#4B5275',
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
}
