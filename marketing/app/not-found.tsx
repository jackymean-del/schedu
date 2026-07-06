/**
 * The single global 404 for the whole site — static export produces exactly
 * one out/404.html from this root boundary; nested not-found.tsx files don't
 * take effect on a static host, so route-specific 404 copy isn't possible.
 */
import Link from 'next/link'
import { MarketingChrome } from '@/components/MarketingChrome'

export default function NotFound() {
  return (
    <MarketingChrome>
      <section className="flex flex-col items-center px-6 py-24 text-center">
        <h1 className="text-[28px] font-normal text-[#13111E]">Page not found</h1>
        <p className="mt-3 text-[15px] text-[#8B87AD]">That page doesn&apos;t exist (yet).</p>
        <Link href="/" className="mt-6 rounded-[9px] bg-[#7C6FE0] px-7 py-3 text-sm font-bold text-white no-underline">
          Back home
        </Link>
      </section>
    </MarketingChrome>
  )
}
