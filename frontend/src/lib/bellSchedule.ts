/**
 * THE BELL SCHEDULE — the moments a bell actually rings.
 *
 * The app already knows every period's true wall-clock start and end, per
 * section, from the bell rows the wizard persists (lib/bellTimes). What it
 * never produced is the thing a school physically needs: the list of times
 * somebody presses the bell, printed and pinned up in the corridor and the
 * office. Reading it off a timetable grid means squinting at forty cells to
 * find eight moments.
 *
 * Two things this gets right that a naive "period start times" list would not.
 *
 * 1. ONE BELL PER MOMENT. Period 1 ends and Period 2 starts at the same
 *    minute. That is one bell, not two, and it is described as both — "P1 ends
 *    · P2 begins" — because whoever rings it needs to know what it means.
 *
 * 2. GROUPS, NOT ONE CLOCK. Nursery goes home at 12:30 and Class X at 15:20;
 *    a school with class-wise breaks or early dispersal has several bell
 *    schedules running at once. Sections whose ring times are identical are
 *    grouped; sections that differ get their own column. Flattening them into
 *    one list would put a bell on the wall that rings for nobody.
 */
import type { Period } from '@/types'
import { sectionPeriodTimes, type SlotMins } from './bellTimes'
import { compareSection } from './scheduleAllocation'

export interface Ring {
  /** Minutes from midnight. */
  at: number
  /** What finishes at this moment, if anything. */
  ends?: string
  /** What begins at this moment, if anything. */
  starts?: string
}

export interface BellGroup {
  /** Sections that ring to exactly this schedule. */
  sections: string[]
  rings: Ring[]
}

