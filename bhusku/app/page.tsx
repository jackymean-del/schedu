import Link from 'next/link'
import { BrandChrome } from '@/components/BrandChrome'
import { BRAND, PRODUCTS, BUSINESS, SCHEDU_URL } from '@/lib/site'

const VALUES = [
  { title: 'Craft over clutter', body: 'Every screen earns its place. We remove before we add, so the tool gets out of the way of the work.' },
  { title: 'Built for the real day', body: 'Software modelled on how people actually work — messy timetables, last-minute changes, real constraints.' },
  { title: 'Honest by default', body: 'Clear pricing, no dark patterns, and features that do what they say. If it isn’t ready, we say so.' },
]

export default function Home() {
  return (
    <BrandChrome>
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#FAF9F5] to-white px-6 pb-20 pt-[86px] text-center">
        <span className="mb-5 rounded-full border border-[#ECE6DC] bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#9A8A5E]">
          Product studio
        </span>
        <h1 className="max-w-[760px] text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.05] tracking-[-1.5px] text-[#13111E] [animation:fadeUp_0.6s_ease]">
          Heavy on craft.<br /><span className="text-[#7C6FE0]">Full of energy.</span>
        </h1>
        <p className="mt-6 max-w-[560px] text-[16.5px] leading-[1.75] text-[#4B5275]">
          {BRAND.blurb}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href={SCHEDU_URL} className="no-underline">
            <button className="rounded-[10px] bg-[#13111E] px-6 py-[13px] text-[14px] font-bold text-white">
              Explore schedU →
            </button>
          </a>
          <Link href="/contact" className="no-underline">
            <button className="rounded-[10px] border border-[#E8E4FF] bg-white px-6 py-[13px] text-[14px] font-bold text-[#4B5275] transition-colors hover:border-[#7C6FE0] hover:text-[#7C6FE0]">
              Get in touch
            </button>
          </Link>
        </div>
      </section>

      {/* About */}
      <section id="about" className="border-t border-[#F3F0EA] bg-white px-6 py-20">
        <div className="mx-auto max-w-[1000px]">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">Who we are</p>
          <h2 className="max-w-[720px] text-[clamp(24px,3.5vw,34px)] font-bold leading-[1.2] tracking-[-0.6px] text-[#13111E]">
            An independent studio making software that respects your time.
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-[14px] border border-[#EFEBFF] bg-[#FCFBFF] px-[22px] py-6">
                <h3 className="text-[15px] font-bold text-[#13111E]">{v.title}</h3>
                <p className="mt-2 text-[13.5px] leading-[1.7] text-[#4B5275]">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="border-t border-[#F3F0EA] bg-[#FAF9F5] px-6 py-20">
        <div className="mx-auto max-w-[1000px]">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">What we build</p>
          <h2 className="text-[clamp(24px,3.5vw,34px)] font-bold tracking-[-0.6px] text-[#13111E]">Our products</h2>

          <div className="mt-9 grid gap-5">
            {PRODUCTS.map(p => (
              <a key={p.name} href={p.href} className="group no-underline">
                <div className="flex flex-col gap-4 rounded-[16px] border border-[#E8E4FF] bg-white p-7 transition-all hover:border-[#D8D2FF] sm:flex-row sm:items-center">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px]" style={{ background: p.markColor }}>
                    <svg width="30" height="30" viewBox="0 0 52 52" fill="none">
                      <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round" />
                      <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[19px] font-black tracking-[-0.4px] text-[#13111E]">
                        sched<span className="italic text-[#7C6FE0]">U</span>
                      </span>
                      <span className="rounded-full bg-[#EDFBF3] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#16A34A]">Live</span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-semibold text-[#7C6FE0]">{p.tagline}</p>
                    <p className="mt-1.5 max-w-[560px] text-[13.5px] leading-[1.7] text-[#4B5275]">{p.blurb}</p>
                  </div>
                  <span className="shrink-0 text-[14px] font-bold text-[#4B5275] transition-colors group-hover:text-[#7C6FE0]">
                    Visit →
                  </span>
                </div>
              </a>
            ))}
            <div className="rounded-[16px] border border-dashed border-[#E0D9F5] bg-white/50 px-7 py-6 text-[13.5px] text-[#9A95BC]">
              More products in the works — <a href="/contact" className="font-semibold text-[#7C6FE0] no-underline">say hello</a> if you want to hear first.
            </div>
          </div>
        </div>
      </section>

      {/* Pricing transparency (what we charge for) */}
      <section id="pricing" className="border-t border-[#F3F0EA] bg-white px-6 py-20">
        <div className="mx-auto max-w-[1000px]">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9A95BC]">What we charge for</p>
          <h2 className="text-[clamp(24px,3.5vw,34px)] font-bold tracking-[-0.6px] text-[#13111E]">Simple, honest pricing</h2>
          <p className="mt-3 max-w-[640px] text-[14.5px] leading-[1.75] text-[#4B5275]">
            Our products are free to start. schedU offers an optional <strong>Pro</strong> plan billed securely in INR via Razorpay
            (UPI, cards &amp; netbanking) — <strong>₹{BUSINESS.proMonthlyINR}/month</strong> or <strong>₹{BUSINESS.proYearlyINR.toLocaleString('en-IN')}/year</strong>.
            Cancel anytime; access continues to the end of the billing period.
          </p>
          <a href={`${SCHEDU_URL}/pricing`} className="mt-6 inline-block no-underline">
            <button className="rounded-[10px] border border-[#E8E4FF] bg-white px-6 py-3 text-[14px] font-bold text-[#4B5275] transition-colors hover:border-[#7C6FE0] hover:text-[#7C6FE0]">
              See schedU pricing →
            </button>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#13111E] px-6 py-16 text-center">
        <h2 className="mx-auto max-w-[560px] text-[clamp(22px,3.5vw,30px)] font-bold leading-[1.25] tracking-[-0.5px] text-white">
          Working on something we should build?
        </h2>
        <p className="mx-auto mt-3 max-w-[440px] text-[14.5px] leading-[1.7] text-[#C4C0E8]">
          Partnerships, feedback, or just curious — we read every message.
        </p>
        <Link href="/contact" className="no-underline">
          <button className="mt-7 rounded-[10px] bg-white px-6 py-[13px] text-[14px] font-bold text-[#13111E]">
            Contact bhusku
          </button>
        </Link>
      </section>
    </BrandChrome>
  )
}
