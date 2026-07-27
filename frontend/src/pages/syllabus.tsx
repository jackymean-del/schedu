/**
 * Syllabus — Blueprint v3, Part C (faculty capture).
 *
 * Part C §1 · §6 · §7:
 *   - enter the hours a subject needs to cover its syllabus (directly, or as a
 *     chapter list with hours per chapter),
 *   - tick a chapter off after the session that taught it,
 *   - see coverage (required / covered / remaining) update live.
 *
 * This is a thin view over lib/syllabusTracking — all the maths lives in that
 * shared service, because the same numbers also answer the Step 4 OR question
 * and drive Live Mode.
 */
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useTimetableStore } from '@/store/timetableStore'
import {
  useSyllabus, planKey, requiredHours, coveredHours, remainingHours, coveragePct,
  coverageRows, summariseBy, type SyllabusPlan,
} from '@/lib/syllabusTracking'
import { BookOpen, Plus, Trash2, Check } from 'lucide-react'

type Dim = 'subject' | 'class' | 'section' | 'teacher'
const DIMS: Array<{ k: Dim; label: string }> = [
  { k: 'subject', label: 'Subject-wise' },
  { k: 'class',   label: 'Class-wise' },
  { k: 'section', label: 'Section-wise' },
  { k: 'teacher', label: 'Teacher-wise' },
]

const ACCENT = '#7C6FE0'

