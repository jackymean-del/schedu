/**
 * THE BOARD'S BELL — the ringing itself, and the small panel that configures it.
 *
 * Two things live here that the board deliberately keeps at arm's length:
 *
 *  - a one-second heartbeat. The board itself re-derives the whole timetable
 *    when it ticks, so it ticks every fifteen seconds and must keep doing so.
 *    A bell needs the actual minute boundary, and the clock needs the actual
 *    second, so both own their own interval and re-render only themselves.
 *
 *  - the sound permission. A browser will not let a page make a noise until
 *    somebody has interacted with it, which an unattended corridor screen never
 *    provides. So the board arms on the first tap ANYWHERE on the page, and
 *    says so in plain words until that has happened — a bell that is silently
 *    disallowed is the whole failure mode of this feature.
 */
import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Play, Plus, Volume2, X } from 'lucide-react'
import type { Ring } from '@/lib/bellSchedule'
import { fmtRingTime } from '@/lib/bellSchedule'
import { ringsDue, parseClock, toClock, type DueRing } from '@/lib/bellRinger'
import {
  arm, isArmed, ring, stopRing, readAudioFile,
  BUILT_IN_RINGS, MAX_RING_BYTES, type BuiltInRing, type RingGroup,
} from '@/lib/bellAudio'
import { useBellSettings } from '@/store/bellSettings'

const CARD = '#16141F'
const LINE = '#262234'
const DIM = '#8B87AD'
const ACCENT = '#9E92FF'

/** The order the groups are shown in — loudest and most school-like first. */
const RING_GROUPS: RingGroup[] = ['Bells', 'Chimes', 'Signals']

/** How long the board shows what just rang. */
const FLASH_MS = 6000

/**
 * Rings the bell, and reports what it is doing so the screen can show it.
 * Keeps its clock in a ref: this runs every second and must not re-render the
 * board that hosts it, only itself, and only when something actually happens.
 */
export function useBellRinger(opts: { rings: Ring[]; dayKey: string; silent: boolean }) {
  const { rings, dayKey, silent } = opts
  const enabled = useBellSettings(s => s.enabled)
  const sound = useBellSettings(s => s.sound)
  const volume = useBellSettings(s => s.volume)
  const customDataUrl = useBellSettings(s => s.customDataUrl)
  const alarms = useBellSettings(s => s.alarms)

  const [flash, setFlash] = useState<DueRing | null>(null)
  const [armedNow, setArmedNow] = useState(() => isArmed())

  // Latest inputs, read by the interval without restarting it.
  const live = useRef({ rings, dayKey, silent, enabled, sound, volume, customDataUrl, alarms })
  live.current = { rings, dayKey, silent, enabled, sound, volume, customDataUrl, alarms }
  const prevMin = useRef<number | undefined>(undefined)

  // The first tap anywhere on the page is the gesture that buys us sound.
  useEffect(() => {
    if (armedNow) return
    const onGesture = () => { void arm().then(ok => ok && setArmedNow(true)) }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [armedNow])

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const nowMin = d.getHours() * 60 + d.getMinutes()
      const s = live.current
      const due = ringsDue({
        rings: s.rings, alarms: s.alarms, dayKey: s.dayKey,
        prevMin: prevMin.current, nowMin, silent: s.silent || !s.enabled,
      })
      prevMin.current = nowMin
      if (!due.length) return
      // Two bells in one minute is one sound; the label carries both.
      ring({ sound: s.sound, customDataUrl: s.customDataUrl, volume: s.volume })
      setFlash(due[0])
      window.setTimeout(() => setFlash(f => (f?.key === due[0].key ? null : f)), FLASH_MS)
    }
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [])

  return {
    flash,
    /** Sound is wanted but the browser has not been given its gesture yet. */
    needsTap: enabled && !armedNow,
    armNow: () => { void arm().then(ok => setArmedNow(ok)) },
  }
}

