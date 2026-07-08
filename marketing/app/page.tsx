import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { HeroTuning } from '@/components/animations/HeroTuning'
import { LivePulse } from '@/components/animations/LivePulse'
import { MultiTimetable } from '@/components/animations/MultiTimetable'
import { appHref } from '@/lib/appUrl'

const BOARDS = [
  'IB (MYP / DP)', 'Cambridge IGCSE', 'Common Core', 'GCSE / A-Level',
  'CBSE', 'ICSE', 'AP Courses', 'French Baccalaureate',
  'Australian ATAR', 'NCEA', 'Matric / NSC', 'O-Level / WAEC',
  'Korean CSAT', 'Japanese Gakuryoku', '…and any custom curriculum',
]

const FEATURES = [
  { icon: '🧠', title: 'AI period allocation', desc: 'AI suggests balanced period distributions per class and board — no manual tables needed.' },
  { icon: '👨‍🏫', title: 'Smart teacher allocation', desc: 'Workload-balanced, expertise-matched teacher assignments with vertical continuity rules.' },
  { icon: '👥', title: 'OR slots & cross-class groups', desc: 'Flexible OR periods run one subject at a time; AND groups pool same-subject students across sections — built automatically.' },
]

const STATS = [
  { value: '1,200+', label: 'Schools using schedU' },
  { value: '4.8 min', label: 'Avg. timetable generation time' },
  { value: '98%', label: 'Conflict-free first generation' },
  { value: '180+', label: 'Countries & territories' },
]

const STEPS = [
  { n: 1, title: 'Enter basics', desc: 'Name, board, class range, teachers, rooms.' },
  { n: 2, title: 'AI generates', desc: 'Allocations, groups, and constraints auto-built.' },
  { n: 3, title: 'Review & refine', desc: 'AI inlines like a spreadsheet. AI explains every choice.' },
  { n: 4, title: 'Publish & share', desc: 'Share a public or private link, or export to PDF and Excel.' },
]

const TIERS = [
  {
    name: 'Starter', price: 'Free', period: '',
    desc: 'Everything a small team needs to try AI scheduling.',
    cta: 'Start free', href: appHref('/login'), popular: false,
    features: ['Up to 2 classes', 'Up to 20 subjects', 'AI auto-schedule', 'Real-time conflict detection', 'PDF export'],
  },
  {
    name: 'Pro', price: '$29', period: '/mo',
    desc: 'For a single institution running multiple streams and electives.',
    cta: 'Start free', href: appHref('/login'), popular: true,
    features: ['Unlimited classes', 'Unlimited subjects', 'Elective OR/AND groups', 'Multi-stream support', 'Room & resource planning', 'Priority support'],
  },
  {
    name: 'Enterprise', price: '$99', period: '/mo',
    desc: 'For groups managing many campuses or institutions.',
    cta: 'Talk to sales', href: 'mailto:hello@bhusku.com', popular: false,
    features: ['Everything in Pro', 'Multi-campus management', 'API access', 'SSO / SAML', 'Dedicated success manager'],
  },
]

const TESTIMONIALS = [
  { quote: 'schedU turned a three-week scheduling marathon into an afternoon. The conflict detection alone has saved us from a dozen timetable headaches this term.', name: 'Priya Nair', role: 'Vice Principal, Greenwood International School' },
  { quote: 'Managing electives across three streams used to be guesswork. Now the OR/AND groups just work, and every student gets a clash-free schedule.', name: 'Daniel Osei', role: 'Registrar, Northgate College' },
  { quote: 'Rolling schedU out across all our campuses was painless. SSO and the API meant every institution in the group was generating timetables in the same week.', name: 'Maria Gonzalez', role: 'Director of Operations, Atlas Education Group' },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export const metadata: Metadata = {
  title: 'schedU — AI Timetable Scheduling for Any Institution',
  description: 'schedU uses AI to auto-generate conflict-free timetables for any institution — schools, colleges, universities, and beyond. Works with any board, any curriculum, anywhere.',
  alternates: { canonical: '/' },
}

// Mirrors the prices actually shown in the Pricing section below — schema.org
// Offer requires a numeric price, so 'Free'/'$29'/'$99' map to 0/29/99 USD.
const SOFTWARE_APPLICATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'schedU',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  url: 'https://schedu.bhusku.com',
  description: 'AI-generated, conflict-free timetables for schools, colleges, and universities — any board, any curriculum.',
  offers: TIERS.map(t => ({
    '@type': 'Offer',
    name: t.name,
    price: t.price === 'Free' ? '0' : t.price.replace('$', ''),
    priceCurrency: 'USD',
  })),
}

