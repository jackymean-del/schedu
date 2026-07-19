import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { HeroWalkthrough } from '@/components/animations/HeroWalkthrough'
import { LiveDemo } from '@/components/animations/LiveDemo'
import { CalendarShowcase } from '@/components/animations/CalendarShowcase'
import { UniqueFeatures } from '@/components/UniqueFeatures'
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


// Keep in sync with /pricing and the in-app Razorpay checkout (INR): Pro is
// ₹333/mo or ₹3,333/yr; Free caps match what the app enforces.
const TIERS = [
  {
    name: 'Free', price: '₹0', period: '/mo', sub: '',
    desc: 'Everything a small team needs to try AI scheduling.',
    cta: 'Start free', href: appHref('/login'), popular: false,
    features: ['AI auto-scheduling — conflict-free', '1 active schedule', 'Up to 40 classes', 'All timetable views', 'Excel & PDF export'],
  },
  {
    name: 'Pro', price: '₹333', period: '/mo', sub: 'or ₹3,333/yr — save 17%',
    desc: 'For a single institution running multiple streams and electives.',
    cta: 'Get Pro', href: appHref('/login'), popular: true,
    features: ['Unlimited schedules & classes', 'Live task assignment & substitutions', 'Team collaboration', 'Advanced AI & multi-shift scheduling', 'Priority support'],
  },
  {
    name: 'Enterprise', price: 'Custom', period: '', sub: '',
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
  title: 'schedU — Add Life to Your Schedules, Smartly | AI Timetable Generator',
  description: 'AI-generated, conflict-free timetables that keep living after publish day: a live board that follows the clock, fair one-click substitutions, and workload balancing. Any board, any curriculum, anywhere.',
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
  // Only the numeric INR tiers become Offers; Enterprise ("Custom") is omitted
  // rather than advertised with a fake price.
  offers: TIERS.filter(t => t.price.startsWith('₹')).map(t => ({
    '@type': 'Offer',
    name: t.name,
    price: t.price.replace(/[₹,]/g, ''),
    priceCurrency: 'INR',
  })),
}

export default function HomePage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_SCHEMA) }}
      />

      {/* Hero — the simulated product walkthrough plays immediately after the nav */}
      <section className="bg-gradient-to-b from-[#F8F7FF] to-white pb-12 pt-4">
        <HeroWalkthrough />

        <div className="mx-auto mt-10 max-w-[1000px] px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-[7px] rounded-full border border-[#E8C88A] bg-[#FDF6E7] px-4 py-[5px] text-xs font-semibold text-[#92702A]">
            <span className="inline-block size-[7px] shrink-0 rounded-full bg-[#D4920E]" />
            The only scheduler with a live board that follows the clock
          </div>
          <h1 className="mb-[16px] text-[clamp(30px,5.5vw,50px)] font-normal leading-[1.12] tracking-[-1.4px] text-[#13111E]">
            Add life to your schedules, <span className="italic text-[#7C6FE0]">smartly.</span>
          </h1>
          <p className="mx-auto mb-8 max-w-[640px] text-base leading-[1.75] text-[#4B5275]">
            Most timetables die the day they&rsquo;re published. Yours follows the clock —
            who&rsquo;s teaching, who&rsquo;s free, who&rsquo;s covering — every minute of term,
            across every schedule your institution runs.
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

      {/* Try it live — a genuinely interactive Live board, not a video */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16">
        <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">No signup needed — try it right here</p>
        <h2 className="mb-2 max-w-[640px] text-center text-[clamp(24px,4vw,32px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          Drag through a school day, <span className="italic text-[#7C6FE0]">live.</span>
        </h2>
        <p className="mb-8 max-w-[560px] text-center text-[14px] leading-[1.65] text-[#4B5275]">
          This is the Live board. Drag the timeline, sort free faculty by load, mark someone absent and assign a fairness-checked substitute — the same mechanics as the product.
        </p>
        <LiveDemo />
      </section>

      {/* Calendar mode — full-width day timetable with the real red Playhead */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#FAFAFE] px-6 py-16">
        <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Calendar mode — every lens, one timeline</p>
        <h2 className="mb-2 max-w-[680px] text-center text-[clamp(24px,4vw,32px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          The day, hour by hour — with the <span className="italic text-[#EF4444]">red Playhead</span> on your clock.
        </h2>
        <p className="mb-9 max-w-[600px] text-center text-[14px] leading-[1.65] text-[#4B5275]">
          The same school day through four lenses — Classes, Faculty, Venues, Subjects. The timeline is the heading, and the Playhead is genuinely your local time, moving as you read this.
        </p>
        <CalendarShowcase />
      </section>

      {/* Unique features — dense grid, no empty space */}
      <section id="unique" className="flex flex-col items-center bg-white px-6 py-16">
        <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Not used by anyone else</p>
        <h2 className="mb-9 max-w-[560px] text-center text-[clamp(24px,4vw,32px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          Six things <span className="italic text-[#7C6FE0]">only schedU does.</span>
        </h2>
        <p className="mb-7 text-center text-[13px] text-[#8B87AD]">Click any card to try the actual mechanic — every demo is interactive.</p>
        <UniqueFeatures />
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
              <div className="mt-3.5 flex items-baseline gap-1">
                <span className="font-mono text-[34px] font-bold leading-none text-[#13111E]">{t.price}</span>
                {t.period && <span className="text-[13px] text-[#8B87AD]">{t.period}</span>}
              </div>
              <p className="mb-1.5 mt-1 min-h-[16px] text-[11.5px] font-semibold text-[#7C6FE0]">{t.sub}</p>
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
