/**
 * OR-slot priority — Blueprint Step 4 + Part C.
 *
 * The blueprint calls this "the one real blocker in this pipeline": when several
 * subjects share an OR slot, the slot should go to whichever "needs more sessions
 * to complete its syllabus" — but schedU had no syllabus data, so the choice was
 * left entirely manual.
 *
 * Part C closes that gap. This panel reads the syllabus service and, per OR group
 * and section, states which subject is furthest behind and why. It is advisory by
 * design: it explains the recommendation and leaves the decision with the user,
 * because a school may have reasons the data can't see.
 *
 * Silent when there is no syllabus data — an empty recommendation is worse than
 * none, and the blueprint is explicit that the manual path stays valid.
 */
import { useMemo } from 'react'
import { useSyllabus, rankOrGroupBySessionNeed } from '@/lib/syllabusTracking'
import { Shuffle, Info } from 'lucide-react'

export interface OrGroupLike {
  id: string
  name?: string
  slotLabel?: string
  logic: 'AND' | 'OR'
  subjects: string[]
  sections?: string[]
}

export function OrPrioritySuggestion({
  groups, allSectionNames,
}: {
  groups: OrGroupLike[]
  allSectionNames: string[]
}) {
  const plans = useSyllabus(s => s.plans)

  // For every (OR group × section) with at least one subject that has syllabus
  // data, work out which subject is furthest behind.
  const rows = useMemo(() => {
    const out: Array<{
      key: string; group: string; section: string
      ranked: ReturnType<typeof rankOrGroupBySessionNeed>
    }> = []
    groups
      .filter(g => g.logic === 'OR' && g.subjects.length > 1)
      .forEach(g => {
        const sections = (g.sections?.length ? g.sections : allSectionNames)
        sections.forEach(section => {
          const ranked = rankOrGroupBySessionNeed(g.subjects, section, plans)
          // Only advise where we actually hold data for something in the group.
          if (!ranked.some(r => r.hasPlan)) return
          out.push({
            key: `${g.id}__${section}`,
            group: g.slotLabel || g.name || g.subjects.join(' / '),
            section,
            ranked,
          })
        })
      })
    return out
  }, [groups, allSectionNames, plans])

  if (rows.length === 0) return null

  return (
    <div style={{ border: '1px solid #E4E0FF', borderRadius: 10, background: '#fff', padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Shuffle size={14} color="#7C6FE0" />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#13111E' }}>Which subject needs the slot?</div>
      </div>
      <p style={{ fontSize: 11.5, color: '#8B87AD', margin: '0 0 10px' }}>
        Based on live syllabus coverage — the subject furthest from finishing is listed first.
        This is a recommendation, not a rule: you still choose what runs.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => {
          const top = r.ranked[0]
          return (
            <div key={r.key} style={{ border: '1px solid #ECE9FB', borderRadius: 9, padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4B41C4' }}>{r.group}</span>
                <span style={{ fontSize: 11.5, color: '#8B87AD' }}>· {r.section}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#067647', fontWeight: 700 }}>
                  Suggest: {top.subject}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.ranked.map((s, i) => (
                  <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                      background: i === 0 ? '#DCFCE7' : '#F5F2FF',
                      color: i === 0 ? '#067647' : '#8B87AD',
                    }}>{i + 1}</span>
                    <span style={{ fontWeight: i === 0 ? 700 : 500, color: '#13111E', minWidth: 120 }}>{s.subject}</span>
                    {s.hasPlan ? (
                      <>
                        <div style={{ flex: 1, height: 6, background: '#EDE9FF', borderRadius: 3, overflow: 'hidden', maxWidth: 160 }}>
                          <div style={{ height: '100%', width: `${s.pct}%`, background: s.pct >= 100 ? '#16A34A' : '#7C6FE0' }} />
                        </div>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: '#4B5275' }}>
                          {s.pct}% · <strong style={{ color: s.remaining > 0 ? '#B45309' : '#067647' }}>{s.remaining} h left</strong>
                        </span>
                      </>
                    ) : (
                      <span style={{ color: '#9A95BC', fontStyle: 'italic' }}>no syllabus recorded — not ranked</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, fontSize: 11, color: '#8B87AD' }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Record required hours or chapters on the <a href="/syllabus" style={{ color: '#7C6FE0', fontWeight: 700 }}>Syllabus</a> page
          to widen this. Subjects with no syllabus data are never ranked above ones that have it.
        </span>
      </div>
    </div>
  )
}
