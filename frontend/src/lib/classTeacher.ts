/**
 * Who is a class's class teacher - stated once.
 *
 * The fact was stored twice: on the CLASS (`section.classTeacher`, set in the
 * Classes grid) and on the TEACHER (`staff.isClassTeacher`, set in the Faculty
 * grid and Master Data). Nothing kept them together, so a school could see
 * "II-A - class teacher: Teacher 1" in one table and "Teacher 1 - class
 * teacher of: none" in the next. The engine reads both and lets the class win,
 * so the Faculty column could show a class teacher the timetable then ignored.
 *
 * The class is the source of truth. Teacher-side screens READ through
 * classTeacherOf and WRITE through assignClassTeacher, which updates the class
 * (and keeps the legacy teacher-side field in step for anything still reading
 * it).
 */

interface StaffLike { id?: string; name: string; isClassTeacher?: string }
interface SectionLike { name: string; classTeacher?: string }

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Does this class name this teacher (by name or id)? */
const names = (sec: SectionLike, t: StaffLike) => same(sec.classTeacher, t.name) || (!!t.id && sec.classTeacher === t.id)

/** The class this teacher is class teacher of, or ''. */
export function classTeacherOf(t: StaffLike, sections: SectionLike[]): string {
  const viaClass = sections.find(s => names(s, t))
  if (viaClass) return viaClass.name
  // Legacy: only the teacher side says so. Honour it only where the class has
  // not named somebody else - the engine lets the class win, and so must this.
  const legacy = (t.isClassTeacher ?? '').trim()
  if (!legacy) return ''
  const sec = sections.find(s => s.name === legacy)
  return sec && !(sec.classTeacher ?? '').trim() ? legacy : ''
}

/**
 * Make `teacher` the class teacher of `sectionName` ('' = of nothing).
 * A class has one class teacher and a teacher leads one class, so the class's
 * previous class teacher and the teacher's previous class are both released.
 */
export function assignClassTeacher<S extends SectionLike, T extends StaffLike>(
  sections: S[], staff: T[], teacher: T, sectionName: string,
): { sections: S[]; staff: T[] } {
  const nextSections = sections.map(s => {
    if (s.name === sectionName) return { ...s, classTeacher: teacher.name }
    if (names(s, teacher)) return { ...s, classTeacher: '' }
    return s
  })
  const nextStaff = staff.map(st => {
    if (st === teacher || (teacher.id && st.id === teacher.id)) return { ...st, isClassTeacher: sectionName }
    if (sectionName && st.isClassTeacher === sectionName) return { ...st, isClassTeacher: '' }
    return st
  })
  return { sections: nextSections, staff: nextStaff }
}
