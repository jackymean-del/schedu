/**
 * Public, read-only timetable viewer at /share/<token>.
 * Fetches a self-contained snapshot from the public API — no auth, no store.
 */
import { useEffect, useState } from 'react'
import { Seo } from '@/components/marketing/Seo'
import { appStartHref } from '@/lib/nav'
import type { SharedTimetable } from '@/lib/share'

export function SharedTimetablePage() {
  const token = window.location.pathname.split('/').filter(Boolean).pop() ?? ''
  const [data, setData] = useState<SharedTimetable | null>(null)
  const [title, setTitle] = useState('Shared schedule')
  const [status, setStatus] = useState<'loading' | 'ready' | 'restricted' | 'error'>('loading')

  // Email gate (restricted shares) — two steps: request code, then verify it
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [gateStep, setGateStep] = useState<'email' | 'code'>('email')
  const [unlocking, setUnlocking] = useState(false)
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/share/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then(json => {
        if (!active) return
        setTitle(json.title || json.timetable?.title || 'Shared schedule')
        if (json.restricted) {
          setStatus('restricted')
          return
        }
        setData(json.timetable as SharedTimetable)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [token])

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setUnlocking(true)
    setAccessError('')
    try {
      const res = await fetch(`/api/share/${token}/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not send a code, please try again.')
      }
      setGateStep('code')
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Could not send a code.')
    } finally {
      setUnlocking(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setUnlocking(true)
    setAccessError('')
    try {
      const res = await fetch(`/api/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'That code is invalid or has expired.')
      }
      const json = await res.json()
      setData(json.timetable as SharedTimetable)
      setTitle(json.title || 'Shared schedule')
      setStatus('ready')
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Could not verify this code.')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div data-mk className="flex min-h-screen flex-col bg-white text-[#13111E]">
      <Seo
        title={`${title} · Shared schedule`}
        description="A read-only schedule shared via schedU."
        path={`/share/${token}`}
        noindex
      />

      {/* Slim header */}
      <header className="flex items-center justify-between border-b border-[#F0EDFF] px-6 py-3.5">
        <a href="/" className="flex items-center gap-2 no-underline">
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-[#7C6FE0]">
            <svg width="15" height="15" viewBox="0 0 52 52" fill="none">
              <rect x="12" y="9" width="8" height="33" rx="4" fill="white" />
              <path d="M 20 22 C 23 14 40 15 40 30 C 40 45 23 46 20 42" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round" />
              <circle cx="39" cy="10" r="4.5" fill="#D4920E" />
            </svg>
          </span>
          <span className="text-[15px] font-black tracking-[-0.3px]">
            sched<span className="italic text-[#7C6FE0]">U</span>
          </span>
        </a>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#EDE9FF] px-2.5 py-1 text-[11px] font-semibold text-[#7C6FE0]">View only</span>
          <a href={appStartHref()} className="rounded-[8px] bg-[#13111E] px-4 py-2 text-[12px] font-semibold text-white no-underline">
            Create your own
          </a>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        {status === 'loading' && <p className="py-20 text-center text-[#8B87AD]">Loading schedule…</p>}

        {status === 'restricted' && (
          <div className="mx-auto max-w-[420px] py-20 text-center">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-4 text-[24px] font-normal text-[#13111E]">{title}</h1>

            {gateStep === 'email' ? (
              <>
                <p className="mt-2 text-[15px] leading-[1.7] text-[#8B87AD]">
                  This timetable is shared privately. Enter your email and we’ll send you a one-time code.
                </p>
                <form onSubmit={requestCode} className="mx-auto mt-6 flex max-w-[360px] flex-col gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@institution.edu"
                    className="w-full rounded-lg border border-[#E8E4FF] bg-white px-3.5 py-[11px] text-sm text-[#13111E] outline-none focus:border-[#7C6FE0]"
                  />
                  <button
                    type="submit"
                    disabled={unlocking}
                    className="rounded-[9px] bg-[#7C6FE0] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {unlocking ? 'Sending…' : 'Send me a code'}
                  </button>
                  {accessError && <p className="text-[12px] text-[#DC2626]">{accessError}</p>}
                </form>
              </>
            ) : (
              <>
                <p className="mt-2 text-[15px] leading-[1.7] text-[#8B87AD]">
                  We sent a 6-digit code to <span className="font-semibold text-[#13111E]">{email}</span>. Enter it below.
                </p>
                <form onSubmit={verifyCode} className="mx-auto mt-6 flex max-w-[360px] flex-col gap-3">
                  <input
                    inputMode="numeric"
                    required
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-lg border border-[#E8E4FF] bg-white px-3.5 py-[11px] text-center text-lg tracking-[0.3em] text-[#13111E] outline-none focus:border-[#7C6FE0]"
                  />
                  <button
                    type="submit"
                    disabled={unlocking}
                    className="rounded-[9px] bg-[#7C6FE0] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {unlocking ? 'Checking…' : 'View schedule'}
                  </button>
                  {accessError && <p className="text-[12px] text-[#DC2626]">{accessError}</p>}
                  <button
                    type="button"
                    onClick={() => { setGateStep('email'); setCode(''); setAccessError('') }}
                    className="text-[12px] font-semibold text-[#7C6FE0]"
                  >
                    Use a different email
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="mx-auto max-w-[480px] py-20 text-center">
            <div className="text-4xl">🔗</div>
            <h1 className="mt-4 text-[24px] font-normal text-[#13111E]">Link not found</h1>
            <p className="mt-2 text-[15px] leading-[1.7] text-[#8B87AD]">
              This share link is invalid or has expired.
            </p>
            <a href="/" className="mt-6 inline-block rounded-[9px] bg-[#7C6FE0] px-6 py-3 text-sm font-bold text-white no-underline">
              Go to schedU
            </a>
          </div>
        )}

        {status === 'ready' && data && (
          <div className="mx-auto max-w-[1100px]">
            <h1 className="text-[26px] font-normal tracking-[-0.5px] text-[#13111E]">{data.title}</h1>
            <p className="mt-1 text-[12px] text-[#8B87AD]">
              {data.orgName ? `${data.orgName} · ` : ''}
              Generated {new Date(data.generatedAt).toLocaleDateString()} · view-only snapshot
            </p>

            {data.sections.length === 0 && (
              <p className="mt-10 text-[#8B87AD]">This shared schedule has no sections.</p>
            )}

            {data.sections.map(sec => (
              <section key={sec.name} className="mt-8">
                <h2 className="mb-3 text-[16px] font-bold text-[#13111E]">{sec.name}</h2>
                <div className="overflow-x-auto rounded-[12px] border border-[#E8E4FF]">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-[#F8F7FF]">
                        <th className="border-b border-r border-[#E8E4FF] px-3 py-2 text-left font-bold text-[#4B5275]">Day</th>
                        {data.periods.map(p => (
                          <th
                            key={p.id}
                            className={`border-b border-[#E8E4FF] px-3 py-2 text-center font-bold ${p.isBreak ? 'text-[#8B87AD]' : 'text-[#4B5275]'}`}
                          >
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map(day => (
                        <tr key={day}>
                          <td className="whitespace-nowrap border-r border-t border-[#E8E4FF] bg-[#FAFAFE] px-3 py-2 font-semibold text-[#13111E]">
                            {day.slice(0, 3)}
                          </td>
                          {data.periods.map(p => {
                            if (p.isBreak)
                              return (
                                <td key={p.id} className="border-t border-[#E8E4FF] bg-[#F8F7FF] px-2 py-2 text-center text-[10px] text-[#8B87AD]">
                                  {p.name}
                                </td>
                              )
                            const cell = sec.grid[day]?.[p.id]
                            return (
                              <td key={p.id} className="border-l border-t border-[#E8E4FF] px-2 py-2 text-center align-top">
                                {cell ? (
                                  <>
                                    <div className="font-bold text-[#13111E]">{cell.subject}</div>
                                    {cell.teacher && <div className="text-[10px] text-[#7C6FE0]">{cell.teacher}</div>}
                                    {cell.room && <div className="text-[10px] text-[#8B87AD]">{cell.room}</div>}
                                  </>
                                ) : (
                                  <span className="text-[#CBC6EC]">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-[#F0EDFF] px-6 py-4 text-center text-[12px] text-[#8B87AD]">
        Shared via{' '}
        <a href="/" className="font-semibold text-[#7C6FE0] no-underline">schedU</a> — AI timetable scheduling
      </footer>
    </div>
  )
}
