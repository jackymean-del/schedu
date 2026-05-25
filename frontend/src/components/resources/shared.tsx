/**
 * Shared UI primitives — design system for all four resource panels.
 * InlineChipSelect — multi/single select with portal dropdown + grouped options
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

// ─── Design tokens ─────────────────────────────────────────────────────────────
export const P   = '#7C6FE0'                    // brand purple
export const P_D = '#6358C4'                    // darker — hover / active
export const P_L = '#EDE9FF'                    // light bg — chips, ghost buttons
export const P_B = 'rgba(124,111,224,0.22)'     // border

// ─── Table style constants ─────────────────────────────────────────────────────
export const TH: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'left', fontWeight: 700,
  fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#9896B5', borderBottom: '1.5px solid #EAE6FF',
  background: '#F7F5FF', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 2,
}

export const TD: React.CSSProperties = {
  padding: '3px 8px', fontSize: 12, color: '#111028',
  borderBottom: '1px solid #F0ECFE', verticalAlign: 'middle',
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
export const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2,
  background: '#EDE9FF', color: '#5B52C4',
  borderRadius: 4, padding: '0 5px 1px',
  fontSize: 10.5, fontWeight: 600, lineHeight: '14px',
  border: '1px solid rgba(124,111,224,0.3)', whiteSpace: 'nowrap',
  maxWidth: 100, overflow: 'hidden',
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
export const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: P_L, color: P_D, border: `1px solid ${P_B}`,
  borderRadius: 5, padding: '4px 10px', fontSize: 11.5,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

export const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: P, color: '#fff', border: 'none',
  borderRadius: 5, padding: '4px 12px', fontSize: 11.5,
  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

// ─── Table card container ──────────────────────────────────────────────────────
export const TABLE_CARD: React.CSSProperties = {
  flex: 1, overflowY: 'auto', marginTop: 4,
  border: '1px solid #E4E0FF', borderRadius: 7, background: '#fff',
  boxShadow: '0 1px 4px rgba(124,111,224,0.06)',
}

// ─── useClickOutside (two elements) ───────────────────────────────────────────
export function useClickOutsideTwo(
  a: React.RefObject<HTMLElement | null>,
  b: React.RefObject<HTMLElement | null>,
  fn: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        (!a.current || !a.current.contains(t)) &&
        (!b.current || !b.current.contains(t))
      ) fn()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [a, b, active, fn])
}

// ─── InlineEdit — click-to-edit text ──────────────────────────────────────────
export function InlineEdit({
  value, onSave, placeholder = 'Click to edit',
  style: extraStyle,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [tmp, setTmp] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setTmp(value) }, [value])

  function commit() { onSave(tmp.trim()); setEditing(false) }
  function cancel()  { setTmp(value); setEditing(false) }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={tmp}
        onChange={e => setTmp(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        style={{
          border: `1.5px solid ${P}`, borderRadius: 4, padding: '2px 6px',
          fontSize: 12, color: '#111028', outline: 'none',
          background: '#FAFAFE', fontFamily: 'inherit', ...extraStyle,
        }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor: 'text', borderRadius: 3, padding: '2px 4px',
        color: value ? '#111028' : '#C4C0DC',
        display: 'inline-block', minWidth: 50,
        transition: 'background 0.08s', ...extraStyle,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F0ECFE')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {value || placeholder}
    </span>
  )
}

// ─── InlineChipSelect ─────────────────────────────────────────────────────────
export interface ChipOption {
  value: string
  label?: string
  group?: string
}

interface InlineChipSelectProps {
  selected: string[]
  options: ChipOption[]
  onChange: (v: string[]) => void
  singleSelect?: boolean
  placeholder?: string
  maxChips?: number
  disabled?: boolean
  minDropdownWidth?: number
}

export function InlineChipSelect({
  selected, options, onChange,
  singleSelect = false,
  placeholder = '+ Add',
  maxChips = 2,
  disabled = false,
  minDropdownWidth = 240,
}: InlineChipSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: minDropdownWidth })
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropRef    = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  useClickOutsideTwo(triggerRef, dropRef, () => { setOpen(false); setSearch('') }, open)

  useEffect(() => {
    if (!open) return
    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const w = Math.max(rect.width + 50, minDropdownWidth)
      const spaceBelow = window.innerHeight - rect.bottom
      setPos({
        left: Math.min(rect.left, window.innerWidth - w - 8),
        width: w,
        top: spaceBelow > 250 ? rect.bottom + 4 : rect.top - 280,
      })
    }
    document.addEventListener('scroll', reposition, true)
    return () => document.removeEventListener('scroll', reposition, true)
  }, [open, minDropdownWidth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  function openDropdown() {
    if (disabled) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const w = Math.max(rect.width + 50, minDropdownWidth)
    const spaceBelow = window.innerHeight - rect.bottom
    setPos({
      left: Math.min(rect.left, window.innerWidth - w - 8),
      width: w,
      top: spaceBelow > 250 ? rect.bottom + 4 : rect.top - 280,
    })
    setOpen(o => !o)
  }

  function toggle(value: string) {
    if (singleSelect) {
      onChange(selected[0] === value ? [] : [value])
      setOpen(false); setSearch('')
    } else {
      onChange(selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value])
    }
  }

  const hasGroups = options.some(o => o.group)
  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map<string, ChipOption[]>()
    for (const opt of options) {
      const lbl = opt.label ?? opt.value
      if (q && !lbl.toLowerCase().includes(q) && !opt.value.toLowerCase().includes(q)) continue
      const g = opt.group ?? ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(opt)
    }
    return map
  }, [options, search])

  const visible  = selected.slice(0, maxChips)
  const overflow = selected.length - visible.length

  return (
    <>
      <div
        ref={triggerRef}
        onClick={openDropdown}
        style={{
          display: 'inline-flex', flexWrap: 'wrap', gap: 3, alignItems: 'center',
          cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${open ? P : 'transparent'}`,
          borderRadius: 4, padding: '1px 2px', transition: 'border-color 0.12s',
          minHeight: 22,
        }}
      >
        {visible.map(v => {
          const lbl = options.find(o => o.value === v)?.label ?? v
          return (
            <span key={v} style={chipStyle}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</span>
              {!disabled && (
                <button
                  onMouseDown={e => { e.stopPropagation(); e.preventDefault(); toggle(v) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 1px', color: P_D, lineHeight: 1, flexShrink: 0, fontSize: 11, opacity: 0.75 }}
                >×</button>
              )}
            </span>
          )
        })}
        {overflow > 0 && (
          <span style={{
            background: '#F0EDFF', color: '#7C6FE0', borderRadius: 4,
            padding: '1px 5px 2px', fontSize: 10.5, fontWeight: 700,
            border: '1px solid rgba(124,111,224,0.22)',
          }}>+{overflow}</span>
        )}
        {/* Placeholder — button-style when empty, subtle edit icon when populated */}
        {!disabled && selected.length === 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: P,
            padding: '3px 10px',
            background: '#fff', border: `1.5px solid #DDD8FF`,
            borderRadius: 5, lineHeight: '14px', whiteSpace: 'nowrap',
          }}>
            {placeholder}
          </span>
        )}
        {!disabled && selected.length > 0 && (
          <span style={{ fontSize: 10, color: '#C4C0DC', padding: '0 2px', lineHeight: 1, userSelect: 'none' }}>✎</span>
        )}
      </div>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
            background: '#fff', border: '1px solid #DDD8FF',
            borderRadius: 8, boxShadow: '0 8px 28px rgba(90,80,180,0.16), 0 2px 8px rgba(90,80,180,0.08)',
            zIndex: 9999, overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #EEE9FF', display: 'flex', alignItems: 'center', gap: 6, background: '#FAFAFE' }}>
            <span style={{ fontSize: 12, color: '#C0BBD8', flexShrink: 0 }}>⌕</span>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, background: 'transparent', color: '#111028', fontFamily: 'inherit' }}
            />
            {search && (
              <button onMouseDown={e => { e.preventDefault(); setSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BBD8', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
            )}
          </div>

          {/* Bulk actions */}
          {!singleSelect && (
            <div style={{ padding: '4px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid #EEE9FF', background: '#F9F7FF' }}>
              <button
                onMouseDown={e => { e.preventDefault(); onChange(options.map(o => o.value)) }}
                style={{ fontSize: 10, color: '#5B52C4', background: '#EDE9FF', border: '1px solid rgba(124,111,224,0.22)', borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontWeight: 700 }}
              >All</button>
              <button
                onMouseDown={e => { e.preventDefault(); onChange([]) }}
                style={{ fontSize: 10, color: '#888', background: '#F0F0F0', border: '1px solid #E4E4E4', borderRadius: 3, padding: '2px 7px', cursor: 'pointer' }}
              >None</button>
              {hasGroups && Array.from(grouped.keys()).filter(g => g).map(g => {
                const vals = (grouped.get(g) ?? []).map(o => o.value)
                const allIn = vals.every(v => selected.includes(v))
                return (
                  <button key={g}
                    onMouseDown={e => {
                      e.preventDefault()
                      if (allIn) onChange(selected.filter(v => !vals.includes(v)))
                      else { const next = new Set(selected); vals.forEach(v => next.add(v)); onChange(Array.from(next)) }
                    }}
                    style={{
                      fontSize: 10, color: allIn ? '#5B52C4' : '#555',
                      background: allIn ? '#EDE9FF' : '#F0F0F0',
                      border: allIn ? '1px solid rgba(124,111,224,0.22)' : '1px solid #E4E4E4',
                      borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontWeight: allIn ? 700 : 400,
                    }}
                  >{g}</button>
                )
              })}
            </div>
          )}

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {Array.from(grouped.entries()).map(([grp, opts]) => (
              <div key={grp}>
                {grp && (
                  <div style={{
                    padding: '5px 10px 3px', fontSize: 9, fontWeight: 700,
                    color: '#B0ABCC', textTransform: 'uppercase', letterSpacing: '0.08em',
                    background: '#F9F7FF', borderTop: '1px solid #EEEBFF',
                  }}>{grp}</div>
                )}
                {opts.map(opt => {
                  const lbl = opt.label ?? opt.value
                  const checked = selected.includes(opt.value)
                  return (
                    <label key={opt.value}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 10px', cursor: 'pointer',
                        background: checked ? '#F0EDFF' : 'transparent',
                        fontSize: 12, color: checked ? '#4A43A0' : '#111028',
                        fontWeight: checked ? 600 : 400,
                        transition: 'background 0.07s',
                      }}
                      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#F9F8FF' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = checked ? '#F0EDFF' : '' }}
                    >
                      <input
                        type={singleSelect ? 'radio' : 'checkbox'}
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                        style={{ accentColor: P, margin: 0, flexShrink: 0 }}
                      />
                      {lbl}
                    </label>
                  )
                })}
              </div>
            ))}
            {grouped.size === 0 && (
              <div style={{ padding: '14px 10px', textAlign: 'center', fontSize: 12, color: '#C0BBD8' }}>
                {search ? `No matches for "${search}"` : 'No options available'}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
