/**
 * Shared chrome for the bhusku parent-brand site — sticky nav + footer.
 * Per the brand system, bhusku is TYPOGRAPHIC ONLY (no icon) — the Fader U
 * belongs to schedU, not the parent. Footer carries the legal/policy links
 * Razorpay onboarding requires.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { BRAND, SCHEDU_URL } from '@/lib/site'

const NAV = [
  { label: 'Products', href: '/#products' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/contact' },
]

const LEGAL = [
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refunds', href: '/refunds' },
  { label: 'Contact', href: '/contact' },
]

function Wordmark() {
  // Lowercase "bhusku" in Plus Jakarta 800 — the family typographic mark.
  return (
    <span className="text-[19px] font-extrabold lowercase tracking-[-0.4px] text-[#13111E]">
      bhusku
    </span>
  )
}

export function BrandChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#13111E]">
      {/* Nav */}
      <nav className="sticky top-0 z-[200] flex h-[58px] items-center border-b border-[#F0EDFF] bg-white/95 px-6 backdrop-blur-sm sm:px-12">
        <Link href="/" className="flex shrink-0 items-center no-underline"><Wordmark /></Link>
        <div className="flex-1" />
        <div className="mr-6 hidden items-center gap-7 sm:flex">
          {NAV.map(l => (
            <Link key={l.label} href={l.href}
              className="whitespace-nowrap text-sm font-medium text-[#4B5275] no-underline transition-colors hover:text-[#7C6FE0]">
              {l.label}
            </Link>
          ))}
        </div>
        <a href={SCHEDU_URL} className="no-underline">
          <button className="rounded-[7px] bg-[#13111E] px-[18px] py-2 text-[13px] font-semibold text-white">
            Visit schedU
          </button>
        </a>
      </nav>

      <div className="flex-1">{children}</div>

      {/* Footer */}
      <footer className="border-t border-[#F0EDFF] bg-[#FAF9F5] px-6 py-10 sm:px-12">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-[320px]">
            <Wordmark />
            <p className="mt-2 text-[13px] leading-[1.7] text-[#6B6785]">{BRAND.tagline}</p>
            <a href={`mailto:${BRAND.email}`} className="mt-2 inline-block text-[13px] font-medium text-[#7C6FE0] no-underline">
              {BRAND.email}
            </a>
          </div>
          <div className="flex gap-14">
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A95BC]">Products</span>
              <a href={SCHEDU_URL} className="text-[13px] text-[#4B5275] no-underline transition-colors hover:text-[#7C6FE0]">schedU</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A95BC]">Legal</span>
              {LEGAL.map(l => (
                <Link key={l.label} href={l.href}
                  className="text-[13px] text-[#4B5275] no-underline transition-colors hover:text-[#7C6FE0]">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-[1100px] border-t border-[#ECE6DC] pt-5 text-[12px] text-[#9A95BC]">
          © {new Date().getFullYear()} bhusku · Heavy on craft. Full of energy.
        </div>
      </footer>
    </div>
  )
}