/** '8:05 AM' / '08:05' — matches the app's existing 12/24-hour preference. */
export function fmtRingTime(min: number, h24 = false): string {
  const h = Math.floor(min / 60), m = min % 60
  if (h24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * A human name for a slot.
 *
 * Period ids map to the period's own name ("Period 1"); the synthetic keys
 * bellTimes emits for non-teaching rows ('assembly', 'dispersal', a break id)
 * fall back to the slot's type, title-cased, so an unnamed break still reads
 * "Break" rather than a random id.
 */
function slotLabel(key: string, slot: SlotMins, periods: Period[]): string {
  const p = periods.find(x => x.id === key)
  if (p?.name) return p.name
  const t = slot.type || key
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')
}

/**
 * Ring times for one section, in order.
 *
 * Built from slot boundaries rather than from period starts, so the end of the
 * last lesson — home time, the bell that matters most — is never dropped.
 */
export function ringsForSection(section: string, config: any, periods: Period[]): Ring[] {
  const times = sectionPeriodTimes(section, config, periods)
  const byMinute = new Map<number, Ring>()

  const touch = (at: number): Ring => {
    let r = byMinute.get(at)
    if (!r) { r = { at }; byMinute.set(at, r) }
    return r
  }

  for (const [key, slot] of times) {
    if (!slot || slot.endMin <= slot.startMin) continue
    const label = slotLabel(key, slot, periods)
    touch(slot.startMin).starts = label
    touch(slot.endMin).ends = label
  }

  return [...byMinute.values()].sort((a, b) => a.at - b.at)
}

/** A block of the day, with a name — "Period 1", "Break", "Assembly". */
export interface BellSlot { startMin: number; endMin: number; label: string }

/** Every block of one section's day, in order. */
export function slotsForSection(section: string, config: any, periods: Period[]): BellSlot[] {
  const out: BellSlot[] = []
  for (const [key, slot] of sectionPeriodTimes(section, config, periods)) {
    if (!slot || slot.endMin <= slot.startMin) continue
    out.push({ startMin: slot.startMin, endMin: slot.endMin, label: slotLabel(key, slot, periods) })
  }
  return out.sort((a, b) => a.startMin - b.startMin)
}

/** Two ring lists are the same bell schedule when every moment and meaning matches. */
function signature(rings: Ring[]): string {
  return rings.map(r => `${r.at}|${r.ends ?? ''}|${r.starts ?? ''}`).join(';')
}

/**
 * The school's bell schedules, one per distinct pattern.
 *
 * Sections are grouped by identical ring times, so a school where everyone
 * shares a clock gets exactly one group and a school with early dispersal for
 * its youngest gets two. Groups come back in start-time order, earliest first.
 */
export function bellGroups(sections: string[], config: any, periods: Period[]): BellGroup[] {
  const groups = new Map<string, BellGroup>()
  for (const s of sections) {
    const rings = ringsForSection(s, config, periods)
    if (rings.length === 0) continue
    const sig = signature(rings)
    const g = groups.get(sig)
    if (g) g.sections.push(s)
    else groups.set(sig, { sections: [s], rings })
  }
  return [...groups.values()].sort((a, b) => (a.rings[0]?.at ?? 0) - (b.rings[0]?.at ?? 0))
}

/**
 * The next bell at or after `nowMin`, for a live display.
 *
 * Returns undefined once the day's last bell has gone, rather than wrapping to
 * tomorrow's first — a board reading "next bell in 14 hours" at 5pm is noise.
 */
export function nextRing(rings: Ring[], nowMin: number): Ring | undefined {
  return rings.find(r => r.at >= nowMin)
}

/** Minutes until the next bell, or undefined when the day is done. */
export function minutesToNextRing(rings: Ring[], nowMin: number): number | undefined {
  const r = nextRing(rings, nowMin)
  return r ? r.at - nowMin : undefined
}

/**
 * What a bell means, in the fewest words that are true.
 *
 * Named for what STARTS: at 9:40 the useful fact is "Period 2", not "Period 1
 * ends · Period 2 begins" — one moment described twice, which reads as two
 * events. The last bell of the day starts nothing, so it says so.
 */
export function describeRing(r: Ring): string {
  return r.starts || (r.ends ? 'End of day' : 'Bell')
}

/** Rows for the printed sheet / spreadsheet export. */
export function bellRows(group: BellGroup, h24 = false): string[][] {
  return group.rings.map(r => [fmtRingTime(r.at, h24), describeRing(r)])
}

/**
 * A column heading compressed to a from–to range: "I-A – II-C".
 *
 * A school with thirty sections sharing one bell would otherwise print all
 * thirty names across the top of the sheet, which no longer fits a column and
 * tells the reader nothing they didn't know. Sorted in SCHOOL order (Nursery
 * before I before X) via compareSection, not alphabetically, or the range ends
 * would be meaningless.
 */
export function rangeLabel(sections: string[]): string {
  const sorted = [...sections].sort(compareSection)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return sorted[0]
  return `${sorted[0]} – ${sorted[sorted.length - 1]}`
}

// ── The pinned-up chart: classes across, time down ────────────────────────

/** One column: the classes that share a clock, and the day they share. */
export interface BellColumn { sections: string[]; slots: BellSlot[] }

/**
 * Columns for the whole school, one per distinct daily pattern.
 *
 * Grouped by identical slots so a school on one clock gets a single column and
 * a school with early dispersal gets one per group — never one merged column
 * showing times that ring for nobody.
 */
export function bellColumns(
  schedules: Array<{ sections: string[]; config: any; periods: Period[] }>,
): BellColumn[] {
  const groups = new Map<string, BellColumn>()
  for (const { sections, config, periods } of schedules) {
    for (const s of sections) {
      const slots = slotsForSection(s, config, periods)
      if (!slots.length) continue
      const sig = slots.map(x => `${x.startMin}-${x.endMin}:${x.label}`).join(';')
      const g = groups.get(sig)
      if (g) g.sections.push(s)
      else groups.set(sig, { sections: [s], slots })
    }
  }
  return [...groups.values()].sort((a, b) => (a.slots[0]?.startMin ?? 0) - (b.slots[0]?.startMin ?? 0))
}

export interface BellCell {
  /** The block running at this row, when one is. */
  label?: string
  /** True only on the row where the block STARTS, so a block spanning several
   *  rows is named once instead of repeating down the column. */
  isStart: boolean
  /** Minutes this block runs, for a rowspan-style presentation. */
  endMin?: number
}
export interface BellGridRow {
  startMin: number
  /** When this row's band ends — the next boundary anywhere in the school. */
  endMin: number
  cells: BellCell[]
}

/**
 * The chart itself: one row per band of time, one cell per column.
 *
 * Row boundaries are every moment ANY column changes, so columns on different
 * clocks stay aligned against a single time axis — which is the only way a
 * reader can compare them. A column with nothing running in a band gets an
 * empty cell rather than a borrowed neighbour's block.
 */
export function bellGrid(columns: BellColumn[]): BellGridRow[] {
  const marks = new Set<number>()
  for (const c of columns) for (const s of c.slots) { marks.add(s.startMin); marks.add(s.endMin) }
  const points = [...marks].sort((a, b) => a - b)

  const rows: BellGridRow[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const startMin = points[i], endMin = points[i + 1]
    const cells = columns.map(c => {
      const slot = c.slots.find(s => s.startMin <= startMin && s.endMin > startMin)
      if (!slot) return { isStart: false }
      return { label: slot.label, isStart: slot.startMin === startMin, endMin: slot.endMin }
    })
    // A band where every column is empty is a gap in nobody's day — drop it.
    if (cells.some(c => c.label)) rows.push({ startMin, endMin, cells })
  }
  return rows
}
