'use client'

import { useState } from 'react'

const inputClass =
  'w-full rounded-lg border border-[#E8E4FF] bg-white px-3.5 py-[11px] text-sm text-[#13111E] outline-none focus:border-[#7C6FE0]'
const labelClass = 'mb-1.5 block text-xs font-semibold text-[#4B5275]'

export function ContactForm() {
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
        body: JSON.stringify({ name, email, message, source: 'bhusku-contact' }),
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

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[14px] border border-[#86EFAC] bg-[#F0FDF4] px-[26px] py-8">
        <div className="text-3xl leading-none">✅</div>
        <h2 className="text-lg font-bold text-[#13111E]">Message sent</h2>
        <p className="text-sm leading-[1.7] text-[#4B5275]">
          Thanks{name ? `, ${name}` : ''} — we&rsquo;ve received your message and will reply to{' '}
          <span className="font-semibold text-[#13111E]">{email}</span> soon.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-[14px] border border-[#E8E4FF] bg-[#FCFBFF] px-[26px] py-7">
      <div>
        <label className={labelClass} htmlFor="c-name">Name</label>
        <input id="c-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
      </div>
      <div>
        <label className={labelClass} htmlFor="c-email">Email</label>
        <input id="c-email" type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required />
      </div>
      <div>
        <label className={labelClass} htmlFor="c-message">Message</label>
        <textarea id="c-message" rows={5} className={`${inputClass} resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="How can we help?" required />
      </div>
      {status === 'error' && <p className="text-[13px] font-medium text-[#DC2626]">{error}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="mt-1 rounded-[10px] bg-[#13111E] px-6 py-3 text-[14px] font-bold text-white disabled:opacity-60">
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
