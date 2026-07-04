/**
 * Contact page — contact form (mailto) + details. Styled with Tailwind.
 */
import { useState } from 'react'
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { Seo } from '@/components/marketing/Seo'
import { ORGANIZATION_SCHEMA } from '@/lib/structuredData'

const CHANNELS = [
  { icon: '✉️', title: 'Email', value: 'hello@bhusku.com', href: 'mailto:hello@bhusku.com' },
  { icon: '💬', title: 'Support', value: 'support@bhusku.com', href: 'mailto:support@bhusku.com' },
  { icon: '🚀', title: 'Start free', value: 'Create a timetable now', href: '/wizard' },
]

const inputClass =
  'w-full rounded-lg border border-[#E8E4FF] bg-white px-3.5 py-[11px] text-sm text-[#13111E] outline-none focus:border-[#7C6FE0]'
const labelClass = 'mb-1.5 block text-xs font-semibold text-[#4B5275]'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong, please try again.')
      }
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong, please try again.')
    }
  }

  return (
    <MarketingChrome>
      <Seo
        title="Contact"
        description="Questions about schedU, a demo for your institution, or help getting set up? Get in touch with the schedU team."
        path="/contact"
        jsonLd={ORGANIZATION_SCHEMA}
      />
      {/* Hero */}
      <section className="flex flex-col items-center bg-gradient-to-b from-[#F8F7FF] to-white px-6 pb-10 pt-[72px] text-center">
        <p className="mb-[18px] text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B87AD]">Contact</p>
        <h1 className="mb-3.5 max-w-[640px] text-[clamp(30px,5vw,46px)] font-normal leading-[1.15] tracking-[-1px] text-[#13111E]">
          Let's talk <span className="italic text-[#7C6FE0]">scheduling.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-[1.8] text-[#4B5275]">
          Questions about schedU, a demo for your institution, or help getting set up — we'd love to hear from you.
        </p>
      </section>

      {/* Body: form + channels */}
      <section className="flex justify-center bg-white px-6 pb-[72px] pt-10">
        <div className="grid w-full max-w-[900px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-7">

          {/* Form */}
          {status === 'sent' ? (
            <div className="flex flex-col items-start gap-3 rounded-[14px] border border-[#86EFAC] bg-[#F0FDF4] px-[26px] py-8">
              <div className="text-3xl leading-none">✅</div>
              <h2 className="text-lg font-bold text-[#13111E]">Message sent</h2>
              <p className="text-sm leading-[1.7] text-[#4B5275]">
                Thanks{name ? `, ${name}` : ''} — we’ve received your message and will reply to{' '}
                <span className="font-semibold text-[#13111E]">{email}</span> soon.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-[14px] border border-[#E8E4FF] bg-[#FAFAFE] px-[26px] py-7">
              <div>
                <label className={labelClass} htmlFor="c-name">Name</label>
                <input id="c-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
              </div>
              <div>
                <label className={labelClass} htmlFor="c-email">Email</label>
                <input id="c-email" type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@institution.edu" required />
              </div>
              <div>
                <label className={labelClass} htmlFor="c-msg">Message</label>
                <textarea id="c-msg" className={`${inputClass} min-h-[120px] resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="How can we help?" required />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="rounded-lg bg-[#7C6FE0] px-[18px] py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(124,111,224,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
              {status === 'error' && (
                <p className="text-[12px] leading-[1.5] text-[#DC2626]">
                  {error} You can also email{' '}
                  <a href="mailto:hello@bhusku.com" className="font-semibold underline">hello@bhusku.com</a>.
                </p>
              )}
              <p className="text-[11px] leading-[1.5] text-[#8B87AD]">
                Prefer to write directly? Email{' '}
                <a href="mailto:hello@bhusku.com" className="font-semibold text-[#7C6FE0] no-underline">hello@bhusku.com</a>.
              </p>
            </form>
          )}

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
