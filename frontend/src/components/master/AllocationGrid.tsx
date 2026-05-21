/**
 * AllocationGrid — Class × Subject period allocation matrix.
 *
 * Spec: schedU Doc Part 1.
 *
 * Each cell holds a compact allocation syntax string:
 *   "5"   "5+1"   "3(2X)"   "2L"   "6T"
 *
 * Live features:
 *   - Compact cells (minimal padding, monospace value)
 *   - Per-row "Used / Cap" badge with utilisation bar
 *   - AI Suggest fills conflict-free defaults (scales to capacity)
 *   - Period / Hours display toggle via displayMode prop
 *   - All DataGrid features (paste, transpose, CSV, undo, etc.)
 */

import { useMemo, useState } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { Subject, Section, Period } from '@/types'
import { DataGrid, DataGridColumn } from '@/components/DataGrid/DataGrid'
import {
  parseAllocation, validateAllocationCapacity,
} from '@/lib/allocationSyntax'
import {
  computeCapacity, capacityForSection, inferBandFromSection,
  utilisationStatus,
} from '@/lib/capacityEngine'
import { Sparkles, Grid3x3, Trophy } from 'lucide-react'
import { CandidateComparisonModal } from './CandidateComparisonModal'

interface Props {
  displayMode?: 'periods' | 'hours'
  periodMinutes?: number
}

