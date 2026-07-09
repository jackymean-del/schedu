import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { HeroMovie } from '@/components/animations/HeroMovie'
import { appHref } from '@/lib/appUrl'

const BOARDS = [
  'IB (MYP / DP)', 'Cambridge IGCSE', 'Common Core', 'GCSE / A-Level',
  'CBSE', 'ICSE', 'AP Courses', 'French Baccalaureate',
  'Australian ATAR', 'NCEA', 'Matric / NSC', 'O-Level / WAEC',
  'Korean CSAT', 'Japanese Gakuryoku', '…and any custom curriculum',
]

const STATS = [
  { value: '1,200+', label: 'Institutions using schedU' },
  { value: '4.8 min', label: 'Avg. timetable generation time' },
  { value: '98%', label: 'Conflict-free first generation' },
  { value: '180+', label: 'Countries & territories' },
]

const UNIQUE_FEATURES = [
  { icon: '🔀', title: 'Cross-timetable clash detection', desc: 'The same teacher double-booked across two entirely separate timetables — caught instantly, not just within one schedule.' },
  { icon: '🔗', title: 'Directory auto-link', desc: 'Type a teacher or room name that already exists elsewhere and schedU links it automatically — one record, reused everywhere.' },
  { icon: '🍱', title: 'Per-grade staggered breaks', desc: 'Nursery breaks after P3, Class VI after P5, Class XI after P6 — every grade\'s break lands at its own real time, automatically.' },
  { icon: '🔁', title: 'Transpose any view instantly', desc: 'Flip Class, Teacher, Room, or Subject views between periods-as-columns and days-as-columns with one click.' },
  { icon: '🧩', title: 'True AND / OR combination engine', desc: 'AND runs subjects in genuine parallel across sections, streams, and blocks. OR competes for a single slot based on real period need — never a fake simultaneous split.' },
  { icon: '📡', title: 'A live Pulse on every view', desc: 'Every schedule view — class, teacher, room, subject — carries the same live "now" indicator, not just one dashboard.' },
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
  title: 'schedU — The last schedule you\'ll ever fix by hand',
  description: 'schedU uses AI to auto-generate conflict-free timetables for any institution — schools, colleges, universities, and beyond. Works with any board, any curriculum, anywhere.',
  alternates: { canonical: '/' },
}

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

      {/* Hero — the movie plays immediately, right after the nav, full-bleed */}
      <section className="bg-gradient-to-b from-[#F8F7FF] to-white pb-12">
        <HeroMovie />

        <div className="mx-auto mt-10 max-w-[1000px] px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-[7px] rounded-full border border-[#E8C88A] bg-[#FDF6E7] px-4 py-[5px] text-xs font-semibold text-[#92702A]">
            <span className="inline-block size-[7px] shrink-0 rounded-full bg-[#D4920E]" />
            The only scheduler with a live Tuner Console
          </div>
          <h1 className="mb-[16px] text-[clamp(30px,5.5vw,50px)] font-normal leading-[1.12] tracking-[-1.4px] text-[#13111E]">
            The last schedule you&rsquo;ll ever{' '}
            <span className="italic text-[#7C6FE0]">fix by hand.</span>
          </h1>
          <p className="mx-auto mb-8 max-w-[620px] text-base leading-[1.75] text-[#4B5275]">
            Tune it like sound, resolve it like a puzzle — across every building, room,
            and combination your institution runs.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={appHref('/login')} className="no-underline">
              <button className="rounded-[9px] bg-[#7C6FE0] px-[26px] py-[13px] text-sm font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
                Start free — no credit card
              </button>
            </a>
            <a href="#unique" className="no-underline">
              <button className="rounded-[9px] border border-[#E8E4FF] bg-white px-[26px] py-[13px] text-sm font-bold text-[#4B5275]">
                See how it works
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="flex justify-center border-y border-[#F0EDFF] bg-[#F8F7FF] px-6 py-10">
        <div className="grid w-full max-w-[860px] grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          {STATS.map((s, i) => (
            <div key={s.label} className={`px-3 py-3 text-center ${i < STATS.length - 1 ? 'border-r border-[#E8E4FF]' : ''}`}>
              <div className="mb-[7px] text-[28px] font-normal leading-none text-[#13111E]">{s.value}</div>
              <div className="text-xs leading-[1.5] text-[#8B87AD]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Unique features — dense grid, no empty space */}
      <section id="unique" className="flex flex-col items-center bg-white px-6 py-16">
        <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Not used by anyone else</p>
        <h2 className="mb-9 max-w-[560px] text-center text-[clamp(24px,4vw,32px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          Six things <span className="italic text-[#7C6FE0]">only schedU does.</span>
        </h2>
        <div className="grid w-full max-w-[1040px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          {UNIQUE_FEATURES.map(f => (
            <div key={f.title} className={`rounded-xl border border-[#E8E4FF] bg-[#FAFAFE] px-6 py-6 ${cardHover}`}>
              <div className="mb-3 text-[26px] leading-none">{f.icon}</div>
              <h3 className="mb-2 text-[14.5px] font-bold text-[#13111E]">{f.title}</h3>
              <p className="text-[13px] leading-[1.65] text-[#4B5275]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Global board support */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#FAFAFE] px-6 py-14 text-center">
        <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">
          Works with every curriculum worldwide
        </p>
        <div className="flex max-w-[820px] flex-wrap justify-center gap-2">
          {BOARDS.map(b => (
            <span key={b} className="inline-block whitespace-nowrap rounded-full border border-[#E8E4FF] bg-white px-3 py-[5px] text-xs font-medium text-[#4B5275] transition-colors hover:border-[#C4B5FD] hover:bg-[#EDE9FF] hover:text-[#7C6FE0]">
              {b}
            </span>
          ))}
        </div>
        <p className="mt-5 max-w-[480px] text-[13px] leading-[1.6] text-[#8B87AD]">
          No built-in board restrictions. Enter your own period counts, subject names,
          and grading labels — schedU adapts to any institution.
        </p>
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

      {/* Bottom CTA */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16 text-center">
        <h2 className="mb-2.5 text-[30px] font-normal leading-[1.2] text-[#13111E]">Ready to build your timetable?</h2>
        <p className="mb-7 max-w-[380px] text-[15px] leading-[1.6] text-[#8B87AD]">
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
