/**
 * The roster/timetable disagreement, said where you can see it.
 *
 * lib/rosterOrphans explains the state: deleting a roster row deliberately does
 * not rewrite a generated timetable, so a teacher who left in March keeps her
 * lessons until somebody reassigns them. Master Data already warns, because
 * that is where the fix happens.
 *
 * This is the other half. The timetable is where the problem is VISIBLE — a
 * period that looks staffed by a person who is gone — and it is the screen
 * people actually live in. A warning only on the page you visit to fix things
 * is a warning you see after you already knew.
 *
 * All four kinds are checked in one pass, because they fail the same way and a
 * reader wants one answer, not four banners stacked down the page.
 */
import { useMemo } from 'react'
import { findOrphans, orphanWarning, type OrphanKind } from '@/lib/rosterOrphans'

interface Props {
  classTT: any
  sections: Array<{ name?: string }> | undefined
  staff: Array<{ name?: string }> | undefined
  subjects: Array<{ name?: string }> | undefined
  rooms: Array<{ name?: string; actualName?: string; generatedName?: string }> | undefined
}

/** A venue's display name, matching lib/roomShape's precedence. */
const roomName = (r: Props['rooms'] extends (infer U)[] | undefined ? U : never) =>
  r?.actualName ?? r?.name ?? r?.generatedName

export function TimetableOrphanBanner({ classTT, sections, staff, subjects, rooms }: Props) {
  const messages = useMemo(() => {
    const rosters: Array<[OrphanKind, (string | undefined)[]]> = [
      ['teacher', (staff ?? []).map(s => s?.name)],
      ['subject', (subjects ?? []).map(s => s?.name)],
      ['room', (rooms ?? []).map(roomName)],
      ['section', (sections ?? []).map(s => s?.name)],
    ]
    return rosters
      .map(([kind, names]) => orphanWarning(kind, findOrphans(classTT, kind, names)))
      .filter((m): m is string => m !== null)
  }, [classTT, staff, subjects, rooms, sections])

  if (messages.length === 0) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#991B1B',
        padding: '8px 12px', fontSize: 12, lineHeight: 1.5, flexShrink: 0,
      }}>
      <span aria-hidden="true">⚠</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {messages.map(m => <span key={m}>{m}</span>)}
      </div>
    </div>
  )
}
