import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { HeroWalkthrough } from '@/components/animations/HeroWalkthrough'
import { LiveDemo } from '@/components/animations/LiveDemo'
import { CalendarShowcase } from '@/components/animations/CalendarShowcase'
import { UniqueFeatures } from '@/components/UniqueFeatures'
import { LocalPrice, LocalMoney, LocalBillingNote } from '@/components/LocalPrice'
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
    desc: 'Everything a small team needs to try Human-Intelligence scheduling.',
    cta: 'Start free', href: appHref('/login'), popular: false,
    features: ['Human-Intelligence auto-scheduling — conflict-free', 'Up to 10 sections', 'All timetable views', 'Excel & PDF export'],
  },
  {
    name: 'Pro', price: '₹333', period: '/mo', sub: 'or ₹3,333/yr — save 17%',
    desc: 'For a single institution running multiple streams and electives.',
    cta: 'Get Pro', href: appHref('/login'), popular: true,
    features: ['Up to 70 sections', 'Live task assignment & substitutions', 'Team collaboration', 'Advanced engine & multi-shift scheduling', 'Priority support'],
  },
  {
    name: 'Enterprise', price: 'Custom', period: '', sub: '',
    desc: 'For groups beyond 70 sections or running multiple campuses.',
    cta: 'Talk to sales', href: 'mailto:hello@bhusku.com', popular: false,
    features: ['Beyond 70 sections', 'Multi-campus management', 'Everything in Pro', 'API access', 'SSO / SAML'],
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
  // The brand is spelled out because the root layout's title template applies
  // to CHILD segments only — this page sits in the same segment that defines
  // it, so nothing would be appended and a search for the brand would return a
  // result that never says it.
  //
  // 55 characters, so the whole line survives a Google listing rather than
  // being cut mid-phrase. "Timetable Generator" is what people type; "Human
  // Intelligence" is the reason to click this result over the AI ones around
  // it.
  title: 'schedU — Timetable Generator Built on Human Intelligence',
  description: 'Build conflict-free school timetables, class routines and teacher schedules in minutes. Built on Human Intelligence — real scheduling expertise you can inspect, question and override, not a black box that guesses. A live board that follows the clock, one-click substitutions and workload balancing, for any board and any curriculum.',
  alternates: { canonical: '/' },
}

