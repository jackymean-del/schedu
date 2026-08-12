/**
 * Shared app footer — matches landing page footer.
 * Used on login, register, dashboard, and wizard pages.
 */
export function AppFooter({ style }: { style?: React.CSSProperties }) {
  const links = ['Privacy', 'Terms', 'Support', 'Status']
  return (
    <footer style={{
      background: '#fff',
      borderTop: '1px solid #E5E7EB',
      padding: '16px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      ...style,
    }}>
      <span style={{ fontSize: 12, color: '#6B7079' }}>
        © {new Date().getFullYear()} schedU. All rights reserved.
      </span>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {links.map(l => (
          <a key={l} href="#" style={{
            fontSize: 12, color: '#6B7079', textDecoration: 'none',
            transition: 'color 0.13s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = '#69707E')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6B7079')}
          >
            {l}
          </a>
        ))}
        <a href="mailto:hello@bhusku.com" style={{
          fontSize: 12, color: '#6B7079', textDecoration: 'none',
          transition: 'color 0.13s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#69707E')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6B7079')}
        >
          hello@bhusku.com
        </a>
      </div>
    </footer>
  )
}
