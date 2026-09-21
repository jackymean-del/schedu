/**
 * What ONE cell looks like on a shared link.
 *
 * Its own module because lib/share reaches the API, and this mapping needs
 * checking without a network or a booted app behind it. It is small, and it
 * decides what a teacher sees on the link their school sends them — which it
 * got wrong for every parallel cell until now.
 */
export interface SharedCell {
  subject?: string
  teacher?: string
  room?: string
  /**
   * The parallel groups in this cell, when it has them.
   *
   * Without this a shared timetable flattened "Physics OR Chemistry" to the
   * combined label and the FIRST group's teacher and room — so the second
   * group's teacher was simply absent from the timetable their school had just
   * sent them, and half the class was pointed at the wrong room.
   *
   * The cell-level fields are kept as they were, so an older shared link still
   * renders exactly as before.
   */
  groups?: Array<{ subject?: string; teacher?: string; room?: string }>
}

/**
 * One timetable cell as a shared link should show it.
 *
 * Split out so it can be checked without a store behind it — the mapping is
 * small, but it decides what a teacher sees on the link their school sends
 * them, and it silently dropped half of every parallel cell.
 */
export function toSharedCell(cell: any): SharedCell {
  // Both parallel shapes: groupAssignments for OR/AND groups, options for
  // optional blocks. A cell carries one or the other.
  const parallel = [
    ...(cell?.groupAssignments ?? []),
    ...(cell?.options ?? []),
  ].filter((g: any) => g && (g.subject || g.teacher))
  return {
    subject: cell?.subject,
    teacher: cell?.teacher,
    room: cell?.room,
    ...(parallel.length
      ? {
          groups: parallel.map((g: any) => ({
            subject: g.subject, teacher: g.teacher, room: g.room ?? cell?.room,
          })),
        }
      : {}),
  }
}