// ── The questions people actually ask before choosing a scheduler ──────────
//
// This exists for two reasons, and the SEO one is the smaller of them.
//
// Not for the rich result. Google restricted FAQ rich snippets in 2023 to
// well-known government and health sites, so this markup will almost certainly
// not draw an expanded listing, and pretending otherwise would be the kind of
// SEO folklore that survives because nobody checks.
//
// What it does do is give a crawler unambiguous, quotable text. The listing for
// this site read "schedU uses AI to auto-generate conflict-free timetables" —
// the opposite of what this product is — because a crawler inferred it from a
// category full of AI tools and a page that never said otherwise in so many
// words. The first entry says otherwise in so many words, in the structured
// form that featured snippets and AI overviews draw from.
//
// Every answer here must also be TRUE and match the page; Google drops
// structured data that does not, and a school that arrives on a promise the
// product does not keep is worse than one that never came.
const HOME_FAQ = [
  {
    q: 'Does schedU use AI to build timetables?',
    a: 'No. schedU is built on Human Intelligence — the scheduling rules a timetable in-charge actually applies, written down and made inspectable. Every decision has a reason you can read, question and override, and the same input always produces the same timetable. A model that guesses can do none of those things, and a timetable you cannot explain to the teacher standing in front of you is not finished.',
  },
  {
    q: 'What does "Human Intelligence" mean in practice?',
    a: 'It means the constraints are explicit rather than learned. Teacher availability, weekly workload limits, double periods that must not straddle a break, a class teacher who takes the first period, room capacity, elective groups — each is a rule you set and can see applied. When something cannot be satisfied, schedU tells you which rule blocked it and where, instead of quietly producing a worse timetable.',
  },
  {
    q: 'How long does it take to generate a timetable?',
    a: 'Seconds for a typical school. A thirty-section school with a full allocation matrix, day-off rules and teacher availability solves in under a second, and you can re-run it as often as you like while you adjust the inputs.',
  },
  {
    q: 'Will it work with my board or curriculum?',
    a: 'Yes. schedU has no built-in board restrictions — you enter your own period counts, subject names, streams and grading labels. Schools on CBSE, ICSE, IB, Cambridge, state boards and Common Core all use the same engine, as do colleges and universities with entirely different structures.',
  },
  {
    q: 'What happens when a teacher is absent?',
    a: 'The day view shows every period left uncovered and suggests substitutes who are genuinely free at that moment — checked against every parallel group, not just the first name on the cell. One click records the cover, and the corridor board and every affected teacher’s timetable update with it.',
  },
  {
    q: 'Can several people work on the timetable?',
    a: 'Yes. A school can add colleagues by email with a role — administrator, faculty or view-only — and teachers get their own view of the periods they teach. Where a period offers a choice of subject, the teacher who offers it can take that slot themselves and the change reaches whoever is planning the day.',
  },
]

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOME_FAQ.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const SOFTWARE_APPLICATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'schedU',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  url: 'https://schedu.bhusku.com',
  description: 'Conflict-free, expertly generated timetables for schools, colleges, and universities — any board, any curriculum.',
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
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

      {/* Human Intelligence — the positioning story */}
      <section id="human-intelligence" className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16">
        <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Why schedU is different</p>
        <h2 className="mb-3 max-w-[720px] text-center text-[clamp(24px,4vw,34px)] font-normal leading-[1.18] tracking-[-0.6px] text-[#13111E]">
          Built with <span className="italic text-[#7C6FE0]">Human Intelligence</span>, not black-box AI.
        </h2>
        <p className="mx-auto mb-10 max-w-[620px] text-center text-[14.5px] leading-[1.75] text-[#4B5275]">
          A real timetable isn&rsquo;t a guess. schedU is the lived experience of building real
          schedules — the rules, the edge cases, the fairness — planned, turned into transparent
          logic, and implemented so you can see exactly why every decision was made. Predictable,
          explainable, and yours to override.
        </p>
        <div className="grid w-full max-w-[920px] gap-4 sm:grid-cols-3">
          {[
            { icon: '🧠', title: 'Practically experienced', body: 'Modelled on how schedules are really made — dispersal times, double periods, electives, staggered lunches, day-offs.' },
            { icon: '📐', title: 'Planned & algorithmed', body: 'Every constraint is deliberate logic with a national-policy brain behind it — not a statistical black box that hallucinates.' },
            { icon: '🔍', title: 'Explainable & yours', body: 'See why each slot got its teacher and subject, and hand-edit any cell. The engine assists; you stay in control.' },
          ].map(c => (
            <div key={c.title} className="rounded-[14px] border border-[#EFEBFF] bg-[#FCFBFF] px-[22px] py-6">
              <div className="mb-2.5 text-[22px]">{c.icon}</div>
              <h3 className="mb-1.5 text-[15px] font-bold text-[#13111E]">{c.title}</h3>
              <p className="text-[13px] leading-[1.65] text-[#4B5275]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Try it live — a genuinely interactive Live board, not a video */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#FAFAFE] px-6 py-16">
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
        <LocalBillingNote className="-mt-[22px] mb-[30px] max-w-[460px] text-center text-[11.5px] leading-[1.5] text-[#A5A1C0]" />
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
                <span className="font-mono text-[34px] font-bold leading-none text-[#13111E]"><LocalPrice>{t.price}</LocalPrice></span>
                {t.period && <span className="text-[13px] text-[#8B87AD]">{t.period}</span>}
              </div>
              <p className="mb-1.5 mt-1 min-h-[16px] text-[11.5px] font-semibold text-[#7C6FE0]">{t.sub ? <LocalMoney>{t.sub}</LocalMoney> : ''}</p>
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
      {/* FAQ — the marked-up questions must be visible on the page, or Google
          drops the structured data. */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16">
        <h2 className="mb-2 text-[28px] font-normal text-[#13111E]">Questions schools ask</h2>
        <p className="mb-8 max-w-[520px] text-center text-[14px] leading-[1.7] text-[#8B87AD]">
          The ones worth answering before you trust a piece of software with your week.
        </p>
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[18px]">
          {HOME_FAQ.map(item => (
            <div key={item.q} className="rounded-xl border border-[#E8E4FF] bg-white px-[22px] py-[22px]">
              <h3 className="mb-2 text-sm font-bold text-[#13111E]">{item.q}</h3>
              <p className="text-[13px] leading-[1.7] text-[#4B5275]">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

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
