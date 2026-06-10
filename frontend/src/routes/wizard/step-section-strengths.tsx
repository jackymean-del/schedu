/**
 * Step — Section Strengths Matrix (refactored to unified DataGrid)
 *
 * Uses the shared <DataGrid> for an Excel-feel grid that's identical to
 * every other data-entry screen in schedU. Per design philosophy:
 *   "If a user understands one table, they understand the whole platform."
 */

import { useMemo, useEffect, useState } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import type { SectionStrength, ScopeMatrix, Section } from '@/types'
import { DataGrid, DataGridColumn } from '@/components/DataGrid/DataGrid'
import { ScopeMatrixModal } from '@/components/DataGrid/ScopeMatrixModal'
import { Grid3x3, Sparkles } from 'lucide-react'

const STREAMS = ['Science', 'Commerce', 'Humanities', 'General', 'Other']

function guessStream(secName: string): string {
  const u = secName.toUpperCase()
  if (u.includes('SCIENCE') || u.includes('SCI') || u.includes('PCM') || u.includes('PCB')) return 'Science'
  if (u.includes('COMMERCE') || u.includes('COM')) return 'Commerce'
  if (u.includes('HUM') || u.includes('ARTS')) return 'Humanities'
  return 'General'
}

interface Row extends SectionStrength {
  // Row uses sectionName as the unique key.
}

