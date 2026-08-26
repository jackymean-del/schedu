/**
 * MAKING A NOISE FROM A BROWSER TAB.
 *
 * The hard part is not the sound, it is the permission. Browsers refuse to let
 * a page play audio until somebody has interacted with it, and a corridor
 * display is by definition unattended — so a board that just calls play() at
 * 9:40 is silent, silently. Every sound therefore goes through here, and the
 * screen can ask whether it is actually able to ring (`isArmed`) so it can say
 * "tap to enable" rather than failing where nobody can see it.
 *
 * `arm()` must be called from a real user gesture — a click handler, not an
 * effect. After that the AudioContext stays usable for the life of the page,
 * which for this screen means until someone reloads it.
 *
 * The built-in rings are synthesised rather than shipped as files: it keeps the
 * bundle honest, it means no licensing question hangs over a school's bell, and
 * a struck bell is genuinely just a handful of sine waves once you know which
 * ones. A school that wants its own recording uploads one, which plays through
 * an <audio> element instead.
 */

export type BuiltInRing =
  | 'electric' | 'gong' | 'handbell'
  | 'westminster' | 'chime' | 'marimba' | 'triangle'
  | 'twotone' | 'buzzer' | 'ping'

export type RingGroup = 'Bells' | 'Chimes' | 'Signals'

export const BUILT_IN_RINGS: {
  id: BuiltInRing; name: string; hint: string; group: RingGroup
}[] = [
  { id: 'electric',    group: 'Bells',   name: 'Electric bell', hint: 'The classic corridor brrrring' },
  { id: 'gong',        group: 'Bells',   name: 'Brass gong',    hint: 'One deep strike, left to ring out' },
  { id: 'handbell',    group: 'Bells',   name: 'Hand bell',     hint: 'Brass, shaken by hand' },
  { id: 'westminster', group: 'Chimes',  name: 'Westminster',   hint: 'The four-note quarter chime' },
  { id: 'chime',       group: 'Chimes',  name: 'Tubular chime', hint: 'Struck tube, soft edges' },
  { id: 'marimba',     group: 'Chimes',  name: 'Marimba',       hint: 'Wooden and warm — good for infants' },
  { id: 'triangle',    group: 'Chimes',  name: 'Triangle',      hint: 'Bright, thin, gentle' },
  { id: 'twotone',     group: 'Signals', name: 'Two-tone',      hint: 'Bing-bong, before an announcement' },
  { id: 'buzzer',      group: 'Signals', name: 'Buzzer',        hint: 'Harsh — hard to ignore' },
  { id: 'ping',        group: 'Signals', name: 'Ping',          hint: 'Short and quiet' },
]

let ctx: AudioContext | null = null
let armed = false

function audioCtx(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/** Has a user gesture unlocked audio for this page yet? */
export function isArmed(): boolean {
  return armed && ctx?.state === 'running'
}

/**
 * Unlock audio. MUST be called from a user gesture. Resolves to whether the
 * page can now make a sound, so the caller can keep asking if it cannot.
 */
export async function arm(): Promise<boolean> {
  const c = audioCtx()
  if (!c) return false
  try {
    if (c.state === 'suspended') await c.resume()
    // A zero-length silent buffer: on stricter engines resume() alone is not
    // enough, the context has to have actually played something.
    const buf = c.createBuffer(1, 1, c.sampleRate)
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start(0)
    armed = c.state === 'running'
  } catch {
    armed = false
  }
  return armed
}

// ─── The synth ──────────────────────────────────────────────────────────────
//
// What makes a struck bell sound like metal rather than an organ note is that
// its partials are NOT a harmonic series. A real casting is tuned to roughly
//   hum : prime : tierce : quint : nominal  =  0.5 : 1 : 1.2 : 1.5 : 2
// and that 1.2 is a MINOR third, which is where a bell's faintly mournful
// colour comes from. No amount of stacking octaves and fifths gets there.
//
// The other half is the strike: a few milliseconds of filtered noise as the
// clapper meets the metal. Leave it out and every bell sounds like it faded
// in, which is the giveaway of a synthesised one.
//
// Everything takes its context as an argument so a ring can be rendered
// offline and measured, instead of only ever being judged by ear.

type Ctx = BaseAudioContext

/** Noise, built once per context — the clapper's contact sound. */
const noiseCache = new WeakMap<Ctx, AudioBuffer>()
function noiseBuffer(c: Ctx): AudioBuffer {
  const hit = noiseCache.get(c)
  if (hit) return hit
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.4), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  noiseCache.set(c, buf)
  return buf
}

/** The contact transient: filtered noise, gone in a few milliseconds. */
function strikeNoise(c: Ctx, out: AudioNode, t0: number, gain: number, hz: number, dur = 0.05) {
  const src = c.createBufferSource()
  const bp = c.createBiquadFilter()
  const amp = c.createGain()
  src.buffer = noiseBuffer(c)
  bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 1.2
  amp.gain.setValueAtTime(Math.max(0.0001, gain), t0)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(bp); bp.connect(amp); amp.connect(out)
  src.start(t0); src.stop(t0 + dur + 0.02)
}

