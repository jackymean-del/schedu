/**
 * "Who does this apply to?" — the scope control shared by every calendar entry
 * that can be school-wide or narrower: holidays, ad-hoc missed days, events.
 *
 * Scope is stored as a list of SECTION names, because that is the granularity
 * everything downstream works in (holidayImpact walks classTT section by
 * section). An EMPTY list means the whole school — the common case, and the one
 * that needs no thought.
 *
 * The picker itself is offered class-first, since "the whole of Class IX is on
 * a field trip" is what people actually say. Tapping a class toggles all of its
 * sections at once; a class with a single section collapses to one chip so the
 * control doesn't look redundant for small schools.
 */
import { classOfSection } from '@/lib/syllabusTracking'

const ACCENT = '#7C6FE0'

export interface ScopeGroup { cls: string; sections: string[] }

/** Sections grouped by their class, in the order they were given. */
export function groupSections(sections: string[]): ScopeGroup[] {
  const out: ScopeGroup[] = []
  for (const s of sections) {
    const cls = classOfSection(s)
    const g = out.find(x => x.cls === cls)
    if (g) g.sections.push(s)
    else out.push({ cls, sections: [s] })
  }
  return out
}

/** How to describe a scope in one phrase, for banners and list rows. */
export function describeScope(value: string[] | undefined, allSections: string[]): string {
  if (!value?.length) return 'Whole school'
  // Name the class instead of listing its sections when every one is included.
  const groups = groupSections(allSections)
  const parts: string[] = []
  const covered = new Set<string>()
  for (const g of groups) {
    if (g.sections.length > 1 && g.sections.every(s => value.includes(s))) {
      parts.push(g.cls)
      g.sections.forEach(s => covered.add(s))
    }
  }
  for (const s of value) if (!covered.has(s)) parts.push(s)
  return parts.join(', ') || 'Whole school'
}

/**
 * The same thing phrased for the middle of a sentence — "…this for the whole
 * school", "…this for IX, X-A". Never lower-cased: class names are proper
 * names, and "declaring this for ix-a" reads like a typo.
 */
export function scopePhrase(value: string[] | undefined, allSections: string[]): string {
  return value?.length ? describeScope(value, allSections) : 'the whole school'
}

export function ScopePicker({ sections, value, onChange, label = 'Applies to' }: {
  /** Every section in the school. */
  sections: string[]
  /** Selected sections; empty = whole school. */
  value: string[]
  onChange: (next: string[]) => void
  label?: string
}) {
  const groups = groupSections(sections)
  const wholeSchool = value.length === 0

  const toggleSection = (s: string) =>
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s])
  const toggleClass = (g: ScopeGroup) => {
    const all = g.sections.every(s => value.includes(s))
    onChange(all
      ? value.filter(s => !g.sections.includes(s))
      : [...value, ...g.sections.filter(s => !value.includes(s))])
  }

  return (
    <div>
      <div style={lbl}>{label}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: wholeSchool ? 0 : 9 }}>
        <button type="button" onClick={() => onChange([])} style={chip(wholeSchool)}>
          Whole school
        </button>
        <button type="button"
          onClick={() => { if (wholeSchool) onChange(sections.slice(0, 1)) }}
          style={chip(!wholeSchool)}>
          Only certain classes
        </button>
      </div>

      {!wholeSchool && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 7,
          padding: '10px 11px', borderRadius: 10, border: '1px solid #ECE9FB', background: '#FBFAFF',
          maxHeight: 190, overflowY: 'auto',
        }}>
          {sections.length === 0 && (
            <span style={{ fontSize: 11.5, color: '#9A95BC' }}>
              No classes in this schedule yet — it will apply school-wide.
            </span>
          )}
          {groups.map(g => {
            // A one-section class needs one chip, not a heading plus a chip.
            if (g.sections.length === 1) {
              const s = g.sections[0]
              return (
                <div key={g.cls} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => toggleSection(s)} style={chip(value.includes(s), true)}>{s}</button>
                </div>
              )
            }
            const all = g.sections.every(s => value.includes(s))
            return (
              <div key={g.cls} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => toggleClass(g)} style={{ ...chip(all, true), fontWeight: 800 }}
                  title={all ? `Clear all of ${g.cls}` : `Select every section of ${g.cls}`}>
                  {g.cls} · all
                </button>
                {g.sections.map(s => (
                  <button type="button" key={s} onClick={() => toggleSection(s)} style={chip(value.includes(s), true)}>{s}</button>
                ))}
              </div>
            )
          })}
          <div style={{ fontSize: 11, color: '#9A95BC' }}>
            {value.length === 0
              ? 'Nothing selected — it will apply to the whole school.'
              : `Applies to ${describeScope(value, sections)}. Everyone else keeps their normal day.`}
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#4B5275', marginBottom: 5 }
const chip = (active: boolean, small = false): React.CSSProperties => ({
  padding: small ? '4px 10px' : '7px 13px',
  borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: small ? 11.5 : 12.5, fontWeight: 700,
  border: `1px solid ${active ? ACCENT : '#E4E0FF'}`,
  background: active ? '#EDE9FF' : '#fff',
  color: active ? '#4B41C4' : '#8B87AD',
})
