/**
 * Step 3 — Allocation
 *
 * Three sub-tabs:
 *   1. Period Allocation      — Class × Subject periods-per-week matrix
 *   2. Teacher Allocation     — Mockup-style teacher summary (type chips, load bars)
 *   3. Teacher Availability   — Pre-solve per-teacher day × period matrix
 *
 * Includes Back / Next navigation.
 */

import { useState } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { AllocationGrid } from '@/components/master/AllocationGrid'
import { TeacherAllocationSummary } from '@/components/master/TeacherAllocationSummary'
import { TeacherAvailabilityEditor } from '@/components/master/TeacherAvailabilityEditor'
import { Grid3x3, Users, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'

type Sub = 'periods' | 'teachers' | 'availability'

export function StepAllocation() {
  const { setStep, subjectAllocations } = useTimetableStore() as any
  const [sub, setSub] = useState<Sub>('periods')

  // At least one allocation cell filled → can proceed
  const hasAllocations = Object.values(subjectAllocations ?? {}).some(
    (row: any) => Object.values(row ?? {}).some((v: any) => v && String(v).trim() !== '')
  )

  return (
    <div style={{ padding: '20px 24px 24px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Grid3x3 size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Allocation
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            <em style={{ color: '#7C6FE0' }}>AI</em> uses both matrices: periods drive how long each subject runs, teacher allocation drives who teaches what.
            {' '}<span style={{ fontFamily: "'DM Mono', monospace", color: '#8B87AD', fontSize: 11 }}>
              Syntax: 5 | 5+1 | 3(2X) | 2L
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 14,
        background: '#F8F7FF', padding: 4, borderRadius: 10, width: 'fit-content',
      }}>
        <SubTab active={sub === 'periods'}      onClick={() => setSub('periods')}      icon={<Grid3x3      size={13} />} label="Period Allocation" />
        <SubTab active={sub === 'teachers'}     onClick={() => setSub('teachers')}     icon={<Users        size={13} />} label="Teacher Allocation" />
        <SubTab active={sub === 'availability'} onClick={() => setSub('availability')} icon={<CalendarCheck size={13} />} label="Availability" />
      </div>

      {/* Tab content */}
      {sub === 'periods'      && <AllocationGrid />}
      {sub === 'teachers'     && <TeacherAllocationSummary />}
      {sub === 'availability' && <TeacherAvailabilityEditor />}

      {/* Navigation footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0EDFF',
      }}>
        <button onClick={() => setStep(2)} style={btnSecondary}>
          <ChevronLeft size={14} /> Shifts & Timing
        </button>
        <button onClick={() => setStep(4)} style={btnPrimary(true)}>
          Student Groups <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function SubTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 7, border: 'none',
        background: active ? '#fff' : 'transparent',
        color: active ? '#13111E' : '#4B5275',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        boxShadow: active ? '0 1px 3px rgba(124,111,224,0.15)' : 'none',
        fontFamily: 'inherit',
      }}>
      <span style={{ color: active ? '#7C6FE0' : '#8B87AD' }}>{icon}</span>
      {label}
    </button>
  )
}

// ── Shared button styles ──────────────────────────────────────

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E4FF',
  background: '#fff', color: '#4B5275', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

function btnPrimary(enabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: enabled ? 'linear-gradient(135deg, #7C6FE0, #9B8EF5)' : '#E8E4FF',
    color: enabled ? '#fff' : '#B8B4D4',
    fontSize: 12, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    boxShadow: enabled ? '0 2px 8px rgba(124,111,224,0.35)' : 'none',
  }
}