/** One decaying sine partial. */
function partial(c: Ctx, out: AudioNode, t0: number, hz: number, gain: number, decay: number) {
  const osc = c.createOscillator()
  const amp = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(hz, t0)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.004)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
  osc.connect(amp); amp.connect(out)
  osc.start(t0); osc.stop(t0 + decay + 0.03)
}

/** Bell partial ratios, with how loud each is and how fast it dies. The upper
 *  ones go first, which is why a bell grows darker as it rings out. */
const BELL_PARTIALS: [ratio: number, gain: number, decayScale: number][] = [
  [0.5, 0.28, 1.00],   // hum
  [1.0, 0.40, 0.80],   // prime
  [1.2, 0.30, 0.55],   // tierce — the minor third
  [1.5, 0.18, 0.40],   // quint
  [2.0, 0.16, 0.28],   // nominal
  [2.7, 0.08, 0.16],
  [3.4, 0.05, 0.10],
]

/** A struck bell: contact transient, then the inharmonic partials ringing on. */
function bellHit(c: Ctx, out: AudioNode, t0: number, hz: number, gain: number, decay: number) {
  strikeNoise(c, out, t0, gain * 0.5, hz * 3, 0.04)
  for (const [ratio, g, ds] of BELL_PARTIALS) {
    // A touch of detune on the upper partials gives the slow beating a real
    // casting has; a perfectly tuned bell sounds like a synthesiser.
    const detune = ratio > 1 ? 1 + ratio * 0.0015 : 1
    partial(c, out, t0, hz * ratio * detune, gain * g, decay * ds)
  }
}

/** A struck tube or wooden bar: harmonic rather than inharmonic, and shorter. */
function malletHit(c: Ctx, out: AudioNode, t0: number, hz: number, gain: number, decay: number, wood = false) {
  strikeNoise(c, out, t0, gain * (wood ? 0.35 : 0.22), hz * (wood ? 2 : 4), 0.03)
  const parts: [number, number, number][] = wood
    ? [[1, 1.0, 1], [4, 0.18, 0.5], [10, 0.06, 0.25]]      // a marimba bar's odd modes
    : [[1, 1.0, 1], [2, 0.35, 0.6], [3, 0.14, 0.35], [4.2, 0.07, 0.2]]
  for (const [r, g, ds] of parts) partial(c, out, t0, hz * r, gain * g, decay * ds)
}

/** A buzzing electrical voice — square-ish, sagging slightly as it holds. */
function buzz(c: Ctx, out: AudioNode, t0: number, hz: number, gain: number, dur: number) {
  const osc = c.createOscillator()
  const lp = c.createBiquadFilter()
  const amp = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(hz, t0)
  osc.frequency.linearRampToValueAtTime(hz * 0.98, t0 + dur)
  lp.type = 'lowpass'; lp.frequency.value = 2600
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.01)
  amp.gain.setValueAtTime(Math.max(0.0001, gain), t0 + dur - 0.03)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(lp); lp.connect(amp); amp.connect(out)
  osc.start(t0); osc.stop(t0 + dur + 0.02)
}

/**
 * Build one ring into `out`, starting at `t0`. Returns how long it lasts, so
 * an offline render knows how much tape to reserve.
 *
 * Exported because the same code runs in two places: this page, and an
 * OfflineAudioContext where every ring can be rendered and measured.
 */
/**
 * Per-ring loudness trim.
 *
 * Written by ear-free measurement: each ring was rendered offline and its RMS
 * taken, which spread over 4:1 — the electric bell, of all things, came out
 * quietest, because thirty short strikes average out to less energy than one
 * sustained buzz. Untrimmed, the volume slider means a different thing for
 * every choice, and a school that switches ring finds it has also changed how
 * loud its corridor is.
 *
 * The spread that is left is deliberate and matches what each one claims to
 * be: the buzzer sits above the pack because it is the one you cannot ignore,
 * the triangle and the ping below it because they are the gentle ones.
 */
const LEVEL_TRIM: Record<BuiltInRing, number> = {
  electric: 2.36, gong: 1.61, handbell: 1.86,
  westminster: 0.78, chime: 0.94, marimba: 0.83, triangle: 1.38,
  twotone: 0.97, buzzer: 0.70, ping: 0.90,
}

