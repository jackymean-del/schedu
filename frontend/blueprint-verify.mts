/* Blueprint v3 compliance checks. Run: npx tsx blueprint-verify.mts */
import { distributeSections } from './src/lib/sectionDistribution'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? '✓' : '✗ FAIL') + ' ' + m); if (!c) fail++ }

// ── Step 1 auto-distribution — the 5 worked cases from the blueprint ──
// "Distribute 2 sections per class starting from the LOWEST class, moving
//  upward, until the section pool runs out. Remaining higher classes get 1 each."
const cases: Array<{ n: number; label: string; total: number; want: number[] }> = [
  { n: 6, label: '1–6', total: 10, want: [2, 2, 2, 2, 1, 1] },
  { n: 5, label: '1–5', total: 10, want: [2, 2, 2, 2, 2] },
  { n: 7, label: '1–7', total: 10, want: [2, 2, 2, 1, 1, 1, 1] },
  { n: 8, label: '1–8', total: 10, want: [2, 2, 1, 1, 1, 1, 1, 1] },
  { n: 8, label: '1–8', total: 12, want: [2, 2, 2, 2, 1, 1, 1, 1] },
]
for (const c of cases) {
  const got = distributeSections(c.n, c.total)
  ok(JSON.stringify(got) === JSON.stringify(c.want),
    `Classes ${c.label} · ${c.total} sections → [${got}] (expected [${c.want}])`)
}

// ── Generalisation beyond the worked cases ──
ok(distributeSections(3, 3).join() === '1,1,1', 'exactly 1 per class when total == classes')
ok(distributeSections(4, 10).join() === '3,3,2,2', 'total > 2×classes still favours lower classes')
ok(distributeSections(5, 3).join() === '1,1,1,0,0', 'fewer sections than classes → lowest classes filled first')
ok(distributeSections(0, 5).length === 0, 'no classes → empty')
ok(distributeSections(3, 0).join() === '0,0,0', 'no sections → all zero')

// Sum is always conserved
for (const c of [...cases, { n: 9, label: 'x', total: 23, want: [] }]) {
  const got = distributeSections(c.n, c.total)
  ok(got.reduce((a, b) => a + b, 0) === c.total, `sum conserved for ${c.n} classes × ${c.total} sections`)
}

// Monotonic: a lower class never has FEWER sections than a higher one
for (const c of cases) {
  const got = distributeSections(c.n, c.total)
  ok(got.every((v, i) => i === 0 || got[i - 1] >= v), `lower classes never get fewer than higher (${c.label}/${c.total})`)
}

console.log(fail === 0 ? '\nALL BLUEPRINT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
