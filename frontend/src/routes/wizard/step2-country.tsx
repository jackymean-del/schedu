import { useState, useEffect, useRef } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { COUNTRIES, ORG_CONFIGS } from "@/lib/orgData"
import { ALL_COUNTRIES } from "@/lib/allCountries"
import { getStandard } from "@/lib/standardsDB"
import type { StandardData } from "@/lib/standardsDB"

function recalculate(std: StandardData, key: keyof StandardData, value: number | string): StandardData {
  const s = { ...std, [key]: value }
  const tb = (n: typeof s) => n.lunchMinutes + n.breakMinutes * (n.numBreaks - 1)
  const hw = (n: typeof s) => Math.round((n.maxPeriodsDay * n.periodDuration + tb(n)) * 5 / 60 * 10) / 10
  if (key === "maxPeriodsDay")   { s.maxPeriodsWeek = (value as number) * 5; s.hoursPerWeek = hw(s) }
  if (key === "maxPeriodsWeek")  { s.maxPeriodsDay = Math.round((value as number) / 5); s.hoursPerWeek = hw(s) }
  if (key === "periodDuration")  { s.hoursPerWeek = hw(s) }
  if (["lunchMinutes","breakMinutes","numBreaks"].includes(key)) { s.hoursPerWeek = hw(s) }
  if (key === "hoursPerWeek")    { s.periodDuration = Math.round(((value as number)*60/5 - tb(s)) / s.maxPeriodsDay) }
  return s
}

