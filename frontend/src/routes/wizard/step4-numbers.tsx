import { useTimetableStore } from "@/store/timetableStore"
import { getCountry, ORG_CONFIGS, generateSections, generateStaff, generateSubjects, generateBreaks } from "@/lib/orgData"
import type { Subject } from "@/types"

// Org-specific labels for periods/slots
const SLOT_LABELS: Record<string, { periodLabel: string; periodSub: string; breakLabel: string; breakSub: string }> = {
  school:    { periodLabel:"Periods/day",       periodSub:"Class periods, excl. breaks",    breakLabel:"Breaks/day",     breakSub:"Incl. Assembly & Dispersal" },
  college:   { periodLabel:"Lectures/day",      periodSub:"Lectures/tutorials per day",     breakLabel:"Breaks/day",     breakSub:"Incl. lunch & short breaks" },
  corporate: { periodLabel:"Meetings/day",      periodSub:"Slots/sessions per day",         breakLabel:"Breaks/day",     breakSub:"Incl. standup & lunch" },
  hospital:  { periodLabel:"Duties/shift",      periodSub:"Duty slots per shift",           breakLabel:"Breaks/shift",   breakSub:"Incl. meal & rest breaks" },
  ngo:       { periodLabel:"Sessions/day",      periodSub:"Activity sessions per day",      breakLabel:"Breaks/day",     breakSub:"Incl. meal break" },
  factory:   { periodLabel:"Work slots/shift",  periodSub:"Production slots per shift",     breakLabel:"Breaks/shift",   breakSub:"Incl. safety & meal breaks" },
}

