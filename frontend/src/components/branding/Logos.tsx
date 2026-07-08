/**
 * Branding logos — schedU product mark, the "Fader U".
 *
 * The Fader U retires the old bhusku `b` dot-icon: it deliberately reads as
 * both U and b, so one mark now carries the whole family (see
 * design/brand/README.md §7). Never resurrect the old `b` glyph.
 */

import React from 'react'

interface LogoProps {
  size?: number
  bg?: string
  fg?: string
  accent?: string
  rounded?: number
  shadow?: boolean
}

// ── SchedU mark — the Fader U (asymmetric stem = tuner track, gold knob) ──
export function SchedULogo({
  size = 32, bg = '#7C6FE0', fg = '#FFFFFF', accent = '#D4920E',
  rounded = 9, shadow = false,
}: LogoProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: rounded, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: shadow ? `0 6px 16px ${bg}55` : undefined,
    }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 52 52" fill="none">
        <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22"
              stroke={fg} strokeWidth="8" fill="none" strokeLinecap="round"/>
        <circle cx="36" cy="12.5" r="4.5" fill={accent}/>
      </svg>
    </div>
  )
}

// ── SchedU full wordmark (icon + text) ──
export function SchedUWordmark({
  iconSize = 32, fontSize = 17, dark = true, showTagline = false,
}: { iconSize?: number; fontSize?: number; dark?: boolean; showTagline?: boolean }) {
  const fg = dark ? '#13111E' : '#FFFFFF'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SchedULogo size={iconSize} />
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize, fontWeight: 900, letterSpacing: '-0.6px', lineHeight: 1,
          color: fg,
        }}>
          Sched<span style={{ color: '#7C6FE0', fontFamily: "'Plus Jakarta Sans', Georgia, serif", fontStyle: 'italic', fontSize: fontSize + 1 }}>U</span>
        </span>
      </div>
      {showTagline && (
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8B87AD', marginTop: 3 }}>
          Smart Scheduling
        </div>
      )}
    </div>
  )
}

// ── Bhusku Footer — copyright + tagline, typographic-only attribution ──
// Tagline: "Heavy on craft. Full of energy." — captures Sambalpuri root
// (bhusku = "fat with knowledge") + the energy/conviction message.
// The `b` dot icon is retired (see design/brand/README.md §7) — the Fader U
// is the only family icon now; parent attribution is typography only.
export function BhuskuFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer style={{
      borderTop: '1px solid #E8E4FF',
      padding: compact ? '14px 24px' : '22px 28px',
      background: '#FAFAFE',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Left: Bhusku brand — typographic only, no icon */}
      <div>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 900, color: '#13111E', letterSpacing: '-0.4px', lineHeight: 1 }}>
          bhusku
        </div>
        <div style={{ fontSize: compact ? 9 : 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8B87AD', marginTop: 3 }}>
          Heavy on craft. <span style={{ color: '#D4920E' }}>Full of energy.</span>
        </div>
      </div>

      {/* Right: copyright */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 10, color: '#8B87AD', fontWeight: 500 }}>
          © 2026 All rights reserved · <span style={{ color: '#13111E', fontWeight: 700 }}>Bhusku</span>
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#B8B4D4' }}>
          Creative · Tech · Studio
        </span>
      </div>
    </footer>
  )
}
