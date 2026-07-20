/**
 * Shared shell for the legal/policy pages — a readable single-column prose
 * layout with consistent heading rhythm.
 */
import type { ReactNode } from 'react'
import { BrandChrome } from '@/components/BrandChrome'
import { POLICY_UPDATED } from '@/lib/site'

export function PolicyShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <BrandChrome>
      <article className="mx-auto max-w-[760px] px-6 py-16">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">Legal</p>
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-[1.15] tracking-[-1px] text-[#13111E]">{title}</h1>
        <p className="mt-2 text-[13px] text-[#9A95BC]">Last updated: {POLICY_UPDATED}</p>
        {intro && <p className="mt-6 text-[15px] leading-[1.8] text-[#4B5275]">{intro}</p>}
        <div className="policy mt-8 flex flex-col gap-6">{children}</div>
      </article>
      <style>{`
        .policy h2 { font-size: 18px; font-weight: 800; color:#13111E; margin-top: 6px; }
        .policy p, .policy li { font-size: 14.5px; line-height: 1.8; color:#4B5275; }
        .policy ul { list-style: disc; padding-left: 22px; display:flex; flex-direction:column; gap:6px; }
        .policy a { color:#7C6FE0; font-weight:600; }
        .policy strong { color:#13111E; }
      `}</style>
    </BrandChrome>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2>{heading}</h2>
      {children}
    </section>
  )
}
