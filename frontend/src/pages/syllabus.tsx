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
  coverageRows, summariseBy, classOfSection, lostHours, riskOf, RISK_LABELS, suggestBorrowSwaps,
  LOST_REASON_LABELS, withHolidayImpact, effectiveMethod, METHOD_LABELS, METHOD_HINTS,
  type SyllabusPlan, type LostSession, type CoverageMethod,
} from '@/lib/syllabusTracking'
import { SyllabusAlert } from '@/components/SyllabusAlert'
import { useHolidays, holidayImpact } from '@/lib/holidays'
import { paceFor } from '@/lib/syllabusPace'
import { BookOpen, Plus, Trash2, Check } from 'lucide-react'

type Dim = 'subject' | 'class' | 'section' | 'teacher'
const DIMS: Array<{ k: Dim; label: string }> = [
  { k: 'subject', label: 'Subject-wise' },
  { k: 'class',   label: 'Class-wise' },
  { k: 'section', label: 'Section-wise' },
  { k: 'teacher', label: 'Faculty-wise' },
]

const ACCENT = '#7C6FE0'

export function SyllabusPage() {
  const store = useTimetableStore() as any
  const sections: any[] = store.sections ?? []
  const subjects: any[] = store.subjects ?? []
  const staff: any[] = store.staff ?? []
  const {
    plans, setRequiredHours, setTeacher, addChapter, updateChapter,
    removeChapter, markChapterCovered, logHours, logLostSession, removeLostSession,
    setMethod, setChapterCounts, setOverallPercent,
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
  const usingChapters = (plan?.chapters?.length ?? 0) > 0
  const method = effectiveMethod(plan)

  // Declared school holidays cost each subject whatever the timetable had on
  // that weekday — folded in here so every coverage figure below is holiday-aware.
  const holidays = useHolidays(s => s.holidays)
  const periodMinutes = (store.config?.periodMinutes) ?? 40
  const impact = useMemo(
    () => holidayImpact(store.classTT ?? {}, holidays, periodMinutes),
    [store.classTT, holidays, periodMinutes],
  )
  const effectivePlans = useMemo(() => withHolidayImpact(plans, impact), [plans, impact])
  const rows = useMemo(() => coverageRows(effectivePlans), [effectivePlans])

  const canPick = sections.length > 0 && subjects.length > 0

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="📗" title="Syllabus" description="Track what each subject needs to cover — and what's actually been taught." />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Same always-on alert as the dashboard — silent when nothing is slipping. */}
        <SyllabusAlert />

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
                {/* These hours are time TAUGHT, not syllabus covered — the two
                    are different, and only the Pace card can tell them apart. */}
                <Stat label="Spent" value={`${cov} h`} color="#067647" />
                <Stat label="Remaining" value={`${rem} h`} color={rem > 0 ? '#B45309' : '#067647'} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ height: 12, background: '#EDE9FF', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#16A34A' : ACCENT, transition: 'width .25s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#8B87AD', marginTop: 3 }}>{pct}% covered</div>
                </div>
              </div>

              {/* Required hours — the denominator, whichever method is used */}
              {!usingChapters && (
                <Field label="Hours needed to cover the syllabus">
                  <input type="number" min={0} step="0.5" value={plan?.requiredHours ?? ''} placeholder="e.g. 40"
                    onChange={e => setRequiredHours(subject, section, e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ ...inputStyle, maxWidth: 200 }} />
                </Field>
              )}

              {/* Blueprint v6 — how this faculty wants to record content, per subject */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4B5275', marginBottom: 6 }}>
                  How do you want to record coverage?
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['percent', 'count', 'named'] as CoverageMethod[]).map(m => (
                    <button key={m} onClick={() => setMethod(subject, section, m)}
                      title={METHOD_HINTS[m]}
                      style={{
                        padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 700,
                        border: `1px solid ${method === m ? ACCENT : '#E4E0FF'}`,
                        background: method === m ? '#EDE9FF' : '#fff',
                        color: method === m ? '#4B41C4' : '#8B87AD',
                      }}>
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#9A95BC', marginTop: 5 }}>{METHOD_HINTS[method]}</div>
              </div>

              {/* (0) Just say the % */}
              {method === 'percent' && (
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'end' }}>
                  <Field label="Syllabus covered (%)">
                    <input type="number" min={0} max={100} step="1" placeholder="e.g. 75"
                      value={plan?.overallPercentCovered ?? ''}
                      onChange={e => setOverallPercent(subject, section, e.target.value === '' ? undefined : Number(e.target.value))}
                      style={inputStyle} />
                  </Field>
                  <div style={{ fontSize: 11.5, color: '#9A95BC', paddingBottom: 10 }}>
                    Just state the figure — no chapters to list, nothing to tick. This alone drives coverage, pace and the alerts.
                  </div>
                </div>
              )}

              {/* (i) Chapter count */}
              {method === 'count' && (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 150px 1fr', gap: 12, alignItems: 'end' }}>
                  <Field label="Total chapters">
                    <input type="number" min={0} step="1" placeholder="e.g. 12"
                      value={plan?.totalChapters ?? ''}
                      onChange={e => setChapterCounts(subject, section, e.target.value === '' ? undefined : Number(e.target.value), plan?.chaptersCovered)}
                      style={inputStyle} />
                  </Field>
                  <Field label="Chapters covered">
                    <input type="number" min={0} step="1" placeholder="e.g. 5"
                      value={plan?.chaptersCovered ?? ''}
                      onChange={e => setChapterCounts(subject, section, plan?.totalChapters, e.target.value === '' ? undefined : Number(e.target.value))}
                      style={inputStyle} />
                  </Field>
                  <div style={{ fontSize: 11.5, color: '#9A95BC', paddingBottom: 10 }}>
                    No chapter names needed. Update the covered count whenever you like — weekly is plenty.
                  </div>
                </div>
              )}
            </Card>

            {/* Chapters — only for the checklist method, so the other two stay
                as light as they promise to be. */}
            {method === 'named' && (
            <Card
              title="Chapters"
              subtitle="Enter each chapter and the hours it needs; tick it off after the session that taught it, or give a % if it's only part-done. Chapter hours replace the direct figure above."
            >
              {(plan?.chapters ?? []).length === 0 && (
                <p style={{ fontSize: 12.5, color: '#9A95BC', margin: 0 }}>No chapters yet — add the first one below.</p>
              )}
              {/* Column headers so the bare numbers in each row can't be misread */}
              {(plan?.chapters ?? []).length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 92px 62px 34px', gap: 10,
                  padding: '0 10px', fontSize: 10.5, fontWeight: 700, color: '#9A95BC',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  <span>Done</span>
                  <span>Chapter</span>
                  <span style={{ textAlign: 'right' }}>Hours</span>
                  <span style={{ textAlign: 'right' }}>% done</span>
                  <span />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(plan?.chapters ?? []).map((c, i) => (
                  <div key={c.id} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 92px 62px 34px', gap: 10, alignItems: 'center',
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
                      type="number" min={0} step="0.5" value={c.hours} placeholder="hrs"
                      onChange={e => updateChapter(subject, section, c.id, { hours: Number(e.target.value) })}
                      style={{ ...inputStyle, padding: '6px 9px', textAlign: 'right' }}
                      title={`${c.hours || 0} teaching hours needed for "${c.name || 'this chapter'}"`}
                      aria-label="Teaching hours for this chapter"
                    />
                    {/* v6 — a chapter only part-taught can carry its own % */}
                    <input
                      type="number" min={0} max={100} step="5"
                      value={c.coveredAt ? 100 : (c.percentCovered ?? '')}
                      disabled={!!c.coveredAt}
                      placeholder="%"
                      onChange={e => updateChapter(subject, section, c.id, {
                        percentCovered: e.target.value === '' ? undefined : Number(e.target.value),
                      })}
                      style={{
                        ...inputStyle, padding: '6px 7px', textAlign: 'right',
                        background: c.coveredAt ? '#F0FDF4' : '#fff',
                        color: c.coveredAt ? '#067647' : '#13111E',
                      }}
                      title={c.coveredAt
                        ? 'Ticked — counts as 100% covered'
                        : `${c.percentCovered ?? 0}% of this chapter covered. Part-taught? Enter a percentage.`}
                      aria-label="Percent of this chapter covered"
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
            )}

            {/* Pace — content covered vs time actually spent */}
            <PaceCard
              plan={plan} classTT={store.classTT ?? {}} periodMinutes={periodMinutes}
              holidays={holidays}
              termStart={store.config?.timetableStartDate}
              termEnd={store.config?.timetableEndDate}
            />

            {/* Holidays are an ADMIN action (Blueprint v6) and now live in
                Settings. Faculty keep only the narrower right the blueprint
                grants them: logging a missed period for their own subject. */}
            {holidays.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '9px 12px', borderRadius: 10, background: '#F8F7FF',
                border: '1px solid #ECE9FB', fontSize: 12, color: '#4B5275',
              }}>
                <strong style={{ color: '#4B41C4' }}>{holidays.length} school holiday{holidays.length > 1 ? 's' : ''} declared</strong>
                <span style={{ color: '#8B87AD' }}>
                  — already deducted from the hours available for every subject.
                </span>
                <div style={{ flex: 1 }} />
                <a href="/settings" style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>
                  Manage in Settings →
                </a>
              </div>
            )}

            {/* Lost sessions — one-off events / absences for THIS subject */}
            <LostSessionsCard
              subject={subject} section={section} plan={plan}
              onAdd={(s) => logLostSession(subject, section, s)}
              onRemove={(id) => removeLostSession(subject, section, id)}
            />

            {/* All tracked plans */}
            {rows.length > 0 && (
              <Card title="All tracked syllabi" subtitle="Most behind first.">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F3F1FC' }}>
                        {['Subject', 'Section', 'Faculty', 'Required', 'Spent', 'Remaining', ''].map((h, i) => (
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
 * The (subject × section) rows that belong to one group of the current lens —
 * i.e. what you see when a group is expanded. Grouping must mirror summariseBy's
 * so a group's detail rows always add up to its header figure.
 *
 * Ordered subject-then-section (so a subject's sections read as one block), with
 * the most-behind subject first.
 */
function detailRowsFor(
  rows: ReturnType<typeof coverageRows>, dim: Dim, label: string,
): ReturnType<typeof coverageRows> {
  const labelOf = (r: (typeof rows)[number]) =>
    (dim === 'teacher' ? r.teacher
      : dim === 'class' ? classOfSection(r.section)
      : r[dim]) || '—'
  const mine = rows.filter(r => labelOf(r) === label)
  // Rank subjects by how far behind they are, then list each subject's sections.
  const worstBySubject = new Map<string, number>()
  mine.forEach(r => worstBySubject.set(r.subject, Math.max(worstBySubject.get(r.subject) ?? 0, r.remaining)))
  return [...mine].sort((a, b) =>
    (worstBySubject.get(b.subject)! - worstBySubject.get(a.subject)!) ||
    a.subject.localeCompare(b.subject) ||
    b.remaining - a.remaining ||
    a.section.localeCompare(b.section))
}

/**
 * Pace — how fast the syllabus is actually being covered, versus the class time
 * being consumed. Both numbers come from data we already have (chapters the
 * faculty tick; periods the timetable schedules), so this adds no new task.
 */
function PaceCard({
  plan, classTT, periodMinutes, holidays, termStart, termEnd,
}: {
  plan: SyllabusPlan | undefined
  classTT: any; periodMinutes: number; holidays: any[]
  termStart?: string; termEnd?: string
}) {
  const report = useMemo(
    () => (plan && termStart && termEnd)
      ? paceFor(plan, classTT, { termStart, termEnd, periodMinutes, holidays })
      : null,
    [plan, classTT, periodMinutes, holidays, termStart, termEnd],
  )
  if (!plan || !report) return null

  if (!report.hasContentSignal) return (
    <Card title="Pace" subtitle="How fast the syllabus is actually being covered.">
      <p style={{ fontSize: 12.5, color: '#8B87AD', margin: 0 }}>
        Add <strong>chapters</strong> above to unlock this. Bulk hours tell us how long a subject was taught,
        but not how much of the syllabus that time actually covered — chapters are what separate the two,
        and ticking them off is the only input needed.
      </p>
    </Card>
  )

  const { pace, contentCovered, timeSpent, contentRemaining, timeRemaining, projectedHoursNeeded, willFinish, shortfallHours } = report
  const tone = willFinish ? '#067647' : '#B45309'
  const paceLabel = pace >= 1.15 ? 'Ahead of plan' : pace <= 0.85 ? 'Slower than planned' : 'On plan'

  return (
    <Card
      title="Pace — will this syllabus finish?"
      subtitle="Compares syllabus actually covered against class time actually used. Both are already known: chapters you tick, and periods the timetable ran."
    >
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Stat label="Syllabus covered" value={`${contentCovered} h`} color="#4B41C4" />
        <Stat label="Class time used" value={`${timeSpent} h`} color="#8B87AD" />
        <Stat label="Pace" value={`${pace}×`} color={pace >= 0.85 ? '#067647' : '#B45309'} />
        <div style={{ fontSize: 11.5, color: '#8B87AD', maxWidth: 210 }}>
          <strong style={{ color: pace >= 0.85 ? '#067647' : '#B45309' }}>{paceLabel}</strong> —
          {pace < 1
            ? ` ${contentCovered} h of syllabus took ${timeSpent} h of class.`
            : ` ${contentCovered} h of syllabus in only ${timeSpent} h of class.`}
        </div>
      </div>

      <div style={{
        padding: '10px 13px', borderRadius: 10,
        background: willFinish ? '#F0FDF4' : '#FFFBEB',
        border: `1px solid ${willFinish ? '#BBF7D0' : '#FDE68A'}`,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: tone, marginBottom: 3 }}>
          {willFinish ? '✓ On track to finish the syllabus' : `⚠ Will not finish — about ${shortfallHours} h short`}
        </div>
        <div style={{ fontSize: 11.5, color: '#4B5275' }}>
          {contentRemaining} h of syllabus left. At this pace that needs <strong>{projectedHoursNeeded} h</strong> of class time,
          and <strong>{timeRemaining} h</strong> remain scheduled before the term ends
          {holidays.length > 0 ? ' (declared holidays already removed)' : ''}.
        </div>
      </div>
    </Card>
  )
}

/**
 * Borrow & replace — Blueprint v5, Syllabus Cover Dashboard.
 *
 * Offers to move a slot from a finished subject to one that's behind, but ONLY
 * where the same teacher takes both in the same class-section — so the swap
 * needs no teacher re-mapping and no room change. Applying it logs the hours
 * against both plans (the lagging subject gains time, the donor gives it up),
 * which is what makes the coverage figures move.
 */
function BorrowReplaceCard({ onPick }: { onPick: (subject: string, section: string) => void }) {
  const plans = useSyllabus(s => s.plans)
  const { logHours, logLostSession } = useSyllabus()
  const swaps = useMemo(() => suggestBorrowSwaps(plans), [plans])
  const [done, setDone] = useState<string[]>([])

  if (swaps.length === 0) return null

  const apply = (s: ReturnType<typeof suggestBorrowSwaps>[number]) => {
    // The donor gives the time up (recorded as a deliberate reallocation, not a
    // loss to circumstance) and the lagging subject receives it.
    logLostSession(s.donor, s.section, {
      date: new Date().toISOString().slice(0, 10),
      hours: s.hours, reason: 'other',
      note: `Slot lent to ${s.lagging}`,
    })
    logHours(s.lagging, s.section, s.hours)
    setDone(d => [...d, `${s.section}|${s.lagging}|${s.donor}`])
  }

  return (
    <Card
      title={`Borrow & replace (${swaps.length})`}
      subtitle="Move a slot from a finished subject to one that's behind. Only offered where the same teacher takes both in the same section, so nothing else in the timetable has to move."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {swaps.map(s => {
          const key = `${s.section}|${s.lagging}|${s.donor}`
          const applied = done.includes(key)
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '9px 11px', borderRadius: 9,
              background: applied ? '#F0FDF4' : '#F8F7FF',
              border: `1px solid ${applied ? '#BBF7D0' : '#E4E0FF'}`,
            }}>
              <span style={{ fontSize: 12, color: '#4B5275' }}>
                <strong style={{ color: '#B45309' }}>{s.lagging}</strong>
                <span style={{ color: '#9A95BC' }}> ({s.laggingPct}%, {s.laggingRemaining} h left)</span>
                {' ← '}
                <strong style={{ color: '#067647' }}>{s.donor}</strong>
                <span style={{ color: '#9A95BC' }}> (covered)</span>
              </span>
              <span style={{ fontSize: 11, color: '#8B87AD' }}>· {s.section} · {s.teacher}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4B41C4', background: '#EDE9FF', borderRadius: 999, padding: '2px 9px' }}>
                {s.hours} h
              </span>
              {applied ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#067647', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Check size={12} /> Applied
                </span>
              ) : (
                <>
                  <button onClick={() => onPick(s.lagging, s.section)} style={{ ...btnSoft, padding: '5px 10px', fontSize: 11.5 }}>
                    Review
                  </button>
                  <button onClick={() => apply(s)}
                    style={{ padding: '6px 13px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Borrow {s.hours} h
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: '#9A95BC', margin: '2px 0 0' }}>
        Applying records the hours against both subjects so coverage updates immediately. Adjust the timetable itself on the Schedule page.
      </p>
    </Card>
  )
}

/**
 * Lost sessions — holidays, school events, faculty absence, anything that ate a
 * class. These hours were counted on by the plan, so recording them is what
 * turns "75% covered, looks fine" into "this can't land without rescheduling".
 */
function LostSessionsCard({
  subject, section, plan, onAdd, onRemove,
}: {
  subject: string; section: string; plan: SyllabusPlan | undefined
  onAdd: (s: Omit<LostSession, 'id'>) => void
  onRemove: (id: string) => void
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState<number | ''>('')
  const [reason, setReason] = useState<LostSession['reason']>('holiday')
  const [note, setNote] = useState('')

  const sessions = plan?.lostSessions ?? []
  const lost = lostHours(plan)
  const risk = riskOf(plan)

  const add = () => {
    if (!Number(hours)) return
    onAdd({ date, hours: Number(hours), reason, note: note.trim() || undefined })
    setHours(''); setNote('')
  }

  return (
    <Card
      title="Lost classes"
      subtitle="Record any session that didn't happen — holiday, school event, faculty absence. Lost time counts against the plan, so the coverage view stops looking healthier than reality."
    >
      {lost > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 11px', borderRadius: 9,
          background: risk === 'critical' ? '#FFFBEB' : '#F8F7FF',
          border: `1px solid ${risk === 'critical' ? '#FDE68A' : '#ECE9FB'}`,
        }}>
          <strong style={{ fontSize: 12.5, color: risk === 'critical' ? '#92400E' : '#4B41C4' }}>
            {lost} h lost for {subject} · {section}
          </strong>
          <span style={{ fontSize: 11.5, color: '#8B87AD' }}>
            {risk === 'critical'
              ? '— these hours have to be found again, or the syllabus won’t finish.'
              : '— already accounted for; nothing outstanding.'}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 9px', background: risk === 'critical' ? '#FDE68A' : '#EDE9FF', color: risk === 'critical' ? '#92400E' : '#4B41C4' }}>
            {RISK_LABELS[risk]}
          </span>
        </div>
      )}

      {sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[...sessions].sort((a, b) => b.date.localeCompare(a.date)).map(s => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '110px 110px 60px 1fr 30px', gap: 8, alignItems: 'center', padding: '6px 9px', borderRadius: 8, border: '1px solid #ECE9FB' }}>
              <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: '#4B5275' }}>{s.date}</span>
              <span style={{ fontSize: 11.5, color: '#13111E', fontWeight: 600 }}>{LOST_REASON_LABELS[s.reason]}</span>
              <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: '#B45309', fontWeight: 700 }}>{s.hours} h</span>
              <span style={{ fontSize: 11.5, color: '#8B87AD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.note ?? ''}</span>
              <button onClick={() => onRemove(s.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9C3EC', display: 'flex', justifyContent: 'center' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '130px 140px 80px 1fr 110px', gap: 8, alignItems: 'end' }}>
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Reason">
          <select value={reason} onChange={e => setReason(e.target.value as LostSession['reason'])} style={inputStyle}>
            {(Object.keys(LOST_REASON_LABELS) as LostSession['reason'][]).map(k => (
              <option key={k} value={k}>{LOST_REASON_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Hours">
          <input type="number" min={0} step="0.5" value={hours} placeholder="1"
            onChange={e => setHours(e.target.value === '' ? '' : Number(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...inputStyle, textAlign: 'right' }} />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Independence Day" style={inputStyle} />
        </Field>
        <button onClick={add} disabled={!Number(hours)}
          style={{ ...btnSoft, opacity: Number(hours) ? 1 : 0.5, cursor: Number(hours) ? 'pointer' : 'not-allowed' }}>
          <Plus size={13} /> Log loss
        </button>
      </div>
    </Card>
  )
}

/**
 * Admin coverage dashboard — Part C §3 · §8.
 * "Dashboard shows remaining hours" and "admin can track syllabus coverage
 * status: subject-wise, per section, per class, teacher-wise."
 * All figures come from the shared service's summariseBy/coverageRows.
 */
function CoverageDashboard({
  rows: allRows, dim, setDim, onPick,
}: {
  rows: ReturnType<typeof coverageRows>
  dim: Dim; setDim: (d: Dim) => void
  onPick: (subject: string, section: string) => void
}) {
  // Narrow to a particular class, section, subject and/or faculty. Filters
  // compose, and everything below (totals, breakdown, behind-schedule) reflects
  // them — so "class VI, Maths only" is a first-class view, not a manual scan.
  const [fClass, setFClass] = useState('')
  const [fSection, setFSection] = useState('')
  const [fSubject, setFSubject] = useState('')
  const [fTeacher, setFTeacher] = useState('')

  const match = (r: (typeof allRows)[number], skip?: 'class' | 'section' | 'subject' | 'teacher') =>
    (skip === 'class'   || !fClass   || classOfSection(r.section) === fClass) &&
    (skip === 'section' || !fSection || r.section === fSection) &&
    (skip === 'subject' || !fSubject || r.subject === fSubject) &&
    (skip === 'teacher' || !fTeacher || (r.teacher || '—') === fTeacher)

  const rows = useMemo(() => allRows.filter(r => match(r)), [allRows, fClass, fSection, fSubject, fTeacher])

  // Each dropdown's options come from the rows the OTHER filters allow, so a
  // choice never leads to an empty view.
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const classOpts   = useMemo(() => uniq(allRows.filter(r => match(r, 'class')).map(r => classOfSection(r.section))), [allRows, fSection, fSubject, fTeacher])
  const sectionOpts = useMemo(() => uniq(allRows.filter(r => match(r, 'section')).map(r => r.section)), [allRows, fClass, fSubject, fTeacher])
  const subjectOpts = useMemo(() => uniq(allRows.filter(r => match(r, 'subject')).map(r => r.subject)), [allRows, fClass, fSection, fTeacher])
  const teacherOpts = useMemo(() => uniq(allRows.filter(r => match(r, 'teacher')).map(r => r.teacher || '—')), [allRows, fClass, fSection, fSubject])
  const anyFilter = !!(fClass || fSection || fSubject || fTeacher)
  const clearAll = () => { setFClass(''); setFSection(''); setFSubject(''); setFTeacher('') }

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

  if (allRows.length === 0) return (
    <Card title="Nothing tracked yet">
      <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
        Record a subject's required hours or chapters on the <strong>Track syllabus</strong> tab — coverage appears here as faculty tick chapters off.
      </p>
    </Card>
  )

  const filterBar = (
    <Card title="Filter" subtitle="Narrow to a class, section, subject or faculty — everything below follows.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
        <Field label="Class">
          <select value={fClass} onChange={e => setFClass(e.target.value)} style={inputStyle}>
            <option value="">All classes</option>
            {classOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Section">
          <select value={fSection} onChange={e => setFSection(e.target.value)} style={inputStyle}>
            <option value="">All sections</option>
            {sectionOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <select value={fSubject} onChange={e => setFSubject(e.target.value)} style={inputStyle}>
            <option value="">All subjects</option>
            {subjectOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Faculty">
          <select value={fTeacher} onChange={e => setFTeacher(e.target.value)} style={inputStyle}>
            <option value="">All faculty</option>
            {teacherOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        {anyFilter && (
          <button onClick={clearAll} style={{ ...btnSoft, height: 38 }}>Clear</button>
        )}
      </div>
    </Card>
  )

  if (rows.length === 0) return (
    <>
      {filterBar}
      <Card title="No match">
        <p style={{ fontSize: 13, color: '#8B87AD', margin: 0 }}>
          Nothing tracked matches these filters. <button onClick={clearAll} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0 }}>Clear filters</button>
        </p>
      </Card>
    </>
  )

  return (
    <>
      {filterBar}
      <Card
        title="Overall coverage"
        subtitle={anyFilter ? 'Across the filtered selection.' : 'Across every tracked subject and section.'}
      >
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Required" value={`${totals.required} h`} color="#4B41C4" />
          <Stat label="Spent" value={`${totals.covered} h`} color="#067647" />
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
        {/* Each group expands into its detail rows, so you always land on the
            actual (subject × section) coverage rather than only a rolled-up bar:
              Subject-wise → the sections that subject runs in
              Section-wise → every subject taught in that section
              Class-wise / Faculty-wise → subject, then its sections beneath it
            (the subject name is printed once per run, sections listed under it). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grouped.map(g => {
            const detail = detailRowsFor(rows, dim, g.label)
            const showSubject = dim !== 'subject'
            const showSection = dim !== 'section'
            return (
              <div key={g.label} style={{ border: '1px solid #ECE9FB', borderRadius: 10, overflow: 'hidden' }}>
                {/* Group header — the rolled-up figure */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px', gap: 10, alignItems: 'center', padding: '8px 12px', background: '#F8F7FF', borderBottom: '1px solid #ECE9FB' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#13111E' }}>{g.label}</span>
                  <div style={{ height: 10, background: '#EDE9FF', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${g.pct}%`, background: g.pct >= 100 ? '#16A34A' : g.pct < 50 ? '#D4920E' : ACCENT }} />
                  </div>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: '#4B5275' }}>
                    {g.covered}/{g.required} h · <strong style={{ color: g.remaining > 0 ? '#B45309' : '#067647' }}>{g.remaining} h left</strong>
                  </span>
                </div>
                {/* Detail rows */}
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ color: '#8B87AD' }}>
                      {showSubject && <th style={{ ...cellS, textAlign: 'left', fontWeight: 700 }}>Subject</th>}
                      {showSection && <th style={{ ...cellS, textAlign: 'left', fontWeight: 700 }}>Section</th>}
                      <th style={{ ...cellS, textAlign: 'right', fontWeight: 700 }}>Required</th>
                      <th style={{ ...cellS, textAlign: 'right', fontWeight: 700 }}>Spent</th>
                      <th style={{ ...cellS, textAlign: 'right', fontWeight: 700 }}>Left</th>
                      <th style={{ ...cellS, width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((r, i) => {
                      // Print the subject once per run so its sections read as a block.
                      const firstOfSubject = i === 0 || detail[i - 1].subject !== r.subject
                      return (
                        <tr key={r.key} onClick={() => onPick(r.subject, r.section)} style={{ cursor: 'pointer' }}
                          title={`Open ${r.subject} · ${r.section}`}>
                          {showSubject && (
                            <td style={{ ...cellS, fontWeight: 700, color: '#13111E' }}>
                              {firstOfSubject ? r.subject : ''}
                            </td>
                          )}
                          {showSection && <td style={{ ...cellS, color: '#4B5275' }}>{r.section}</td>}
                          <td style={{ ...cellS, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{r.required} h</td>
                          <td style={{ ...cellS, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#067647' }}>{r.covered} h</td>
                          <td style={{ ...cellS, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: r.remaining > 0 ? '#B45309' : '#067647', fontWeight: 700 }}>{r.remaining} h</td>
                          <td style={cellS}>
                            <div style={{ height: 6, background: '#EDE9FF', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${r.pct}%`, background: r.pct >= 100 ? '#16A34A' : r.pct < 50 ? '#D4920E' : ACCENT }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </Card>

      {/* v5 — borrow & replace, constrained to one teacher's own slots */}
      <BorrowReplaceCard onPick={onPick} />

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
