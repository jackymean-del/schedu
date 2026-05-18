/**
 * DLGInspector — visualises the Dynamic Learning Groups produced by
 * the engine. Shows how the solver pooled sections per subject,
 * which behavior rule governed each pool, and whether any pool was
 * cap-split because of room capacity.
 *
 * Closes the Doc Part 3 visualisation loop: the user can SEE the
 * cross-class scheduling decisions, not just trust them.
 */

import { useMemo } from 'react'
import type { Period } from '@/types'
import type { DynamicLearningGroup } from '@/lib/schedulingEngine'
import { getSubjectColor } from '@/lib/orgData'
import {
  Layers, Calendar as CalendarIcon, Users2, MapPin,
  AlertTriangle, CheckCircle2, Sparkles,
} from 'lucide-react'

const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

const BEHAVIOR_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  NO_GROUPING:         { bg: '#F1F5F9', fg: '#475569', label: 'Isolated' },
  SAME_GRADE_ONLY:     { bg: '#FEF3C7', fg: '#92400E', label: 'Same grade' },
  CROSS_GRADE_ALLOWED: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Cross grade' },
  FLEXIBLE_GROUPING:   { bg: '#EDE9FF', fg: '#7C6FE0', label: 'Flexible' },
}

interface Props {
  dlgs: DynamicLearningGroup[]
  periods: Period[]
  rooms?: Array<{ actualName?: string; generatedName?: string; name?: string; capacity?: number }>
}

export function DLGInspector({ dlgs, periods, rooms = [] }: Props) {
  // Group DLGs by (day, periodId) — DLGs that share a slot form a parallel block
  const groupedByBlock = useMemo(() => {
    const m = new Map<string, DynamicLearningGroup[]>()
    dlgs.forEach(d => {
      const key = `${d.day}|${d.periodId}`
      const arr = m.get(key) ?? []
      arr.push(d)
      m.set(key, arr)
    })
    return Array.from(m.entries()).map(([key, items]) => {
      const [day, periodId] = key.split('|')
      return { day, periodId, items }
    })
  }, [dlgs])

  // Room capacity lookup
  const roomCapByName = useMemo(() => {
    const m = new Map<string, number>()
    rooms.forEach(r => {
      const name = r.actualName ?? r.name ?? r.generatedName
      if (name && r.capacity && r.capacity > 0) m.set(name, r.capacity)
    })
    return m
  }, [rooms])

  // Stats
  const totalBlocks = groupedByBlock.length
  const splitBlocks = groupedByBlock.filter(b => b.items.some(d => d.behavior.includes('+cap-split'))).length
  const totalSectionsServed = useMemo(() => {
    const s = new Set<string>()
    dlgs.forEach(d => d.sectionNames.forEach(n => s.add(n)))
    return s.size
  }, [dlgs])

  if (dlgs.length === 0) {
    return (
      <div style={{ flex: 1, padding: '24px 16px', textAlign: 'center' as const, color: '#8B87AD' }}>
        <Layers size={28} color="#D8D2FF" style={{ margin: '0 auto 10px', display: 'block' }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>
          No Dynamic Learning Groups
        </div>
        <div style={{ fontSize: 11 }}>
          When sections offer optional subjects, the engine pools them here. Add a Section Strengths matrix to populate this.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Summary banner */}
      <div style={{
        display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center',
        padding: '10px 14px', marginBottom: 12,
        background: 'linear-gradient(135deg, #EDE9FF 0%, #FAFAFE 100%)',
        border: '1px solid #D8D2FF', borderRadius: 10,
      }}>
        <Layers size={14} color="#7C6FE0" />
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase' as const, color: '#7C6FE0',
        }}>
          DLG Inspector
        </span>
        <StatPill label="Groups"   value={dlgs.length} color="#7C6FE0" />
        <StatPill label="Blocks"   value={totalBlocks} color="#9B8EF5" />
        <StatPill label="Sections" value={totalSectionsServed} color="#0EA5E9" />
        {splitBlocks > 0 && (
          <StatPill label="Cap-split" value={splitBlocks} color="#D4920E" />
        )}
      </div>

      {/* Blocks list */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {groupedByBlock.map((block, i) => (
          <BlockCard
            key={`${block.day}|${block.periodId}`}
            block={block}
            index={i + 1}
            periodName={periods.find(p => p.id === block.periodId)?.name ?? block.periodId}
            roomCapByName={roomCapByName}
          />
        ))}
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 12,
      background: `${color}14`, color, border: `1px solid ${color}33`,
      fontSize: 10.5, fontWeight: 700,
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace" }}>{value}</span>
    </span>
  )
}

