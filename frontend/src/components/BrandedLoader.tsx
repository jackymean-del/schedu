/**
 * Full-screen branded loading state — the Fader U mark-native loader. Used while
 * auth is resolving (sign-in, protected-page loads, OAuth callback) so users
 * never see a flash of the login form or an empty page.
 *
 * The gold knob riding the right stem IS the loader (same motion vocabulary as
 * the marketing hero animation) — see design/brand/README.md §5.
 */
export function BrandedLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, background: '#F5F4F0',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes su-loader-knob { 0%{transform:translateY(0)} 38%{transform:translateY(-11px)} 72%{transform:translateY(4px)} 100%{transform:translateY(0)} }
        @keyframes su-loader-fill { 0%{stroke-dashoffset:13} 38%{stroke-dashoffset:2} 72%{stroke-dashoffset:17} 100%{stroke-dashoffset:13} }
        .su-loader .knob { animation: su-loader-knob 1.8s cubic-bezier(.45,0,.25,1) infinite; }
        .su-loader .fill { stroke-dasharray:21; stroke-dashoffset:13; animation: su-loader-fill 1.8s cubic-bezier(.45,0,.25,1) infinite; }
        @keyframes schedu-fade { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .su-loader .knob, .su-loader .fill { animation: none; }
          .schedu-fade-label { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      <div style={{
        width: 64, height: 64, borderRadius: 18, background: '#7C6FE0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(124,111,224,0.30)',
      }}>
        <svg className="su-loader" width="38" height="38" viewBox="0 0 52 52" fill="none">
          <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30" fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round"/>
          <line x1="36" y1="9" x2="36" y2="30" stroke="rgba(255,255,255,0.28)" strokeWidth="8" strokeLinecap="round"/>
          <path className="fill" d="M 36 30 L 36 9" pathLength={21} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round"/>
          <circle className="knob" cx="36" cy="22" r="4.5" fill="#D4920E"/>
        </svg>
      </div>

      <div className="schedu-fade-label" style={{ fontSize: 14, color: '#6B7280', animation: 'schedu-fade 1.2s ease-in-out infinite' }}>
        {label}
      </div>
    </div>
  )
}
