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
  | 'hammer' | 'hammerring' | 'electric' | 'gong' | 'handbell'
  | 'westminster' | 'chime' | 'marimba' | 'triangle'
  | 'twotone' | 'buzzer' | 'ping'

export type RingGroup = 'Bells' | 'Chimes' | 'Signals'

export const BUILT_IN_RINGS: {
  id: BuiltInRing; name: string; hint: string; group: RingGroup
  /** Rings for as long as it is asked to, rather than having its own length.
   *  These are the ones the "how long" setting applies to. */
  sustained?: true
}[] = [
  { id: 'hammer',      group: 'Bells',   name: 'Bell + hammer', hint: 'One hammer strike, left to ring out' },
  { id: 'hammerring',  group: 'Bells',   name: 'Bell, rung',    hint: 'Struck over and over, for as long as you set', sustained: true },
  { id: 'electric',    group: 'Bells',   name: 'Electric bell', hint: 'The classic corridor brrrring', sustained: true },
  { id: 'gong',        group: 'Bells',   name: 'Brass gong',    hint: 'One deep strike, left to ring out' },
  { id: 'handbell',    group: 'Bells',   name: 'Hand bell',     hint: 'Brass, shaken by hand', sustained: true },
  { id: 'westminster', group: 'Chimes',  name: 'Westminster',   hint: 'The four-note quarter chime' },
  { id: 'chime',       group: 'Chimes',  name: 'Tubular chime', hint: 'Struck tube, soft edges' },
  { id: 'marimba',     group: 'Chimes',  name: 'Marimba',       hint: 'Wooden and warm — good for infants' },
  { id: 'triangle',    group: 'Chimes',  name: 'Triangle',      hint: 'Bright, thin, gentle' },
  { id: 'twotone',     group: 'Signals', name: 'Two-tone',      hint: 'Bing-bong, before an announcement' },
  { id: 'buzzer',      group: 'Signals', name: 'Buzzer',        hint: 'Harsh — hard to ignore', sustained: true },
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

/**
 * A HAMMER strike on a thick bell — the school bell that hangs by the office
 * and gets hit with a steel hammer, rather than one swung on a rope.
 *
 * Three things separate it from the clapper bell above, and all three are what
 * make it read as "hit with metal":
 *
 *  1. The contact is metal on metal, so the transient is brighter and lasts a
 *     little longer than a clapper's — two noise bands, one very high.
 *  2. A hammer excites far more of the higher modes, so there are more
 *     partials, and the top ones are loud enough to hear as a distinct clang
 *     before they die away.
 *  3. Real castings are never perfectly symmetrical, so each mode is really
 *     two modes a fraction apart. They drift in and out of phase, and that
 *     slow beating is the shimmer a synthesised bell is always missing.
 */
const HAMMER_PARTIALS: [ratio: number, gain: number, decayScale: number][] = [
  [0.5,  0.22, 1.00],   // hum — long, and what is left at the end
  [1.0,  0.34, 0.85],   // prime
  [1.19, 0.30, 0.60],   // tierce, the minor third
  [1.5,  0.20, 0.45],   // quint
  [2.0,  0.22, 0.35],   // nominal — a hammer drives this harder than a clapper
  [2.55, 0.14, 0.22],
  [3.01, 0.12, 0.17],
  [4.07, 0.08, 0.11],
  [5.43, 0.05, 0.08],
  [6.79, 0.03, 0.05],
]

function hammerHit(c: Ctx, out: AudioNode, t0: number, hz: number, gain: number, decay: number) {
  // Metal on metal: a bright band for the ring of the hammer face, a lower one
  // for the body of the bell taking the blow.
  strikeNoise(c, out, t0, gain * 0.55, hz * 9, 0.055)
  strikeNoise(c, out, t0, gain * 0.40, hz * 3.5, 0.03)

  for (const [ratio, g, ds] of HAMMER_PARTIALS) {
    // Each mode as a beating pair. The offset grows with the partial, which is
    // what real castings do, and keeps the beats from lining up into a tremolo.
    const beat = 0.0009 * ratio * hz
    partial(c, out, t0, hz * ratio, gain * g * 0.6, decay * ds)
    partial(c, out, t0, hz * ratio + beat, gain * g * 0.55, decay * ds * 0.95)
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
 * Written by ear-free measurement: each ring is rendered offline and its RMS
 * taken over the first second and a half — the part anyone actually hears as
 * "the bell". Whole-file RMS is the wrong yardstick here, because a single
 * strike left to ring out for nine seconds is mostly tail, and matching it to
 * a sustained buzz on that basis drives its strike into clipping.
 *
 * Untrimmed the spread is wide, and in unhelpful directions — the electric
 * bell came out quietest of all, because thirty short strikes average to less
 * energy than one held buzz. Left alone, the volume slider would mean a
 * different thing for every choice, and a school that changes its ring would
 * find it had also changed how loud its corridor is.
 *
 * The spread that is left is deliberate and matches what each one claims to
 * be: the buzzer sits above the pack because it is the one you cannot ignore,
 * the triangle and the ping below it because they are the gentle ones.
 */
export const MIN_RING_SECONDS = 1
export const MAX_RING_SECONDS = 30
export const DEFAULT_RING_SECONDS = 4

const LEVEL_TRIM: Record<BuiltInRing, number> = {
  hammer: 0.97, hammerring: 1.05,
  electric: 2.50, gong: 1.00, handbell: 1.62,
  westminster: 0.62, chime: 0.82, marimba: 0.99, triangle: 1.28,
  twotone: 0.89, buzzer: 0.69, ping: 1.15,
}

export function synthRing(
  c: Ctx, out: AudioNode, t0: number, id: BuiltInRing, v: number,
  /** How long the sustained rings should keep going. Ignored by the rings
   *  that have a length of their own — a chime is as long as a chime is. */
  seconds = DEFAULT_RING_SECONDS,
): number {
  const g = Math.max(0, Math.min(1, v)) * LEVEL_TRIM[id]
  const hold = Math.max(MIN_RING_SECONDS, Math.min(MAX_RING_SECONDS, seconds))
  switch (id) {
    case 'hammer':
      // One blow, then left alone. A big bell rings a long time.
      hammerHit(c, out, t0, 415.3, 0.34 * g, 9)
      return 9.4

    case 'hammerring': {
      // Struck steadily by hand — about twice a second, which is as fast as
      // anybody swings a hammer for minutes at a time. The unevenness is on
      // purpose: a machine-perfect interval is the one thing a person never
      // manages, and it is what makes a loop sound like a loop.
      const gap = 0.46
      const hits = Math.max(2, Math.round(hold / gap))
      for (let i = 0; i < hits; i++) {
        // Late, never early — a person swinging a hammer drifts behind the
        // beat, and a negative offset would put the first strike before the
        // start of the render, which the audio clock refuses outright.
        const jitter = ((i * 37) % 11) * 0.006          // 0–60ms, repeatable
        hammerHit(c, out, t0 + i * gap + jitter, 415.3, 0.26 * g, 2.6)
      }
      return hits * gap + 2.4
    }

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
      const until = t0 + hold
      for (let i = 0; t < until; i++) {
        bellHit(c, out, t, i % 2 ? 987.8 : 932.3, 0.20 * g, 0.9)
        t += 0.15 + (i % 3) * 0.02
      }
      return hold + 0.9
    }

    case 'electric': {
      // A solenoid drives the clapper into the gong ten times a second for as
      // long as the current is on. Each contact is its own strike — a tremolo
      // on a held tone gets the rhythm but never the rattle.
      const gap = 0.1
      const hits = Math.max(4, Math.round(hold / gap))
      for (let i = 0; i < hits; i++) bellHit(c, out, t0 + i * gap, 1318.5, 0.16 * g, 0.34)
      return hits * gap + 0.4
    }

    case 'twotone':
      malletHit(c, out, t0, 659.3, 0.34 * g, 1.1)
      malletHit(c, out, t0 + 0.42, 523.3, 0.34 * g, 1.6)
      return 2.2

    case 'buzzer': {
      // Three harsh bursts, the way a klaxon actually gets pressed.
      const gap = 0.5
      const bursts = Math.max(2, Math.round(hold / gap))
      for (let i = 0; i < bursts; i++) buzz(c, out, t0 + i * gap, 233.1, 0.20 * g, 0.36)
      return bursts * gap + 0.1
    }
  }
}

/** How long a ring lasts, without building it. */
export function ringSeconds(id: BuiltInRing, seconds = DEFAULT_RING_SECONDS): number {
  const silent = new OfflineAudioContext(1, 1, 8000)
  return synthRing(silent, silent.destination, 0, id, 0, seconds)
}

let live: { stop: () => void } | null = null

function playBuiltIn(id: BuiltInRing, volume: number, seconds: number) {
  const c = audioCtx()
  if (!c) return
  // Everything goes through one gain node so a ring in progress can be cut
  // short — the long ones (gong, the rung bell) outlast a second press.
  const bus = c.createGain()
  bus.connect(c.destination)
  synthRing(c, bus, c.currentTime, id, volume, seconds)
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

let customStop = 0

function playCustom(dataUrl: string, volume: number, seconds: number) {
  // One element, reused: a bell that rings while the last one is still playing
  // should restart, not layer.
  if (!customEl) customEl = new Audio()
  if (customEl.src !== dataUrl) customEl.src = dataUrl
  customEl.volume = Math.max(0, Math.min(1, volume))
  customEl.currentTime = 0

  // A real recording is usually ONE strike. Looping it to fill the chosen
  // length is how a school gets its own bell rung for eight seconds without
  // having to record eight seconds of it.
  customEl.loop = true
  customStop = Date.now() + Math.max(MIN_RING_SECONDS, seconds) * 1000
  customEl.onended = null
  customEl.ontimeupdate = () => {
    if (Date.now() >= customStop) stopRing()
  }
  void customEl.play().catch(() => {
    // Blocked despite arming — the board shows the "tap to enable" state, so
    // there is nothing useful to do here.
  })
}

export interface RingChoice {
  sound: BuiltInRing | 'custom'
  customDataUrl?: string
  volume: number
  /** How long the sustained rings — and a looped recording — keep going. */
  seconds?: number
}

/** Ring. Silent — and honest about it — when audio was never unlocked. */
export function ring(choice: RingChoice) {
  stopRing()
  const seconds = choice.seconds ?? DEFAULT_RING_SECONDS
  if (choice.sound === 'custom') {
    if (choice.customDataUrl) playCustom(choice.customDataUrl, choice.volume, seconds)
    return
  }
  playBuiltIn(choice.sound, choice.volume, seconds)
}

/** Cut a ring short — used when auditioning one ring after another. */
export function stopRing() {
  if (customEl) {
    customEl.ontimeupdate = null
    customEl.loop = false
    customEl.pause()
    customEl.currentTime = 0
  }
  if (live) { live.stop(); live = null }
}

/**
 * The biggest custom recording we will keep. It is persisted with the rest of
 * the board's settings in localStorage — a ~5MB drawer shared with everything
 * else the app stores — and base64 inflates a file by a third, so 1MB of audio
 * costs about 1.4MB of that drawer.
 *
 * At ordinary bitrates this is roughly a minute of sound, which is far more
 * than a bell needs. (An earlier version of this comment claimed the old
 * 512KB was "about two seconds", which was wrong by a factor of fifteen.)
 */
export const MAX_RING_BYTES = 1024 * 1024

export function readAudioFile(file: File): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('audio/')) {
      reject(new Error('That is not an audio file.')); return
    }
    if (file.size > MAX_RING_BYTES) {
      reject(new Error(`Too big — keep it under ${Math.round(MAX_RING_BYTES / 1024)} KB, which is about a minute of audio.`))
      return
    }
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Could not read that file.'))
    fr.onload = () => resolve({ dataUrl: String(fr.result), name: file.name })
    fr.readAsDataURL(file)
  })
}