export function SyllabusPage() {
  const store = useTimetableStore() as any
  const sections: any[] = store.sections ?? []
  const subjects: any[] = store.subjects ?? []
  const staff: any[] = store.staff ?? []
  const {
    plans, setRequiredHours, setTeacher, addChapter, updateChapter,
    removeChapter, markChapterCovered, logHours,
  } = useSyllabus()

  const [tab, setTab] = useState<'capture' | 'coverage'>('capture')
  const [dim, setDim] = useState<Dim>('subject')
  const [section, setSection] = useState<string>(sections[0]?.name ?? '')
  const [subject, setSubject] = useState<string>(subjects[0]?.name ?? '')
  const [chName, setChName] = useState('')
  const [chHours, setChHours] = useState<number | ''>('')

  const key = planKey(subject, section)
  const plan: SyllabusPlan | undefined = plans[key]
  const req = requiredHours(plan), cov = coveredHours(plan)
  const rem = remainingHours(plan), pct = coveragePct(plan)
  const usingChapters = (plan?.chapters.length ?? 0) > 0

  const rows = useMemo(() => coverageRows(plans), [plans])

  const canPick = sections.length > 0 && subjects.length > 0

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="📗" title="Syllabus" description="Track what each subject needs to cover — and what's actually been taught." />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!canPick && tab === 'capture' && (
          <Card title="No subjects yet">
            <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
              Add classes and subjects in the wizard (or Master Data) first — then come back to record how many hours each subject needs.
              {rows.length > 0 && <> Coverage already recorded is still visible on the <strong>Coverage dashboard</strong> tab.</>}
            </p>
          </Card>
        )}

        {/* Tabs — faculty capture vs admin coverage (Part C §8).
            Coverage stays reachable even when the *current* schedule has no
            subjects loaded, since syllabus data is global and outlives one cycle. */}
        {(canPick || rows.length > 0) && (
          <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #ECE9FB', borderRadius: 10, padding: 4, alignSelf: 'flex-start' }}>
            {([['capture', 'Track syllabus'], ['coverage', 'Coverage dashboard']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  padding: '7px 15px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                  background: tab === k ? ACCENT : 'transparent', color: tab === k ? '#fff' : '#4B5275',
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'coverage' && (
          <CoverageDashboard rows={rows} dim={dim} setDim={setDim} onPick={(sub, sec) => { setSubject(sub); setSection(sec); setTab('capture') }} />
        )}

        {canPick && tab === 'capture' && (
          <>
            {/* Picker */}
            <Card title="Choose a subject" subtitle="Syllabus is tracked per subject, per class-section — the same subject can need different hours in different sections.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Class-section">
                  <select value={section} onChange={e => setSection(e.target.value)} style={inputStyle}>
                    {sections.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Subject">
                  <select value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle}>
                    {subjects.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Faculty (for teacher-wise reports)">
                  <select value={plan?.teacher ?? ''} onChange={e => setTeacher(subject, section, e.target.value)} style={inputStyle}>
                    <option value="">— unassigned —</option>
                    {staff.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
            </Card>

            {/* Coverage */}
            <Card title={`${subject} · ${section}`} subtitle="Live coverage — updates the moment a chapter is ticked.">
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <Stat label="Required" value={`${req} h`} color="#4B41C4" />
                <Stat label="Covered" value={`${cov} h`} color="#067647" />
                <Stat label="Remaining" value={`${rem} h`} color={rem > 0 ? '#B45309' : '#067647'} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ height: 12, background: '#EDE9FF', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#16A34A' : ACCENT, transition: 'width .25s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#8B87AD', marginTop: 3 }}>{pct}% covered</div>
                </div>
              </div>

              {/* Direct hours — only when not using chapters */}
              {!usingChapters && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, alignItems: 'end', marginTop: 6 }}>
                  <Field label="Hours needed to cover the syllabus">
                    <input type="number" min={0} step="0.5" value={plan?.requiredHours ?? ''} placeholder="e.g. 40"
                      onChange={e => setRequiredHours(subject, section, e.target.value === '' ? undefined : Number(e.target.value))}
                      style={inputStyle} />
                  </Field>
                  <Field label="Log taught hours">
                    <button onClick={() => logHours(subject, section, 1)} style={btnSoft}>+1 hour taught</button>
                  </Field>
                  <div style={{ fontSize: 11.5, color: '#9A95BC', paddingBottom: 10 }}>
                    …or break it into chapters below for finer tracking.
                  </div>
                </div>
              )}
            </Card>

            {/* Chapters */}
            <Card
              title="Chapters"
              subtitle="Enter each chapter and the hours it needs; tick it off after the session that taught it. Chapter hours replace the direct figure above."
            >
              {(plan?.chapters ?? []).length === 0 && (
                <p style={{ fontSize: 12.5, color: '#9A95BC', margin: 0 }}>No chapters yet — add the first one below.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(plan?.chapters ?? []).map((c, i) => (
                  <div key={c.id} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 92px 34px', gap: 10, alignItems: 'center',
                    padding: '7px 10px', borderRadius: 9,
                    background: c.coveredAt ? '#F0FDF4' : '#fff',
                    border: `1px solid ${c.coveredAt ? '#BBF7D0' : '#ECE9FB'}`,
                  }}>
                    <button
                      onClick={() => markChapterCovered(subject, section, c.id, !c.coveredAt)}
                      title={c.coveredAt ? 'Mark as not yet taught' : 'Mark as taught'}
                      style={{
                        width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                        border: `1.5px solid ${c.coveredAt ? '#16A34A' : '#D8D2FF'}`,
                        background: c.coveredAt ? '#16A34A' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      {c.coveredAt && <Check size={13} color="#fff" />}
                    </button>
                    <input
                      value={c.name}
                      onChange={e => updateChapter(subject, section, c.id, { name: e.target.value })}
                      placeholder={`Chapter ${i + 1}`}
                      style={{ ...inputStyle, padding: '6px 9px', textDecoration: c.coveredAt ? 'line-through' : 'none', color: c.coveredAt ? '#6b6786' : '#13111E' }}
                    />
                    <input
                      type="number" min={0} step="0.5" value={c.hours}
                      onChange={e => updateChapter(subject, section, c.id, { hours: Number(e.target.value) })}
                      style={{ ...inputStyle, padding: '6px 9px', textAlign: 'right' }}
                      title="Hours this chapter needs"
                    />
                    <button onClick={() => removeChapter(subject, section, c.id)} title="Remove chapter"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9C3EC', display: 'flex', justifyContent: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add chapter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px 110px', gap: 10, alignItems: 'center', marginTop: 4 }}>
                <input value={chName} onChange={e => setChName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && chName.trim()) { addChapter(subject, section, chName, Number(chHours) || 1); setChName(''); setChHours('') } }}
                  placeholder="New chapter name" style={inputStyle} />
                <input type="number" min={0} step="0.5" value={chHours} onChange={e => setChHours(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="hrs" style={{ ...inputStyle, textAlign: 'right' }} />
                <button
                  onClick={() => { if (chName.trim()) { addChapter(subject, section, chName, Number(chHours) || 1); setChName(''); setChHours('') } }}
                  disabled={!chName.trim()}
                  style={{ ...btnSoft, opacity: chName.trim() ? 1 : 0.5, cursor: chName.trim() ? 'pointer' : 'not-allowed' }}>
                  <Plus size={13} /> Add chapter
                </button>
              </div>
            </Card>

            {/* All tracked plans */}
            {rows.length > 0 && (
              <Card title="All tracked syllabi" subtitle="Most behind first.">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F3F1FC' }}>
                        {['Subject', 'Section', 'Faculty', 'Required', 'Covered', 'Remaining', ''].map((h, i) => (
                          <th key={h + i} style={{ ...cellS, textAlign: i >= 3 ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.key} style={{ cursor: 'pointer' }} onClick={() => { setSubject(r.subject); setSection(r.section) }}>
                          <td style={cellS}>{r.subject}</td>
                          <td style={cellS}>{r.section}</td>
                          <td style={{ ...cellS, color: '#8B87AD' }}>{r.teacher ?? '—'}</td>
                          <td style={{ ...cellS, textAlign: 'right' }}>{r.required} h</td>
                          <td style={{ ...cellS, textAlign: 'right', color: '#067647' }}>{r.covered} h</td>
                          <td style={{ ...cellS, textAlign: 'right', color: r.remaining > 0 ? '#B45309' : '#067647', fontWeight: 700 }}>{r.remaining} h</td>
                          <td style={{ ...cellS, width: 90 }}>
                            <div style={{ height: 7, background: '#EDE9FF', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${r.pct}%`, background: r.pct >= 100 ? '#16A34A' : ACCENT }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Admin coverage dashboard — Part C §3 · §8.
 * "Dashboard shows remaining hours" and "admin can track syllabus coverage
 * status: subject-wise, per section, per class, teacher-wise."
 * All figures come from the shared service's summariseBy/coverageRows.
 */
function CoverageDashboard({
  rows, dim, setDim, onPick,
}: {
  rows: ReturnType<typeof coverageRows>
  dim: Dim; setDim: (d: Dim) => void
  onPick: (subject: string, section: string) => void
}) {
  const grouped = useMemo(() => summariseBy(rows, dim), [rows, dim])
  const totals = useMemo(() => {
    const required = rows.reduce((a, r) => a + r.required, 0)
    const covered = rows.reduce((a, r) => a + r.covered, 0)
    return {
      required: Math.round(required * 10) / 10,
      covered: Math.round(covered * 10) / 10,
      remaining: Math.round(Math.max(0, required - covered) * 10) / 10,
      pct: required > 0 ? Math.min(100, Math.round((covered / required) * 100)) : 0,
    }
  }, [rows])

  // Anything under 50% done with hours still outstanding is worth flagging.
  const atRisk = rows.filter(r => r.required > 0 && r.pct < 50 && r.remaining > 0)

  if (rows.length === 0) return (
    <Card title="Nothing tracked yet">
      <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
        Record a subject's required hours or chapters on the <strong>Track syllabus</strong> tab — coverage appears here as faculty tick chapters off.
      </p>
    </Card>
  )

  return (
    <>
      <Card title="Overall coverage" subtitle="Across every tracked subject and section.">
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Required" value={`${totals.required} h`} color="#4B41C4" />
          <Stat label="Covered" value={`${totals.covered} h`} color="#067647" />
          <Stat label="Remaining" value={`${totals.remaining} h`} color={totals.remaining > 0 ? '#B45309' : '#067647'} />
          <Stat label="Tracked" value={`${rows.length}`} color="#8B87AD" />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ height: 14, background: '#EDE9FF', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totals.pct}%`, background: totals.pct >= 100 ? '#16A34A' : ACCENT, transition: 'width .25s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#8B87AD', marginTop: 3 }}>{totals.pct}% of the syllabus taught</div>
          </div>
        </div>
      </Card>

      <Card title="Breakdown" subtitle="Most hours remaining first — switch the lens to see where the gap really sits.">
        <div style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
          {DIMS.map(d => (
            <button key={d.k} onClick={() => setDim(d.k)}
              style={{
                padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 700,
                border: `1px solid ${dim === d.k ? ACCENT : '#E4E0FF'}`,
                background: dim === d.k ? '#EDE9FF' : '#fff',
                color: dim === d.k ? '#4B41C4' : '#8B87AD',
              }}>
              {d.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {grouped.map(g => (
            <div key={g.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#13111E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <div style={{ height: 12, background: '#F5F2FF', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${g.pct}%`, background: g.pct >= 100 ? '#16A34A' : g.pct < 50 ? '#D4920E' : ACCENT }} />
              </div>
              <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: '#4B5275' }}>
                {g.covered}/{g.required} h · <strong style={{ color: g.remaining > 0 ? '#B45309' : '#067647' }}>{g.remaining} h left</strong>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {atRisk.length > 0 && (
        <Card title={`Behind schedule (${atRisk.length})`} subtitle="Under half taught with hours still outstanding — click one to open its chapters.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {atRisk.map(r => (
              <div key={r.key} onClick={() => onPick(r.subject, r.section)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '7px 11px', borderRadius: 8, border: '1px solid #FDE68A', background: '#FFFBEB',
                }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>{r.subject}</span>
                <span style={{ fontSize: 11.5, color: '#B45309' }}>{r.section}</span>
                {r.teacher && <span style={{ fontSize: 11, color: '#A16207' }}>· {r.teacher}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: '#92400E', fontWeight: 700 }}>
                  {r.pct}% · {r.remaining} h left
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}

// ── bits ──
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #ECE9FB', padding: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#13111E', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
        <BookOpen size={15} color={ACCENT} /> {title}
      </h2>
      {subtitle && <p style={{ fontSize: 12.5, color: '#8B87AD', margin: '4px 0 16px' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 12, fontWeight: 600, color: '#4B5275', marginBottom: 5 }}>{label}</div>{children}</label>
}
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8B87AD', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  )
}
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13.5, fontFamily: 'inherit', color: '#13111E', outline: 'none', background: '#fff' }
const btnSoft: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 13px', borderRadius: 9, border: '1px solid #E4E0FF', background: '#F8F7FF', color: ACCENT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const cellS: React.CSSProperties = { border: '1px solid #F0EDFB', padding: '6px 9px', verticalAlign: 'middle' }
