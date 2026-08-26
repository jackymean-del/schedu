/**
 * What the corridor screen does with sound.
 *
 * Persisted per browser rather than per school on purpose: this is a property
 * of the SCREEN, not of the timetable. The display in the corridor should ring;
 * the head of department's laptop, looking at the same board, should not — and
 * neither should be able to switch the other on.
 *
 * The custom recording lives here as a data URL. That is why bellAudio caps
 * what it will accept: this whole object goes into localStorage.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuiltInRing } from '@/lib/bellAudio'
import type { BellAlarm } from '@/lib/bellRinger'

interface BellSettingsState {
  /** Ring at the timetable's own bell times. */
  enabled: boolean
  sound: BuiltInRing | 'custom'
  volume: number
  /** Present only when the school uploaded its own recording. */
  customDataUrl?: string
  customName?: string
  /** Extra times this screen should ring, on top of the timetable's bells. */
  alarms: BellAlarm[]

  setEnabled: (v: boolean) => void
  setSound: (s: BuiltInRing | 'custom') => void
  setVolume: (v: number) => void
  setCustom: (dataUrl: string, name: string) => void
  clearCustom: () => void
  addAlarm: (a: Omit<BellAlarm, 'id'>) => void
  removeAlarm: (id: string) => void
}

export const useBellSettings = create<BellSettingsState>()(
  persist(
    (set) => ({
      enabled: false,
      // The one a school actually has in its corridor, for anyone who never
      // opens this panel.
      sound: 'electric',
      volume: 0.7,
      alarms: [],

      setEnabled: (enabled) => set({ enabled }),
      setSound: (sound) => set({ sound }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setCustom: (customDataUrl, customName) => set({ customDataUrl, customName, sound: 'custom' }),
      // Dropping the recording must also drop the selection, or the board is
      // left pointing at a sound that no longer exists and rings nothing.
      clearCustom: () => set((s) => ({
        customDataUrl: undefined, customName: undefined,
        sound: s.sound === 'custom' ? 'chime' : s.sound,
      })),
      addAlarm: (a) => set((s) => ({
        alarms: [...s.alarms, { ...a, id: Math.random().toString(36).slice(2, 10) }]
          .sort((x, y) => x.at - y.at),
      })),
      removeAlarm: (id) => set((s) => ({ alarms: s.alarms.filter(a => a.id !== id) })),
    }),
    { name: 'schedu-board-bell' },
  ),
)
