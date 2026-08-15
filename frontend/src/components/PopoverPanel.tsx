/**
 * A popover that a keyboard can get out of.
 *
 * The two engine popovers — "why this assignment?" and the score breakdown —
 * were a plain positioned div with a full-screen click-catcher behind it. No
 * role, so a screen reader never announced anything had opened; no Escape, so
 * the only way to dismiss one was to find and click the page behind it; and
 * focus stayed wherever it had been, which for the score popover meant its own
 * tab buttons were an unknown number of tabs away.
 *
 * They are NOT modal, and that distinction is the whole design. Both explain a
 * cell you are still reading, so the page behind them stays live and Tab must
 * be free to leave — no trap, no aria-modal. What they do owe you is the two
 * things a dismissable thing owes anyone: Escape closes it, and focus comes
 * back to the control that opened it.
 *
 * useDialog already had `modal: false` for exactly this; nothing had used it.
 *
 * Render this only while the popover is open. Mounted unconditionally it would
 * bind Escape and move focus for the entire life of the trigger.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useDialog } from '@/hooks/useDialog'

export function PopoverPanel({ label, onClose, style, children }: {
  /** Accessible name — what this popover is about, not just "popover". */
  label: string
  onClose: () => void
  style: CSSProperties
  children: ReactNode
}) {
  const { dialogProps } = useDialog<HTMLDivElement>({ onClose, modal: false, label })
  return (
    <>
      {/* Click-catcher only. Hidden from assistive tech, which would otherwise
          meet a full-viewport element sitting between the reader and the page. */}
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div {...dialogProps} onClick={e => e.stopPropagation()} style={style}>
        {children}
      </div>
    </>
  )
}
