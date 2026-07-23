'use client'

import { useEffect, useState } from 'react'
import { isIndia, getInrToUsd, roundedUSD } from '@/lib/localCurrency'

/**
 * Price display: India keeps INR (the "₹333" string as authored); everyone else
 * sees the amount in USD, rounded to a whole dollar at the live INR→USD rate.
 * Server-render + first paint show the INR string (correct for India & crawlers);
 * after hydration non-India visitors swap to the dollar figure. Non-numeric
 * strings like "Custom" pass through unchanged.
 */
export function LocalPrice({ children }: { children: string }) {
  const [text, setText] = useState(children)
  useEffect(() => {
    if (!/₹/.test(children) || isIndia()) return
    const n = Number(children.replace(/[₹,\s]/g, ''))
    if (!Number.isFinite(n)) return
    let alive = true
    getInrToUsd().then(rate => { if (alive) setText(roundedUSD(n, rate)) })
    return () => { alive = false }
  }, [children])
  return <>{text}</>
}

/** Localise every ₹-amount inside a sentence, e.g. "or ₹3,333/yr — save 17%". */
export function LocalMoney({ children }: { children: string }) {
  const [text, setText] = useState(children)
  useEffect(() => {
    if (isIndia()) return
    let alive = true
    getInrToUsd().then(rate => {
      if (!alive) return
      setText(children.replace(/₹\s?([\d,]+)/g, (_m, d: string) =>
        roundedUSD(Number(d.replace(/,/g, '')), rate)))
    })
    return () => { alive = false }
  }, [children])
  return <>{text}</>
}

/**
 * A small note shown ONLY to non-India visitors (who see USD), so the "billed in
 * INR" disclosure is honest without an equivalent-rupee number and without
 * cluttering the page for Indian visitors.
 */
export function LocalBillingNote({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(!isIndia()) }, [])
  if (!show) return null
  return (
    <p className={className} style={style}>
      Dollar prices are rounded at the current exchange rate; billing is processed securely in INR.
    </p>
  )
}
