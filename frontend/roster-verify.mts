/**
 * The roster rules — who the app thinks somebody is.
 * Run: npx tsx roster-verify.mts
 *
 * This list decides whether a teacher may claim a period from their own phone,
 * so the mapping from a server row to a member is not cosmetic: get it wrong
 * and a real teacher is locked out of their own timetable, or somebody is
 * handed more than they should have.
 */
import {
  safeRole, normEmail, toMembers, unmappedMembers, unknownStaffNames,
} from './src/lib/memberRules.ts'

type Any = any
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

console.log('── an unrecognised role must never become power ──')
{
  ok(safeRole('admin') === 'admin', 'a known role is kept')
  ok(safeRole('teacher') === 'teacher', 'and so is another')
  ok(safeRole('ADMIN') === 'admin', 'case does not change who somebody is')
  ok(safeRole('  viewer ') === 'viewer', 'nor does stray whitespace')

  // The direction that matters. A row from a newer server, a typo, a null —
  // none of them should quietly hand out the keys.
  ok(safeRole('superuser') === 'viewer', 'an unknown role falls back to the LEAST access')
  ok(safeRole(undefined) === 'viewer', 'and so does a missing one')
  ok(safeRole('') === 'viewer', 'and an empty one')
}

console.log('\n── server rows become members ──')
{
  const rows: Any = [
    { id: 'a', email: '  Rao@School.org ', staffName: ' R. Rao ', role: 'teacher', status: 'active' },
    { id: 'b', email: 'devi@school.org', staffName: '', role: 'teacher', status: 'invited' },
  ]
  const members = toMembers(rows)
  ok(members.length === 2, 'both rows arrive')
  ok(members[0].email === 'rao@school.org', 'emails are normalised, because that is the join')
  ok(members[0].staffName === 'R. Rao', 'and staff names are trimmed')
  ok(members[1].staffName === undefined, 'an empty staff name is absent, not ""')
  ok(members[0].status === 'active' && members[1].status === 'invited', 'status survives')

  // A row with no email matches nobody; a duplicate would shadow the first.
  const messy = toMembers([
    { id: 'c', email: '', role: 'admin' },
    { id: 'd', email: 'x@y.z', role: 'admin' },
    { id: 'e', email: 'X@Y.Z', role: 'viewer' },
  ] as Any)
  ok(messy.length === 1, 'a row with no email is dropped and a duplicate does not shadow')
  ok(messy[0].role === 'admin', 'the first row for an address wins')
  ok(toMembers(undefined).length === 0, 'no rows is no members, not a crash')

  ok(normEmail('  A@B.C ') === 'a@b.c', 'email normalisation is the same everywhere')
}

console.log('\n── warnings that must point at the right people ──')
{
  const m = (email: string, role: Any, staffName?: string): Any =>
    ({ id: email, email, role, status: 'active', addedAt: '', staffName })

  const roster: Any = [
    m('head@s.org', 'admin', 'Head'),      // does not teach; not on the staff list
    m('rao@s.org', 'teacher', 'R. Rao'),   // mapped correctly
    m('devi@s.org', 'teacher'),            // no name at all
    m('iyer@s.org', 'teacher', 'T Iyerr'), // a typo
    m('gov@s.org', 'viewer'),              // reads only; needs no mapping
  ]
  const staffNames = ['R. Rao', 'S. Devi', 'T. Iyer']

  const unmapped = unmappedMembers(roster).map((x: Any) => x.email)
  ok(unmapped.join() === 'devi@s.org', 'only the unmapped TEACHER is flagged', unmapped.join() || 'none')
  // An administrator owns the timetable and is authorised as its owner however
  // they are named. Nagging them is how a warning becomes wallpaper.
  ok(!unmapped.includes('head@s.org'), 'an administrator is not nagged for a staff name')
  ok(!unmapped.includes('gov@s.org'), 'and neither is a viewer')

  const unknown = unknownStaffNames(roster, staffNames).map((x: Any) => x.email)
  ok(unknown.join() === 'iyer@s.org', 'the typo is caught', unknown.join() || 'none')
  ok(!unknown.includes('head@s.org'), "and the head's own name is not a typo")
  ok(!unknown.includes('devi@s.org'), 'a blank name is not reported twice as a typo as well')

  // Without a staff list there is nothing to compare against, and guessing
  // would flag every correctly-mapped teacher in a school that has not built
  // its roster yet.
  ok(unknownStaffNames(roster, []).length === 0,
    'with no staff list it stays silent rather than guessing')

  // Case and spacing come from two places people type into separately.
  const loose: Any = [m('a@s.org', 'teacher', '  r. RAO ')]
  ok(unknownStaffNames(loose, staffNames).length === 0,
    'case and spacing do not turn a real teacher into a typo')
}

console.log(fail === 0 ? '\nALL ROSTER CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
