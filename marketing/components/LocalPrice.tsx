'use client'

import { useEffect, useState } from 'react'
import { localizeINR, localizeMoneyInText } from '@/lib/localCurrency'

/**
 * Localise a "₹<n>" price string (e.g. "₹333") to the visitor's currency.
 * Server-render + first paint show the original INR string (correct for
 * crawlers and INR users); after hydration it swaps to the local figure with a
 * "≈" prefix. Non-numeric strings like "Custom" or "₹0" pass through sensibly.
 */
export function LocalPrice({ children }: { children: string }) {
  const [text, setText] = useState(children)
  useEffect(() => {
    if (!/₹/.test(children)) return
    const n = Number(children.replace(/[₹,\s]/g, ''))
    if (!Number.isFinite(n)) return
    const r = localizeINR(n)
    if (r.converted) setText((n > 0 ? '≈ ' : '') + r.amount)
  }, [children])
  return <>{text}</>
}

/** Localise every ₹-amount inside a sentence, e.g. "or ₹3,333/yr — save 17%". */
export function LocalMoney({ children }: { children: string }) {
  const [text, setText] = useState(children)
  useEffect(() => {
    const r = localizeMoneyInText(children)
    if (r.converted) setText(r.text)
  }, [children])
  return <>{text}</>
}

/**
 * A small note shown ONLY to visitors seeing a converted local price, so the
 * "billed in INR" caveat is honest without cluttering the page for INR users.
 */
export function LocalBillingNote({ inr = 333, className, style }: { inr?: number; className?: string; style?: React.CSSProperties }) {
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(localizeINR(inr).converted) }, [inr])
  if (!show) return null
  return (
    <p className={className} style={style}>
      Local prices are approximate — you&rsquo;re billed the same amount in INR (₹333/mo).
    </p>
  )
}