interface Row {
  sectionName: string
  grade?: string
  stream?: string
  __sectionId: string
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  empty:  { bg: '#F8F7FF', fg: '#B0B0C0', border: '#ECEAFB', label: 'Empty' },
  light:  { bg: '#EFF6FF', fg: '#1D4ED8', border: '#DBEAFE', label: 'Light' },
  ok:     { bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0', label: 'OK'    },
  tight:  { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A', label: 'Tight' },
  over:   { bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA', label: 'Over'  },
}

export function AllocationGrid({ displayMode = 'periods', periodMinutes = 40 }: Props) {
  const store = useTimetableStore() as any
  const { sections, subjects, subjectAllocations, config } = store
  const periods: Period[] = store.periods ?? []
  const workDays: string[] = config?.workDays ?? ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']

  const [compareTarget, setCompareTarget] = useState<{ section: Section; subject: Subject } | null>(null)

  const cap = useMemo(() => computeCapacity(workDays, periods), [workDays, periods])

  // Per-section row total
  const rowTotals = useMemo(() => {
    const m: Record<string, number> = {}
    sections.forEach((sec: Section) => {
      const row = subjectAllocations[sec.name] ?? {}
      let total = 0
      subjects.forEach((sub: Subject) => {
        const raw = row[sub.name] ?? (sub.periodsPerWeek ? String(sub.periodsPerWeek) : '')
        if (!raw) return
        const parsed = parseAllocation(raw)
        if (parsed.valid) total += parsed.weeklyTotal
      })
      m[sec.name] = total
    })
    return m
  }, [sections, subjects, subjectAllocations])

  // Build rows
  const rows: Row[] = useMemo(() => sections.map((sec: any) => ({
    sectionName: sec.name,
    grade: sec.grade,
    stream: (sec as any).stream,
    __sectionId: sec.id,
  })), [sections])

  // Helpers for display mode conversion
  const toDisplay = (periods: number) =>
    displayMode === 'hours'
      ? `${Math.round(periods * periodMinutes / 60 * 10) / 10}h`
      : String(periods)

  // Build columns
  const columns: DataGridColumn<Row>[] = useMemo(() => {
    const base: DataGridColumn<Row>[] = [
      {
        key: 'sectionName', label: 'Section', type: 'text',
        sticky: true, width: 110, readonly: true,
      },
      {
        key: '__usage', label: 'Used / Cap', type: 'computed', width: 120, readonly: true,
        format: (row) => {
          const band = inferBandFromSection(row.sectionName)
          const c = capacityForSection(cap, band)
          const u = rowTotals[row.sectionName] ?? 0
          return displayMode === 'hours'
            ? `${Math.round(u * periodMinutes / 60 * 10) / 10}h / ${Math.round(c * periodMinutes / 60 * 10) / 10}h`
            : `${u} / ${c}`
        },
        render: (_, row) => {
          const band = inferBandFromSection(row.sectionName)
          const c = capacityForSection(cap, band)
          const u = rowTotals[row.sectionName] ?? 0
          const status = utilisationStatus(u, c)
          const s = STATUS_STYLE[status]
          const pct = c > 0 ? Math.min(100, Math.round((u / c) * 100)) : 0
          const barColor = status === 'over' ? '#DC2626' : status === 'tight' ? '#D97706' : status === 'ok' ? '#16A34A' : '#7C6FE0'
          const uLabel = displayMode === 'hours' ? `${Math.round(u * periodMinutes / 60 * 10) / 10}h` : String(u)
          const cLabel = displayMode === 'hours' ? `${Math.round(c * periodMinutes / 60 * 10) / 10}h` : String(c)
          return (
            <div style={{ padding: '4px 10px', minWidth: 100 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#13111E', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.3px' }}>
                  {uLabel} / {cLabel}
                </span>
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: '0.03em',
                  padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' as const,
                  background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
                }}>
                  {s.label.toUpperCase()}
                </span>
              </div>
              <div style={{ height: 2, background: '#F0EDFF', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 0.2s' }} />
              </div>
            </div>
          )
        },
      },
    ]

    subjects.forEach((sub: Subject) => {
      base.push({
        key: `subj:${sub.name}`,
        label: sub.shortName ?? sub.name,
        type: 'text',
        minWidth: 72,
        align: 'right',
        placeholder: sub.periodsPerWeek ? String(sub.periodsPerWeek) : '—',
        getValue: (r) => subjectAllocations[r.sectionName]?.[sub.name] ?? '',
        setValue: (r, v) => {
          store.setSubjectAllocationCell?.(r.sectionName, sub.name, String(v ?? ''))
          return r
        },
        render: (rawValue, row) => {
          const stored = subjectAllocations[row.sectionName]?.[sub.name]
          const isStored = !!stored
          const defaultPw = sub.periodsPerWeek
          const display = stored ?? (defaultPw ? String(defaultPw) : '')
          const parsed = display ? parseAllocation(display) : null
          const band = inferBandFromSection(row.sectionName)
          const cellCap = capacityForSection(cap, band)
          const validation = parsed?.valid
            ? validateAllocationCapacity(parsed, cellCap)
            : { ok: false, reason: parsed?.error ?? 'empty' }
          const invalid = !!display && parsed && !parsed.valid
          const overCap = !!display && parsed && parsed.valid && !validation.ok

          // Convert to display unit
          const displayVal = (() => {
            if (!display) return ''
            if (displayMode === 'hours' && parsed?.valid && parsed.weeklyTotal > 0) {
              return `${Math.round(parsed.weeklyTotal * periodMinutes / 60 * 10) / 10}h`
            }
            return display
          })()

          return (
            <div style={{
              padding: '3px 8px',
              textAlign: 'right' as const,
              position: 'relative' as const,
              background: invalid ? '#FEF2F2' : overCap ? '#FFFBEB' : 'transparent',
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 12, fontWeight: 700,
                color: invalid ? '#DC2626' : overCap ? '#D97706' : isStored ? '#13111E' : '#C0BBEE',
              }}>
                {displayVal
                  ? displayVal
                  : <span style={{ color: '#E0DCF5', fontWeight: 400, fontSize: 10 }}>—</span>
                }
              </span>
              {/* tiny weekly-total indicator top-right, periods mode only */}
              {displayMode === 'periods' && parsed?.valid && isStored && (
                <span style={{
                  position: 'absolute' as const, top: 1, right: 3,
                  fontSize: 7, fontWeight: 800,
                  color: parsed.weeklyTotal > 6 ? '#7C6FE0' : '#16A34A',
                  pointerEvents: 'none' as const,
                }}>
                  {parsed.weeklyTotal}
                </span>
              )}
              {invalid && (
                <span style={{
                  position: 'absolute' as const, top: 2, right: 4,
                  fontSize: 9, fontWeight: 800, color: '#DC2626',
                  pointerEvents: 'none' as const,
                }}>!</span>
              )}
              {/* Compare-candidates trophy icon */}
              {parsed?.valid && parsed.weeklyTotal > 0 && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    const sec = (sections as Section[]).find((s: Section) => s.name === row.sectionName)
                    if (sec) setCompareTarget({ section: sec, subject: sub })
                  }}
                  title="Compare candidate teachers"
                  style={{
                    position: 'absolute' as const, top: '50%', left: 3,
                    transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', padding: 1,
                    cursor: 'pointer', color: '#C4BAF5',
                    display: 'inline-flex', alignItems: 'center',
                    opacity: 0, transition: 'opacity 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.color = '#7C6FE0' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}
                >
                  <Trophy size={9} />
                </button>
              )}
            </div>
          )
        },
      })
    })

    return base
  }, [subjects, sections, cap, rowTotals, subjectAllocations, store, displayMode, periodMinutes])

  // ── AI Suggest — conflict-free defaults ──────────────────────
  // Scales periods proportionally so the section total never exceeds its capacity.
  const handleAISuggest = () => {
    const next: Record<string, Record<string, string>> = {}

    sections.forEach((sec: Section) => {
      const band = inferBandFromSection(sec.name)
      const capacity = capacityForSection(cap, band)

      // Subjects that have a default periodsPerWeek
      interface IdealItem { name: string; pw: number; isLab: boolean }
      const ideal: IdealItem[] = (subjects as Subject[])
        .filter((sub: Subject) => sub.periodsPerWeek && sub.periodsPerWeek > 0)
        .map((sub: Subject) => ({
          name: sub.name,
          pw: sub.periodsPerWeek!,
          isLab: !!(sub as any).requiresLab,
        }))

      const totalIdeal = ideal.reduce((a, s) => a + s.pw, 0)
      const row: Record<string, string> = {}

      if (ideal.length === 0) return

      if (capacity <= 0 || totalIdeal <= capacity) {
        // Everything fits — use as-is
        ideal.forEach(s => {
          row[s.name] = s.isLab
            ? `${Math.max(1, s.pw - 1)}+1L`
            : String(s.pw)
        })
      } else {
        // Scale proportionally so total === capacity (no conflicts)
        const scale = capacity / totalIdeal
        let allocated = 0
        ideal.forEach((s, i) => {
          const isLast = i === ideal.length - 1
          const raw = isLast
            ? Math.max(0, capacity - allocated)
            : Math.max(1, Math.round(s.pw * scale))
          if (raw > 0) row[s.name] = String(raw)
          allocated += raw
        })
      }

      if (Object.keys(row).length) next[sec.name] = row
    })

    store.setSubjectAllocations?.(next)
  }

  const handleChange = (_newRows: Row[]) => { /* writes are per-cell via setValue */ }

  return (
    <div>
      {/* Capacity banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const,
        padding: '8px 12px', marginBottom: 10,
        background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
        border: '1px solid #D8D2FF', borderRadius: 8,
      }}>
        <Grid3x3 size={13} color="#7C6FE0" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#13111E', fontFamily: "'DM Mono', monospace" }}>
          {displayMode === 'hours'
            ? `${Math.round(cap.weeklyCapacity * periodMinutes / 60 * 10) / 10}h/week`
            : `${cap.weeklyCapacity} periods/week`
          }
        </span>
        <span style={{ fontSize: 10, color: '#4B5275' }}>
          {cap.workingDays} days × {cap.teachingPeriodsPerDay} periods
          {cap.breakPeriodsPerDay > 0 && ` − ${cap.breakPeriodsPerDay} break/day`}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={handleAISuggest}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, border: 'none',
            background: '#7C6FE0', color: '#fff', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <Sparkles size={11} /> Suggest defaults
        </button>
      </div>

      {/* Syntax legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 10, color: '#4B5275', flexWrap: 'wrap' as const }}>
        {[['5', 'theory'], ['5+1', '+ lab'], ['3(2X)', 'doubles'], ['2L', 'lab only']].map(([s, d]) => (
          <span key={s}>
            <strong style={{ fontFamily: "'DM Mono', monospace", color: '#13111E' }}>{s}</strong>
            {' '}{d}
          </span>
        ))}
      </div>

      <DataGrid<Row>
        title="Period Allocation"
        description="Periods per subject per section. Type cell syntax (e.g. 5+1) — AI engine derives the rest."
        icon={<Grid3x3 size={16} />}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.__sectionId}
        onChange={handleChange}
        toolbar={{
          add: false, importCSV: true, exportCSV: true,
          paste: true, search: true, transpose: true, bulkActions: true,
        }}
      />

      {compareTarget && (
        <CandidateComparisonModal
          section={compareTarget.section}
          subject={compareTarget.subject}
          onClose={() => setCompareTarget(null)}
        />
      )}
    </div>
  )
}