function BlockCard({
  block, index, periodName, roomCapByName,
}: {
  block: { day: string; periodId: string; items: DynamicLearningGroup[] }
  index: number
  periodName: string
  roomCapByName: Map<string, number>
}) {
  const allSections = useMemo(() => {
    const s = new Set<string>()
    block.items.forEach(d => d.sectionNames.forEach(n => s.add(n)))
    return Array.from(s).sort()
  }, [block.items])

  const isSplit = block.items.some(d => d.behavior.includes('+cap-split'))

  return (
    <div style={{
      background: '#fff', border: '1px solid #ECEAFB', borderRadius: 12,
      overflow: 'hidden' as const,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #F3F1FF',
        background: '#FAFAFE',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
      }}>
        <span style={{
          padding: '3px 10px', borderRadius: 10,
          background: '#EDE9FF', color: '#7C6FE0',
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
          fontFamily: "'DM Mono', monospace",
        }}>
          BLOCK {index}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#13111E' }}>
          <CalendarIcon size={11} color="#7C6FE0" />
          {DAY_LABEL[block.day] ?? block.day} · {periodName}
        </span>
        <span style={{ color: '#D8D2FF' }}>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4B5275' }}>
          <Users2 size={11} />
          {allSections.length} section{allSections.length !== 1 ? 's' : ''}
        </span>
        {isSplit && (
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
          }}>
            CAP-SPLIT
          </span>
        )}
      </div>

      {/* Sections pooled */}
      <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
        {allSections.map(s => (
          <span key={s} style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            background: '#fff', color: '#7C6FE0', border: '1px solid #D8D2FF',
            letterSpacing: '0.03em',
          }}>
            {s}
          </span>
        ))}
      </div>

      {/* Parallel options */}
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const, color: '#8B87AD', marginBottom: 2,
        }}>
          Parallel options ({block.items.length})
        </div>
        {block.items.map(dlg => (
          <OptionRow key={dlg.id} dlg={dlg} roomCap={roomCapByName.get(dlg.room)} />
        ))}
      </div>
    </div>
  )
}

function OptionRow({ dlg, roomCap }: { dlg: DynamicLearningGroup; roomCap?: number }) {
  const colorClass = getSubjectColor(dlg.subject)
  const overflow = roomCap != null && dlg.totalStrength > roomCap
  const tight = roomCap != null && !overflow && dlg.totalStrength >= roomCap * 0.9
  const utilization = roomCap != null && roomCap > 0
    ? Math.min(100, Math.round((dlg.totalStrength / roomCap) * 100))
    : null
  const behaviorBase = dlg.behavior.split('+')[0]
  const bStyle = BEHAVIOR_STYLE[behaviorBase] ?? BEHAVIOR_STYLE.FLEXIBLE_GROUPING

  return (
    <div className={colorClass} style={{
      borderRadius: 8, padding: '8px 11px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#13111E' }}>
            {dlg.subject}
          </span>
          <span style={{
            padding: '1px 7px', borderRadius: 8,
            background: bStyle.bg, color: bStyle.fg,
            fontSize: 8.5, fontWeight: 800, letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
          }}>
            {bStyle.label}
          </span>
        </div>
        <div style={{
          fontSize: 10, color: '#4B5275', marginTop: 3,
          display: 'flex', flexWrap: 'wrap' as const, gap: 10,
        }}>
          {dlg.teacher && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Users2 size={10} /> {dlg.teacher}
            </span>
          )}
          {dlg.room && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontFamily: "'DM Mono', monospace",
            }}>
              <MapPin size={10} /> {dlg.room}
            </span>
          )}
        </div>
      </div>

      {/* Capacity gauge */}
      <div style={{ flexShrink: 0, textAlign: 'right' as const, minWidth: 100 }}>
        <div style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
          color: overflow ? '#DC2626' : tight ? '#D4920E' : '#13111E',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
        }}>
          {overflow && <AlertTriangle size={10} />}
          {!overflow && roomCap != null && <CheckCircle2 size={10} color={tight ? '#D4920E' : '#16A34A'} />}
          {dlg.totalStrength}
          {roomCap != null && <span style={{ color: '#8B87AD' }}> / {roomCap}</span>}
        </div>
        {utilization != null && (
          <div style={{ height: 3, background: '#F5F2FF', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${utilization}%`,
              background: overflow ? '#DC2626' : tight ? '#D4920E' : '#16A34A',
              transition: 'width 0.25s',
            }} />
          </div>
        )}
        {roomCap == null && dlg.totalStrength > 0 && (
          <div style={{ fontSize: 9, color: '#B8B4D4', marginTop: 3, fontStyle: 'italic' as const }}>
            no room cap
          </div>
        )}
      </div>
    </div>
  )
}
