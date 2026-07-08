/**
 * Shared chrome for all public marketing pages (home, features, pricing,
 * docs, contact). Provides the sticky nav and footer so every marketing
 * page stays consistent. Styled with Tailwind (brand colours as arbitrary
 * values); the global reset + keyframes live in src/index.css.
 */
import type { ReactNode } from 'react'
import { appStartHref } from '@/lib/nav'

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Contact', href: '/contact' },
]

const FOOTER_LINKS = ['Privacy', 'Terms', 'Support', 'Status']

export function MarketingChrome({ children }: { children: ReactNode }) {
  return (
    <div data-mk className="flex min-h-screen flex-col bg-white text-[#13111E]">

      {/* Sticky nav */}
      <nav className="sticky top-0 z-[200] flex h-[58px] items-center border-b border-[#F0EDFF] bg-white px-12">
        {/* Logo */}
        <a href="/" className="flex shrink-0 items-center gap-[9px] no-underline">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#7C6FE0]">
            <svg width="19" height="19" viewBox="0 0 52 52" fill="none">
              <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round" />
              <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" />
            </svg>
          </div>
          <span className="text-[17px] font-black tracking-[-0.4px] text-[#13111E]">
            sched<span className="italic text-[#7C6FE0]">U</span>
          </span>
        </a>

        <div className="flex-1" />

        {/* Nav links */}
        <div className="mr-8 flex items-center gap-7">
          {NAV_LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              className="whitespace-nowrap text-sm font-medium text-[#4B5275] no-underline transition-colors hover:text-[#7C6FE0]"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="flex shrink-0 items-center gap-2.5">
          <a href="/login" className="no-underline">
            <button className="rounded-[7px] border border-[#E8E4FF] bg-white px-[18px] py-[7px] text-[13px] font-semibold text-[#4B5275] transition-colors hover:border-[#7C6FE0] hover:text-[#7C6FE0]">
              Sign in
            </button>
          </a>
          <a href={appStartHref()} className="no-underline">
            <button className="rounded-[7px] bg-[#13111E] px-[18px] py-2 text-[13px] font-semibold text-white">
              Get started
            </button>
          </a>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1">{children}</div>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EDFF] px-12 py-5">
        <div className="flex gap-6">
          {FOOTER_LINKS.map(l => (
            <a
              key={l}
              href="#"
              className="text-xs font-medium text-[#8B87AD] no-underline transition-colors hover:text-[#7C6FE0]"
            >
              {l}
            </a>
          ))}
        </div>
        <span className="text-xs text-[#8B87AD]">© 2025 schedU</span>
      </footer>

    </div>
  )
}
