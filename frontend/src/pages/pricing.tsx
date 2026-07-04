/**
 * Pricing page — tiers + FAQ. Styled with Tailwind.
 */
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { Seo } from '@/components/marketing/Seo'
import { appStartHref } from '@/lib/nav'
import { ORGANIZATION_SCHEMA } from '@/lib/structuredData'

const TIERS = [
  {
    name: 'Starter', price: 'Free', period: '',
    desc: 'Everything a small team needs to try AI scheduling.',
    cta: 'Start free', href: '/wizard', popular: false,
    features: ['Up to 2 classes', 'Up to 20 subjects', 'AI auto-schedule', 'Real-time conflict detection', 'PDF export'],
  },
  {
    name: 'Pro', price: '$29', period: '/mo',
    desc: 'For a single institution running multiple streams and electives.',
    cta: 'Start free', href: '/wizard', popular: true,
    features: ['Unlimited classes', 'Unlimited subjects', 'Elective OR/AND groups', 'Multi-stream support', 'Room & resource planning', 'Priority support'],
  },
  {
    name: 'Enterprise', price: '$99', period: '/mo',
    desc: 'For groups managing many campuses or institutions.',
    cta: 'Talk to sales', href: 'mailto:hello@bhusku.com', popular: false,
    features: ['Everything in Pro', 'Multi-campus management', 'API access', 'SSO / SAML', 'Dedicated success manager'],
  },
]

const FAQ = [
  { q: 'Is there really a free plan?', a: 'Yes. Starter is free forever for up to 2 classes and 20 subjects — no credit card required.' },
  { q: 'Can I change plans later?', a: 'Anytime. Upgrade or downgrade from your account; changes take effect immediately and billing is prorated.' },
  { q: 'Do you support any curriculum?', a: 'schedU has no built-in board restrictions. Enter your own period counts, subject names, and grading labels — it adapts to you.' },
  { q: 'What does Enterprise add?', a: 'Multi-campus management, API access, SSO/SAML, and a dedicated success manager for rolling schedU out across many institutions.' },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export function PricingPage() {
  return (
    <MarketingChrome>
      <Seo
        title="Pricing"
        description="Simple, transparent pricing for schedU. Start free, then scale to unlimited classes, multi-stream electives, and multi-campus management. Starter / Pro / Enterprise."
        path="/pricing"
        jsonLd={ORGANIZATION_SCHEMA}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-12 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Pricing</p>
        <h1 className="mb-3.5 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Pricing that grows with your{' '}
          <span className="italic text-[#7C6FE0]">institution.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-[1.8] text-[#4B5275]">
          Start free on Starter. Upgrade when you need unlimited classes, electives, and multi-campus control.
        </p>
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
              <div className="mb-1.5 mt-3.5 flex items-baseline gap-1">
                <span className="font-mono text-[34px] font-bold leading-none text-[#13111E]">{t.price}</span>
                {t.period && <span className="text-[13px] text-[#8B87AD]">{t.period}</span>}
              </div>
              <p className="mb-[18px] min-h-[42px] text-[13px] leading-[1.6] text-[#4B5275]">{t.desc}</p>
              <a href={t.href === '/wizard' ? appStartHref() : t.href} className="no-underline">
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
