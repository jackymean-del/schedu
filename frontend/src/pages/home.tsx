/**
 * Landing page — schedU global marketing home.
 * Chrome (nav + footer) comes from MarketingChrome; sections use Tailwind.
 */
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { Seo } from '@/components/marketing/Seo'

const BOARDS = [
  'IB (MYP / DP)', 'Cambridge IGCSE', 'Common Core', 'GCSE / A-Level',
  'CBSE', 'ICSE', 'AP Courses', 'French Baccalaureate',
  'Australian ATAR', 'NCEA', 'Matric / NSC', 'O-Level / WAEC',
  'Korean CSAT', 'Japanese Gakuryoku', '…and any custom curriculum',
]

const FEATURES = [
  { icon: '🧠', title: 'AI period allocation', desc: 'AI suggests balanced period distributions per class and board — no manual tables needed.' },
  { icon: '👨‍🏫', title: 'Smart teacher allocation', desc: 'Workload-balanced, expertise-matched teacher assignments with vertical continuity rules.' },
  { icon: '👥', title: 'Dynamic cross-class groups', desc: 'Elective and activity groups auto-created across sections — no manual group setup.' },
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

const DEMO_CELLS = [
  { label: 'Mathematics', value: '7', hi: false },
  { label: 'Science', value: '5+1', hi: false },
  { label: 'English', value: '6', hi: false },
  { label: 'History', value: '4', hi: false },
  { label: 'Geography', value: '3', hi: false },
  { label: 'Languages', value: '3', hi: false },
  { label: 'PE / Arts', value: '2', hi: false },
  { label: 'Capacity', value: '34', hi: true },
]

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

const TESTIMONIALS = [
  { quote: 'schedU turned a three-week scheduling marathon into an afternoon. The conflict detection alone has saved us from a dozen timetable headaches this term.', name: 'Priya Nair', role: 'Vice Principal, Greenwood International School' },
  { quote: 'Managing electives across three streams used to be guesswork. Now the OR/AND groups just work, and every student gets a clash-free schedule.', name: 'Daniel Osei', role: 'Registrar, Northgate College' },
  { quote: 'Rolling schedU out across all our campuses was painless. SSO and the API meant every institution in the group was generating timetables in the same week.', name: 'Maria Gonzalez', role: 'Director of Operations, Atlas Education Group' },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export function HomePage() {
  return (
    <MarketingChrome>
      <Seo
        title="schedU — AI Timetable Scheduling for Any Institution"
        description="schedU uses AI to auto-generate conflict-free timetables for any institution — schools, colleges, universities, and beyond. Works with any board, any curriculum, anywhere."
        path="/"
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-[60px] pt-[72px] text-center">
        <div className="mb-7 inline-flex animate-[fadeUp_0.55s_ease_both] items-center gap-[7px] rounded-full border border-[#86EFAC] bg-[#F0FDF4] px-4 py-[5px] text-xs font-semibold text-[#15803D]">
          <span className="inline-block size-[7px] shrink-0 rounded-full bg-[#22C55E]" />
          AI-native timetable engine
        </div>

        <h1 className="mb-[18px] max-w-[720px] animate-[fadeUp_0.55s_ease_both] text-[clamp(34px,6.5vw,56px)] font-normal leading-[1.1] tracking-[-1.5px] text-[#13111E] [animation-delay:0.08s]">
          Schedule with schedU,<br />
          <span className="italic text-[#7C6FE0]">at the speed of light.</span>
        </h1>

        <p className="mb-9 max-w-[560px] animate-[fadeUp_0.55s_ease_both] text-base leading-[1.8] text-[#4B5275] [animation-delay:0.16s]">
          schedU intelligently allocates resources — slots, courses, educators, and locations —
          and builds conflict-free timetables in minutes. Designed for schools, colleges,
          universities, coaching institutes, training centres, and academic organizations
          of every scale. Works with any board, any curriculum, anywhere in the world.
        </p>

        <div className="mb-[52px] flex animate-[fadeUp_0.55s_ease_both] flex-wrap justify-center gap-3 [animation-delay:0.22s]">
          <a href="/wizard" className="no-underline">
            <button className="rounded-[9px] bg-[#7C6FE0] px-[30px] py-[13px] text-sm font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
              Start free — no credit card
            </button>
          </a>
          <a href="/demo" className="no-underline">
            <button className="rounded-[9px] border-[1.5px] border-[#E8E4FF] bg-white px-7 py-[13px] text-sm font-semibold text-[#4B5275] transition-colors hover:border-[#7C6FE0] hover:text-[#7C6FE0]">
              See a demo
            </button>
          </a>
        </div>

        {/* Floating demo card */}
        <div className="w-full max-w-[540px] animate-[floatCard_6s_ease-in-out_0.6s_infinite] overflow-hidden rounded-[14px] border border-[#E8E4FF] bg-white shadow-[0_16px_48px_rgba(124,111,224,0.14)]">
          <div className="flex items-center gap-2.5 border-b border-[#E8E4FF] bg-[#F8F7FF] px-4 py-2.5">
            <div className="flex shrink-0 gap-[5px]">
              <span className="size-[10px] rounded-full bg-[#FC6058]" />
              <span className="size-[10px] rounded-full bg-[#FDBC2C]" />
              <span className="size-[10px] rounded-full bg-[#34C749]" />
            </div>
            <span className="font-mono text-[11px] font-medium text-[#8B87AD]">
              schedU — AI Period Allocation — Grade 8A
            </span>
          </div>
          <div className="px-[18px] py-4">
            <div className="grid grid-cols-4 gap-2">
              {DEMO_CELLS.map(({ label, value, hi }) => (
                <div
                  key={label}
                  className={`rounded-[9px] p-2.5 text-center ${hi ? 'border border-[#C4B5FD] bg-[#EDE9FF]' : 'border border-[#E8E4FF] bg-[#FAFAFE]'}`}
                >
                  <div className={`mb-[5px] overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] font-semibold ${hi ? 'text-[#7C6FE0]' : 'text-[#8B87AD]'}`}>
                    {label}
                  </div>
                  <div className={`font-mono text-xl font-extrabold leading-none ${hi ? 'text-[#7C6FE0]' : 'text-[#13111E]'}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3 feature columns */}
      <section id="features" className="flex flex-col items-center bg-white px-6 py-16">
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className={`rounded-xl border border-[#E8E4FF] bg-[#FAFAFE] px-[22px] py-[26px] ${cardHover}`}>
              <div className="mb-3.5 text-[30px] leading-none">{f.icon}</div>
              <h3 className="mb-2 text-[15px] font-bold text-[#13111E]">{f.title}</h3>
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

      {/* How it works */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16">
        <p className="mb-7 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">How it works</p>
        <div className="grid w-full max-w-[900px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
          {STEPS.map(s => (
            <div key={s.n} className={`rounded-xl border border-[#E8E4FF] bg-white px-5 py-[22px] ${cardHover}`}>
              <div className="mb-3.5 inline-flex items-center justify-center rounded-full bg-[#EDE9FF] px-2.5 py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-[#7C6FE0]">
                Step {s.n}
              </div>
              <h4 className="mb-[7px] text-sm font-bold text-[#13111E]">{s.title}</h4>
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

      {/* Bottom CTA */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-[72px] text-center">
        <h2 className="mb-2.5 text-[32px] font-normal leading-[1.2] text-[#13111E]">Ready to build your timetable?</h2>
        <p className="mb-8 max-w-[380px] text-[15px] leading-[1.6] text-[#8B87AD]">
          Start free. No setup. No training required.
        </p>
        <a href="/wizard" className="no-underline">
          <button className="inline-flex items-center gap-2 rounded-[9px] bg-[#7C6FE0] px-9 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
            Create your first timetable →
          </button>
        </a>
      </section>
    </MarketingChrome>
  )
}
