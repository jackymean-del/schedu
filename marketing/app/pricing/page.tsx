import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { LocalPrice, LocalMoney, LocalBillingNote } from '@/components/LocalPrice'
import { appHref } from '@/lib/appUrl'

// Pricing here MUST match the in-app checkout (Razorpay, INR): Pro is ₹333/mo
// or ₹3,333/yr, and the Free caps match what the app actually enforces. If these
// numbers change, update the backend billing config + the app subscription page
// (frontend/src/pages/subscription.tsx) to match.
const TIERS = [
  {
    name: 'Free', price: '₹0', period: '/mo', sub: '',
    desc: 'Everything a small team needs to try Human-Intelligence scheduling.',
    cta: 'Start free', href: appHref('/login'), popular: false,
    features: [
      'Human-Intelligence auto-scheduling — conflict-free in minutes',
      'Up to 10 sections',
      'Class, Faculty, Venue & Subject views',
      'Live calendar (view mode)',
      'Excel & print / PDF export',
    ],
  },
  {
    name: 'Pro', price: '₹333', period: '/mo', sub: 'or ₹3,333/yr — save 17%',
    desc: 'For a single institution running multiple streams and electives.',
    cta: 'Get Pro', href: appHref('/login'), popular: true,
    features: [
      'Up to 70 sections',
      'Live task assignment & substitutions',
      'Team collaboration — invite & manage users',
      'Advanced engine & multi-shift / block scheduling',
      'Workload analytics & optimisation',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise', price: 'Custom', period: '', sub: '',
    desc: 'For groups beyond 70 sections or running multiple campuses.',
    cta: 'Talk to sales', href: 'mailto:hello@bhusku.com', popular: false,
    features: ['Beyond 70 sections', 'Multi-campus management', 'Everything in Pro', 'API access', 'SSO / SAML'],
  },
]

const FAQ = [
  { q: 'Is there really a free plan?', a: 'Yes. The Free plan is free forever — up to 10 sections, with full Human-Intelligence auto-scheduling. No credit card required.' },
  { q: 'How much is Pro, and what does it add?', a: 'Pro is ₹333/month or ₹3,333/year (save ~17%) — shown in USD outside India, billed in INR. It raises the limit to 70 sections and adds live task assignment, team collaboration, workload analytics, and priority support. Beyond 70 sections or multiple campuses is a Custom plan.' },
  { q: 'What payment methods do you accept?', a: 'Payments are processed securely via Razorpay in INR — UPI, cards, and netbanking. International cards are supported too. You can cancel anytime and keep access until the end of your billing period.' },
  { q: 'Do you support any curriculum?', a: 'schedU has no built-in board restrictions. Enter your own period counts, subject names, and grading labels — it adapts to you.' },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for schedU. Free up to 10 sections, Pro (₹333/mo, shown in USD outside India) up to 70 sections with multi-stream electives and team collaboration, Custom beyond 70 or multi-campus.',
  alternates: { canonical: '/pricing' },
}

// FAQPage structured data — mirrors the visible FAQ exactly (Google requires
// the marked-up questions to be present on the page).
const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function PricingPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-12 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Pricing</p>
        <h1 className="mb-3.5 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Pricing that grows with your{' '}
          <span className="italic text-[#7C6FE0]">institution.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-[1.8] text-[#4B5275]">
          Start free up to 10 sections. Upgrade to Pro for up to 70 sections, electives, live task assignment, and team collaboration.
        </p>
        <LocalBillingNote className="mt-4 max-w-[520px] text-[12px] leading-[1.5] text-[#A5A1C0]" />
      </section>

      {/* Tiers */}
      <section className="flex justify-center bg-white px-6 pb-16 pt-5">
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-stretch gap-[18px]">
          {TIERS.map(t => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-[14px] bg-white px-6 py-7 ${cardHover} ${
                t.popular
                  ? 'border-[1.5px] border-[#7C6FE0] shadow-[0_12px_32px_rgba(124,111,224,0.16)]'
                  : 'border border-[#E8E4FF]'
              }`}
            >
              {t.popular && (
                <span className="absolute right-4 top-4 rounded-full bg-[#EDE9FF] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-[#7C6FE0]">
                  Most popular
                </span>
              )}
              <h2 className="text-base font-bold text-[#13111E]">{t.name}</h2>
              <div className="mt-3.5 flex items-baseline gap-1">
                <span className="font-mono text-[34px] font-bold leading-none text-[#13111E]"><LocalPrice>{t.price}</LocalPrice></span>
                {t.period && <span className="text-[13px] text-[#8B87AD]">{t.period}</span>}
              </div>
              <p className="mb-1.5 mt-1 min-h-[16px] text-[11.5px] font-semibold text-[#7C6FE0]">{t.sub ? <LocalMoney>{t.sub}</LocalMoney> : ''}</p>
              <p className="mb-[18px] min-h-[42px] text-[13px] leading-[1.6] text-[#4B5275]">{t.desc}</p>
              <a href={t.href} className="no-underline">
                <button
                  className={`w-full rounded-lg px-[18px] py-[11px] text-[13px] font-bold ${
                    t.popular
                      ? 'border-none bg-[#7C6FE0] text-white shadow-[0_4px_14px_rgba(124,111,224,0.32)]'
                      : 'border-[1.5px] border-[#E8E4FF] bg-white text-[#4B5275] transition-colors hover:border-[#7C6FE0] hover:text-[#7C6FE0]'
                  }`}
                >
                  {t.cta}
                </button>
              </a>
              <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
                {t.features.map(f => (
                  <li key={f} className="flex items-start gap-[9px] text-[13px] text-[#13111E]">
                    <span className="font-extrabold leading-[1.4] text-[#7C6FE0]">✓</span>
                    <span className="leading-[1.4]">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16">
        <h2 className="mb-8 text-[28px] font-normal text-[#13111E]">Frequently asked questions</h2>
        <div className="grid w-full max-w-[880px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]">
          {FAQ.map(item => (
            <div key={item.q} className="rounded-xl border border-[#E8E4FF] bg-white px-[22px] py-[22px]">
              <h3 className="mb-2 text-sm font-bold text-[#13111E]">{item.q}</h3>
              <p className="text-[13px] leading-[1.7] text-[#4B5275]">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingChrome>
  )
}
