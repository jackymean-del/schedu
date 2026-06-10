/**
 * Schedu design tokens — the single source of truth for brand styling.
 *
 * Import from here (or from components/resources/shared.tsx, which re-exports
 * BRAND as P/P_D/P_L/P_B for back-compat). Do NOT hard-code purple hexes:
 * the brand purple is #7C6FE0 and its dark/light/border variants below.
 *
 * Category palettes (room types, class groups, calendar accents) are
 * intentionally multi-coloured and live next to their feature code —
 * they are NOT brand tokens.
 */

export const BRAND = {
  /** Primary brand purple — buttons, links, active states, accents */
  primary:      '#7C6FE0',
  /** Darker variant — hover states, emphasised text on light purple */
  primaryDark:  '#6358C4',
  /** Light tint — selected/active backgrounds, chips */
  primaryLight: '#EDE9FF',
  /** Translucent border / focus ring */
  primaryBorder: 'rgba(124,111,224,0.22)',
} as const

export const SEMANTIC = {
  success: '#059669', successBg: '#F0FDF4', successBorder: '#6EE7B7',
  warning: '#D97706', warningBg: '#FFFBEB', warningBorder: '#FDE68A',
  danger:  '#DC2626', dangerBg:  '#FEF2F2', dangerBorder:  '#FECACA',
  info:    '#2563EB', infoBg:    '#EFF6FF', infoBorder:    '#BFDBFE',
} as const

export const GRAY = {
  text:      '#111028',  // primary text
  textSoft:  '#374151',  // headings on cards
  textMuted: '#6B7280',  // secondary text
  textFaint: '#9CA3AF',  // hints, placeholders
  border:    '#E5E7EB',
  borderSoft:'#F3F4F6',
  bg:        '#FAFAFA',
  card:      '#FFFFFF',
} as const

export const RADIUS = {
  sm: 6,    // inputs, small buttons
  md: 8,    // buttons, rows
  lg: 10,   // cards
  xl: 12,   // panels, modals
  pill: 20, // chips, badges
} as const

export const FONT = {
  mono: "'DM Mono', monospace",
  body: "'Hanken Grotesk', system-ui, sans-serif",
} as const
