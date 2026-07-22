/**
 * Docs page — getting-started hub + quick links. Styled with Tailwind.
 */
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { Seo } from '@/components/marketing/Seo'
import { DOC_ARTICLES } from '@/content/docs'
import { ORGANIZATION_SCHEMA } from '@/lib/structuredData'

const STEPS = [
  { n: 1, title: 'Enter the basics', desc: 'Name your institution, pick a board (or define your own), and add class ranges, teachers, and rooms.' },
  { n: 2, title: 'Let the engine generate', desc: 'schedU builds period allocations, cross-class groups, and constraints automatically — no manual tables.' },
  { n: 3, title: 'Review & refine', desc: 'Edit inline like a spreadsheet. schedU re-validates on every change and explains each choice.' },
  { n: 4, title: 'Export & publish', desc: 'Download class-wise, teacher-wise, and room-wise timetables as PDF or Excel, or print them directly.' },
]

const cardHover =
  'transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)] hover:border-[#D8D2FF]'

export function DocsPage() {
  return (
    <MarketingChrome>
      <Seo
        title="Documentation"
        description="Learn how schedU works — from your first conflict-free timetable to advanced electives, room planning, and exports. Guides for schools, colleges, and universities."
        path="/docs"
        jsonLd={ORGANIZATION_SCHEMA}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-12 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Documentation</p>
        <h1 className="mb-3.5 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Everything you need to{' '}
          <span className="italic text-[#7C6FE0]">get scheduling.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-[1.8] text-[#4B5275]">
          A quick tour of how schedU works, from your first timetable to advanced electives and exports.
        </p>
      </section>

      {/* Quick start steps */}
      <section className="flex flex-col items-center bg-white px-6 py-14">
        <h2 className="mb-7 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Quick start</h2>
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
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

      {/* Topics */}
      <section className="flex flex-col items-center border-t border-[#F0EDFF] bg-[#F8F7FF] px-6 pb-[72px] pt-14">
        <h2 className="mb-7 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Browse by topic</h2>
        <div className="grid w-full max-w-[920px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
          {DOC_ARTICLES.map(d => (
            <a key={d.slug} href={`/docs/${d.slug}`} className="no-underline">
              <div className={`h-full rounded-[14px] border border-[#E8E4FF] bg-white px-[22px] py-6 ${cardHover}`}>
                <div className="mb-3 text-[26px] leading-none">{d.icon}</div>
                <h3 className="mb-[7px] text-[15px] font-bold text-[#13111E]">{d.title}</h3>
                <p className="text-[13px] leading-[1.65] text-[#4B5275]">{d.description}</p>
                <span className="mt-3 inline-block text-[12px] font-semibold text-[#7C6FE0]">Read →</span>
              </div>
            </a>
          ))}
        </div>
        <p className="mt-7 max-w-[460px] text-center text-[13px] leading-[1.6] text-[#8B87AD]">
          Looking for something specific?{' '}
          <a href="/contact" className="font-semibold text-[#7C6FE0] no-underline">Get in touch</a>{' '}
          and we'll point you the right way.
        </p>
      </section>
    </MarketingChrome>
  )
}
