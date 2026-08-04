/**
 * One conversion between a stored room and an editable room row.
 *
 * Two pages edit the same rooms — the wizard's Resources step and Master Data —
 * and each had its own read/write mapping. They disagreed in two ways that cost
 * real data:
 *
 *  1. TYPE CASING. Resources writes 'Computer Lab'; Master Data wrote
 *     'computer-lab'. Resources compensated on read with a map its own comment
 *     described as handling "legacy" values — but Master Data was still
 *     producing them. Master Data itself did not normalise, so a room typed in
 *     Resources came back reading `computer-lab` in its own dropdown, which
 *     matches no option and resets the room to Classroom on the next edit.
 *
 *  2. DROPPED FIELDS. Master Data rebuilt each stored room from its row, and a
 *     row has no `subjectMappings`, `notes`, `building` or `floor`. Merely
 *     opening the page wrote that reduced object back, so a lab lost the
 *     subjects bound to it — which is what tells the scheduler the lab is the
 *     right venue for Chemistry.
 *
 * Both pages now go through here. Writes MERGE onto the stored record, so a
 * field one editor doesn't show is a field it cannot destroy.
 */

/** What a grid row exposes for editing. Fields beyond these are passed through. */
export interface RoomRowLike {
  id: string
  name: string
  type: string
  capacity: number
  building?: string
  floor?: string
  scope?: any
  directoryId?: string
  subjectMappings?: any[]
  notes?: string
}

/**
 * Canonical stored casing is the display casing ('Computer Lab').
 *
 * Chosen because it is what Resources, the seeds and the resource AI already
 * write, and what the ROOM_TYPES dropdown offers; kebab was only ever produced
 * by Master Data's write path.
 */
const KEBAB_TO_ROOM_TYPE: Record<string, string> = {
  'classroom': 'Classroom', 'lab': 'Lab', 'computer-lab': 'Computer Lab',
  'library': 'Library', 'hall': 'Hall', 'gym': 'Gym',
  'staff-room': 'Staff Room', 'staff room': 'Staff Room', 'other': 'Other',
}

/** Accepts either casing; unknown values pass through rather than being lost. */
export function normalizeRoomType(raw: string | undefined): string {
  if (!raw) return 'Classroom'
  return KEBAB_TO_ROOM_TYPE[raw.toLowerCase()] ?? raw
}

/** Stored room → editable row. */
export function roomRowFrom(r: any): RoomRowLike {
  return {
    id: r?.id,
    name: r?.actualName ?? r?.name ?? r?.generatedName ?? 'Room',
    type: normalizeRoomType(r?.roomType ?? r?.type),
    capacity: r?.capacity ?? 40,
    building: r?.building ?? 'Main Block',
    floor: r?.floor ?? 'Ground',
    scope: r?.scope,
    directoryId: r?.directoryId,
    subjectMappings: r?.subjectMappings ?? [],
    notes: r?.notes ?? '',
  }
}

/**
 * Editable row → stored room, keeping whatever the stored record already had.
 *
 * `existing` is the record with the same id, when there is one. Anything the
 * row does not carry (a lab's subject mappings, notes) survives an edit made on
 * a page that never showed it.
 */
export function storedRoomFrom(row: RoomRowLike, existing?: any): any {
  return {
    ...(existing ?? {}),
    id: row.id,
    generatedName: existing?.generatedName ?? row.name,
    actualName: row.name,
    roomType: normalizeRoomType(row.type),
    capacity: row.capacity,
    building: row.building ?? existing?.building ?? 'Main Block',
    floor: row.floor ?? existing?.floor ?? 'Ground',
    subjectMappings: row.subjectMappings ?? existing?.subjectMappings ?? [],
    notes: row.notes ?? existing?.notes ?? '',
    scope: row.scope,
    directoryId: row.directoryId,
  }
}

/** A whole row list → stored list, each merged onto its previous record. */
export function storedRoomsFrom(rows: RoomRowLike[], existing: any[] = []): any[] {
  const byId = new Map<string, any>()
  for (const r of existing ?? []) if (r?.id) byId.set(r.id, r)
  return (rows ?? []).map(row => storedRoomFrom(row, byId.get(row.id)))
}
