/**
 * House writing rules, checked mechanically across the whole repo.
 * Run: npx tsx style-verify.mts   (from frontend/)
 *
 * Right now there is exactly one rule: no em dashes.
 *
 * The character is a strong surface tell that a passage was machine-written,
 * and this product's whole market position is "built on Human Intelligence,
 * not black-box AI". Prose studded with em dashes undercuts that claim on the
 * very page making it.
 *
 * This is a guard rather than a note in a style doc because the session that
 * removed 3,698 of them also found a guard written the week before that had
 * been failing unnoticed, for want of anybody running it. A rule nothing checks
 * is a rule that comes back.
 *
 * The forbidden character is held by code point so this file can look for it
 * without containing one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const EM_DASH = String.fromCharCode(8212)
/** The assistant vendor's name, by code point, for the same reason as above:
 *  this file checks for the word and must not itself be a hit. */
const VENDOR = String.fromCharCode(67, 108, 97, 117, 100, 101)
const NEWLINE = String.fromCharCode(10)
const ROOT = resolve('..')

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'out', 'dist', 'build', 'coverage',
  '.vercel', '.' + VENDOR.toLowerCase(), 'tmp',
])
const EXTS = /\.(ts|tsx|mts|js|jsx|go|md|css|html|sql)$/

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue
    const full = join(dir, e)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) walk(full, out)
    else if (EXTS.test(e)) out.push(full)
  }
  return out
}

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' - ' + extra : ''}`)
  if (!cond) fail++
}

console.log('house style: no em dashes')

const offenders: Array<{ file: string; line: number; text: string }> = []
let scanned = 0

for (const file of walk(ROOT)) {
  let src: string
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  scanned++
  if (!src.includes(EM_DASH)) continue
  src.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) {
      offenders.push({ file: relative(ROOT, file), line: i + 1, text: line.trim().slice(0, 90) })
    }
  })
}

ok(offenders.length === 0,
  `no em dash in any of ${scanned} source files`,
  offenders.length ? `${offenders.length} found` : 'clean')

for (const o of offenders.slice(0, 25)) {
  console.log(`    ${o.file}:${o.line}  ${o.text}`)
}
if (offenders.length > 25) {
  console.log(`    ...and ${offenders.length - 25} more`)
}

// EN dashes (U+2013) are a DIFFERENT character and are deliberately allowed:
// they are typographically correct in ranges such as an academic year or a
// period's start and end time, and flattening them would be a downgrade. This
// is reported, never failed, so the distinction stays visible to whoever runs
// this and nobody "fixes" it by mistake.
const EN_DASH = String.fromCharCode(8211)
let enCount = 0
for (const file of walk(ROOT)) {
  try {
    const src = readFileSync(file, 'utf8')
    for (const ch of src) if (ch === EN_DASH) enCount++
  } catch { /* unreadable */ }
}
console.log(`  (en dashes, U+2013, allowed on purpose: ${enCount})`)


// ── The vendor name is out of the project entirely ───────────────────────
//
// The repo should not read as though a particular assistant wrote it. The
// project-instructions file is Bhusku.md now, and the three prompt docs are
// BHUSKU_*.md, so the only survivor is a single .gitignore line.
//
// That line stays on purpose. Its whole job is to keep the assistant's local
// tooling directory OUT of the repo, so deleting the word there would invite
// in the very thing being removed. It has to name the directory to ignore it.
//
// The allowlist is built from VENDOR rather than written out, so this file
// enforces the rule without breaking it. Everything else is prose, and prose
// says Bhusku.
const VENDOR_ALLOWED = new Set(['.gitignore'])
const vendorHits: string[] = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  if (VENDOR_ALLOWED.has(basename(rel))) continue
  let src: string
  try { src = readFileSync(file, 'utf8') } catch { continue }
  src.split(NEWLINE).forEach((line, i) => {
    if (line.toLowerCase().includes(VENDOR.toLowerCase())) {
      vendorHits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`)
    }
  })
}
ok(vendorHits.length === 0,
  'the vendor name appears only where tooling requires it',
  vendorHits.length ? `${vendorHits.length} found` : 'clean')
for (const h of vendorHits.slice(0, 15)) console.log(`    ${h}`)

console.log(fail === 0 ? '\nALL STYLE CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
