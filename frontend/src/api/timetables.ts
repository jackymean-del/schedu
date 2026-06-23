// ─────────────────────────────────────────────────────────────
// Server-backed timetable repository
//
// The dashboard used to keep its timetable list and per-timetable wizard
// snapshots in localStorage, which is per-browser and therefore shared across
// every signed-in account. This module makes the backend the source of truth
// so each Clerk user gets their own timetables (and they follow the user
// across devices).
//
// Storage mapping (backend `timetables` row):
//   • config JSONB  ← dashboard metadata (TTEntry, minus its id)
//   • data   JSONB  ← the wizard editor snapshot (TT_SNAPSHOT_FIELDS blob)
//   • name          ← TTEntry.name (kept in sync for convenience)
//   • org_type      ← always 'school'; country defaults to 'IN'
// ─────────────────────────────────────────────────────────────
import { timetableApi } from './client'

// Metadata the dashboard shows for each timetable. Mirrors the dashboard's
// local TTEntry shape (kept structural to avoid a circular import).
export interface TTMeta {
  id:              string
  name:            string
  status:          'active' | 'draft' | 'archived'
  wizardStep:      number
  approxClasses:   number
  approxTeachers:  number
  approxSubjects?: number
  approxRooms?:    number
  board:           string
  startDate:       string
  endDate:         string
  createdAt:       number
  fromGrade?:      string
  toGrade?:        string
}

/** Wizard snapshot is an opaque bag of store fields. */
export type TTSnapshot = Record<string, unknown>

interface ServerRow {
  id:         string
  name:       string
  status?:    string
  config?:    Partial<TTMeta> | null
  data?:      TTSnapshot | null
  created_at?: string
}

// ── Mapping helpers ────────────────────────────────────────────
function rowToMeta(row: ServerRow): TTMeta {
  const c = (row.config ?? {}) as Partial<TTMeta>
  return {
    id:             row.id,
    name:           c.name ?? row.name ?? 'Untitled timetable',
    status:         c.status ?? 'draft',
    wizardStep:     c.wizardStep ?? 1,
    approxClasses:  c.approxClasses ?? 0,
    approxTeachers: c.approxTeachers ?? 0,
    approxSubjects: c.approxSubjects,
    approxRooms:    c.approxRooms,
    board:          c.board ?? 'CBSE',
    startDate:      c.startDate ?? '',
    endDate:        c.endDate ?? '',
    createdAt:      c.createdAt ?? (row.created_at ? Date.parse(row.created_at) : Date.now()),
    fromGrade:      c.fromGrade,
    toGrade:        c.toGrade,
  }
}

/** The config blob is everything in the meta except the row id. */
function metaToConfig(meta: TTMeta): Omit<TTMeta, 'id'> {
  const { id: _id, ...config } = meta
  return config
}

// ── Repository API ─────────────────────────────────────────────

/** All timetables for the signed-in user, newest first. */
export async function fetchTimetables(): Promise<TTMeta[]> {
  const res = await timetableApi.list()
  const rows = (res.data?.timetables ?? []) as ServerRow[]
  return rows.map(rowToMeta)
}

/**
 * Create a new timetable server-side. Returns the **server-assigned id**,
 * which the caller must adopt as the timetable's canonical id.
 */
export async function createTimetable(meta: TTMeta, snapshot?: TTSnapshot): Promise<string> {
  const res = await timetableApi.create({
    name:    meta.name,
    country: 'IN',
    config:  metaToConfig(meta),
    data:    snapshot ?? {},
  })
  return (res.data?.id as string) ?? meta.id
}

/** Patch a timetable's metadata (config blob + name). */
export async function updateTimetableMeta(meta: TTMeta): Promise<void> {
  await timetableApi.update(meta.id, {
    name:   meta.name,
    config: metaToConfig(meta),
  })
}

/** Persist the wizard editor snapshot into the timetable's `data` blob. */
export async function saveTimetableSnapshot(id: string, snapshot: TTSnapshot): Promise<void> {
  await timetableApi.update(id, { data: snapshot })
}

/** Fetch a timetable's wizard snapshot, or null if it has none yet. */
export async function fetchTimetableSnapshot(id: string): Promise<TTSnapshot | null> {
  const res = await timetableApi.get(id)
  const data = (res.data?.data ?? null) as TTSnapshot | null
  if (!data || Object.keys(data).length === 0) return null
  return data
}

export async function deleteTimetable(id: string): Promise<void> {
  await timetableApi.delete(id)
}
