/**
 * The positioning, and the SEO limits, checked mechanically.
 * Run: npx tsx content-verify.mts   (from marketing/)
 *
 * This exists because the title said one thing and the page said another for
 * months without anybody noticing. Google described the product as "schedU uses
 * AI to auto-generate conflict-free timetables" — not from a stale title, but
 * because the features page really did say "let the AI build a complete,
 * balanced timetable" and the home page's own hero animation really did show a
 * button labelled "AI Suggest". A crawler quoted the page accurately; the page
 * was wrong.
 *
 * Titles are checked too, because a title over about 60 characters is cut off
 * in the result, and a differentiator that is always cut off is a
 * differentiator nobody has ever read.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

/** Source with comments removed, so a comment ABOUT the AI problem is not
 *  mistaken for the problem. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'out') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

const files = [
  ...walk('app'),
  ...walk('components'),
  ...walk('content'),
  ...walk('lib'),
]

console.log('── no AI wording in copy a reader or a crawler will see ──')
{
  // Phrases where "AI" is deliberate and correct: naming the thing we are NOT,
  // or capturing people searching for one. Each is allowed by its exact text,
  // so a new use has to be added here on purpose rather than slipping in.
  const ALLOWED = [
    'not black-box AI',
    '(not black-box AI)',
    'Does schedU use AI to build timetables?',
    'AI timetable generator alternative',
    'AI overviews',
  ]

  const offenders: string[] = []
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const [i, line] of src.split('\n').entries()) {
      if (!/\bAI\b/.test(line)) continue
      if (ALLOWED.some(a => line.includes(a))) continue
      // The school SUBJECT "Artificial Intelligence" is a real subject, and its
      // abbreviation is legitimately AI.
      if (/artificial intelligence/i.test(line)) continue
      offenders.push(`${relative('.', f)}:${i + 1}  ${line.trim().slice(0, 90)}`)
    }
  }
  ok(offenders.length === 0, 'no stray "AI" in visible copy',
    offenders.length ? '\n    ' + offenders.join('\n    ') : 'none')
}

console.log('\n── the positioning leads, and survives the result ──')
{
  const home = readFileSync(join('app', 'page.tsx'), 'utf8')
  const titleMatch = /title:\s*'([^']+)'/.exec(home)
  const title = titleMatch?.[1] ?? ''
  ok(/Human Intelligence/i.test(title),
    'the home title names Human Intelligence', title)

  // Google shows roughly 600px, about 60 characters. A longer title is not an
  // error, but the part past the cut is never read — and the whole point of
  // this title is the half that used to be cut.
  ok(title.length <= 60, `and fits in a result (${title.length} chars, budget 60)`, title)

  const layout = readFileSync(join('app', 'layout.tsx'), 'utf8')
  const def = /default:\s*"([^"]+)"/.exec(layout)?.[1] ?? ''
  ok(/Human Intelligence/i.test(def), 'so does the site-wide default', def)
  ok(def.length <= 64, `and it fits too (${def.length} chars)`, def)
}

console.log('\n── every page is indexable on its own terms ──')
{
  const pages = ['app/page.tsx', 'app/features/page.tsx', 'app/pricing/page.tsx',
                 'app/docs/page.tsx', 'app/contact/page.tsx']
  const noCanonical: string[] = []
  const bareTitles: string[] = []
  for (const p of pages) {
    const src = readFileSync(p, 'utf8')
    if (!/alternates:\s*\{\s*canonical/.test(src)) noCanonical.push(p)
    // A one-word title renders as "Pricing · schedU" and matches nothing
    // anybody types into a search box.
    const m = /export const metadata[\s\S]*?title:\s*'([^']+)'/.exec(src)
    if (m && m[1].split(/\s+/).length < 3) bareTitles.push(`${p} → "${m[1]}"`)
  }
  ok(noCanonical.length === 0, 'every page declares a canonical', noCanonical.join(', ') || 'all present')
  ok(bareTitles.length === 0, 'and none has a one-word title', bareTitles.join(', ') || 'none')
}

console.log(fail === 0 ? '\nALL CONTENT CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