export default function HomePage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_SCHEMA) }}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-[60px] pt-[72px] text-center">
        <div className="mb-7 inline-flex animate-[fadeUp_0.55s_ease_both] items-center gap-[7px] rounded-full border border-[#86EFAC] bg-[#F0FDF4] px-4 py-[5px] text-xs font-semibold text-[#15803D]">
          <span className="inline-block size-[7px] shrink-0 rounded-full bg-[#22C55E]" />
          AI-native timetable engine
        </div>

        <h1 className="mb-[18px] max-w-[720px] animate-[fadeUp_0.55s_ease_both] text-[clamp(34px,6.5vw,56px)] font-normal leading-[1.1] tracking-[-1.5px] text-[#13111E] [animation-delay:0.08s]">
          AI-generated timetables for{' '}
          <span className="italic text-[#7C6FE0]">any institution.</span>
        </h1>
        <p className="mb-9 max-w-[560px] animate-[fadeUp_0.55s_ease_both] text-base leading-[1.8] text-[#4B5275] [animation-delay:0.16s]">
          schedU auto-generates conflict-free timetables for schools, colleges, and universities —
          any board, any curriculum, anywhere in the world.
        </p>
        <div className="flex animate-[fadeUp_0.55s_ease_both] flex-wrap items-center justify-center gap-3 [animation-delay:0.24s]">
          <a href={appHref('/login')} className="no-underline">
            <button className="rounded-[9px] bg-[#7C6FE0] px-[26px] py-[13px] text-sm font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
              Start free — no credit card
            </button>
          </a>
          <a href="#features" className="no-underline">
            <button className="rounded-[9px] border border-[#E8E4FF] bg-white px-[26px] py-[13px] text-sm font-bold text-[#4B5275]">
              See how it works
            </button>
          </a>
        </div>

        {/* Hero animation — the Tuner Console resolving a schedule to 0 conflicts */}
        <div className="mt-14 w-full max-w-[640px] rounded-2xl border border-[#E8E4FF] bg-white p-5 shadow-[0_20px_60px_rgba(124,111,224,0.14)]">
          <HeroTuning />
        </div>
      </section>

      {/* 3 feature columns */}
      <section id="features" className="flex flex-col items-center bg-white px-6 py-16">
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className={`rounded-xl border border-[#E8E4FF] bg-[#FAFAFE] px-[22px] py-[26px] ${cardHover}`}>
              <div className="mb-3.5 text-[30px] leading-none">{f.icon}</div>
              <h2 className="mb-2 text-[15px] font-bold text-[#13111E]">{f.title}</h2>
              <p className="text-[13px] leading-[1.7] text-[#4B5275]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats band */}
      <section className="flex justify-center border-y border-[#F0EDFF] bg-[#F8F7FF] px-6 py-11">
        <div className="grid w-full max-w-[860px] grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          {STATS.map((s, i) => (
            <div key={s.label} className={`px-3 py-4 text-center ${i < STATS.length - 1 ? 'border-r border-[#E8E4FF]' : ''}`}>
              <div className="mb-[7px] text-[30px] font-normal leading-none text-[#13111E]">{s.value}</div>
              <div className="text-xs leading-[1.5] text-[#8B87AD]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Global board support */}
      <section className="flex flex-col items-center bg-white px-6 py-14 text-center">
        <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">
          Works with every curriculum worldwide
        </p>
        <div className="flex max-w-[820px] flex-wrap justify-center gap-2">
          {BOARDS.map(b => (
            <span key={b} className="inline-block whitespace-nowrap rounded-full border border-[#E8E4FF] bg-[#FAFAFE] px-3 py-[5px] text-xs font-medium text-[#4B5275] transition-colors hover:border-[#C4B5FD] hover:bg-[#EDE9FF] hover:text-[#7C6FE0]">
              {b}
            </span>
          ))}
        </div>
        <p className="mt-5 max-w-[480px] text-[13px] leading-[1.6] text-[#8B87AD]">
          No built-in board restrictions. Enter your own period counts, subject names,
          and grading labels — schedU adapts to you.
        </p>
      </section>

      {/* Live board */}
      <section className="flex flex-col items-center bg-white px-6 py-16 text-center">
        <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Live board</p>
        <h2 className="mb-4 max-w-[560px] text-[clamp(24px,4vw,34px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          See <span className="italic text-[#7C6FE0]">who's free right now.</span>
        </h2>
        <p className="mb-9 max-w-[520px] text-sm leading-[1.8] text-[#4B5275]">
          A live wall-clock view of the school day — who's teaching, who just freed up,
          and who can cover a gap instantly.
        </p>
        <div className="w-full max-w-[680px] rounded-2xl border border-[#E8E4FF] bg-[#FAFAFE] p-6 text-left">
          <LivePulse />
        </div>
      </section>

      {/* How it works */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16">
        <h2 className="mb-7 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">How it works</h2>
        <div className="grid w-full max-w-[900px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
          {STEPS.map(s => (
            <div key={s.n} className={`rounded-xl border border-[#E8E4FF] bg-white px-5 py-[22px] ${cardHover}`}>
              <div className="mb-3.5 inline-flex items-center justify-center rounded-full bg-[#EDE9FF] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-[#7C6FE0]">
                Step {s.n}
              </div>
              <h3 className="mb-[7px] text-sm font-bold text-[#13111E]">{s.title}</h3>
              <p className="text-[12.5px] leading-[1.65] text-[#4B5275]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16">
        <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Pricing</p>
        <h2 className="mb-2 text-center text-[30px] font-normal leading-[1.2] text-[#13111E]">Simple pricing that scales with you</h2>
        <p className="mb-[38px] max-w-[440px] text-center text-sm leading-[1.6] text-[#8B87AD]">
          Start free, upgrade when your institution grows. No hidden fees.
        </p>
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-stretch gap-[18px]">
          {TIERS.map(t => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-[14px] bg-white px-6 py-7 ${cardHover} ${
                t.popular ? 'border-[1.5px] border-[#7C6FE0] shadow-[0_12px_32px_rgba(124,111,224,0.16)]' : 'border border-[#E8E4FF]'
              }`}
            >
              {t.popular && (
                <span className="absolute right-4 top-4 rounded-full bg-[#EDE9FF] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-[#7C6FE0]">
                  Most popular
                </span>
              )}
              <h3 className="text-base font-bold text-[#13111E]">{t.name}</h3>
              <div className="mb-1.5 mt-3.5 flex items-baseline gap-1">
                <span className="font-mono text-[34px] font-bold leading-none text-[#13111E]">{t.price}</span>
                {t.period && <span className="text-[13px] text-[#8B87AD]">{t.period}</span>}
              </div>
              <p className="mb-[18px] min-h-[42px] text-[13px] leading-[1.6] text-[#4B5275]">{t.desc}</p>
              <a href={t.href} className="no-underline">
                <button
                  className={`w-full rounded-lg px-[18px] py-[11px] text-[13px] font-bold ${
                    t.popular
                      ? 'bg-[#7C6FE0] text-white shadow-[0_4px_14px_rgba(124,111,224,0.32)]'
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

      {/* Testimonials */}
      <section id="testimonials" className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16">
        <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Loved by teams worldwide</p>
        <h2 className="mb-[38px] text-center text-[30px] font-normal leading-[1.2] text-[#13111E]">
          Trusted by institutions that hate scheduling
        </h2>
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-stretch gap-[18px]">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="flex flex-col gap-[18px] rounded-[14px] border border-[#E8E4FF] bg-white px-[22px] py-6">
              <p className="flex-1 text-sm leading-[1.7] text-[#13111E]">&ldquo;{t.quote}&rdquo;</p>
              <div>
                <div className="text-[13px] font-bold text-[#13111E]">{t.name}</div>
                <div className="mt-0.5 text-xs text-[#8B87AD]">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-timetable scale */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16 text-center">
        <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Built to scale</p>
        <h2 className="mb-9 max-w-[520px] text-[clamp(22px,3.5vw,30px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          Run <span className="italic text-[#7C6FE0]">every grade's schedule</span> at once.
        </h2>
        <div className="w-full max-w-[500px] rounded-2xl border border-[#E8E4FF] bg-[#FAFAFE] p-6">
          <MultiTimetable />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-[72px] text-center">
        <h2 className="mb-2.5 text-[32px] font-normal leading-[1.2] text-[#13111E]">Ready to build your timetable?</h2>
        <p className="mb-8 max-w-[380px] text-[15px] leading-[1.6] text-[#8B87AD]">
          Start free. No setup. No training required.
        </p>
        <a href={appHref('/login')} className="no-underline">
          <button className="inline-flex items-center gap-2 rounded-[9px] bg-[#7C6FE0] px-9 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
            Create your first timetable →
          </button>
        </a>
      </section>
    </MarketingChrome>
  )
}
