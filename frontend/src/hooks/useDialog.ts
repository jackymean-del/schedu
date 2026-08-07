/**
 * The four things a modal owes a keyboard or screen-reader user.
 *
 * Every modal in this app was a plain `position: fixed` div. Measured on the
 * bell-schedule modal: no role, no aria-modal, focus left behind on the page,
 * and Escape did nothing. So a screen reader never announced that a dialog had
 * opened, and a keyboard user could tab straight out of it into the page
 * underneath — still visible through the backdrop, still focusable, with no
 * way to tell they had left.
 *
 * This gives one place to fix all of them:
 *
 *   1. SEMANTICS — role="dialog" and aria-modal, so it is announced as a
 *      dialog and the page behind it is treated as inert.
 *   2. FOCUS IN — focus moves to the dialog when it opens, or the caller's
 *      chosen element. Without this, "close" is an unknown number of tabs away.
 *   3. FOCUS TRAPPED — Tab and Shift+Tab cycle within the dialog.
 *   4. ESCAPE — closes, which is what every user already expects, and
 *      RESTORES focus to whatever opened it so you are not dumped at the top
 *      of the document.
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogOptions {
  /** Called on Escape and on backdrop click. */
  onClose: () => void
  /** Accessible name. Use when the dialog has no visible heading to point at. */
  label?: string
  /** Id of the visible heading that names the dialog. Preferred over `label`. */
  labelledBy?: string
  /** Set false for non-modal popovers that should not trap focus. */
  modal?: boolean
}

/**
 * Spread the returned `dialogProps` onto the dialog's own panel — the box with
 * the content, NOT the full-screen backdrop. The backdrop is decorative; giving
 * it the role would tell a screen reader the dialog covers the whole viewport.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(opts: DialogOptions) {
  const { onClose, label, labelledBy, modal = true } = opts
  const ref = useRef<T | null>(null)
  // Captured before focus moves, so it can be handed back on close.
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null

    const node = ref.current
    if (node) {
      // Prefer the first real control; fall back to the panel itself, which is
      // made programmatically focusable via tabIndex={-1} below.
      const first = node.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? node).focus({ preventScroll: true })
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !modal) return

      const n = ref.current
      if (!n) return
      const items = [...n.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) { e.preventDefault(); n.focus(); return }

      const first = items[0], last = items[items.length - 1]
      // Focus outside the dialog (it escaped, or started there) comes back in.
      if (!n.contains(document.activeElement)) { e.preventDefault(); first.focus(); return }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // Hand focus back to the trigger, if it is still on the page.
      const el = restoreTo.current
      if (el && document.contains(el)) el.focus({ preventScroll: true })
    }
  }, [onClose, modal])

  return {
    ref,
    dialogProps: {
      ref,
      role: 'dialog' as const,
      'aria-modal': modal || undefined,
      'aria-label': labelledBy ? undefined : label,
      'aria-labelledby': labelledBy,
      // Focusable as a last resort so focus has somewhere to land in a dialog
      // with no controls at all.
      tabIndex: -1,
    },
  }
}
