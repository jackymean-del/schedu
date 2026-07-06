import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/MarketingChrome'
import { ContactForm } from './ContactForm'
import { appHref } from '@/lib/appUrl'

const CHANNELS = [
  { icon: '✉️', title: 'Email', value: 'hello@bhusku.com', href: 'mailto:hello@bhusku.com' },
  { icon: '💬', title: 'Support', value: 'support@bhusku.com', href: 'mailto:support@bhusku.com' },
  { icon: '🚀', title: 'Start free', value: 'Create a timetable now', href: appHref('/wizard') },
]

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions about schedU, a demo for your institution, or help getting set up? Get in touch with the schedU team.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <MarketingChrome>
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-10 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Contact</p>
        <h1 className="mb-3.5 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Let&apos;s talk <span className="italic text-[#7C6FE0]">scheduling.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-[1.8] text-[#4B5275]">
          Questions about schedU, a demo for your institution, or help getting set up — we&apos;d love to hear from you.
        </p>
      </section>

      {/* Body: form + channels */}
      <section className="flex justify-center bg-white px-6 pb-[72px] pt-10">
        <div className="grid w-full max-w-[900px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-7">

          <ContactForm />

          {/* Channels */}
          <div className="flex flex-col gap-3.5">
            {CHANNELS.map(c => (
              <a key={c.title} href={c.href} className="no-underline">
                <div className="flex items-center gap-3.5 rounded-[14px] border border-[#E8E4FF] bg-white px-5 py-[18px] transition-all hover:-translate-y-[3px] hover:border-[#D8D2FF] hover:shadow-[0_8px_24px_rgba(124,111,224,0.10)]">
                  <div className="text-2xl leading-none">{c.icon}</div>
                  <div>
                    <div className="text-sm font-bold text-[#13111E]">{c.title}</div>
                    <div className="mt-0.5 text-[13px] text-[#7C6FE0]">{c.value}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>

        </div>
      </section>
    </MarketingChrome>
  )
}
