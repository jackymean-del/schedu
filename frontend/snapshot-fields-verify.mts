/**
 * PER-SCHEDULE DATA HAS TO BE IN THREE LISTS, OR IT SILENTLY VANISHES.
 * Run: npx tsx snapshot-fields-verify.mts
 *
 * Saving a schedule rebuilds its snapshot from TT_SNAPSHOT_FIELDS and
 * overwrites the whole key. Loading one calls loadActiveTimetableIntoStore,
 * which no-ops as soon as `classTT` is non-empty — and `classTT` comes back on
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
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

/**
 * Fields that are OUTPUTS of the solver, recomputed from classTT wherever they
 * are shown, and so deliberately absent from persist. Adding a name here is a
 * claim that nothing trusts the stored copy — check before you do.
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

// 1 & 2 — the two snapshot lists must be identical, in both directions.
const onlyRegistry = registry.filter(f => !dashboard.includes(f))
const onlyDashboard = dashboard.filter(f => !registry.includes(f))
ok(onlyRegistry.length === 0,
  'every snapshot field in ttRegistry is mirrored in dashboard',
  onlyRegistry.length ? `missing from dashboard: ${onlyRegistry.join(', ')}` : 'in step')
ok(onlyDashboard.length === 0,
  'and nothing is in the dashboard mirror that ttRegistry does not save',
  onlyDashboard.length ? `missing from ttRegistry: ${onlyDashboard.join(', ')}` : 'in step')

// 3 — anything saved per schedule must also survive a reload, or be derived.
const notPersisted = [...new Set([...registry, ...dashboard])]
  .filter(f => !partialize.includes(f) && !DERIVED_NOT_PERSISTED.includes(f))
ok(notPersisted.length === 0,
  'every snapshot field survives a reload, or is declared derived',
  notPersisted.length
    ? `lost on reload: ${notPersisted.join(', ')} — add to partialize, or to DERIVED_NOT_PERSISTED if nothing trusts the stored copy`
    : `${DERIVED_NOT_PERSISTED.length} declared derived: ${DERIVED_NOT_PERSISTED.join(', ')}`)

// The derived ones are only safe while nothing reads them as truth. The
// dashboard's conflict tile did exactly that and showed a false all-clear.
// Comments are stripped first: the fix for that tile left the words
// "store.conflicts" in a comment explaining why it no longer reads it, and a
// check that fires on its own explanation is worse than no check at all.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const dash = stripComments(read('src/pages/dashboard.tsx'))
for (const f of DERIVED_NOT_PERSISTED) {
  const trusts = new RegExp(`store\\.${f}\\b`).test(dash)
  ok(!trusts, `dashboard does not read store.${f} as truth`,
    trusts ? 'it does — that value is empty after every reload' : 'recomputed where shown')
}

console.log(fail === 0 ? '\nALL SNAPSHOT-FIELD CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
