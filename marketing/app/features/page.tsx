import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { AndOrEngine } from '@/components/animations/AndOrEngine'
import { ScheduleViews } from '@/components/animations/ScheduleViews'
import { MultiBuilding } from '@/components/animations/MultiBuilding'
import { appHref } from '@/lib/appUrl'

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

export const metadata: Metadata = {
  title: 'Features',
  description: 'Explore every schedU feature — AI auto-scheduling, real-time conflict detection, elective OR/AND groups, multi-stream support, room planning, and PDF/Excel export.',
  alternates: { canonical: '/features' },
}

export default function FeaturesPage() {
  return (
    <MarketingChrome>
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

      {/* One schedule, every view — plus the generation pipeline */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16 text-center">
        <p className="mb-[14px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">From input to zero conflicts</p>
        <h2 className="mb-4 max-w-[600px] text-[clamp(24px,4vw,34px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          One schedule, <span className="italic text-[#7C6FE0]">every way you need to see it.</span>
        </h2>
        <p className="mb-9 max-w-[560px] text-sm leading-[1.8] text-[#4B5275]">
          Class, Teacher, Room, Subject, Calendar, and print-ready Traditional — all six views read the
          same underlying schedule, so a change in one is a change in all of them. Generated in seconds,
          always conflict-free.
        </p>
        <div className="w-full max-w-[640px] rounded-2xl border border-[#E8E4FF] bg-white p-6">
          <ScheduleViews />
        </div>
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

      {/* Differentiator: the Academic Combination Matrix */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-white px-6 py-16 text-center">
        <p className="mb-[14px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">No competitor has this</p>
        <h2 className="mb-4 max-w-[560px] text-[clamp(24px,4vw,34px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          Same students, <span className="italic text-[#7C6FE0]">regrouped differently</span> per subject.
        </h2>
        <p className="mb-9 max-w-[540px] text-sm leading-[1.8] text-[#4B5275]">
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[13px] text-[#13111E]">Physics AND Chemistry</code> runs both subjects in
          parallel — different groups attend their own teacher and venue at the same slot.{' '}
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[13px] text-[#13111E]">PE OR Painting</code> is a choice — each student
          picks one option, each with its own teacher and venue (or stays in homeroom). schedU resolves either
          expression into clash-free instructional clusters, pooling students across sections automatically.
        </p>
        <div className="w-full max-w-[720px] rounded-2xl border border-[#E8E4FF] bg-[#FAFAFE] p-6">
          <AndOrEngine />
        </div>
      </section>

      {/* Room & resource planning */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16 text-center">
        <p className="mb-[14px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Room & resource planning</p>
        <h2 className="mb-4 max-w-[560px] text-[clamp(24px,4vw,34px)] font-normal leading-[1.2] tracking-[-0.5px] text-[#13111E]">
          One schedule, <span className="italic text-[#7C6FE0]">every building.</span>
        </h2>
        <p className="mb-9 max-w-[520px] text-sm leading-[1.8] text-[#4B5275]">
          Labs, halls, and shared spaces across every block — schedU places each period
          where it fits, honouring room type and capacity automatically.
        </p>
        <div className="w-full max-w-[560px] rounded-2xl border border-[#E8E4FF] bg-white p-6">
          <MultiBuilding />
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 py-16 text-center">
        <h2 className="mb-6 text-[28px] font-normal text-[#13111E]">See it on your own data</h2>
        <a href={appHref('/login')} className="no-underline">
          <button className="rounded-[9px] bg-[#7C6FE0] px-8 py-[13px] text-sm font-bold text-white shadow-[0_4px_18px_rgba(124,111,224,0.38)]">
            Start free — no credit card
          </button>
        </a>
      </section>
    </MarketingChrome>
  )
}
