/**
 * Step — Subject Combinations
 *
 * schedU works on COMBINATION-wise strength — not individual students.
 * Admin enters how many students chose each combination per class.
 *
 * Example for XI Science:
 *   PCM + CS  → 38 students
 *   PCB       → 26 students
 *   PCMB      → 12 students
 *
 * No student names, no rolls — just headcount per combination.
 */

import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { Plus, Trash2, GitMerge, Users2, Sparkles } from "lucide-react"
import type { SubjectCombination } from "@/types"

function makeId() { return Math.random().toString(36).slice(2, 9) }

const card: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E8E4FF',
  borderRadius: 12, padding: 16, marginBottom: 14,
}
const inp: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, borderRadius: 7,
  border: '1px solid #D8D2FF', background: '#FAFAFE',
  outline: 'none', color: '#13111E', minWidth: 0, width: '100%',
}
const lbl: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#8B87AD', marginBottom: 4,
}
const btnPri: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: '#7C6FE0', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 10px', borderRadius: 7, border: '1px solid #E8E4FF',
  background: '#fff', color: '#4B5275', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

// Some common combo presets to make data entry faster
const PRESETS: Record<string, { name: string; subjects: string[] }[]> = {
  Science: [
    { name: 'PCM',      subjects: ['Physics', 'Chemistry', 'Mathematics'] },
    { name: 'PCB',      subjects: ['Physics', 'Chemistry', 'Biology'] },
    { name: 'PCM + CS', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'] },
    { name: 'PCMB',     subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'] },
  ],
  Commerce: [
    { name: 'Commerce + Math', subjects: ['Accountancy', 'Business Studies', 'Economics', 'Mathematics'] },
    { name: 'Commerce + IT',   subjects: ['Accountancy', 'Business Studies', 'Economics', 'Computer Science'] },
    { name: 'Commerce only',   subjects: ['Accountancy', 'Business Studies', 'Economics'] },
  ],
  Humanities: [
    { name: 'History + Pol Sci', subjects: ['History', 'Political Science', 'Geography'] },
    { name: 'Arts + Psychology', subjects: ['History', 'Psychology', 'Sociology'] },
  ],
}

export function StepCombinations() {
  const {
    subjectCombinations, upsertSubjectCombination, removeSubjectCombination,
    sections, subjects,
  } = useTimetableStore() as any

  // Derive unique class names from sections (strip A/B/C suffix)
  const classNames: string[] = Array.from(new Set<string>(
    sections.map((s: any) => {
      const m = String(s.name).match(/^(.+?)\s*[-–]\s*[A-Z]+$/)
      return m ? m[1] : s.name
    })
  ))
  // If no sections exist, fall back to a default set
  const effectiveClasses = classNames.length > 0 ? classNames : ['XI Science', 'XI Commerce', 'XII Science']

  const [activeClass, setActiveClass] = useState<string>(effectiveClasses[0])

  const combosForClass = subjectCombinations.filter((c: SubjectCombination) => c.className === activeClass)

  const addCombo = (preset?: { name: string; subjects: string[] }) => {
    const c: SubjectCombination = {
      id: makeId(),
      className: activeClass,
      name: preset?.name ?? `Combo ${combosForClass.length + 1}`,
      subjects: preset?.subjects ?? [],
      strength: 0,
    }
    upsertSubjectCombination(c)
  }

  const updateCombo = (id: string, patch: Partial<SubjectCombination>) => {
    const c = subjectCombinations.find((x: SubjectCombination) => x.id === id)
    if (!c) return
    upsertSubjectCombination({ ...c, ...patch })
  }

  // Detect stream from class name for preset suggestions
  const guessStream = (name: string): keyof typeof PRESETS | null => {
    const u = name.toUpperCase()
    if (u.includes('SCIENCE') || u.includes('SCI')) return 'Science'
    if (u.includes('COMMERCE') || u.includes('COM')) return 'Commerce'
    if (u.includes('HUMANITIES') || u.includes('HUM') || u.includes('ARTS')) return 'Humanities'
    return null
  }
  const stream = guessStream(activeClass)
  const presets = stream ? PRESETS[stream] : []

  const totalStrength = combosForClass.reduce((sum: number, c: SubjectCombination) => sum + (c.strength || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GitMerge size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Subject Combinations
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            How many students chose each combination per class? <em style={{ color: '#7C6FE0' }}>No student names — just headcount.</em>
          </div>
        </div>
      </div>

      {/* Class tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, borderBottom: '1px solid #E8E4FF', paddingBottom: 12 }}>
        {effectiveClasses.map(cls => {
          const count = subjectCombinations.filter((c: SubjectCombination) => c.className === cls).length
          const total = subjectCombinations
            .filter((c: SubjectCombination) => c.className === cls)
            .reduce((sum: number, c: SubjectCombination) => sum + (c.strength || 0), 0)
          const isActive = cls === activeClass
          return (
            <button key={cls} onClick={() => setActiveClass(cls)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: isActive ? '1.5px solid #7C6FE0' : '1px solid #E8E4FF',
                background: isActive ? '#EDE9FF' : '#fff',
                color: isActive ? '#13111E' : '#4B5275',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              {cls}
              <span style={{ fontSize: 10, color: '#8B87AD', fontWeight: 600 }}>
                {count} combos · {total} students
              </span>
            </button>
          )
        })}
      </div>

      {/* Presets */}
      {presets.length > 0 && combosForClass.length === 0 && (
        <div style={{ ...card, background: '#F5F2FF', borderColor: '#D8D2FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkles size={14} color="#7C6FE0" />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#13111E' }}>
              Common {stream} combinations
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#4B5275', marginBottom: 12 }}>
            Quick-add typical {stream} combinations. You can edit names, subjects, and strengths after.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {presets.map(p => (
              <button key={p.name} onClick={() => addCombo(p)} style={btnGhost}>
                <Plus size={11} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Combinations table */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#13111E' }}>
              Combinations for <span style={{ color: '#7C6FE0' }}>{activeClass}</span>
            </div>
            <div style={{ fontSize: 11, color: '#8B87AD', marginTop: 2 }}>
              {combosForClass.length} combination{combosForClass.length !== 1 ? 's' : ''} · <strong style={{ color: '#13111E' }}>{totalStrength}</strong> total students
            </div>
          </div>
          <button onClick={() => addCombo()} style={btnPri}>
            <Plus size={14} /> Add combination
          </button>
        </div>

        {combosForClass.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8B87AD', fontSize: 12, background: '#FAFAFE', borderRadius: 8, border: '1px dashed #D8D2FF' }}>
            <Users2 size={28} color="#D8D2FF" style={{ margin: '0 auto 8px', display: 'block' }} />
            No combinations yet for {activeClass}. Use a preset above or add one manually.
          </div>
        ) : (
          <div style={{ border: '1px solid #E8E4FF', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 100px 36px', gap: 1, background: '#E8E4FF', padding: 1 }}>
              <div style={{ background: '#F5F2FF', padding: '8px 12px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</div>
              <div style={{ background: '#F5F2FF', padding: '8px 12px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subjects</div>
              <div style={{ background: '#F5F2FF', padding: '8px 12px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strength</div>
              <div style={{ background: '#F5F2FF' }} />
            </div>
            {/* Data rows */}
            {combosForClass.map((c: SubjectCombination) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 100px 36px', gap: 1, background: '#E8E4FF', padding: 1 }}>
                <div style={{ background: '#fff' }}>
                  <input value={c.name} onChange={e => updateCombo(c.id, { name: e.target.value })}
                    placeholder="e.g. PCM + CS"
                    style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0, fontWeight: 700 }} />
                </div>
                <div style={{ background: '#fff' }}>
                  <input value={c.subjects.join(', ')}
                    onChange={e => updateCombo(c.id, { subjects: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="Physics, Chemistry, Mathematics"
                    list={`combo-subjects-${c.id}`}
                    style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0, fontSize: 11.5 }} />
                  <datalist id={`combo-subjects-${c.id}`}>
                    {subjects.map((s: any) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
                <div style={{ background: '#fff' }}>
                  <input type="number" min={0} value={c.strength}
                    onChange={e => updateCombo(c.id, { strength: parseInt(e.target.value) || 0 })}
                    style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0, fontFamily: "'DM Mono', monospace", fontWeight: 700, textAlign: 'right' as const, paddingRight: 14 }} />
                </div>
                <div style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button onClick={() => removeSubjectCombination(c.id)} title="Remove combination"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacy callout */}
      <div style={{ marginTop: 18, padding: '14px 16px', background: 'linear-gradient(135deg, #F5F2FF 0%, #FAFAFE 100%)', border: '1px solid #E8E4FF', borderRadius: 10, fontSize: 11.5, color: '#4B5275', lineHeight: 1.7 }}>
        <strong style={{ color: '#7C6FE0' }}>🔒 Privacy by design:</strong> schedU never stores student names, roll numbers, or personal info to generate timetables. We use combination-wise strength only — enough for the engine to size sessions, pool sections, and balance teacher load. No data protection burden, no compliance risk.
      </div>
    </div>
  )
}