/** The band that appears for a few seconds when the bell goes. */
export function RingFlash({ due }: { due: DueRing }) {
  return (
    <div style={{
      border: `2px solid ${ACCENT}`, background: 'rgba(158,146,255,0.14)',
      borderRadius: 16, padding: 'clamp(12px, 1.4vw, 20px)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <Bell size={22} color={ACCENT} />
      <span style={{ fontSize: 'clamp(18px, 2.2vw, 34px)', fontWeight: 800 }}>{due.label}</span>
      <span style={{ fontSize: 'clamp(12px, 1.2vw, 18px)', color: DIM, fontVariantNumeric: 'tabular-nums' }}>
        {fmtRingTime(due.at)}
      </span>
    </div>
  )
}

/** Shown while sound is on but disallowed — the failure that is otherwise silent. */
export function NeedsTapBand({ onTap }: { onTap: () => void }) {
  return (
    <button onClick={onTap} style={{
      border: `2px dashed ${LINE}`, background: 'transparent', color: DIM,
      borderRadius: 16, padding: 'clamp(10px, 1.1vw, 16px)', cursor: 'pointer',
      fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <BellOff size={18} />
      <span style={{ fontSize: 'clamp(12px, 1.2vw, 17px)' }}>
        The bell is on, but this browser won't play sound until the screen is touched.
        <strong style={{ color: '#C9C3EC' }}> Tap anywhere to enable it.</strong>
      </span>
    </button>
  )
}

export function BellButton({ onClick, on }: { onClick: () => void; on: boolean }) {
  return (
    <button onClick={onClick} title="Bell settings" style={{
      background: 'transparent', border: `1px solid ${LINE}`, color: on ? ACCENT : '#4A4560',
      borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 'clamp(10px, 0.9vw, 13px)', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {on ? <Bell size={13} /> : <BellOff size={13} />}
      {on ? 'Bell on' : 'Bell off'}
    </button>
  )
}

export function BellPanel({ onClose, rings }: { onClose: () => void; rings: Ring[] }) {
  const s = useBellSettings()
  const [err, setErr] = useState('')
  const [at, setAt] = useState('15:30')
  const [label, setLabel] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Auditioning has to arm audio first: the click IS the gesture, and
  // without it the browser silently drops the first sound anyone tries.
  const audition = (id: BuiltInRing) => {
    void arm().then(() => ring({ sound: id, volume: s.volume }))
  }

  const testRing = () => {
    void arm().then(() => ring({ sound: s.sound, customDataUrl: s.customDataUrl, volume: s.volume }))
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    try {
      const { dataUrl, name } = await readAudioFile(f)
      s.setCustom(dataUrl, name)
    } catch (e: any) {
      setErr(e?.message ?? 'Could not use that file.')
    }
  }

  const addAlarm = () => {
    const min = parseClock(at)
    if (min === undefined) { setErr('Give the time as HH:MM.'); return }
    setErr('')
    s.addAlarm({ at: min, label: label.trim() || 'Alarm' })
    setLabel('')
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(6,5,12,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
        background: CARD, border: `1px solid ${LINE}`, borderRadius: 18,
        padding: 22, color: '#F4F2FF', display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Bell</div>
            <div style={{ fontSize: 12.5, color: DIM, marginTop: 2 }}>
              This screen only — other devices showing the board stay silent.
            </div>
          </div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>

        {/* On / off */}
        <Row label="Ring at the timetable's bell times"
          hint={rings.length ? `${rings.length} bells today, first at ${fmtRingTime(rings[0].at)}` : 'No bells today'}>
          <Toggle checked={s.enabled} onChange={s.setEnabled} />
        </Row>

        {/* Sound — pick with the left button, hear it with the right one */}
        <div style={{ flexShrink: 0 }}>
          <Head>Sound</Head>
          {RING_GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#4A4560', letterSpacing: '0.06em', marginBottom: 6 }}>
                {group.toUpperCase()}
              </div>
              <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                {BUILT_IN_RINGS.filter(r => r.group === group).map(r => (
                  <RingOption key={r.id}
                    name={r.name} hint={r.hint}
                    selected={s.sound === r.id}
                    onSelect={() => { s.setSound(r.id); audition(r.id) }}
                    onPlay={() => audition(r.id)} />
                ))}
              </div>
            </div>
          ))}

          <RingOption
            name={s.customName ? trim(s.customName, 22) : 'Your own recording'}
            hint={s.customDataUrl ? 'Uploaded to this screen' : 'Choose a file below first'}
            selected={s.sound === 'custom'}
            disabled={!s.customDataUrl}
            onSelect={() => s.customDataUrl && s.setSound('custom')}
            onPlay={() => s.customDataUrl && ring({ sound: 'custom', customDataUrl: s.customDataUrl, volume: s.volume })} />

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={testRing} style={{ ...chip(false), borderStyle: 'dashed' }}>Test the chosen one</button>
            <button onClick={stopRing} style={{ ...chip(false), borderStyle: 'dashed' }}>Stop</button>
          </div>
        </div>

        {/* Custom upload */}
        <div style={{ flexShrink: 0 }}>
          <Head>Upload a recording</Head>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
            onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => fileRef.current?.click()} style={chip(false)}>Choose audio file…</button>
            {s.customName && (
              <>
                <span style={{ fontSize: 12.5, color: '#C9C3EC' }}>{trim(s.customName, 34)}</span>
                <button onClick={s.clearCustom} style={iconBtn}><X size={13} /></button>
              </>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: DIM, marginTop: 6 }}>
            Any audio file up to {Math.round(MAX_RING_BYTES / 1024)} KB — about two seconds.
            It is stored on this screen, not uploaded anywhere.
          </div>
        </div>

        {/* Volume */}
        <div style={{ flexShrink: 0 }}>
          <Head>Volume</Head>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Volume2 size={15} color={DIM} />
            <input type="range" min={0} max={100} value={Math.round(s.volume * 100)}
              onChange={e => s.setVolume(Number(e.target.value) / 100)}
              style={{ flex: 1, accentColor: ACCENT }} />
            <span style={{ fontSize: 12, color: DIM, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(s.volume * 100)}%
            </span>
          </div>
        </div>

        {/* Alarms */}
        <div style={{ flexShrink: 0 }}>
          <Head>Extra alarms</Head>
          <div style={{ fontSize: 11.5, color: DIM, marginBottom: 8 }}>
            Rings on top of the timetable — a staff briefing, a gate closing.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input type="time" value={at} onChange={e => setAt(e.target.value)} style={{ ...inp, width: 120 }} />
            <input placeholder="What it is for" value={label} onChange={e => setLabel(e.target.value)}
              style={{ ...inp, flex: 1, minWidth: 140 }} />
            <button onClick={addAlarm} style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Add
            </button>
          </div>
          {s.alarms.length === 0 ? (
            <div style={{ fontSize: 12, color: '#4A4560' }}>None — the timetable's own bells are enough for most schools.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.alarms.map(a => (
                <div key={a.id} style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
                  border: `1px solid ${LINE}`, borderRadius: 9, padding: '7px 11px',
                }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13 }}>{toClock(a.at)}</span>
                  <span style={{ fontSize: 12.5, color: DIM, flex: 1 }}>{a.label}</span>
                  <button onClick={() => s.removeAlarm(a.id)} style={iconBtn}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div style={{ fontSize: 12.5, color: '#FCA5A5', flexShrink: 0 }}>{err}</div>}

        <div style={{ fontSize: 11.5, color: '#4A4560', flexShrink: 0 }}>
          A bell the screen misses — asleep, or the tab suspended — stays missed rather than
          ringing late. Nothing rings on a holiday, or on a day the school is closed.
        </div>
      </div>
    </div>
  )
}

/** One ring: a wide button that selects it, and a small one that plays it
 *  without changing the choice. Ten options are too many to audition by
 *  selecting each in turn. */
function RingOption({ name, hint, selected, disabled, onSelect, onPlay }: {
  name: string; hint: string; selected: boolean; disabled?: boolean
  onSelect: () => void; onPlay: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${selected ? ACCENT : LINE}`,
      background: selected ? 'rgba(158,146,255,0.12)' : 'transparent',
      opacity: disabled ? 0.45 : 1, flexShrink: 0,
    }}>
      <button onClick={onSelect} disabled={disabled} style={{
        flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent',
        padding: '7px 10px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: selected ? ACCENT : '#F4F2FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 10.5, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hint}
        </div>
      </button>
      <button onClick={onPlay} disabled={disabled} title={`Hear ${name}`} style={{
        border: 'none', borderLeft: `1px solid ${selected ? ACCENT : LINE}`,
        background: 'transparent', color: selected ? ACCENT : DIM,
        width: 34, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Play size={13} />
      </button>
    </div>
  )
}

const trim = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function Head({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: '#C9C3EC', marginBottom: 8, letterSpacing: 0.2 }}>{children}</div>
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} aria-pressed={checked} style={{
      width: 44, height: 25, borderRadius: 13, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: checked ? ACCENT : '#332F45', position: 'relative', transition: 'background .15s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 22 : 3, width: 19, height: 19,
        borderRadius: 10, background: '#fff', transition: 'left .15s',
      }} />
    </button>
  )
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700,
  border: `1px solid ${active ? ACCENT : LINE}`,
  background: active ? 'rgba(158,146,255,0.16)' : 'transparent',
  color: active ? ACCENT : DIM,
})

const inp: React.CSSProperties = {
  background: '#0F0E17', border: `1px solid ${LINE}`, borderRadius: 9,
  padding: '7px 10px', color: '#F4F2FF', fontFamily: 'inherit', fontSize: 12.5,
  colorScheme: 'dark',
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${LINE}`, borderRadius: 8,
  color: DIM, cursor: 'pointer', width: 28, height: 28,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
