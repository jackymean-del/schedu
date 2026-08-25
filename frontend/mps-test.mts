// Stream detection: what a section's NAME can and cannot tell us, and what
// the explicit stream on the section overrides. Run: npx tsx mps-test.mts
//
// This file used to expect bare senior names ('XI-A1', 'XI-C') to come back as
// 'science', which was true of one school's roster and nothing else. The rule
// since then is the one documented on resolveStream: the stream recorded on
// the section is authoritative, and the name is only consulted when there
// isn't one. A name carrying no stream marker is 'general' — not a guess.
import { detectStream, resolveStream } from './src/components/resources/curriculum'

let bad = 0
const check = (got: string, want: string, label: string) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(34)} = ${got.padEnd(9)}${ok ? '' : ' (want ' + want + ')'}`)
}

console.log('── by name: explicit markers ──')
const named: [string, string][] = [
  ['XI-COM1', 'commerce'], ['XI-COM2', 'commerce'], ['XII-COM', 'commerce'],
  ['XI-Com-1', 'commerce'], ['XII-Commerce', 'commerce'],
  ['XI-HUM', 'arts'], ['XI-Hum-A', 'arts'], ['XI-Arts', 'arts'],
  ['XI-Sci-A', 'science'], ['XI-PCM-A', 'science'], ['XI-Spark', 'science'],
  ['XI-PCB-A', 'pcb'], ['XI-Bot-A', 'pcb'],
  // "Computer" must never read as commerce — the 'com' prefix is a trap.
  ['XI-Computer', 'general'], ['XI-CompSci', 'general'],
]
for (const [name, want] of named) check(detectStream(name), want, name)

console.log('\n── by name: no marker means no guess ──')
// A plain section letter says nothing about the stream. Guessing 'science'
// here is what the section's own stream field is for.
for (const name of ['XI-A1', 'XI-B1', 'XI-C', 'XI-N', 'XII-D']) {
  check(detectStream(name), 'general', name)
}

console.log('\n── the recorded stream wins over the name ──')
const resolved: [{ name: string; stream?: string }, string][] = [
  [{ name: 'XI-C', stream: 'Science' }, 'science'],
  [{ name: 'XI-A1', stream: 'Spark' }, 'science'],
  [{ name: 'XI-N', stream: 'Commerce' }, 'commerce'],
  [{ name: 'XI-B1', stream: 'Humanities' }, 'arts'],
  [{ name: 'XI-C', stream: 'Biology' }, 'pcb'],
  // Named one way, recorded another: the record is authoritative.
  [{ name: 'XI-Com-1', stream: 'Science' }, 'science'],
  // No stream recorded, or an unrecognised one → fall back to the name.
  [{ name: 'XI-Hum-A', stream: '' }, 'arts'],
  [{ name: 'XI-Sci-A', stream: 'Foundation' }, 'science'],
  [{ name: 'XI-C', stream: 'General' }, 'general'],
]
for (const [sec, want] of resolved) {
  check(resolveStream(sec), want, `${sec.name} (stream: ${sec.stream || 'none'})`)
}

console.log(bad === 0 ? '\nALL STREAM CHECKS PASSED' : `\n${bad} CHECK(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
