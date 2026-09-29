/**
 * GradeInput - a smart autocomplete input for class/grade range fields.
 *
 * Detects the naming prefix the user is typing (Class, Grade, Std, Form,
 * Year, …) and shows matching numbered suggestions (roman & arabic). Falls
 * back to a curated list of common pre-primary labels when the field is empty.
 * Auto-corrects spacing on blur via tidyGradeLabel.
 */
import { useState, useRef, useEffect, useId } from 'react'
import { tidyGradeLabel } from '@/lib/gradeParse'

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
const ARABIC = ['1','2','3','4','5','6','7','8','9','10','11','12']

const PRE_PRIMARY = ['Nursery', 'LKG', 'UKG', 'KG-1', 'KG-2', 'PP-1', 'PP-2', 'Pre-K', 'Reception']

// Recognised prefix keywords and their canonical capitalisation
const PREFIXES: { test: RegExp; label: string }[] = [
  { test: /^class/i,    label: 'Class' },
  { test: /^grade/i,    label: 'Grade' },
  { test: /^std/i,      label: 'Std' },
  { test: /^standard/i, label: 'Standard' },
  { test: /^form/i,     label: 'Form' },
  { test: /^year/i,     label: 'Year' },
  { test: /^level/i,    label: 'Level' },
  { test: /^room/i,     label: 'Room' },
]

function buildSuggestions(value: string): string[] {
  const v = value.trim()

  if (!v) return [...PRE_PRIMARY, ...ROMAN.map(r => `Class-${r}`)]

  const lower = v.toLowerCase()

  // Pre-primary match
  const preMatch = PRE_PRIMARY.filter(p => p.toLowerCase().startsWith(lower))
  if (preMatch.length) return preMatch

  // Prefix match - generate roman + arabic variants
  for (const { test, label } of PREFIXES) {
    if (test.test(v)) {
      const sep = v.includes(' ') ? ' ' : '-'
      return [
        ...ROMAN.map(r => `${label}${sep}${r}`),
        ...ARABIC.map(n => `${label}${sep}${n}`),
      ]
    }
  }

  return []
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  className?: string
}

export function GradeInput({ value, onChange, placeholder, style, className }: Props) {
  const [open, setOpen]   = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const uid = useId()

  const suggestions = buildSuggestions(value)
  const show = open && focused && suggestions.length > 0

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (s: string) => {
    onChange(tidyGradeLabel(s))
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        id={uid}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        style={style}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={e => {
          setFocused(false)
          // Tidy spacing/casing after the user leaves the field
          const tidied = tidyGradeLabel(e.target.value)
          if (tidied !== e.target.value) onChange(tidied)
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && suggestions.length === 1) pick(suggestions[0])
        }}
      />

      {show && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #DDD8FF',
          borderRadius: 8, zIndex: 200,
          boxShadow: '0 6px 20px rgba(124,111,224,0.14)',
          maxHeight: 220, overflowY: 'auto',
          padding: '4px 0',
        }}>
          {suggestions.map(s => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              style={{
                padding: '7px 12px', fontSize: 12.5, cursor: 'pointer',
                color: '#13111E', fontWeight: 500,
                background: value && s.toLowerCase() === value.toLowerCase() ? '#EDE9FF' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F5F2FF')}
              onMouseLeave={e => (e.currentTarget.style.background =
                value && s.toLowerCase() === value.toLowerCase() ? '#EDE9FF' : 'transparent')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
