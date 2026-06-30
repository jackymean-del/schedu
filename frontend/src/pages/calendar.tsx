/**
 * Calendar — month planning view + weekly class timetable view.
 * The timetable section reads from the active timetable store so the
 * generated schedule is visible without leaving the calendar page.
 */
import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrgProfile } from '@/store/orgProfile'
import { useTimetableStore } from '@/store/timetableStore'
import { ChevronLeft, ChevronRight, CalendarDays, BookOpen } from 'lucide-react'

const DOW    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const DAY_FULL: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

// Simple hash → one of 14 soft palette colours
const PALETTE = [
  '#EDE9FF','#E0F2FE','#D1FAE5','#FEF3C7','#FCE7F3',
  '#E0E7FF','#F0FDF4','#FFF7ED','#F0F9FF','#FDF4FF',
  '#ECFDF5','#FFFBEB','#EFF6FF','#FDF2F8',
]
const TEXT_PALETTE = [
  '#5B4FCA','#0369A1','#047857','#92400E','#9D174D',
  '#3730A3','#166534','#7C2D12','#0C4A6E','#6B21A8',
  '#065F46','#78350F','#1E3A8A','#831843',
]
function subjectIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

export function CalendarPage() {
  const { period } = useOrgProfile()
  const store = useTimetableStore()
  const today = new Date()
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })

  // ── month grid ──────────────────────────────────────────────────
  const first = new Date(view.y, view.m, 1).getDay()
  const days  = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const move = (d: number) => setView(v => {
    const m = v.m + d
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }
  })

  // ── timetable section ───────────────────────────────────────────
  const { classTT, sections, periods, config } = store
  const workDays: string[] = (config.workDays?.length ? config.workDays : ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'])
  const hasTimetable = sections.length > 0 && Object.keys(classTT).length > 0

  const sectionNames = useMemo(
    () => [...sections].map(s => s.name).sort(),
    [sections],
  )
  const [selectedSection, setSelectedSection] = useState<string>('')
  const activeSection = selectedSection || sectionNames[0] || ''

  const sectionTT = useMemo(
    () => (hasTimetable ? (classTT[activeSection] ?? {}) : {}),
    [classTT, activeSection, hasTimetable],
  )

  // Build time labels from periods + config.startTime
  const timeLabelMap = useMemo(() => {
    const map: Record<string, { start: string; end: string }> = {}
    const [sh = 9, sm = 0] = (config.startTime ?? '09:00').split(':').map(Number)
    let mins = sh * 60 + sm
    const fmt = (m: number) => {
      const h = Math.floor(m / 60) % 12 || 12
      const min = String(m % 60).padStart(2, '0')
      const ap = Math.floor(m / 60) >= 12 ? 'PM' : 'AM'
      return `${h}:${min} ${ap}`
    }
    for (const p of periods) {
      map[p.id] = { start: fmt(mins), end: fmt(mins + (p.duration ?? 45)) }
      mins += p.duration ?? 45
    }
    return map
  }, [periods, config.startTime])

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader
        icon="🗓️"
        title="Calendar"
        description={period ? `Planning period: ${period}` : 'Plan terms, holidays and key dates.'}
      />

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Month calendar ──────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} color="#7C6FE0" />
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: 0 }}>
                {MONTHS[view.m]} {view.y}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => move(-1)} style={navBtn}><ChevronLeft size={15} /></button>
              <button
                onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}
                style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 600 }}
              >Today</button>
              <button onClick={() => move(1)} style={navBtn}><ChevronRight size={15} /></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {DOW.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#8B87AD', padding: '4px 0' }}>{d}</div>
            ))}
            {cells.map((c, i) => {
              const isToday = c === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear()
              return (
                <div key={i} style={{
                  aspectRatio: '1 / 0.65', borderRadius: 7, padding: '5px 7px',
                  fontSize: 12.5,
                  background: isToday ? '#EDE9FF' : c ? '#FAF9FF' : 'transparent',
                  border: isToday ? '1.5px solid #7C6FE0' : c ? '1px solid #F3F1FB' : 'none',
                  color: isToday ? '#7C6FE0' : '#13111E',
                  fontWeight: isToday ? 700 : 500,
                }}>
                  {c ?? ''}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 12, color: '#8B87AD', margin: '12px 0 0', textAlign: 'center' }}>
            Term dates and holidays you add will appear here.
          </p>
        </div>

        {/* ── Timetable week view ─────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} color="#7C6FE0" />
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: 0 }}>Class Schedule</h2>
            </div>
            {hasTimetable && (
              <select
                value={activeSection}
                onChange={e => setSelectedSection(e.target.value)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid #DDD8FF', fontSize: 13,
                  fontWeight: 600, color: '#13111E', background: '#FAF9FF',
                  cursor: 'pointer',
                }}
              >
                {sectionNames.map(sn => (
                  <option key={sn} value={sn}>{sn}</option>
                ))}
              </select>
            )}
          </div>

          {!hasTimetable ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <p style={{ fontSize: 14, color: '#5B5A6E', fontWeight: 600, margin: '0 0 6px' }}>
                No timetable generated yet
              </p>
              <p style={{ fontSize: 13, color: '#8B87AD', margin: '0 0 18px' }}>
                Complete the wizard to generate a timetable — it will appear here automatically.
              </p>
              <a href="/dashboard" style={{
                display: 'inline-block', padding: '8px 20px',
                background: '#7C6FE0', color: '#fff',
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}>Go to Dashboard</a>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Period</th>
                    {workDays.map(d => (
                      <th key={d} style={thStyle}>{DAY_FULL[d] ?? d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(p => {
                    const isBreak = p.type === 'break'
                    const times = timeLabelMap[p.id]
                    return (
                      <tr key={p.id}>
                        {/* period label */}
                        <td style={{
                          ...tdStyle,
                          background: isBreak ? '#F8F7FF' : '#FAF9FF',
                          fontWeight: 600, fontSize: 11.5, color: '#8B87AD',
                          whiteSpace: 'nowrap', minWidth: 80,
                        }}>
                          {isBreak ? (
                            <span style={{ color: '#C4BFEA', fontStyle: 'italic' }}>{p.name ?? 'Break'}</span>
                          ) : (
                            <>
                              <div style={{ color: '#5B5A6E' }}>{p.name ?? p.id.toUpperCase()}</div>
                              {times && <div style={{ fontSize: 10, color: '#B5B2D2', marginTop: 1 }}>{times.start}</div>}
                            </>
                          )}
                        </td>

                        {/* day cells */}
                        {workDays.map(day => {
                          if (isBreak) {
                            return (
                              <td key={day} style={{ ...tdStyle, background: '#F8F7FF' }}>
                                <div style={{ height: 2, background: '#E8E4FF', borderRadius: 1, margin: '6px 4px' }} />
                              </td>
                            )
                          }
                          const cell = sectionTT[day]?.[p.id]
                          const subj = cell?.subject ?? ''
                          const teacher = cell?.teacher ?? ''
                          const idx = subj ? subjectIndex(subj) : -1
                          return (
                            <td key={day} style={tdStyle}>
                              {subj ? (
                                <div style={{
                                  background: PALETTE[idx],
                                  borderRadius: 6,
                                  padding: '5px 7px',
                                  fontSize: 11.5,
                                }}>
                                  <div style={{ fontWeight: 700, color: TEXT_PALETTE[idx], lineHeight: 1.2 }}>
                                    {subj}
                                  </div>
                                  {teacher && (
                                    <div style={{ fontSize: 10, color: TEXT_PALETTE[idx], opacity: 0.7, marginTop: 2 }}>
                                      {teacher.split(' ')[0]}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ height: 30, background: '#F5F3FF', borderRadius: 6, opacity: 0.4 }} />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB',
  background: '#fff', color: '#6B7280', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11.5,
  fontWeight: 700, color: '#8B87AD', background: '#FAF9FF',
  borderBottom: '2px solid #EDE9FF',
}
const tdStyle: React.CSSProperties = {
  padding: '4px 6px', verticalAlign: 'top',
  borderBottom: '1px solid #F3F1FB', minWidth: 90,
}