export function StepSectionStrengths() {
  const {
    sections, subjects, sectionStrengths, setSectionStrengths,
    setSections, periods, config,
  } = useTimetableStore() as any

  const subjectCols: string[] = useMemo(() => subjects.map((s: any) => s.name), [subjects])
  const [scopeTarget, setScopeTarget] = useState<Section | null>(null)
  const workDays: string[] = config?.workDays ?? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  // Initialize matrix on first mount
  useEffect(() => {
    if (sectionStrengths.length === 0 && sections.length > 0 && subjectCols.length > 0) {
      const init: SectionStrength[] = sections.map((sec: any) => ({
        sectionName: sec.name,
        stream: guessStream(sec.name),
        subjectStrengths: Object.fromEntries(subjectCols.map(s => [s, 0])),
      }))
      setSectionStrengths(init)
    }
  }, [sections.length, subjectCols.length])

  // Build rows from sections (one row per section, materialize as Row)
  const rows: Row[] = useMemo(() => {
    return sections.map((sec: any) => {
      const existing = sectionStrengths.find((r: SectionStrength) => r.sectionName === sec.name)
      return existing ?? {
        sectionName: sec.name,
        stream: guessStream(sec.name),
        subjectStrengths: Object.fromEntries(subjectCols.map(s => [s, 0])),
      }
    })
  }, [sections, sectionStrengths, subjectCols])

  // Build columns: Section (sticky) | Stream | Total | <subjects...>
  const columns: DataGridColumn<Row>[] = useMemo(() => {
    const cols: DataGridColumn<Row>[] = [
      {
        key: 'sectionName', label: 'Section', type: 'text',
        sticky: true, width: 110, readonly: true,
      },
      {
        key: 'stream', label: 'Stream', type: 'select',
        options: STREAMS, width: 130,
      },
      {
        key: 'totalStudents', label: 'Total', type: 'number',
        width: 80, placeholder: 'auto',
        getValue: (r) => r.totalStudents ?? '',
        setValue: (r, v) => ({ ...r, totalStudents: v === '' || v == null ? undefined : Math.max(0, Number(v) || 0) }),
      },
    ]

    subjectCols.forEach(subName => {
      cols.push({
        key: `subj:${subName}`,
        label: subName,
        type: 'number',
        minWidth: 88,
        align: 'right',
        getValue: (r) => r.subjectStrengths?.[subName] ?? 0,
        setValue: (r, v) => ({
          ...r,
          subjectStrengths: { ...r.subjectStrengths, [subName]: Math.max(0, Number(v) || 0) },
        }),
        cellStyle: (value, row) => {
          if (value === 0 || value === '' || value == null) return undefined
          const vals = Object.values(row.subjectStrengths ?? {}).filter(v => typeof v === 'number' && v > 0) as number[]
          if (!vals.length) return undefined
          const max = Math.max(...vals)
          const isCore = value === max
          return {
            background: isCore ? '#F0FDF4' : '#FEF3C7',
            position: 'relative' as const,
          }
        },
        render: (value, row) => {
          if (value === 0 || value === '' || value == null) return <div style={{ padding: '11px 14px', color: '#B8B4D4', textAlign: 'right' as const, fontFamily: "'DM Mono', monospace" }}>—</div>
          const vals = Object.values(row.subjectStrengths ?? {}).filter(v => typeof v === 'number' && v > 0) as number[]
          const max = vals.length ? Math.max(...vals) : 0
          const isCore = value === max
          return (
            <div style={{ position: 'relative' as const, padding: '11px 14px', textAlign: 'right' as const }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#13111E', fontWeight: 600 }}>{value}</span>
              <span style={{
                position: 'absolute' as const, top: 3, right: 5, fontSize: 7, fontWeight: 800,
                letterSpacing: '0.05em', color: isCore ? '#15803D' : '#92400E',
                pointerEvents: 'none' as const,
              }}>
                {isCore ? 'CORE' : 'OPT'}
              </span>
            </div>
          )
        },
      })
    })

    return cols
  }, [subjectCols])

  // Save handler — write the updated rows back to the store
  const handleChange = (newRows: Row[]) => {
    setSectionStrengths(newRows)
  }

  // Empty state
  if (sections.length === 0 || subjects.length === 0) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
        <Header />
        <div style={{
          background: '#FAFAFE', border: '1px dashed #D8D2FF', borderRadius: 12,
          padding: '40px 20px', textAlign: 'center',
        }}>
          <Grid3x3 size={36} color="#D8D2FF" style={{ margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E' }}>
            Add sections and subjects first
          </div>
          <div style={{ fontSize: 12, color: '#8B87AD', marginTop: 6, maxWidth: 460, margin: '6px auto 0' }}>
            The strength matrix is per section × subject. Define them in the
            <strong style={{ color: '#7C6FE0' }}> Resources</strong> step, then come back here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <Header />

      <DataGrid<Row>
        title="Section Strengths"
        description="How many students take each subject, per section. The AI figures out the rest."
        icon={<Grid3x3 size={16} />}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.sectionName}
        onChange={handleChange}
        onScope={(row) => {
          const sec = sections.find((s: Section) => s.name === row.sectionName)
          if (sec) setScopeTarget(sec)
        }}
        toolbar={{
          add: false,
          importCSV: true,
          exportCSV: true,
          paste: true,
          search: true,
          transpose: true,
          bulkActions: true,
        }}
      />

      {/* Scope authoring modal */}
      {scopeTarget && (
        <ScopeMatrixModal
          entityName={scopeTarget.name}
          entityKind="Section"
          scope={scopeTarget.scope}
          workDays={workDays}
          periods={periods}
          onSave={(nextScope: ScopeMatrix | undefined) => {
            setSections(sections.map((s: Section) =>
              s.name === scopeTarget.name ? { ...s, scope: nextScope } : s
            ))
          }}
          onClose={() => setScopeTarget(null)}
        />
      )}

      {/* AI explainer */}
      <div style={{
        marginTop: 16,
        background: 'linear-gradient(135deg, #EDE9FF 0%, #F5F2FF 100%)',
        border: '1px solid #D8D2FF', borderRadius: 12, padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Sparkles size={13} color="#7C6FE0" />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7C6FE0' }}>
            What our AI infers from this matrix
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: '#4B5275', lineHeight: 1.7 }}>
          <li><strong style={{ color: '#13111E' }}>Optional vs Core</strong> — subject strength below section total ⇒ optional</li>
          <li><strong style={{ color: '#13111E' }}>Parallel blocks</strong> — multiple optionals summing to section total run together</li>
          <li><strong style={{ color: '#13111E' }}>Cross-section pooling</strong> — same optional in multiple sections ⇒ pooled session</li>
          <li><strong style={{ color: '#13111E' }}>Capacity sizing</strong> — block option capacity = pooled strength across sections</li>
          <li><strong style={{ color: '#13111E' }}>Teacher / Room demand</strong> — derived per option, balanced load</li>
        </ul>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Grid3x3 size={20} color="#7C6FE0" />
      </div>
      <div style={{ flex: 1 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
          Section Strengths
        </h2>
        <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
          How many students take each subject, per section. <em style={{ color: '#7C6FE0' }}>That's it.</em> The AI does the rest.
        </div>
      </div>
    </div>
  )
}
