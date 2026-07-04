/**
 * Features page — deep dive on what schedU does. Styled with Tailwind.
 */
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { Seo } from '@/components/marketing/Seo'
import { appStartHref } from '@/lib/nav'
import { ORGANIZATION_SCHEMA } from '@/lib/structuredData'

const FEATURES = [
  {
    icon: '🧠',
    title: 'AI auto-schedule',
    desc: 'Feed schedU your teachers, subjects, and sections, then let the AI build a complete, balanced timetable in seconds. Regenerate instantly when requirements change.',
  },
  {
    icon: '⚠️',
    title: 'Real-time conflict detection',
    desc: 'Every change is validated the moment you make it — teacher clashes, room double-bookings, and over-allocated periods are flagged live, so a finished timetable is always conflict-free.',
  },
  {
    icon: '🔀',
    title: 'Elective OR / AND groups',
    desc: 'OR slots run one subject at a time (e.g. Physics or Chemistry, as the day’s syllabus needs); AND groups pool same-subject students across sections into one cross-class group — all scheduled clash-free.',
  },
  {
    icon: '🎓',
    title: 'Multi-stream support',
    desc: 'Run Science, Commerce, and Arts streams side by side with split and merged sections. Shared subjects stay aligned across streams while each keeps its own requirements.',
  },
  {
    icon: '🏛️',
    title: 'Room & resource planning',
    desc: 'Tag rooms by type and capacity and let schedU place labs, halls, and shared spaces where they fit. Resource constraints are honoured automatically.',
  },
  {
    icon: '📤',
    title: 'Publishing & sharing',
    desc: 'Publish polished timetables, share them as a public or email-restricted link, or export to print-ready PDF and Excel — for staff, students, and parents.',
  },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export function FeaturesPage() {
  return (
    <MarketingChrome>
      <Seo
        title="Features"
        description="Explore every schedU feature — AI auto-scheduling, real-time conflict detection, elective OR/AND groups, multi-stream support, room planning, and PDF/Excel export."
        path="/features"
        jsonLd={ORGANIZATION_SCHEMA}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-14 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Features</p>
        <h1 className="mb-4 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Every tool your institution needs to{' '}
          <span className="italic text-[#7C6FE0]">schedule with confidence.</span>
        </h1>
        <p className="max-w-[560px] text-base leading-[1.8] text-[#4B5275]">
          schedU combines AI generation with the real constraints institutions live by —
          so the timetable you publish is always conflict-free.
        </p>
      </section>

      {/* Feature grid */}
      <section className="flex flex-col items-center bg-white px-6 pb-[72px] pt-14">
        <div className="grid w-full max-w-[980px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className={`rounded-[14px] border border-[#E8E4FF] bg-[#FAFAFE] px-6 py-7 ${cardHover}`}>
              <div className="mb-3.5 text-[30px] leading-none">{f.icon}</div>
              <h2 className="mb-2 text-base font-bold text-[#13111E]">{f.title}</h2>
              <p className="text-[13.5px] leading-[1.7] text-[#4B5275]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16 text-center">
        <h2 className="mb-6 text-[28px] font-normal text-[#13111E]">See it on your own data</h2>
        <a href={appStartHref()} className="no-underline">
          <button className="rounded-[9px] bg-[#7C6FE0] px-8 py-[13px] text-sm font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
            Start free — no credit card
          </button>
        </a>
      </section>
    </MarketingChrome>
  )
}
