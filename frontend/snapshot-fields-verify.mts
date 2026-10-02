/**
 * PER-SCHEDULE DATA HAS TO BE IN THREE LISTS, OR IT SILENTLY VANISHES.
 * Run: npx tsx snapshot-fields-verify.mts
 *
 * Saving a schedule rebuilds its snapshot from TT_SNAPSHOT_FIELDS and
 * overwrites the whole key. Loading one calls loadActiveTimetableIntoStore,
 * which no-ops as soon as `classTT` is non-empty - and `classTT` comes back on
 * its own from the store's generic persist. So on a plain page reload the
 * snapshot is never read, and any field that lives ONLY in the snapshot comes
 * back at its initial value.
 *
 * That is not theoretical. It has cost this project real data twice: the
 * allocation matrix and the typed capacity denominators were written globally,
 * looked saved, and were wiped on the next save; and the dashboard's conflict
 * count read a field that no reload ever restored, so it showed "0 conflicts"
 * for a timetable that had them.
 *
 * The rule is therefore: every per-schedule field appears in
 *   1. TT_SNAPSHOT_FIELDS in lib/ttRegistry.ts
 *   2. the mirror copy in pages/dashboard.tsx
 *   3. the persist partialize in store/timetableStore.ts
 * unless it is DERIVED, in which case it must be listed below and the thing
 * that reads it must recompute it rather than trust the store.
 *
 * This used to be a comment asking people to remember. Now it fails a check.
 */
import { readFileSync } from 'node:fs'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

/**
 * Fields that are OUTPUTS of the solver, recomputed from classTT wherever they
 * are shown, and so deliberately absent from persist. Adding a name here is a
 * claim that nothing trusts the stored copy - check before you do.
 */
const DERIVED_NOT_PERSISTED = ['conflicts', 'suggestions']

const read = (p: string) => readFileSync(p, 'utf8')

