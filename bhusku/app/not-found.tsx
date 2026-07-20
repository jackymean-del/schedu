import Link from 'next/link'
import { BrandChrome } from '@/components/BrandChrome'

export default function NotFound() {
  return (
    <BrandChrome>
      <section className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-28 text-center">
        <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">404</div>
        <h1 className="mt-3 text-[clamp(26px,4vw,38px)] font-extrabold tracking-[-0.8px] text-[#13111E]">Page not found</h1>
        <p className="mt-3 text-[15px] leading-[1.7] text-[#4B5275]">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </p>
        <Link href="/" className="mt-7 no-underline">
          <button className="rounded-[10px] bg-[#13111E] px-6 py-3 text-[14px] font-bold text-white">Back home</button>
        </Link>
      </section>
    </BrandChrome>
  )
}