export function Step4Numbers() {
  const store = useTimetableStore()
  const { config, setConfig, setStep } = store

  // Always regenerate fresh data from current config numbers
  const handleGenerate = () => {
    const orgType = config.orgType ?? "school"
    const cc      = config.countryCode ?? "IN"
    store.setSections(generateSections(orgType, cc, config.numSections))
    store.setStaff(generateStaff(orgType, cc, config.numStaff))
    store.setSubjects(generateSubjects(orgType, cc, config.numSubjects) as Subject[])
    store.setBreaks(generateBreaks(orgType, config.numBreaks))
    setStep(5)
  }
  const country = getCountry(config.countryCode ?? "IN")
  const org     = ORG_CONFIGS[config.orgType ?? "school"]
  const slots   = SLOT_LABELS[config.orgType ?? "school"] ?? SLOT_LABELS.school

  const totalSlots = config.numSections * config.periodsPerDay * config.workDays.length
  const capacity   = config.numStaff * country.maxPeriodsWeek
  const pct        = Math.round((totalSlots / capacity) * 100)
  const needed     = Math.ceil(totalSlots / country.maxPeriodsWeek)
  const status     = pct > 110 ? "danger" : pct > 90 ? "warning" : "ok"

  const fields = [
    { label: org.staffsLabel,   sub: `Max ${country.maxPeriodsWeek}/week`,   key: "numStaff" as const },
    { label: org.sectionsLabel, sub: org.sectionLabel,                       key: "numSections" as const },
    { label: org.subjectsLabel, sub: org.subjectLabel,                       key: "numSubjects" as const },
    { label: slots.periodLabel, sub: slots.periodSub,                        key: "periodsPerDay" as const },
    { label: slots.breakLabel,  sub: slots.breakSub,                         key: "numBreaks" as const },
  ]

  return (
    <div>
      <h1 style={{ fontFamily:"'Plus Jakarta Sans',Georgia,serif", fontSize:28, marginBottom:8 }}>
        {org.name} — How many of each?
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:16, lineHeight:1.65 }}>
        Enter numbers only — the engine generates all names, rooms, {org.subjectsLabel.toLowerCase()} and {slots.breakLabel.toLowerCase()} automatically.
      </p>
      {/* Scheduling Mode Selection */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:8 }}>
          Scheduling Mode
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, maxWidth:600, marginBottom:12 }}>
          <button onClick={() => store.setSchedulingMode('period-based')}
            style={{ padding:"14px", borderRadius:10, textAlign:"left" as const, cursor:"pointer", border: store.schedulingMode!=='duration-based'?"2px solid #7C6FE0":"1.5px solid #e8e5de", background: store.schedulingMode!=='duration-based'?"#eaecf8":"#fff" }}>
            <div style={{ fontSize:13, fontWeight:700, color: store.schedulingMode!=='duration-based'?"#3730a3":"#1c1b18", marginBottom:4 }}>📅 Mode 1: Period-Based</div>
            <div style={{ fontSize:11, color:"#6a6860", lineHeight:1.5 }}>Enter periods/week per subject directly. Schedu allocates teachers and prevents clashes.</div>
          </button>
          <button onClick={() => store.setSchedulingMode('duration-based')}
            style={{ padding:"14px", borderRadius:10, textAlign:"left" as const, cursor:"pointer", border: store.schedulingMode==='duration-based'?"2px solid #7C6FE0":"1.5px solid #e8e5de", background: store.schedulingMode==='duration-based'?"#f0fdf4":"#fff" }}>
            <div style={{ fontSize:13, fontWeight:700, color: store.schedulingMode==='duration-based'?"#14532d":"#1c1b18", marginBottom:4 }}>⏱ Mode 2: Duration-Based</div>
            <div style={{ fontSize:11, color:"#6a6860", lineHeight:1.5 }}>Enter total hours needed per subject (e.g. 180 hrs/year). Schedu calculates weekly periods automatically.</div>
          </button>
        </div>
        {store.schedulingMode === 'duration-based' && (
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#f0fdf4", border:"1px solid #D8D2FF", borderRadius:8, fontSize:12, color:"#14532d" }}>
            <span>📆 Working days / year:</span>
            <input type="number" min={100} max={365} defaultValue={store.workingDaysPerYear}
              onBlur={e => store.setWorkingDaysPerYear(Math.max(100, +e.target.value))}
              style={{ width:70, padding:"4px 8px", border:"1.5px solid #D8D2FF", borderRadius:6, fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
            <span style={{ color:"#7C6FE0" }}>
              → {Math.round(store.workingDaysPerYear / config.workDays.length)} working weeks/year
            </span>
            <span style={{ color:"#6b7280", fontSize:11 }}>Used to convert total hours → weekly periods</span>
          </div>
        )}
      </div>

      <div style={{ background:"#eaecf8", borderLeft:"4px solid #7C6FE0", borderRadius:"0 8px 8px 0", padding:"10px 14px", marginBottom:20, fontSize:12, color:"#3730a3", lineHeight:1.6 }}>
        ✨ the engine will generate realistic {org.staffsLabel.toLowerCase()}, {org.sectionsLabel.toLowerCase()}, {org.subjectsLabel.toLowerCase()} and {slots.breakLabel.toLowerCase()} based on <strong>{country.name}</strong> norms. Everything is editable in the next step.
      </div>

      {/* Number inputs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
        {fields.map(f => (
          <div key={f.key} style={{ background:"#fff", border:"1.5px solid #e8e5de", borderRadius:12, padding:"14px 10px", textAlign:"center" as const }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:8, lineHeight:1.3 }}>{f.label}</div>
            <input type="number" min={1} max={500} value={config[f.key]}
              onChange={e => setConfig({ [f.key]: Math.max(1, +e.target.value) } as any)}
              style={{ width:"100%", textAlign:"center" as const, fontSize:28, fontWeight:700, fontFamily:"'DM Mono',monospace", background:"transparent", border:"none", outline:"none", color:"#1c1b18" }}
            />
            <div style={{ fontSize:10, color:"#a8a59e", marginTop:6, lineHeight:1.3 }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
        {[
          { v: config.numStaff,    l: org.staffsLabel },
          { v: config.numSections, l: org.sectionsLabel },
          { v: config.numSubjects, l: org.subjectsLabel },
          { v: pct,                l: "Capacity %", suffix: "%" },
        ].map(({ v, l, suffix }) => (
          <div key={l} style={{ background:"#fff", border:"1.5px solid #e8e5de", borderRadius:10, padding:"12px", textAlign:"center" as const }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"#1c1b18" }}>{v}{suffix ?? ""}</div>
            <div style={{ fontSize:10, color:"#a8a59e", marginTop:4 }}>{l}</div>
          </div>
        ))}
      </div>

      {status === "danger" && (
        <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#991b1b", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
          ⚠️ <div><strong>{org.staffsLabel} overloaded ({pct}%)!</strong> Need at least <strong>{needed}</strong>.
            <button onClick={() => setConfig({ numStaff: needed })} style={{ marginLeft:8, textDecoration:"underline", background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:600 }}>
              Auto-fix → {needed}
            </button>
          </div>
        </div>
      )}
      {status === "warning" && (
        <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400e", marginBottom:12 }}>
          ⚠️ <strong>High workload ({pct}%)</strong> — Some {org.staffsLabel.toLowerCase()} near national max of {country.maxPeriodsWeek}/week.
        </div>
      )}
      {status === "ok" && (
        <div style={{ background:"#f0fdf4", border:"1px solid #D8D2FF", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#14532d", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
          ✅ <strong>Well balanced ({pct}%)</strong> — {org.staffsLabel} count is sufficient.
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(3)} style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={handleGenerate} style={{ padding:"9px 18px", borderRadius:8, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", background:"#7C6FE0", color:"#fff" }}>✨ Generate data & continue →</button>
      </div>
    </div>
  )
}
