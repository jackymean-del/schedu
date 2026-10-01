/**
 * The roster/timetable disagreement, said where you can see it.
 *
 * lib/rosterOrphans explains the state: deleting a roster row deliberately does
 * not rewrite a generated timetable, so a teacher who left in March keeps her
 * lessons until somebody reassigns them. Master Data already warns, because
 * that is where the fix happens.
 *
 * This is the other half. The timetable is where the problem is VISIBLE - a
 * period that looks staffed by a person who is gone - and it is the screen
 * people actually live in. A warning only on the page you visit to fix things
 * is a warning you see after you already knew.
 *
 * All four kinds are checked in one pass, because they fail the same way and a
 * reader wants one answer, not four banners stacked down the page.
 */
import { useMemo, useState } from 'react'
import { findOrphans, orphanWarning, type Orphan, type OrphanKind } from '@/lib/rosterOrphans'
import {
  reassignTeacher, reassignRoom, removeSubject, removeSection, repairSummary, type RepairResult,
} from '@/lib/rosterRepair'
import { cellHasTeacher } from '@/lib/cellTeachers'
import { teacherWeeklyCap } from '@/lib/teacherCap'

interface Props {
  classTT: any
  sections: Array<{ name?: string }> | undefined
  staff: Array<{ name?: string; id?: string; maxPeriodsPerWeek?: number }> | undefined
  subjects: Array<{ name?: string }> | undefined
  rooms: Array<{ name?: string; actualName?: string; generatedName?: string }> | undefined
  /** Commit a repaired timetable (through the page's undo history) and say
   *  what happened. Without it the banner only reports, as it used to. */
  onRepair?: (classTT: any, message: string) => void
}

/** Periods a week a teacher is booked for, every parallel group counted. */
function weeklyLoadOf(tt: any, name: string): number {
  let n = 0
  for (const days of Object.values(tt ?? {}) as any[]) {
    for (const periods of Object.values(days ?? {}) as any[]) {
      for (const cell of Object.values(periods ?? {}) as any[]) if (cellHasTeacher(cell, name)) n++
    }
  }
  return n
}

/** A venue's display name, matching lib/roomShape's precedence. */
const roomName = (r: Props['rooms'] extends (infer U)[] | undefined ? U : never) =>
  r?.actualName ?? r?.name ?? r?.generatedName

const ctl = {
  fontSize: 11.5, padding: '3px 6px', borderRadius: 6, border: '1px solid #FECACA',
  background: '#fff', color: '#7F1D1D', fontFamily: 'inherit',
} as const
const btn = { ...ctl, cursor: 'pointer', fontWeight: 700 } as const

/** One orphan and the decision that resolves it. */
function OrphanFix({ kind, orphan, choices, onFix }: {
  kind: OrphanKind
  orphan: Orphan
  choices: string[]
  onFix: (pick: string) => void
}) {
  const [pick, setPick] = useState('')
  const where = orphan.sections.length ? ` in ${orphan.sections.slice(0, 3).join(', ')}${orphan.sections.length > 3 ? ` +${orphan.sections.length - 3}` : ''}` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <strong>“{orphan.name}”</strong>
      <span>{orphan.periods} period{orphan.periods === 1 ? '' : 's'}{where}</span>
      {(kind === 'teacher' || kind === 'room') ? (
        <>
          <select value={pick} onChange={e => setPick(e.target.value)} style={ctl}
            aria-label={`Reassign ${orphan.name} to`}>
            <option value="">Reassign to…</option>
            {choices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={!pick} onClick={() => { onFix(pick); setPick('') }}
            style={{ ...btn, opacity: pick ? 1 : 0.5, cursor: pick ? 'pointer' : 'default' }}>
            Reassign
          </button>
        </>
      ) : (
        <button onClick={() => onFix('')} style={btn}>
          {kind === 'subject' ? 'Remove its lessons' : 'Remove its timetable'}
        </button>
      )}
    </div>
  )
}

export function TimetableOrphanBanner({ classTT, sections, staff, subjects, rooms, onRepair }: Props) {
  const found = useMemo(() => {
    const rosters: Array<[OrphanKind, (string | undefined)[]]> = [
      ['teacher', (staff ?? []).map(s => s?.name)],
      ['subject', (subjects ?? []).map(s => s?.name)],
      ['room', (rooms ?? []).map(roomName)],
      ['section', (sections ?? []).map(s => s?.name)],
    ]
    return rosters
      .map(([kind, names]) => {
        const orphans = findOrphans(classTT, kind, names)
        return { kind, orphans, message: orphanWarning(kind, orphans) }
      })
      .filter(f => f.message !== null)
  }, [classTT, staff, subjects, rooms, sections])

  if (found.length === 0) return null

  const staffNames = (staff ?? []).map(s => s?.name).filter((n): n is string => !!n)
  const roomNames = [...new Set((rooms ?? []).map(roomName).filter((n): n is string => !!n))]

  const fix = (kind: OrphanKind, o: Orphan, pick: string) => {
    if (!onRepair) return
    let r: RepairResult
    let done: string
    if (kind === 'teacher') {
      const to = (staff ?? []).find(s => s?.name === pick)
      if (!to?.name) return
      r = reassignTeacher(classTT, o.name, { name: to.name, id: to.id })
      done = `Reassigned “${o.name}” to ${to.name}`
    } else if (kind === 'room') {
      r = reassignRoom(classTT, o.name, pick)
      done = `Moved “${o.name}” lessons to ${pick}`
    } else if (kind === 'subject') {
      r = removeSubject(classTT, o.name)
      done = `Removed “${o.name}”`
    } else {
      r = removeSection(classTT, o.name)
      done = `Removed the timetable of “${o.name}”`
    }
    if (r.changed === 0) {
      onRepair(classTT, `Nothing changed: every “${o.name}” lesson would double-book. Pick someone else.`)
      return
    }
    let message = repairSummary(r, done, `“${o.name}”`)
    // A clash is refused; an overload is the school's call, but it must be
    // seen. Handing a leaver's 29 periods to a colleague already near their
    // cap is exactly the move that looks fine on the grid and is not.
    if (kind === 'teacher') {
      const to = (staff ?? []).find(s => s?.name === pick)
      const load = weeklyLoadOf(r.classTT, pick)
      const cap = teacherWeeklyCap(to as any)
      if (cap > 0 && load > cap) message += ` ${pick} now teaches ${load} periods a week, above their ${cap}.`
    }
    onRepair(r.classTT, message)
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#991B1B',
        padding: '8px 12px', fontSize: 12, lineHeight: 1.5, flexShrink: 0,
      }}>
      <span aria-hidden="true">⚠</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {found.map(f => (
          <div key={f.kind} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>{f.message}</span>
            {onRepair && f.orphans.map(o => (
              <OrphanFix key={o.name} kind={f.kind} orphan={o}
                choices={f.kind === 'teacher' ? staffNames : roomNames}
                onFix={pick => fix(f.kind, o, pick)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
