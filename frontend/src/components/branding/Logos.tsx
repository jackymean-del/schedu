/**
 * Branding logos — Bhusku (parent brand) + SchedU (product)
 *
 * BhuskuLogo: stylized `b` letterform with gold accent dot.
 *             Used only in FOOTER and brand pages.
 *
 * SchedULogo: stacked time-block / Gantt motif representing scheduling.
 *             UNIQUE to SchedU. Used in sidebar, topbar, dashboard.
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

// ── SchedU mark — stacked time-blocks (scheduling timeline) ──
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
        {/* Stacked time-blocks — 4 bars of varying widths suggesting a schedule */}
        <rect x="10" y="13" width="24" height="4.5" rx="2.25" fill={fg}/>
        <rect x="10" y="21" width="32" height="4.5" rx="2.25" fill={fg} opacity="0.82"/>
        <rect x="10" y="29" width="18" height="4.5" rx="2.25" fill={fg} opacity="0.65"/>
        <rect x="10" y="37" width="26" height="4.5" rx="2.25" fill={fg} opacity="0.5"/>
        {/* Gold dot accent (matches Bhusku family) */}
        <circle cx="42" cy="11" r="3.5" fill={accent}/>
      </svg>
    </div>
  )
}

// ── Bhusku b-mark — letterform with gold accent ──
export function BhuskuLogo({
  size = 28, bg = '#7C6FE0', fg = '#FFFFFF', accent = '#D4920E',
  rounded = 8, shadow = false,
}: LogoProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: rounded, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: shadow ? `0 4px 12px ${bg}44` : undefined,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 52 52" fill="none">
        <rect x="12" y="9" width="8" height="33" rx="4" fill={fg}/>
        <path d="M 20 22 C 23 14 40 15 40 30 C 40 45 23 46 20 42"
              stroke={fg} strokeWidth="8" fill="none" strokeLinecap="round"/>
        <circle cx="39" cy="10" r="4.5" fill={accent}/>
      </svg>
    </div>
  )
}

// ── SchedU full wordmark (icon + text) ──
export function SchedUWordmark({
  iconSize = 32, fontSize = 17, dark = true, showTagline = false,
}: { iconSize?: number; fontSize?: number; dark?: boolean; showTagline?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SchedULogo size={iconSize} />
      <div>
        <div style={{
          fontFamily: "'Hanken Grotesk', sans-serif",
          fontSize, fontWeight: 900, letterSpacing: '-0.6px', lineHeight: 1,
          color: dark ? '#13111E' : '#FFFFFF',
        }}>
          Sched<span style={{ color: '#7C6FE0', fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: fontSize + 1 }}>U</span>
        </div>
        {showTagline && (
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8B87AD', marginTop: 3 }}>
            Smart Scheduling
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bhusku Footer — copyright + tagline + b-mark ──
// Tagline: "Heavy on craft. Full of energy." — captures Sambalpuri root
// (bhusku = "fat with knowledge") + the energy/conviction message.
export function BhuskuFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer style={{
      borderTop: '1px solid #E8E4FF',
      padding: compact ? '14px 24px' : '22px 28px',
      background: '#FAFAFE',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const,
      fontFamily: "'Hanken Grotesk', sans-serif",
    }}>
      {/* Left: Bhusku brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <BhuskuLogo size={compact ? 26 : 32} />
        <div>
          <div style={{ fontSize: compact ? 13 : 14, fontWeight: 900, color: '#13111E', letterSpacing: '-0.4px', lineHeight: 1 }}>
            bhusku
          </div>
          <div style={{ fontSize: compact ? 9 : 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8B87AD', marginTop: 3 }}>
            Heavy on craft. <span style={{ color: '#D4920E' }}>Full of energy.</span>
          </div>
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