export function synthRing(c: Ctx, out: AudioNode, t0: number, id: BuiltInRing, v: number): number {
  const g = Math.max(0, Math.min(1, v)) * LEVEL_TRIM[id]
  switch (id) {
    case 'ping':
      malletHit(c, out, t0, 1046.5, 0.34 * g, 0.5)
      return 0.6

    case 'triangle':
      // Very high, very thin, and it rings for ages — almost all upper partials.
      partial(c, out, t0, 2093, 0.16 * g, 2.4)
      partial(c, out, t0, 3138, 0.10 * g, 2.0)
      partial(c, out, t0, 4186, 0.06 * g, 1.6)
      strikeNoise(c, out, t0, 0.10 * g, 6000, 0.03)
      return 2.6

    case 'marimba':
      malletHit(c, out, t0, 523.3, 0.40 * g, 0.9, true)
      malletHit(c, out, t0 + 0.16, 784.0, 0.34 * g, 1.1, true)
      return 1.4

    case 'chime':
      malletHit(c, out, t0, 784.0, 0.32 * g, 1.9)
      malletHit(c, out, t0 + 0.62, 587.3, 0.28 * g, 2.2)
      return 2.9

    case 'westminster': {
      // The quarter chime, in E — the four notes everybody recognises.
      const notes = [659.3, 587.3, 523.3, 392.0]
      notes.forEach((hz, i) => malletHit(c, out, t0 + i * 0.55, hz, 0.30 * g, 2.4))
      return 0.55 * 3 + 2.6
    }

    case 'gong':
      // Deep, slow, and left alone to ring out.
      bellHit(c, out, t0, 174.6, 0.42 * g, 5.5)
      return 5.8

    case 'handbell': {
      // Shaken: the clapper strikes each wall in turn, so the hits alternate
      // and the spacing is uneven, the way a hand is uneven.
      let t = t0
      for (let i = 0; i < 7; i++) {
        bellHit(c, out, t, i % 2 ? 987.8 : 932.3, 0.20 * g, 0.9)
        t += 0.15 + (i % 3) * 0.02
      }
      return 2.1
    }

    case 'electric': {
      // A solenoid drives the clapper into the gong ten times a second for as
      // long as the current is on. Each contact is its own strike — a tremolo
      // on a held tone gets the rhythm but never the rattle.
      const hits = 30, gap = 0.1
      for (let i = 0; i < hits; i++) bellHit(c, out, t0 + i * gap, 1318.5, 0.16 * g, 0.34)
      return hits * gap + 0.4
    }

    case 'twotone':
      malletHit(c, out, t0, 659.3, 0.34 * g, 1.1)
      malletHit(c, out, t0 + 0.42, 523.3, 0.34 * g, 1.6)
      return 2.2

    case 'buzzer': {
      // Three harsh bursts, the way a klaxon actually gets pressed.
      for (let i = 0; i < 3; i++) buzz(c, out, t0 + i * 0.5, 233.1, 0.20 * g, 0.36)
      return 1.7
    }
  }
}

/** How long a ring lasts, without building it. */
export function ringSeconds(id: BuiltInRing): number {
  const silent = new OfflineAudioContext(1, 1, 8000)
  return synthRing(silent, silent.destination, 0, id, 0)
}

let live: { stop: () => void } | null = null

function playBuiltIn(id: BuiltInRing, volume: number) {
  const c = audioCtx()
  if (!c) return
  // Everything goes through one gain node so a ring in progress can be cut
  // short — the long ones (gong, electric) outlast a second press otherwise.
  const bus = c.createGain()
  bus.connect(c.destination)
  synthRing(c, bus, c.currentTime, id, volume)
  live = {
    stop: () => {
      try {
        bus.gain.cancelScheduledValues(c.currentTime)
        bus.gain.setValueAtTime(bus.gain.value, c.currentTime)
        bus.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.05)
      } catch { /* already gone */ }
    },
  }
}

let customEl: HTMLAudioElement | null = null

function playCustom(dataUrl: string, volume: number) {
  // One element, reused: a bell that rings while the last one is still playing
  // should restart, not layer.
  if (!customEl) customEl = new Audio()
  if (customEl.src !== dataUrl) customEl.src = dataUrl
  customEl.volume = Math.max(0, Math.min(1, volume))
  customEl.currentTime = 0
  void customEl.play().catch(() => {
    // Blocked despite arming — the board shows the "tap to enable" state, so
    // there is nothing useful to do here.
  })
}

export interface RingChoice {
  sound: BuiltInRing | 'custom'
  customDataUrl?: string
  volume: number
}

/** Ring. Silent — and honest about it — when audio was never unlocked. */
export function ring(choice: RingChoice) {
  stopRing()
  if (choice.sound === 'custom') {
    if (choice.customDataUrl) playCustom(choice.customDataUrl, choice.volume)
    return
  }
  playBuiltIn(choice.sound, choice.volume)
}

/** Cut a ring short — used when auditioning one ring after another. */
export function stopRing() {
  if (customEl) { customEl.pause(); customEl.currentTime = 0 }
  if (live) { live.stop(); live = null }
}

/**
 * The biggest custom recording we will keep. It is persisted with the rest of
 * the board's settings in localStorage, which is a ~5MB drawer shared with
 * everything else the app stores, and base64 inflates a file by a third. A
 * bell is two seconds long; anything past this is a song.
 */
export const MAX_RING_BYTES = 512 * 1024

export function readAudioFile(file: File): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('audio/')) {
      reject(new Error('That is not an audio file.')); return
    }
    if (file.size > MAX_RING_BYTES) {
      reject(new Error(`Too big — keep it under ${Math.round(MAX_RING_BYTES / 1024)} KB (about 2 seconds).`))
      return
    }
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Could not read that file.'))
    fr.onload = () => resolve({ dataUrl: String(fr.result), name: file.name })
    fr.readAsDataURL(file)
  })
}