/** The string-literal names inside the first array after `marker`. */
function fieldList(src: string, marker: string): string[] {
  const i = src.indexOf(marker)
  if (i < 0) return []
  const j = src.indexOf(']', i)
  const body = src.slice(i, j).replace(/\/\/[^\n]*/g, '')
  return [...body.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map(m => m[1])
}

const registry = fieldList(read('src/lib/ttRegistry.ts'), 'const TT_SNAPSHOT_FIELDS')
const dashboard = fieldList(read('src/pages/dashboard.tsx'), 'const TT_SNAPSHOT_FIELDS')

const store = read('src/store/timetableStore.ts')
const pi = store.indexOf('partialize: (state) => ({')
const partialize = [...store.slice(pi, store.indexOf('}),', pi)).matchAll(/(\w+):\s*state\./g)].map(m => m[1])

console.log(`registry ${registry.length} · dashboard ${dashboard.length} · partialize ${partialize.length}`)

ok(registry.length > 10, 'the snapshot list was found and is not empty', `${registry.length} fields`)
ok(partialize.length > 10, 'the partialize list was found and is not empty', `${partialize.length} fields`)

// 1 & 2 - the two snapshot lists must be identical, in both directions.
const onlyRegistry = registry.filter(f => !dashboard.includes(f))
const onlyDashboard = dashboard.filter(f => !registry.includes(f))
ok(onlyRegistry.length === 0,
  'every snapshot field in ttRegistry is mirrored in dashboard',
  onlyRegistry.length ? `missing from dashboard: ${onlyRegistry.join(', ')}` : 'in step')
ok(onlyDashboard.length === 0,
  'and nothing is in the dashboard mirror that ttRegistry does not save',
  onlyDashboard.length ? `missing from ttRegistry: ${onlyDashboard.join(', ')}` : 'in step')

// 4 - everything the Generate step reads from the store is saved with the
// schedule. Checks 1-3 only ask that what IS saved survives; nothing asked
// whether what generation USES is saved at all, and the AND groups were not:
// a schedule's elective split reached the server as nothing.
{
  const gen = read('src/routes/wizard/step6-generate.tsx')
  const pi2 = gen.indexOf('const payload: GenerationPayload = {')
  const body = gen.slice(pi2, gen.indexOf('\n    }', pi2))
  const used = [...new Set([...body.matchAll(/\(store as any\)\.(\w+)|\bstore\.(\w+)/g)].map(m => m[1] ?? m[2]))]
  const missing = used.filter(f => !registry.includes(f))
  ok(used.length >= 8, 'the generation payload was found', `${used.length} store fields`)
  ok(missing.length === 0, 'everything generation reads is saved with the schedule',
    missing.length ? `not saved per schedule: ${missing.join(', ')}` : 'all saved')
}

// 3 - anything saved per schedule must also survive a reload, or be derived.
const notPersisted = [...new Set([...registry, ...dashboard])]
  .filter(f => !partialize.includes(f) && !DERIVED_NOT_PERSISTED.includes(f))
ok(notPersisted.length === 0,
  'every snapshot field survives a reload, or is declared derived',
  notPersisted.length
    ? `lost on reload: ${notPersisted.join(', ')} - add to partialize, or to DERIVED_NOT_PERSISTED if nothing trusts the stored copy`
    : `${DERIVED_NOT_PERSISTED.length} declared derived: ${DERIVED_NOT_PERSISTED.join(', ')}`)

// The derived ones are only safe while nothing reads them as truth. The
// dashboard's conflict tile did exactly that and showed a false all-clear.
// Comments are stripped first: the fix for that tile left the words
// "store.conflicts" in a comment explaining why it no longer reads it, and a
// check that fires on its own explanation is worse than no check at all.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

// Checked across every screen that shows one, not just the dashboard. The same
// field was being read from the store on the TIMETABLE page too, where it drove
// a green "✓ No conflicts" pill and the publish dialog's warning - so a reload
// reported a broken schedule as clean at the exact moment someone was about to
// publish it to a school.
const SCREENS = [
  'src/pages/dashboard.tsx',
  'src/routes/timetable.tsx',
  'src/components/master/ReviewDashboard.tsx',
  'src/pages/insights.tsx',
  'src/pages/calendar.tsx',
]
for (const f of DERIVED_NOT_PERSISTED) {
  const guilty = SCREENS.filter(screen => {
    try { return new RegExp(`store\\.${f}\\b`).test(stripComments(read(screen))) }
    catch { return false }
  })
  ok(guilty.length === 0, `no screen reads store.${f} as truth`,
    guilty.length
      ? `${guilty.map(g => g.split('/').pop()).join(', ')} - empty after every reload`
      : `recomputed on all ${SCREENS.length} screens that show it`)
}


// ── RESTORE MUST NEVER COPY ONE SCHEDULE INTO ANOTHER ─────────────────────
//
// The dashboard's "Restore data" button used to call saveTTSnapshot(t.id)
// unconditionally. saveTTSnapshot builds its snapshot from the CURRENT store
// and pushes it to the server, so with a different schedule open, Restore
// copied that schedule wholesale into this one - and overwrote this one's
// real server copy, in the ordinary case of opening it on a new device.
// Then it said the data had been "secured" and "preserved".
//
// Saving the open store under t.id is only correct when the open schedule IS
// t.id. This checks that every such save inside the handler is guarded by
// exactly that comparison, so the fix cannot be simplified away.
console.log('')
console.log('-- restore never copies one schedule into another --')
{
  const src = read('src/pages/dashboard.tsx')
  const start = src.indexOf('const handleRepairSnapshot')
  const end = src.indexOf('const handleDelete', start)
  const body = start >= 0 && end > start ? src.slice(start, end) : ''
  ok(body.length > 0, 'the restore handler can be found', body ? 'found' : 'MISSING')

  // Every call that writes the open store under this schedule's id.
  const saves: number[] = []
  let at = body.indexOf('saveTTSnapshot(t.id)')
  while (at >= 0) { saves.push(at); at = body.indexOf('saveTTSnapshot(t.id)', at + 1) }

  // Each must sit inside a block opened by the same-schedule check.
  const guard = 'getActiveTTId() === t.id'
  const unguarded = saves.filter(pos => {
    const g = body.lastIndexOf(guard, pos)
    if (g < 0) return true
    // The guard's block must still be open at the save: no closing brace at
    // the guard's own indentation between them.
    const between = body.slice(g, pos)
    const opens = (between.match(/{/g) || []).length
    const closes = (between.match(/}/g) || []).length
    return opens <= closes
  })
  ok(unguarded.length === 0,
    'the open schedule is saved under this id only when it IS this schedule',
    unguarded.length ? `${unguarded.length} unguarded save(s)` : `${saves.length} save(s), all guarded`)

  // And it must look for the schedule's OWN copy before falling back at all.
  ok(body.includes('fetchTimetableSnapshot(t.id)'),
    'and it looks for the server copy of THIS schedule first')

  // The old message claimed success it had not earned.
  ok(!/data has been secured/.test(body),
    'and it no longer claims data was "secured" when nothing was found')
}
console.log(fail === 0 ? '\nALL SNAPSHOT-FIELD CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
