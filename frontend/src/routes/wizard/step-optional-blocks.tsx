/**
 * Step — Optional Blocks
 *
 * schedU's signature feature: define groups of subjects that run
 * SIMULTANEOUSLY in the same period across one or more sections.
 *
 * Example: OPTIONAL_BLOCK_1 = [PE, Art, Painting] on Tue Period 3.
 *          Students self-select; system tracks combination-wise strength.
 */

import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { Plus, Trash2, Layers, Calendar, Users, MapPin } from "lucide-react"
import type { OptionalBlock, OptionalOption } from "@/types"

const DAY_OPTIONS = [
  { key: 'MONDAY',    label: 'Mon' },
  { key: 'TUESDAY',   label: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wed' },
  { key: 'THURSDAY',  label: 'Thu' },
  { key: 'FRIDAY',    label: 'Fri' },
  { key: 'SATURDAY',  label: 'Sat' },
]

function makeId() { return Math.random().toString(36).slice(2, 9) }

// ─── Style tokens ─────────────────────────────────────────────
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

export function StepOptionalBlocks() {
  const {
    optionalBlocks, upsertOptionalBlock, removeOptionalBlock,
    sections, staff, rooms, periods, subjects,
  } = useTimetableStore() as any

  const [expandedId, setExpandedId] = useState<string | null>(
    optionalBlocks[0]?.id ?? null
  )

  const classPeriods = periods.filter((p: any) => p.type === 'class' || !p.type)

  const addBlock = () => {
    const b: OptionalBlock = {
      id: makeId(),
      name: `Optional Block ${optionalBlocks.length + 1}`,
      sectionNames: [],
      day: 'TUESDAY',
      periodId: classPeriods[0]?.id ?? '',
      options: [
        { subject: 'PE',       teacher: '', room: 'Ground',    capacity: 50 },
        { subject: 'Art',      teacher: '', room: 'Art Room',  capacity: 30 },
        { subject: 'Painting', teacher: '', room: 'Room 304',  capacity: 20 },
      ],
    }
    upsertOptionalBlock(b)
    setExpandedId(b.id)
  }

  const updateBlock = (id: string, patch: Partial<OptionalBlock>) => {
    const b = optionalBlocks.find((x: OptionalBlock) => x.id === id)
    if (!b) return
    upsertOptionalBlock({ ...b, ...patch })
  }

  const updateOption = (blockId: string, idx: number, patch: Partial<OptionalOption>) => {
    const b = optionalBlocks.find((x: OptionalBlock) => x.id === blockId)
    if (!b) return
    const options = b.options.map((o: OptionalOption, i: number) => i === idx ? { ...o, ...patch } : o)
    upsertOptionalBlock({ ...b, options })
  }

  const addOption = (blockId: string) => {
    const b = optionalBlocks.find((x: OptionalBlock) => x.id === blockId)
    if (!b) return
    upsertOptionalBlock({
      ...b,
      options: [...b.options, { subject: '', teacher: '', room: '', capacity: 30 }],
    })
  }

  const removeOption = (blockId: string, idx: number) => {
    const b = optionalBlocks.find((x: OptionalBlock) => x.id === blockId)
    if (!b) return
    upsertOptionalBlock({ ...b, options: b.options.filter((_: any, i: number) => i !== idx) })
  }

  const toggleSection = (blockId: string, name: string) => {
    const b = optionalBlocks.find((x: OptionalBlock) => x.id === blockId)
    if (!b) return
    const has = b.sectionNames.includes(name)
    upsertOptionalBlock({
      ...b,
      sectionNames: has ? b.sectionNames.filter((s: string) => s !== name) : [...b.sectionNames, name],
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={20} color="#7C6FE0" />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: '#13111E', margin: 0, lineHeight: 1.1 }}>
            Optional Blocks
          </h2>
          <div style={{ fontSize: 12, color: '#4B5275', marginTop: 3 }}>
            Define groups of subjects that run <em style={{ color: '#7C6FE0' }}>simultaneously</em> in the same period. Students self-select their option.
          </div>
        </div>
        <button onClick={addBlock} style={btnPri}>
          <Plus size={14} /> Add Block
        </button>
      </div>

      {/* Empty state */}
      {optionalBlocks.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', borderStyle: 'dashed', background: '#FAFAFE' }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>◇</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 4 }}>No optional blocks yet</div>
          <div style={{ fontSize: 12, color: '#8B87AD', marginBottom: 16, maxWidth: 380, margin: '0 auto 16px' }}>
            Optional blocks let one period host multiple parallel subjects.<br/>
            E.g. <strong style={{ color: '#7C6FE0' }}>PE / Art / Painting</strong> all on Tue Period 3.
          </div>
          <button onClick={addBlock} style={btnPri}>
            <Plus size={14} /> Create your first block
          </button>
        </div>
      )}

      {/* Blocks */}
      {optionalBlocks.map((b: OptionalBlock) => {
        const isExpanded = expandedId === b.id
        const period = classPeriods.find((p: any) => p.id === b.periodId)
        const totalCap = b.options.reduce((sum, o) => sum + (o.capacity ?? 0), 0)
        return (
          <div key={b.id} style={card}>
            {/* Block header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isExpanded ? 16 : 0 }}>
              <button onClick={() => setExpandedId(isExpanded ? null : b.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7C6FE0', fontSize: 14, padding: 4 }}>
                {isExpanded ? '▾' : '▸'}
              </button>
              <input value={b.name}
                onChange={e => updateBlock(b.id, { name: e.target.value })}
                style={{ ...inp, fontWeight: 700, fontSize: 13, flex: 1, color: '#13111E', background: '#fff' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8B87AD', whiteSpace: 'nowrap' }}>
                <Calendar size={12} /> {DAY_OPTIONS.find(d => d.key === b.day)?.label ?? '—'} · {period?.name ?? '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8B87AD', whiteSpace: 'nowrap' }}>
                <Users size={12} /> {b.options.length} options · cap {totalCap}
              </div>
              <button onClick={() => { removeOptionalBlock(b.id); if (expandedId === b.id) setExpandedId(null) }}
                title="Delete block"
                style={{ ...btnGhost, color: '#DC2626', borderColor: '#FEE2E2' }}>
                <Trash2 size={12} />
              </button>
            </div>

            {/* Expanded editor */}
            {isExpanded && (
              <>
                {/* Day + Period */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={lbl}>Day</div>
                    <select value={b.day} onChange={e => updateBlock(b.id, { day: e.target.value })} style={inp}>
                      {DAY_OPTIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={lbl}>Period</div>
                    <select value={b.periodId} onChange={e => updateBlock(b.id, { periodId: e.target.value })} style={inp}>
                      <option value="">— Select —</option>
                      {classPeriods.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Sections sharing this block */}
                <div style={{ marginBottom: 14 }}>
                  <div style={lbl}>Sections sharing this block <span style={{ color: '#B8B4D4', textTransform: 'none', letterSpacing: 0 }}>(cross-section pooling)</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sections.map((s: any) => {
                      const on = b.sectionNames.includes(s.name)
                      return (
                        <button key={s.id} onClick={() => toggleSection(b.id, s.name)}
                          style={{
                            padding: '5px 11px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                            border: on ? '1.5px solid #7C6FE0' : '1px solid #E8E4FF',
                            background: on ? '#EDE9FF' : '#FFFFFF',
                            color: on ? '#13111E' : '#8B87AD', cursor: 'pointer',
                          }}>
                          {on && '✓ '}{s.name}
                        </button>
                      )
                    })}
                    {sections.length === 0 && <span style={{ fontSize: 11, color: '#B8B4D4' }}>No sections yet. Add some in the Resources step.</span>}
                  </div>
                </div>

                {/* Options list */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...lbl, marginBottom: 6 }}>Parallel options <span style={{ color: '#B8B4D4', textTransform: 'none', letterSpacing: 0 }}>(subject + teacher + room + capacity)</span></div>
                  <div style={{ border: '1px solid #E8E4FF', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.2fr 80px 36px', gap: 1, background: '#E8E4FF', padding: 1 }}>
                      <div style={{ background: '#F5F2FF', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject</div>
                      <div style={{ background: '#F5F2FF', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teacher</div>
                      <div style={{ background: '#F5F2FF', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Room</div>
                      <div style={{ background: '#F5F2FF', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#8B87AD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cap</div>
                      <div style={{ background: '#F5F2FF' }} />
                    </div>
                    {b.options.map((opt, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.2fr 80px 36px', gap: 1, background: '#E8E4FF', padding: 1, borderTop: i === 0 ? 'none' : undefined }}>
                        <div style={{ background: '#fff' }}>
                          <input list={`subjects-${b.id}`} value={opt.subject}
                            onChange={e => updateOption(b.id, i, { subject: e.target.value })}
                            placeholder="e.g. PE"
                            style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0 }} />
                          <datalist id={`subjects-${b.id}`}>
                            {subjects.map((s: any) => <option key={s.id} value={s.name} />)}
                          </datalist>
                        </div>
                        <div style={{ background: '#fff' }}>
                          <input list={`teachers-${b.id}`} value={opt.teacher}
                            onChange={e => updateOption(b.id, i, { teacher: e.target.value })}
                            placeholder="Assign teacher"
                            style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0 }} />
                          <datalist id={`teachers-${b.id}`}>
                            {staff.map((t: any) => <option key={t.id} value={t.name} />)}
                          </datalist>
                        </div>
                        <div style={{ background: '#fff' }}>
                          <input list={`rooms-${b.id}`} value={opt.room}
                            onChange={e => updateOption(b.id, i, { room: e.target.value })}
                            placeholder="e.g. Ground"
                            style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0 }} />
                          <datalist id={`rooms-${b.id}`}>
                            {rooms.map((r: any) => <option key={r.id} value={r.name} />)}
                          </datalist>
                        </div>
                        <div style={{ background: '#fff' }}>
                          <input type="number" min={0} value={opt.capacity ?? ''}
                            onChange={e => updateOption(b.id, i, { capacity: e.target.value ? parseInt(e.target.value) : undefined })}
                            placeholder="—"
                            style={{ ...inp, border: 'none', background: 'transparent', borderRadius: 0, fontFamily: "'DM Mono', monospace" }} />
                        </div>
                        <div style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button onClick={() => removeOption(b.id, i)} title="Remove option"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addOption(b.id)} style={{ ...btnGhost, marginTop: 8 }}>
                    <Plus size={12} /> Add option
                  </button>
                </div>

                {/* Summary */}
                <div style={{ background: '#FAFAFE', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#4B5275' }}>
                  <span><MapPin size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />{b.sectionNames.length} section{b.sectionNames.length !== 1 ? 's' : ''} pooling</span>
                  <span style={{ color: '#D8D2FF' }}>·</span>
                  <span>{b.options.length} parallel subject{b.options.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: '#D8D2FF' }}>·</span>
                  <span>Total capacity: <strong style={{ color: '#13111E' }}>{totalCap}</strong> students</span>
                </div>
              </>
            )}
          </div>
        )
      })}

      {/* Help footer */}
      <div style={{ marginTop: 18, padding: '14px 16px', background: '#F5F2FF', border: '1px solid #E8E4FF', borderRadius: 10, fontSize: 11.5, color: '#4B5275', lineHeight: 1.7 }}>
        <strong style={{ color: '#7C6FE0' }}>How it works:</strong> When an Optional Block is placed on (Tue, Period 3) for sections XI-A and XI-B, all students from both sections attend that period — each going to the room of their chosen option (PE → Ground, Art → Art Room, etc.). The system uses combination strengths (not individual rosters) to size sessions and avoid capacity conflicts.
      </div>
    </div>
  )
}
