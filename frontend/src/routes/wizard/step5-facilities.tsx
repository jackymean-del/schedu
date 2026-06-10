import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import type { Facility } from "@/types"

const FACILITY_TYPES = [
  { type: 'classroom', label: 'Classroom', icon: '🏫', color: '#7C6FE0' },
  { type: 'lab',       label: 'Lab',       icon: '🔬', color: '#7C6FE0' },
  { type: 'hall',      label: 'Hall',      icon: '🏛️', color: '#D4920E' },
  { type: 'gym',       label: 'Gym',       icon: '⚽', color: '#dc2626' },
  { type: 'other',     label: 'Other',     icon: '🏢', color: '#9B8EF5' },
] as const

export function Step5Facilities() {
  const { facilities, setFacilities, setStep, config } = useTimetableStore()
  const T = useTerminology()

  const addFacility = (type: Facility['facilityType']) => {
    const typeConfig = FACILITY_TYPES.find(t => t.type === type)!
    const sameType = facilities.filter(f => f.facilityType === type)
    const n = sameType.length + 1
    const prefix = type === 'classroom' ? 'Room' : typeConfig.label
    const name = `${prefix} ${facilities.length + 1}`
    const newF: Facility = {
      id: crypto.randomUUID(),
      generatedName: name,
      actualName: name,
      facilityType: type,
      capacity: type === 'hall' ? 200 : type === 'gym' ? 100 : 40,
    }
    setFacilities([...facilities, newF])
  }

  const autoGenerate = (count: number) => {
    const generated: Facility[] = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      generatedName: `Room ${i + 1}`,
      actualName: `Room ${i + 1}`,
      facilityType: 'classroom',
      capacity: 40,
    }))
    setFacilities(generated)
  }

  const updateFacility = (id: string, updates: Partial<Facility>) => {
    setFacilities(facilities.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeFacility = (id: string) => setFacilities(facilities.filter(f => f.id !== id))

  const byType = FACILITY_TYPES.map(ft => ({
    ...ft,
    items: facilities.filter(f => f.facilityType === ft.type),
  }))

  const thS: React.CSSProperties = { padding:"7px 10px", background:"#f7f6f2", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", textAlign:"left" as const, borderBottom:"1px solid #e8e5de" }
  const tdS: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid #f0ede7", verticalAlign:"middle" }

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:8 }}>
        {T.facilities} Setup
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:16, lineHeight:1.65 }}>
        Add {T.facilities.toLowerCase()} available for scheduling. Schedu auto-names them ("Room 1", "Lab 1").
        You can rename any {T.facility.toLowerCase()} individually.
      </p>

      {/* Quick generate */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"#eaecf8", borderRadius:10, marginBottom:20, flexWrap:"wrap" as const }}>
        <span style={{ fontSize:12, color:"#3730a3", fontWeight:500 }}>⚡ Quick generate classrooms:</span>
        {[10, 20, 30, 40].map(n => (
          <button key={n} onClick={() => autoGenerate(n)}
            style={{ padding:"5px 14px", borderRadius:6, border:"1px solid #D8D2FF", background:"#fff", color:"#7C6FE0", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {n} Rooms
          </button>
        ))}
        <input type="number" min={1} max={200} placeholder="Custom count"
          onKeyDown={e => { if (e.key === 'Enter') autoGenerate(+(e.target as HTMLInputElement).value) }}
          style={{ width:100, padding:"5px 8px", border:"1px solid #D8D2FF", borderRadius:6, fontSize:12, outline:"none" }} />
      </div>

      {/* Add buttons by type */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", marginBottom:10 }}>
          Add specific {T.facility.toLowerCase()} type:
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
          {FACILITY_TYPES.map(ft => (
            <button key={ft.type} onClick={() => addFacility(ft.type)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, border:`1.5px solid ${ft.color}33`, background:`${ft.color}0a`, color:ft.color, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              <span>{ft.icon}</span> + {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary counts */}
      {facilities.length > 0 && (
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" as const }}>
          {byType.filter(ft => ft.items.length > 0).map(ft => (
            <div key={ft.type} style={{ padding:"6px 12px", borderRadius:6, background:`${ft.color}11`, border:`1px solid ${ft.color}33`, fontSize:12, color:ft.color, fontWeight:600 }}>
              {ft.icon} {ft.items.length} {ft.label}{ft.items.length > 1 ? 's' : ''}
            </div>
          ))}
          <div style={{ padding:"6px 12px", borderRadius:6, background:"#f7f6f2", border:"1px solid #e8e5de", fontSize:12, color:"#374151", fontWeight:600 }}>
            📦 {facilities.length} total
          </div>
        </div>
      )}

      {/* Facilities table */}
      {facilities.length > 0 && (
        <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden", marginBottom:16 }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              <th style={{...thS, width:36}}>#</th>
              <th style={thS}>Name</th>
              <th style={{...thS, width:120}}>Type</th>
              <th style={{...thS, width:80}}>Capacity</th>
              <th style={{...thS, width:32}}></th>
            </tr></thead>
            <tbody>
              {facilities.map((f, i) => {
                const ft = FACILITY_TYPES.find(t => t.type === f.facilityType)!
                return (
                  <tr key={f.id} style={{ background: i%2===0?"#fff":"#fafaf9" }}>
                    <td style={{...tdS, color:"#a8a59e", fontSize:10, fontFamily:"monospace"}}>{i+1}</td>
                    <td style={tdS}>
                      <input value={f.actualName}
                        onChange={e => updateFacility(f.id, { actualName: e.target.value })}
                        style={{ width:"100%", padding:"3px 6px", border:"1px solid transparent", borderRadius:5, fontSize:12, background:"transparent", outline:"none" }}
                      />
                    </td>
                    <td style={tdS}>
                      <select value={f.facilityType}
                        onChange={e => updateFacility(f.id, { facilityType: e.target.value as Facility['facilityType'] })}
                        style={{ fontSize:11, border:"1px solid #e8e5de", borderRadius:6, padding:"3px 6px", background:"#fff", color:ft.color }}>
                        {FACILITY_TYPES.map(t => <option key={t.type} value={t.type}>{t.icon} {t.label}</option>)}
                      </select>
                    </td>
                    <td style={tdS}>
                      <input type="number" min={1} value={f.capacity ?? 40}
                        onChange={e => updateFacility(f.id, { capacity: +e.target.value })}
                        style={{ width:60, padding:"3px 6px", border:"1px solid #e8e5de", borderRadius:5, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }}
                      />
                    </td>
                    <td style={tdS}>
                      <button onClick={() => removeFacility(f.id)}
                        style={{ width:22, height:22, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#c8c5bc", fontSize:16 }}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {facilities.length === 0 && (
        <div style={{ textAlign:"center" as const, padding:"32px", color:"#a8a59e", fontSize:13, border:"1.5px dashed #e8e5de", borderRadius:12, marginBottom:16 }}>
          No {T.facilities.toLowerCase()} added yet.<br/>
          <span style={{ fontSize:11 }}>Click "Quick generate" or add specific types above.</span>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(4)} style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => setStep(6)}
          style={{ padding:"9px 18px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  )
}
