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
 * The built-in rings are synthesised rather than shipped as files: a bell is a
 * few sine waves with the right decay, and it keeps the bundle honest. A school
 * that wants its own recording uploads one, which plays through an <audio>
 * element instead.
 */

export type BuiltInRing = 'chime' | 'handbell' | 'ping'

export const BUILT_IN_RINGS: { id: BuiltInRing; name: string; hint: string }[] = [
  { id: 'chime',    name: 'Chime',      hint: 'Two-tone, soft edges' },
  { id: 'handbell', name: 'School bell', hint: 'The clattery one' },
  { id: 'ping',     name: 'Ping',       hint: 'Short and quiet' },
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

/** One struck partial: a sine that starts loud and decays away. */
function strike(c: AudioContext, at: number, freq: number, gain: number, decay: number) {
  const osc = c.createOscillator()
  const amp = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, at)
  amp.gain.setValueAtTime(0.0001, at)
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  osc.connect(amp); amp.connect(c.destination)
  osc.start(at); osc.stop(at + decay + 0.05)
}

function playBuiltIn(id: BuiltInRing, volume: number) {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  const v = Math.max(0, Math.min(1, volume))

  if (id === 'ping') {
    strike(c, t, 1046.5, 0.34 * v, 0.55)
    return
  }

  if (id === 'chime') {
    // A struck tube: fundamental plus the two partials that make it read as a
    // chime rather than a beep, the upper ones dying away first.
    const parts: [number, number, number][] = [
      [784.0, 0.30, 1.9], [1174.7, 0.16, 1.3], [1568.0, 0.08, 0.8],
    ]
    parts.forEach(([f, g, d]) => strike(c, t, f, g * v, d))
    strike(c, t + 0.62, 587.3, 0.24 * v, 2.1)
    return
  }

  // handbell — a clapper hitting metal, over and over. The rattle is the
  // amplitude wobble, not the note, so it is a tremolo on a bright pair of
  // partials rather than a series of separate strikes.
  const dur = 1.7
  const osc = c.createOscillator()
  const osc2 = c.createOscillator()
  const amp = c.createGain()
  const trem = c.createOscillator()
  const tremAmp = c.createGain()

  osc.type = 'triangle'; osc.frequency.setValueAtTime(660, t)
  osc2.type = 'triangle'; osc2.frequency.setValueAtTime(988, t)
  trem.type = 'square'; trem.frequency.setValueAtTime(11, t)
  tremAmp.gain.setValueAtTime(0.5, t)

  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.22 * v), t + 0.02)
  amp.gain.setValueAtTime(Math.max(0.0001, 0.22 * v), t + dur - 0.25)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  trem.connect(tremAmp); tremAmp.connect(amp.gain)
  osc.connect(amp); osc2.connect(amp); amp.connect(c.destination)
  ;[osc, osc2, trem].forEach(o => { o.start(t); o.stop(t + dur + 0.05) })
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
  if (choice.sound === 'custom') {
    if (choice.customDataUrl) playCustom(choice.customDataUrl, choice.volume)
    return
  }
  playBuiltIn(choice.sound, choice.volume)
}

/** Stop a long custom recording early — used by the "Test" button. */
export function stopRing() {
  if (customEl) { customEl.pause(); customEl.currentTime = 0 }
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
