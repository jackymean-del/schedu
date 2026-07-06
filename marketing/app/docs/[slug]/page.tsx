import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketingChrome } from '@/components/MarketingChrome'
import { appHref } from '@/lib/appUrl'
import { DOC_ARTICLES, getDoc, type DocBlock } from '@/content/docs'

// Static export needs every param known at build time — no on-demand slugs.
export const dynamicParams = false

export function generateStaticParams() {
  return DOC_ARTICLES.map(d => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) return { title: 'Documentation' }
  return {
    title: `${doc.title} · Docs`,
    description: doc.description,
    alternates: { canonical: `/docs/${doc.slug}` },
  }
}

function Block({ block }: { block: DocBlock }) {
  if ('p' in block) return <p className="mt-4 text-[15px] leading-[1.8] text-[#4B5275]">{block.p}</p>
  if ('ul' in block)
    return (
      <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
        {block.ul.map(item => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-[1.7] text-[#4B5275]">
            <span className="mt-[2px] font-extrabold text-[#7C6FE0]">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  if ('ol' in block)
    return (
      <ol className="mt-4 flex list-none flex-col gap-2.5 p-0">
        {block.ol.map((item, i) => (
          <li key={item} className="flex items-start gap-3 text-[15px] leading-[1.7] text-[#4B5275]">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#EDE9FF] text-[12px] font-bold text-[#7C6FE0]">{i + 1}</span>
            <span className="pt-px">{item}</span>
          </li>
        ))}
      </ol>
    )
  return (
    <div className="mt-5 rounded-xl border border-[#E8E4FF] bg-[#F8F7FF] px-4 py-3 text-[14px] leading-[1.6] text-[#4B5275]">
      💡 {block.note}
    </div>
  )
}

export default async function DocArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  return (
    <MarketingChrome>
      <div className="mx-auto grid w-full max-w-[1000px] grid-cols-1 gap-10 px-6 py-12 md:grid-cols-[220px_1fr]">

        {/* Sidebar */}
        <aside className="hidden md:block">
          <div className="sticky top-[80px]">
            <Link href="/docs" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8B87AD] no-underline hover:text-[#7C6FE0]">
              ← All docs
            </Link>
            <nav className="mt-5 flex flex-col gap-1">
              {DOC_ARTICLES.map(d => {
                const active = d.slug === doc.slug
                return (
                  <Link
                    key={d.slug}
                    href={`/docs/${d.slug}`}
                    className={`rounded-lg px-3 py-2 text-[13.5px] no-underline transition-colors ${
                      active ? 'bg-[#EDE9FF] font-semibold text-[#7C6FE0]' : 'text-[#4B5275] hover:bg-[#F8F7FF]'
                    }`}
                  >
                    {d.icon} {d.title}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Article */}
        <article className="min-w-0">
          <Link href="/docs" className="text-[13px] font-semibold text-[#7C6FE0] no-underline md:hidden">← All docs</Link>
          <div className="mt-2 text-[34px] leading-none md:mt-0">{doc.icon}</div>
          <h1 className="mt-4 text-[32px] font-normal leading-[1.15] tracking-[-0.5px] text-[#13111E]">{doc.title}</h1>
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8B87AD]">{doc.readMins} min read</p>
          <p className="mt-5 text-[16px] leading-[1.8] text-[#4B5275]">{doc.intro}</p>

          {doc.sections.map(section => (
            <section key={section.heading} className="mt-10">
              <h2 className="text-[20px] font-bold text-[#13111E]">{section.heading}</h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}

          {/* Footer CTA */}
          <div className="mt-14 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E8E4FF] bg-[#F8F7FF] px-6 py-5">
            <span className="text-[15px] font-medium text-[#13111E]">Ready to try it?</span>
            <a href={appHref('/login')} className="rounded-[9px] bg-[#7C6FE0] px-5 py-2.5 text-[13px] font-bold text-white no-underline shadow-[0_4px_14px_rgba(124,111,224,0.32)]">
              Start free
            </a>
            <Link href="/contact" className="text-[13px] font-semibold text-[#7C6FE0] no-underline">Talk to us →</Link>
          </div>
        </article>
      </div>
    </MarketingChrome>
  )
}
