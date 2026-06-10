import { useState, useEffect } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { COUNTRIES, ORG_CONFIGS } from "@/lib/orgData"

interface OrgStandard {
  maxPeriodsWeek: number
  maxPeriodsDay: number
  hoursPerWeek: number
  lunchMinutes: number
  breakMinutes: number
  notes: string
}

function getDefaultStandard(countryCode: string, orgType: string): OrgStandard {
  const c = COUNTRIES.find(x => x.code === countryCode)
  const defaults: Record<string, Partial<OrgStandard>> = {
    school:    { lunchMinutes: 30, breakMinutes: 10, notes: "NCTE / Ministry of Education guidelines" },
    college:   { lunchMinutes: 45, breakMinutes: 15, notes: "UGC guidelines" },
    corporate: { lunchMinutes: 60, breakMinutes: 15, notes: "Labour Act / Factory Act" },
    hospital:  { lunchMinutes: 30, breakMinutes: 20, notes: "Healthcare Staffing Standards" },
    ngo:       { lunchMinutes: 45, breakMinutes: 15, notes: "Internal HR policy" },
    factory:   { lunchMinutes: 30, breakMinutes: 15, notes: "Factory Act / Labour Law" },
  }
  return {
    maxPeriodsWeek: c?.maxPeriodsWeek ?? 36,
    maxPeriodsDay:  c?.maxPeriodsDay  ?? 6,
    hoursPerWeek:   40,
    lunchMinutes:   defaults[orgType]?.lunchMinutes ?? 30,
    breakMinutes:   defaults[orgType]?.breakMinutes ?? 10,
    notes:          defaults[orgType]?.notes ?? "Organization standard",
  }
}

