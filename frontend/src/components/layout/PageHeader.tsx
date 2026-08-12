import type { ReactNode } from 'react'

interface PageHeaderProps {
  icon?: string
  title: string
  description?: string
  status?: 'saved' | 'saving' | 'draft' | 'published' | 'error' | null
  statusLabel?: string
  actions?: ReactNode
  tabs?: { key: string; label: string; count?: number }[]
  activeTab?: string
  onTabChange?: (key: string) => void
}

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  saved:     { dot: '#22c55e', text: '#69707e' },
  saving:    { dot: '#f59e0b', text: '#92400e' },
  draft:     { dot: '#f59e0b', text: '#92400e' },
  published: { dot: '#22c55e', text: '#065f46' },
  error:     { dot: '#ef4444', text: '#dc2626' },
}

export function PageHeader({
  icon, title, description,
  status, statusLabel,
  actions,
  tabs, activeTab, onTabChange,
}: PageHeaderProps) {
  const st = status ? STATUS_STYLES[status] : null

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      position: 'sticky', top: 0, zIndex: 20,
      flexShrink: 0,
    }}>
      {/* ── Main header row ── */}
      {/* Wraps below a fixed height on narrow screens: the title plus an action
          cluster needs ~500px, and on a phone the actions were pushed off the
          right edge with no way to reach them. */}
      <div style={{
        minHeight: 48, display: 'flex', alignItems: 'center',
        padding: '8px 16px', gap: 10, flexWrap: 'wrap',
      }}>
        {/* Decorative — the page's name is in the heading beside it, so a
            screen reader announcing the emoji would just add noise. */}
        {icon && <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
          {/* A real <h1>: Master Data, Syllabus, Settings and Users each had NO
              heading at all, so "jump to the main heading" landed nowhere. */}
          <h1 style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', margin: 0 }}>
            {title}
          </h1>
          {description && (
            <span style={{ fontSize: 12, color: '#6B7079', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              — {description}
            </span>
          )}
        </div>

        {/* Status indicator */}
        {status && st && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: st.dot, display: 'inline-block',
              ...(status === 'saving' ? { animation: 'pulse 1s infinite' } : {}),
            }} />
            <span style={{ fontSize: 11, color: st.text, fontWeight: 500 }}>
              {statusLabel ?? (status === 'saved' ? 'Auto-saved' : status.charAt(0).toUpperCase() + status.slice(1))}
            </span>
          </div>
        )}

        {/* Actions slot */}
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>

      {/* ── Tab bar (optional) ── */}
      {tabs && tabs.length > 0 && (
        <div style={{ display: 'flex', borderTop: '1px solid #f3f4f6', padding: '0 24px', gap: 2 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => onTabChange?.(t.key)}
              style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === t.key ? '2px solid #7C6FE0' : '2px solid transparent',
                background: 'transparent', marginBottom: -1,
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                color: activeTab === t.key ? '#7C6FE0' : '#69707e',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 0.1s',
              }}
            >
              {t.label}
              {t.count != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 10,
                  background: activeTab === t.key ? '#EDE9FF' : '#f3f4f6',
                  color: activeTab === t.key ? '#7C6FE0' : '#69707e',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
