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
  coverageRows, type SyllabusPlan,
} from '@/lib/syllabusTracking'
import { BookOpen, Plus, Trash2, Check } from 'lucide-react'

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
        {!canPick && (
          <Card title="No subjects yet">
            <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
              Add classes and subjects in the wizard (or Master Data) first — then come back to record how many hours each subject needs.
            </p>
          </Card>
        )}

        {canPick && (
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
