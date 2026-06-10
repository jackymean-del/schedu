import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import type { Shift } from "@/types"

const ALL_DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"]
const DAY_SHORT: Record<string,string> = { MONDAY:"Mo",TUESDAY:"Tu",WEDNESDAY:"We",THURSDAY:"Th",FRIDAY:"Fr",SATURDAY:"Sa",SUNDAY:"Su" }

const TIME_SLOTS = [
  "06:00","06:30","07:00","07:30","08:00","08:30",
  "09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30",
  "15:00","15:30","16:00","16:30","17:00","17:30",
  "18:00","18:30","19:00","19:30","20:00",
]

function toDisplay(time: string, fmt: '12h'|'24h'): string {
  const [h, m] = time.split(':').map(Number)
  if (fmt === '24h') return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h%12||12}:${m.toString().padStart(2,'0')} ${ampm}`
}

function calcDuration(start: string, end: string): string {
  const [sh,sm] = start.split(':').map(Number)
  const [eh,em] = end.split(':').map(Number)
  const mins = (eh*60+em) - (sh*60+sm)
  if (mins <= 0) return '—'
  const h = Math.floor(mins/60), m = mins%60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const lbl = (text: string) => (
  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'#a8a59e', marginBottom:8 }}>
    {text}
  </div>
)

const SHIFT_COLORS = ['#7C6FE0','#7C6FE0','#D4920E','#dc2626','#9B8EF5','#7C6FE0']

export function Step3Schedule() {
  const { config, setConfig, setStep } = useTimetableStore()
  const [multiShift, setMultiShift] = useState((config.shifts ?? []).length > 0)
  const fmt = config.timeFormat

  const toggleDay = (day: string) => {
    const days = config.workDays.includes(day)
      ? config.workDays.filter(d => d !== day)
      : [...config.workDays, day]
    if (days.length > 0) setConfig({ workDays: days })
  }

  // Single shift mode helpers
  const singleDuration = calcDuration(config.startTime, config.endTime)

  // Multi-shift helpers
  const addShift = () => {
    const newShift: Shift = {
      id: crypto.randomUUID(),
      name: `Shift ${config.shifts.length + 1}`,
      startTime: '09:00',
      endTime: '13:00',
      assignedClasses: [],
    }
    setConfig({ shifts: [...(config.shifts ?? []), newShift] })
  }

  const updateShift = (id: string, updates: Partial<Shift>) => {
    setConfig({ shifts: (config.shifts ?? []).map(s => s.id === id ? { ...s, ...updates } : s) })
  }

  const removeShift = (id: string) => {
    setConfig({ shifts: (config.shifts ?? []).filter(s => s.id !== id) })
  }

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:8 }}>
        Time format & working schedule
      </h1>
      <p style={{ color:'#6a6860', fontSize:13, marginBottom:24, lineHeight:1.65 }}>
        Configure working days, time format, and class timings. Use multiple shifts if different classes have different start/end times.
      </p>

      {/* Time format */}
      <div style={{ marginBottom:24 }}>
        {lbl("Time Format")}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:380 }}>
          {(['12h','24h'] as const).map(f => (
            <button key={f} onClick={() => setConfig({ timeFormat: f })}
              style={{ padding:'16px', borderRadius:10, cursor:'pointer', textAlign:'center', border: fmt===f?'2px solid #7C6FE0':'1.5px solid #e8e5de', background: fmt===f?'#eaecf8':'#fff', transition:'all 0.15s' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, color: fmt===f?'#7C6FE0':'#1c1b18' }}>
                {f === '12h' ? '10:00 AM' : '14:00'}
              </div>
              <div style={{ fontSize:11, color:'#6a6860', marginTop:4 }}>
                {f === '12h' ? 'AM/PM (12-hour)' : 'Military (24-hour)'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Working days */}
      <div style={{ marginBottom:24 }}>
        {lbl("Working Days")}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
          {ALL_DAYS.map(day => {
            const on = config.workDays.includes(day)
            return (
              <button key={day} onClick={() => toggleDay(day)}
                style={{ width:40, height:40, borderRadius:'50%', cursor:'pointer', transition:'all 0.15s', border: on?'none':'1.5px solid #d4d1c8', background: on?'#7C6FE0':'#fff', color: on?'#fff':'#6a6860', fontSize:12, fontWeight:700 }}>
                {DAY_SHORT[day]}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize:11, color:'#a8a59e', marginTop:6 }}>{config.workDays.length} working days selected</div>
      </div>

      {/* Single vs Multi shift toggle */}
      <div style={{ marginBottom:20 }}>
        {lbl("Class Timing Mode")}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxWidth:500 }}>
          <button onClick={() => { setMultiShift(false); setConfig({ shifts: [] }) }}
            style={{ padding:'14px', borderRadius:10, border: !multiShift?'2px solid #7C6FE0':'1.5px solid #e8e5de', background: !multiShift?'#eaecf8':'#fff', cursor:'pointer', textAlign:'left' as const }}>
            <div style={{ fontSize:13, fontWeight:600, color: !multiShift?'#7C6FE0':'#1c1b18', marginBottom:4 }}>🕐 Single Timing</div>
            <div style={{ fontSize:11, color:'#6a6860' }}>All classes have the same start & end time</div>
          </button>
          <button onClick={() => { setMultiShift(true); if ((config.shifts ?? []).length === 0) addShift() }}
            style={{ padding:'14px', borderRadius:10, border: multiShift?'2px solid #7C6FE0':'1.5px solid #e8e5de', background: multiShift?'#f0fdf4':'#fff', cursor:'pointer', textAlign:'left' as const }}>
            <div style={{ fontSize:13, fontWeight:600, color: multiShift?'#7C6FE0':'#1c1b18', marginBottom:4 }}>🕐🕑 Multiple Shifts</div>
            <div style={{ fontSize:11, color:'#6a6860' }}>Different classes have different start/end times</div>
          </button>
        </div>
      </div>

      {/* Single shift */}
      {!multiShift && (
        <div style={{ border:'1.5px solid #e8e5de', borderRadius:12, padding:'16px', marginBottom:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:420, marginBottom:12 }}>
            <div>
              {lbl("Start Time")}
              <select value={config.startTime} onChange={e => setConfig({ startTime: e.target.value })}
                style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e8e5de', fontSize:13, background:'#fff', outline:'none', cursor:'pointer' }}>
                {TIME_SLOTS.filter(t => t < config.endTime).map(t => (
                  <option key={t} value={t}>{toDisplay(t, fmt)}</option>
                ))}
              </select>
            </div>
            <div>
              {lbl("End Time")}
              <select value={config.endTime} onChange={e => setConfig({ endTime: e.target.value })}
                style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e8e5de', fontSize:13, background:'#fff', outline:'none', cursor:'pointer' }}>
                {TIME_SLOTS.filter(t => t > config.startTime).map(t => (
                  <option key={t} value={t}>{toDisplay(t, fmt)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ background:'#f7f6f2', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#374151' }}>
            🕐 All classes: <strong>{toDisplay(config.startTime, fmt)}</strong> → <strong>{toDisplay(config.endTime, fmt)}</strong>
            &nbsp;·&nbsp; <strong>{singleDuration}</strong>/day &nbsp;·&nbsp; {config.workDays.length} days/week
          </div>
        </div>
      )}

      {/* Multiple shifts */}
      {multiShift && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:'#6a6860', marginBottom:12, lineHeight:1.6 }}>
            💡 Create named shifts and assign class groups to each shift in <strong>Step 5</strong> (Review & Edit Data).
          </div>
          <div style={{ display:'flex', flexDirection:'column' as const, gap:10 }}>
            {(config.shifts ?? []).map((shift, si) => (
              <div key={shift.id} style={{ border:`2px solid ${SHIFT_COLORS[si % SHIFT_COLORS.length]}22`, borderRadius:12, overflow:'hidden' }}>
                {/* Shift header */}
                <div style={{ background:`${SHIFT_COLORS[si % SHIFT_COLORS.length]}11`, borderBottom:`1px solid ${SHIFT_COLORS[si % SHIFT_COLORS.length]}22`, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:SHIFT_COLORS[si % SHIFT_COLORS.length], flexShrink:0 }} />
                  <input value={shift.name}
                    onChange={e => updateShift(shift.id, { name: e.target.value })}
                    style={{ flex:1, fontSize:13, fontWeight:600, background:'transparent', border:'none', outline:'none', color:'#1c1b18' }}
                    placeholder="Shift name (e.g. Morning Shift)"
                  />
                  <span style={{ fontSize:11, color:'#6a6860', fontFamily:'monospace' }}>
                    {calcDuration(shift.startTime, shift.endTime)}/day
                  </span>
                  {config.shifts.length > 1 && (
                    <button onClick={() => removeShift(shift.id)}
                      style={{ width:22, height:22, borderRadius:4, border:'none', background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      ×
                    </button>
                  )}
                </div>
                {/* Times */}
                <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:420 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase' as const, color:'#a8a59e', marginBottom:5 }}>Start Time</div>
                    <select value={shift.startTime} onChange={e => updateShift(shift.id, { startTime: e.target.value })}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #e8e5de', fontSize:12, background:'#fff', outline:'none', cursor:'pointer' }}>
                      {TIME_SLOTS.filter(t => t < shift.endTime).map(t => (
                        <option key={t} value={t}>{toDisplay(t, fmt)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase' as const, color:'#a8a59e', marginBottom:5 }}>End Time</div>
                    <select value={shift.endTime} onChange={e => updateShift(shift.id, { endTime: e.target.value })}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #e8e5de', fontSize:12, background:'#fff', outline:'none', cursor:'pointer' }}>
                      {TIME_SLOTS.filter(t => t > shift.startTime).map(t => (
                        <option key={t} value={t}>{toDisplay(t, fmt)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Summary */}
                <div style={{ padding:'0 14px 12px', fontSize:11, color:'#6a6860' }}>
                  🕐 <strong>{toDisplay(shift.startTime, fmt)}</strong> → <strong>{toDisplay(shift.endTime, fmt)}</strong>
                  &nbsp;·&nbsp; Classes assigned here in Step 5
                </div>
              </div>
            ))}
          </div>
          <button onClick={addShift}
            style={{ marginTop:10, width:'100%', padding:'10px', borderRadius:10, border:'1.5px dashed #d4d1c8', background:'transparent', fontSize:12, color:'#6a6860', cursor:'pointer', fontWeight:500 }}>
            ＋ Add Another Shift
          </button>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', paddingTop:16, borderTop:'1px solid #e8e5de' }}>
        <button onClick={() => setStep(2)} style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #e8e5de', background:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>← Back</button>
        <button onClick={() => setStep(4)} style={{ padding:'9px 18px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', background:'#7C6FE0', color:'#fff' }}>
          Save & Continue →
        </button>
      </div>
    </div>
  )
}