export function Step2Country() {
  const { config, setConfig, setStep } = useTimetableStore()
  const [custom, setCustom] = useState("")
  const [editingStd, setEditingStd] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [standard, setStandard] = useState<OrgStandard | null>(null)

  const selected = COUNTRIES.find(c => c.code === config.countryCode)
  const org = ORG_CONFIGS[config.orgType ?? "school"]

  // Auto-load standard when country or org changes
  useEffect(() => {
    if (config.countryCode && config.orgType) {
      const saved = localStorage.getItem(`std_${config.orgType}_${config.countryCode}`)
      if (saved) {
        setStandard(JSON.parse(saved))
      } else {
        setStandard(getDefaultStandard(config.countryCode, config.orgType))
      }
    }
  }, [config.countryCode, config.orgType])

  const saveStandard = () => {
    if (!standard || !config.countryCode || !config.orgType) return
    localStorage.setItem(`std_${config.orgType}_${config.countryCode}`, JSON.stringify(standard))
    setEditingStd(false)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2500)
  }

  const resetStandard = () => {
    if (!config.countryCode || !config.orgType) return
    localStorage.removeItem(`std_${config.orgType}_${config.countryCode}`)
    setStandard(getDefaultStandard(config.countryCode, config.orgType))
    setEditingStd(false)
  }

  const fieldRow = (label: string, key: keyof OrgStandard, unit: string, type = "number") => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 40px', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid #f0ede7' }}>
      <span style={{ fontSize:12, color:'#1c1b18' }}>{label}</span>
      {editingStd ? (
        <input
          type={type} value={String(standard?.[key] ?? "")}
          onChange={e => setStandard(prev => prev ? { ...prev, [key]: type==="number" ? +e.target.value : e.target.value } : prev)}
          style={{ padding:'4px 8px', border:'1.5px solid #7C6FE0', borderRadius:6, fontSize:12, fontFamily: type==="number"?"'DM Mono',monospace":'inherit', textAlign: type==="number"?"right":'left', outline:'none', width:'100%' }}
        />
      ) : (
        <span style={{ fontSize:12, fontFamily: type==="number"?"'DM Mono',monospace":'inherit', fontWeight:600, textAlign:'right' }}>
          {String(standard?.[key] ?? "—")}
        </span>
      )}
      <span style={{ fontSize:11, color:'#a8a59e' }}>{unit}</span>
    </div>
  )

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:8 }}>
        Select your country
      </h1>
      <p style={{ color:'#6a6860', fontSize:13, marginBottom:20, lineHeight:1.65 }}>
        We auto-load national labour laws, workload norms and regulatory standards based on your country and organization type.
      </p>

      {/* Country grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        {COUNTRIES.map(c => {
          const sel = config.countryCode === c.code
          return (
            <button key={c.code} onClick={() => setConfig({ countryCode: c.code })}
              style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'12px 14px', borderRadius:10, textAlign:'left',
                border: sel ? '2px solid #7C6FE0' : '1.5px solid #e8e5de',
                background: sel ? '#eaecf8' : '#fff',
                cursor:'pointer', transition:'all 0.15s',
              }}
              onMouseEnter={e => { if(!sel){ (e.currentTarget as HTMLElement).style.borderColor='#9B8EF5'; (e.currentTarget as HTMLElement).style.background='#f0fdf4'; }}}
              onMouseLeave={e => { if(!sel){ (e.currentTarget as HTMLElement).style.borderColor='#e8e5de'; (e.currentTarget as HTMLElement).style.background='#fff'; }}}
            >
              <span style={{ fontSize:24 }}>{c.flag}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color: sel?'#3730a3':'#1c1b18' }}>{c.name}</div>
                <div style={{ fontSize:11, color:'#6a6860', marginTop:2 }}>{c.subtitle}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Custom country */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <input value={custom} onChange={e=>setCustom(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&custom.trim()) setConfig({countryCode:'CUSTOM'}) }}
          placeholder="Other country — type and press Enter"
          style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1.5px solid #e8e5de', fontSize:13, outline:'none' }}
        />
        <button onClick={() => custom.trim() && setConfig({countryCode:'CUSTOM'})}
          style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e8e5de', background:'#fff', fontSize:13, cursor:'pointer', fontWeight:500 }}>
          Use
        </button>
      </div>

      {/* Standards panel — shown when country selected */}
      {selected && standard && (
        <div style={{ border:'1.5px solid #e8e5de', borderRadius:12, overflow:'hidden', marginBottom:20 }}>
          {/* Header */}
          <div style={{ padding:'10px 14px', background: editingStd ? '#eaecf8' : '#f0fdf4', borderBottom:'1px solid #e8e5de', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>{selected.flag}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color: editingStd ? '#3730a3' : '#14532d' }}>
                  {editingStd ? `✏️ Editing: ${selected.name} · ${org.name} Standard` : `✅ Standard loaded: ${selected.name} · ${org.name}`}
                </div>
                <div style={{ fontSize:11, color:'#6a6860', marginTop:1 }}>{standard.notes}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {!editingStd && (
                <button onClick={() => setEditingStd(true)}
                  style={{ padding:'5px 12px', borderRadius:6, border:'1.5px solid #d4d1c8', background:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', color:'#7C6FE0' }}>
                  ✏️ Customize
                </button>
              )}
              {editingStd && (
                <>
                  <button onClick={saveStandard}
                    style={{ padding:'5px 12px', borderRadius:6, border:'none', background:'#7C6FE0', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    💾 Save as My Standard
                  </button>
                  <button onClick={() => setEditingStd(false)}
                    style={{ padding:'5px 12px', borderRadius:6, border:'1.5px solid #e8e5de', background:'#fff', fontSize:11, cursor:'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={resetStandard}
                    style={{ padding:'5px 12px', borderRadius:6, border:'1.5px solid #fca5a5', background:'#fff', fontSize:11, cursor:'pointer', color:'#dc2626' }}>
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Fields */}
          <div style={{ padding:'6px 14px 10px' }}>
            {fieldRow(`Max periods / week (${org.staffsLabel})`, "maxPeriodsWeek", "periods")}
            {fieldRow("Max periods / day", "maxPeriodsDay", "periods")}
            {fieldRow("Working hours / week", "hoursPerWeek", "hrs")}
            {fieldRow("Lunch break duration", "lunchMinutes", "min")}
            {fieldRow("Short break duration", "breakMinutes", "min")}
            {fieldRow("Notes / regulation reference", "notes", "", "text")}
          </div>

          {editingStd && (
            <div style={{ padding:'8px 14px', background:'#eaecf8', fontSize:11, color:'#3730a3', borderTop:'1px solid #D8D2FF' }}>
              💡 Your customized standard is saved locally per browser. Click <strong>"Save as My Standard"</strong> to apply it to all future timetables for <strong>{selected.name} · {org.name}</strong>.
            </div>
          )}
        </div>
      )}

      {/* Saved confirmation */}
      {savedMsg && (
        <div style={{ background:'#f0fdf4', border:'1px solid #D8D2FF', borderRadius:8, padding:'8px 14px', fontSize:12, color:'#14532d', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
          ✅ Standard saved! Will be used for all future {selected?.name} · {org.name} timetables.
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', paddingTop:16, borderTop:'1px solid #e8e5de' }}>
        <button onClick={() => setStep(1)}
          style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #e8e5de', background:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          ← Back
        </button>
        <button onClick={() => config.countryCode && setStep(3)} disabled={!config.countryCode}
          style={{ padding:'9px 18px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor: config.countryCode?'pointer':'not-allowed', background: config.countryCode?'#7C6FE0':'#d4d1c8', color:'#fff' }}>
          Continue →
        </button>
      </div>
    </div>
  )
}