export function Step2Country() {
  const { config, setConfig, setStep } = useTimetableStore()
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [editingStd, setEditingStd] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [standard, setStandard] = useState<StandardData | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const selected   = COUNTRIES.find(c => c.code === config.countryCode)
  const selectedW  = ALL_COUNTRIES.find(c => c.code === config.countryCode)
  const org        = ORG_CONFIGS[config.orgType ?? "school"]
  const MAIN_CODES = COUNTRIES.map(c => c.code)

  const filteredCountries = ALL_COUNTRIES
    .filter(c => !MAIN_CODES.includes(c.code))
    .filter(c => search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  // ── KEY FIX: Load fresh standard from DB every time country OR orgType changes ──
  useEffect(() => {
    if (!config.countryCode || !config.orgType) return
    // Clear old stale localStorage
    const v = localStorage.getItem("ss_std_v")
    if (v !== "3") {
      Object.keys(localStorage).filter(k => k.startsWith("std_")).forEach(k => localStorage.removeItem(k))
      localStorage.setItem("ss_std_v", "3")
    }
    // ALWAYS load fresh from DB — never use cached old data for display
    const fresh = getStandard(config.orgType, config.countryCode)
    setStandard(fresh)
    setEditingStd(false)
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
    setStandard(getStandard(config.orgType, config.countryCode))
    // Stay in edit mode so user can see the reset values and continue editing
  }

  const displayName = selected?.name ?? selectedW?.name ?? ""
  const displayFlag = selected?.flag ?? selectedW?.flag ?? "🌍"

  // Number field row
  const NumRow = ({ label, k, unit, ro = false }: { label: string; k: keyof StandardData; unit: string; ro?: boolean }) => {
    const val = standard?.[k] as number
    return (
      <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 48px", alignItems:"center", gap:8, padding:"7px 0", borderBottom:"1px solid #f0ede7" }}>
        <span style={{ fontSize:12, color:"#1c1b18" }}>{label}</span>
        {editingStd && !ro
          ? <input type="number" defaultValue={val} key={val}
              onBlur={e => standard && setStandard(recalculate(standard, k, +e.target.value))}
              style={{ padding:"4px 8px", border:"1.5px solid #7C6FE0", borderRadius:6, fontSize:12, fontFamily:"'DM Mono',monospace", textAlign:"right", outline:"none", width:"100%", background:"#fff" }} />
          : <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
              {ro && editingStd && <span style={{ fontSize:9, background:"#f0fdf4", color:"#7C6FE0", padding:"1px 5px", borderRadius:4, fontWeight:600 }}>AUTO</span>}
              <span style={{ fontSize:13, fontFamily:"'DM Mono',monospace", fontWeight:700, color: ro&&editingStd?"#7C6FE0":"#1c1b18" }}>{val}</span>
            </div>
        }
        <span style={{ fontSize:11, color:"#a8a59e" }}>{unit}</span>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:8 }}>Select your country</h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:20, lineHeight:1.65 }}>
        We auto-load national labour laws, workload norms and regulatory standards based on your country and organization type.
      </p>

      {/* Main country grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        {COUNTRIES.map(c => {
          const sel = config.countryCode === c.code
          return (
            <button key={c.code}
              onClick={() => { setConfig({ countryCode: c.code }); setSearch("") }}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, textAlign:"left", border: sel?"2px solid #7C6FE0":"1.5px solid #e8e5de", background: sel?"#eaecf8":"#fff", cursor:"pointer", transition:"all 0.15s" }}
              onMouseEnter={e => { if(!sel){ (e.currentTarget as HTMLElement).style.borderColor="#9B8EF5"; (e.currentTarget as HTMLElement).style.background="#f0fdf4" }}}
              onMouseLeave={e => { if(!sel){ (e.currentTarget as HTMLElement).style.borderColor="#e8e5de"; (e.currentTarget as HTMLElement).style.background="#fff" }}}
            >
              <span style={{ fontSize:24 }}>{c.flag}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color: sel?"#3730a3":"#1c1b18" }}>{c.name}</div>
                <div style={{ fontSize:11, color:"#6a6860", marginTop:2 }}>{c.subtitle}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Searchable world countries */}
      <div ref={searchRef} style={{ position:"relative", marginBottom:20 }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true) }} onFocus={() => setShowDropdown(true)}
          placeholder="🔍 Search all other countries of the world..."
          style={{ width:"100%", padding:"10px 14px", borderRadius:10, border: showDropdown?"1.5px solid #7C6FE0":"1.5px solid #e8e5de", fontSize:13, outline:"none", boxSizing:"border-box", background:"#fff" }}
        />
        {showDropdown && (
          <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:200, background:"#fff", border:"1.5px solid #7C6FE0", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", marginTop:4, maxHeight:260, overflowY:"auto" }}>
            {filteredCountries.length === 0
              ? <div style={{ padding:"14px", fontSize:12, color:"#a8a59e", textAlign:"center" }}>No countries found for "{search}"</div>
              : filteredCountries.map(c => {
                  const sel = config.countryCode === c.code
                  return (
                    <button key={c.code}
                      onClick={() => { setConfig({ countryCode: c.code }); setSearch(c.name); setShowDropdown(false) }}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", border:"none", background: sel?"#eaecf8":"transparent", cursor:"pointer", textAlign:"left", borderBottom:"1px solid #f0ede7" }}
                      onMouseEnter={e => { if(!sel) (e.currentTarget as HTMLElement).style.background="#f7f6f2" }}
                      onMouseLeave={e => { if(!sel) (e.currentTarget as HTMLElement).style.background="transparent" }}
                    >
                      <span style={{ fontSize:20 }}>{c.flag}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight: sel?700:500, color: sel?"#3730a3":"#1c1b18" }}>{c.name}</div>
                        <div style={{ fontSize:10, color:"#a8a59e" }}>{c.code}</div>
                      </div>
                      {sel && <span style={{ color:"#7C6FE0", fontSize:14, fontWeight:700 }}>✓</span>}
                    </button>
                  )
                })
            }
          </div>
        )}
      </div>

      {/* Standards panel */}
      {config.countryCode && standard && (
        <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden", marginBottom:20 }}>

          {/* Header */}
          <div style={{ padding:"12px 14px", background: editingStd?"#eaecf8":"#f0fdf4", borderBottom:"1px solid #e8e5de", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:10, flex:1 }}>
              <span style={{ fontSize:22, marginTop:2 }}>{displayFlag}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color: editingStd?"#3730a3":"#14532d", marginBottom:3 }}>
                  {editingStd ? `✏️ Editing: ${displayName} · ${org.name}` : `✅ ${displayName} · ${org.name} Standard`}
                </div>
                {/* Notes shown directly in header */}
                <div style={{ fontSize:12, color:"#374151", lineHeight:1.55, maxWidth:440 }}>{standard.notes}</div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:4, fontStyle:"italic" }}>{standard.regulation}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", flexShrink:0 }}>
              {!editingStd
                ? <button onClick={() => setEditingStd(true)} style={{ padding:"5px 12px", borderRadius:6, border:"1.5px solid #d4d1c8", background:"#fff", fontSize:11, fontWeight:600, cursor:"pointer", color:"#7C6FE0" }}>✏️ Customize</button>
                : <>
                    <button onClick={saveStandard} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:"#7C6FE0", color:"#fff", fontSize:11, fontWeight:600, cursor:"pointer" }}>💾 Save</button>
                    <button onClick={() => setEditingStd(false)} style={{ padding:"5px 12px", borderRadius:6, border:"1.5px solid #e8e5de", background:"#fff", fontSize:11, cursor:"pointer" }}>Cancel</button>
                    <button onClick={resetStandard} style={{ padding:"5px 12px", borderRadius:6, border:"1.5px solid #fca5a5", background:"#fff", fontSize:11, cursor:"pointer", color:"#dc2626" }}>Reset</button>
                  </>
              }
            </div>
          </div>

          {/* Edit tip */}
          {editingStd && (
            <div style={{ background:"#fffbeb", borderBottom:"1px solid #fcd34d", padding:"6px 14px", fontSize:11, color:"#92400e" }}>
              💡 Edit any field — related fields update <strong>automatically</strong>. <strong style={{ color:"#7C6FE0" }}>AUTO</strong> fields are calculated.
            </div>
          )}

          {/* Fields */}
          <div style={{ padding:"4px 14px 8px" }}>
            <NumRow label={`Max periods / week (${org.staffsLabel})`} k="maxPeriodsWeek" unit="periods" />
            <NumRow label="Max periods / day"    k="maxPeriodsDay"   unit="periods" />
            <NumRow label="Period duration"      k="periodDuration"  unit="min" />
            <NumRow label="Working hours / week" k="hoursPerWeek"    unit="hrs" ro={true} />
            <NumRow label="Lunch break"          k="lunchMinutes"    unit="min" />
            <NumRow label="Short break"          k="breakMinutes"    unit="min" />
            <NumRow label="Number of breaks"     k="numBreaks"       unit="total" />
          </div>

          {/* Official Reference Links */}
          {standard.links && standard.links.length > 0 && (
            <div style={{ padding:"10px 14px 14px", borderTop:"1px solid #f0ede7" }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#a8a59e", marginBottom:8 }}>
                📎 Official Reference Documents
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {standard.links.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, background:"#f5f3ff", border:"1px solid #D8D2FF", textDecoration:"none", color:"#7C6FE0", fontSize:12, fontWeight:500, transition:"all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#ede9fe"; (e.currentTarget as HTMLElement).style.borderColor="#9B8EF5" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="#f5f3ff"; (e.currentTarget as HTMLElement).style.borderColor="#D8D2FF" }}
                  >
                    <span style={{ fontSize:16, flexShrink:0 }}>🔗</span>
                    <span style={{ flex:1, lineHeight:1.4 }}>{link.label}</span>
                    <span style={{ fontSize:12, color:"#9B8EF5", fontWeight:700, flexShrink:0 }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {editingStd && (
            <div style={{ padding:"8px 14px", background:"#eaecf8", fontSize:11, color:"#3730a3", borderTop:"1px solid #D8D2FF" }}>
              📌 Saved per browser for <strong>{displayName} · {org.name}</strong>. Auto-loads next time.
            </div>
          )}
        </div>
      )}

      {savedMsg && (
        <div style={{ background:"#f0fdf4", border:"1px solid #D8D2FF", borderRadius:8, padding:"8px 14px", fontSize:12, color:"#14532d", marginBottom:12 }}>
          ✅ Saved! Will auto-load for all future {displayName} · {org.name} timetables.
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(1)} style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => config.countryCode && setStep(3)} disabled={!config.countryCode}
          style={{ padding:"9px 18px", borderRadius:8, border:"none", fontSize:13, fontWeight:600, cursor: config.countryCode?"pointer":"not-allowed", background: config.countryCode?"#7C6FE0":"#d4d1c8", color:"#fff" }}>
          Continue →
        </button>
      </div>
    </div>
  )
}
