/**
 * Share-by-link: build a self-contained, read-only snapshot of the current
 * timetable and store it server-side behind a public token. The snapshot is
 * a flat, render-ready structure independent of the live store, so a shared
 * link never changes after it is created (like a calendar share link).
 */
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'

export interface SharedCell {
  subject?: string
  teacher?: string
  room?: string
}

export interface SharedPeriod {
  id: string
  name: string
  isBreak: boolean
}

export interface SharedSection {
  name: string
  /** grid[day][periodId] → cell (class periods only) */
  grid: Record<string, Record<string, SharedCell>>
}

export interface SharedTimetable {
  title: string
  orgName?: string
  generatedAt: string
  days: string[]
  periods: SharedPeriod[]
  sections: SharedSection[]
}

/** Flatten the current timetable in the store into a portable snapshot. */
export function buildShareSnapshot(title?: string): SharedTimetable {
  const { config, sections, periods, classTT, organization } = useTimetableStore.getState()
  const days = config.workDays ?? []

  const periodMeta: SharedPeriod[] = periods.map(p => ({
    id: p.id,
    name: p.name,
    isBreak: p.type !== 'class',
  }))

  const snapSections: SharedSection[] = sections.map(sec => {
    const grid: Record<string, Record<string, SharedCell>> = {}
    for (const day of days) {
      grid[day] = {}
      for (const p of periods) {
        if (p.type !== 'class') continue
        const cell = classTT[sec.name]?.[day]?.[p.id]
        if (cell && (cell.subject || cell.teacher || cell.room)) {
          grid[day][p.id] = { subject: cell.subject, teacher: cell.teacher, room: cell.room }
        }
      }
    }
    return { name: sec.name, grid }
  })

  return {
    title: title || organization?.name || 'Timetable',
    orgName: organization?.name,
    generatedAt: new Date().toISOString(),
    days,
    periods: periodMeta,
    sections: snapSections,
  }
}

export interface ShareOptions {
  /** 'public' = anyone with the link; 'restricted' = only listed emails. */
  visibility: 'public' | 'restricted'
  /** Allow-listed emails (required when visibility is 'restricted'). */
  emails?: string[]
}

/** POST the snapshot and return a copyable share URL. */
export async function createShareLink(
  snapshot: SharedTimetable,
  options: ShareOptions = { visibility: 'public' },
): Promise<string> {
  const token = useAuthStore.getState().token
  const res = await fetch('/api/v1/timetables/share', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      title: snapshot.title,
      payload: snapshot,
      visibility: options.visibility,
      emails: options.emails ?? [],
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Could not create the share link.')
  }
  const { token: shareToken } = await res.json()
  return `${window.location.origin}/share/${shareToken}`
}
