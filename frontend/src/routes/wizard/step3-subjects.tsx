import { useEffect, useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { generateSubjects } from "@/lib/orgData"
import { durationToWeeklyPeriods } from "@/lib/schedulingEngine"

function getBaseClasses(sections: { name: string; grade?: string }[]): string[] {
  const bases = sections.map(s => {
    const m = s.name.match(/^(.+?)[-\s][A-E]$/i)
    return m ? m[1].trim() : (s.grade || s.name)
  })
  return [...new Set(bases)].filter(Boolean)
}

export function Step3Subjects() {
  const store = useTimetableStore()
  const { config, subjects, sections, setSubjects, setStep } = store
  const T = useTerminology()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const workingWeeks = Math.round((store.workingDaysPerYear ?? 220) / config.workDays.length)
  const baseClasses = getBaseClasses(sections)

  useEffect(() => {
    if (!subjects.length) {
      setSubjects(generateSubjects(config.orgType ?? "school", config.countryCode ?? "IN", config.numSubjects))
    }
  }, [])

  const updateSubject = (i: number, key: string, val: number | string) => {
    const n = [...subjects] as any[]
    n[i] = { ...n[i], [key]: val }
    if (store.schedulingMode === 'duration-based' && key === 'requiredHours' && +val > 0) {
      n[i].periodsPerWeek = durationToWeeklyPeriods({
        subjectName: n[i].name, className: 'all',
        requiredHours: +val,
        periodDurationMins: n[i].sessionDuration ?? 40,
        workingDaysPerYear: store.workingDaysPerYear ?? 220,
        workingDaysPerWeek: config.workDays.length,
      })
    }
    setSubjects(n)
  }

  const getCC = (si: number, cls: string) => {
    const cc = (subjects[si].classConfigs ?? []).find(c => c.sectionName === cls)
    return cc ?? {
      sectionName: cls,
      periodsPerWeek: subjects[si].periodsPerWeek,
      maxPeriodsPerDay: subjects[si].maxPeriodsPerDay ?? 2,
      sessionDuration: subjects[si].sessionDuration ?? 40,
    }
  }

  const updateCC = (si: number, cls: string, key: string, val: number) => {
    const n = [...subjects] as any[]
    const configs = [...(n[si].classConfigs ?? [])]
    const idx = configs.findIndex((c: any) => c.sectionName === cls)
    const base = getCC(si, cls)
    const updated: any = { ...base, [key]: val }
    if (store.schedulingMode === 'duration-based' && key === 'requiredHours' && val > 0) {
      updated.periodsPerWeek = durationToWeeklyPeriods({
        subjectName: n[si].name, className: cls, requiredHours: val,
        periodDurationMins: updated.sessionDuration,
        workingDaysPerYear: store.workingDaysPerYear ?? 220,
        workingDaysPerWeek: config.workDays.length,
      })
    }
    if (idx >= 0) configs[idx] = updated
    else configs.push(updated)
    n[si] = { ...n[si], classConfigs: configs }
    setSubjects(n)
  }

  const thS: React.CSSProperties = { padding:"8px 12px", background:"#f7f6f2", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", textAlign:"left" as const, borderBottom:"1px solid #e8e5de", whiteSpace:"nowrap" as const }
  const tdS: React.CSSProperties = { padding:"8px 12px", borderBottom:"1px solid #f0ede7", verticalAlign:"middle", fontSize:12 }
  const nS: React.CSSProperties = { padding:"4px 6px", border:"1px solid #e8e5de", borderRadius:6, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }
  const ccS: React.CSSProperties = { padding:"3px 6px", border:"1px solid #c4b5fd", borderRadius:5, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }

  // All class groups to show in class-wise table
  const allGroups = baseClasses.length > 0 ? baseClasses
    : ['Pre-Primary','Primary','Upper Primary','Secondary']

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:6 }}>
        {T.resources} Configuration
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:24, lineHeight:1.65 }}>
        Set {T.sessions.toLowerCase()}s per week for each {T.resource.toLowerCase()}.
        Each {T.resource.toLowerCase()} can have <strong>different values per class group</strong> — expand ⚙ to configure.
      </p>

      {/* Mode */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:10 }}>Scheduling Mode</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, maxWidth:560 }}>
          {([
            ['period-based','📅','Mode 1 — Period Based',`Specify ${T.sessions.toLowerCase()}s/week directly.`,'#7C6FE0','#eaecf8','#3730a3'],
            ['duration-based','⏱','Mode 2 — Duration Based',`Specify total hours/year. Auto-calculates ${T.sessions.toLowerCase()}s/week.`,'#7C6FE0','#f0fdf4','#14532d'],
          ] as const).map(([mode,icon,title,desc,bdr,bg,tc]) => {
            const active = store.schedulingMode === mode
            return (
              <button key={mode} onClick={() => store.setSchedulingMode(mode)}
                style={{ padding:"12px", borderRadius:10, textAlign:"left" as const, cursor:"pointer", border: active?`2px solid ${bdr}`:"1.5px solid #e8e5de", background: active?bg:"#fff" }}>
                <div style={{ fontSize:16, marginBottom:4 }}>{icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color: active?tc:"#1c1b18", marginBottom:2 }}>{title}</div>
                <div style={{ fontSize:11, color:"#6a6860" }}>{desc}</div>
              </button>
            )
          })}
        </div>
        {store.schedulingMode === 'duration-based' && (
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"#f0fdf4", border:"1px solid #D8D2FF", borderRadius:8, fontSize:12, color:"#14532d" }}>
            <span>📆 Working days/year:</span>
            <input type="number" min={100} max={365} defaultValue={store.workingDaysPerYear ?? 220}
              onBlur={e => store.setWorkingDaysPerYear(Math.max(100,+e.target.value))}
              style={{ width:70, padding:"4px 8px", border:"1.5px solid #D8D2FF", borderRadius:6, fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
            <span>÷ {config.workDays.length} days/week = <strong>{workingWeeks} weeks/year</strong></span>
          </div>
        )}
      </div>

      {/* Subjects table */}
      <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden", marginBottom:12 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{...thS, width:36}}>#</th>
              <th style={thS}>{T.resource} Name</th>
              {store.schedulingMode === 'period-based' ? <>
                <th style={{...thS, width:100}}>{T.sessions}/week</th>
                <th style={{...thS, width:70}}>/day</th>
                <th style={{...thS, width:90}}>Min/session</th>
                <th style={{...thS, width:80}}>Max/day</th>
              </> : <>
                <th style={{...thS, width:110}}>Req hrs/year</th>
                <th style={{...thS, width:95}}>{T.sessions}/week</th>
                <th style={{...thS, width:90}}>Min/session</th>
              </>}
              <th style={{...thS, width:100, color:"#7C6FE0"}}>⚙ Class-wise</th>
              <th style={{...thS, width:32}}></th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s, i) => {
              const perDay = Math.ceil(s.periodsPerWeek / config.workDays.length)
              const isExp = expandedId === s.id
              const hasCC = (s.classConfigs ?? []).length > 0
              const colSpan = store.schedulingMode === 'period-based' ? 9 : 8

              return (
                <>
                  <tr key={s.id} style={{ background: i%2===0?"#fff":"#fafaf9" }}>
                    <td style={{...tdS, color:"#a8a59e", fontSize:10, fontFamily:"monospace"}}>{i+1}</td>
                    <td style={tdS}>
                      <input value={s.name} onChange={e => updateSubject(i,'name',e.target.value)}
                        style={{ width:"100%", padding:"3px 0", border:"none", fontSize:13, fontWeight:500, background:"transparent", outline:"none" }} />
                    </td>
                    {store.schedulingMode === 'period-based' ? <>
                      <td style={tdS}>
                        <input type="number" min={1} max={30} value={s.periodsPerWeek}
                          onChange={e => updateSubject(i,'periodsPerWeek',Math.max(1,+e.target.value))}
                          style={{...nS, width:54}} />
                      </td>
                      <td style={{...tdS, textAlign:"center" as const}}>
                        <span style={{ fontSize:12, fontWeight:600, color:"#7C6FE0", background:"#eaecf8", padding:"2px 7px", borderRadius:4 }}>{perDay}</span>
                      </td>
                      <td style={tdS}>
                        <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                          <input type="number" min={10} max={180} value={s.sessionDuration ?? 40}
                            onChange={e => updateSubject(i,'sessionDuration',Math.max(10,+e.target.value))}
                            style={{...nS, width:50}} />
                          <span style={{ fontSize:10, color:"#a8a59e" }}>m</span>
                        </div>
                      </td>
                      <td style={tdS}>
                        <input type="number" min={1} max={6} value={s.maxPeriodsPerDay ?? 2}
                          onChange={e => updateSubject(i,'maxPeriodsPerDay',Math.max(1,+e.target.value))}
                          style={{...nS, width:44}} />
                      </td>
                    </> : <>
                      <td style={tdS}>
                        <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                          <input type="number" min={0} defaultValue={(s as any).requiredHours ?? 0} key={s.id+'-rh'}
                            onBlur={e => updateSubject(i,'requiredHours',+e.target.value)}
                            style={{...nS, width:60}} />
                          <span style={{ fontSize:10, color:"#a8a59e" }}>hrs</span>
                        </div>
                      </td>
                      <td style={{...tdS, textAlign:"center" as const}}>
                        <span style={{ fontSize:12, fontWeight:600, color:"#7C6FE0", background:"#f0fdf4", padding:"2px 7px", borderRadius:4 }}>{s.periodsPerWeek}</span>
                      </td>
                      <td style={tdS}>
                        <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                          <input type="number" min={10} max={180} value={s.sessionDuration ?? 40}
                            onChange={e => updateSubject(i,'sessionDuration',Math.max(10,+e.target.value))}
                            style={{...nS, width:50}} />
                          <span style={{ fontSize:10, color:"#a8a59e" }}>m</span>
                        </div>
                      </td>
                    </>}
                    <td style={tdS}>
                      <button onClick={() => setExpandedId(isExp ? null : s.id)}
                        style={{ fontSize:11, padding:"3px 8px", borderRadius:5, border:`1px solid ${isExp?"#7C6FE0":"#e8e5de"}`, background: isExp?"#eaecf8":hasCC?"#f0fdf4":"#fff", color: isExp?"#7C6FE0":hasCC?"#7C6FE0":"#6a6860", cursor:"pointer", fontWeight:500 }}>
                        {isExp ? "▲ Hide" : hasCC ? "✓ Set" : "⚙ Set"}
                      </button>
                    </td>
                    <td style={tdS}>
                      <button onClick={() => setSubjects(subjects.filter((_,j)=>j!==i))}
                        style={{ width:22, height:22, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#c8c5bc", fontSize:16 }}>×</button>
                    </td>
                  </tr>

                  {/* Class-wise panel — flat rows, not nested table */}
                  {isExp && (
                    <tr key={s.id+'-cw'}>
                      <td colSpan={colSpan} style={{ padding:0, background:"#f5f3ff", borderBottom:"2px solid #7C6FE0" }}>
                        <div style={{ padding:"12px 16px" }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"#3730a3", marginBottom:10 }}>
                            ⚙ Class-wise settings for <strong>{s.name}</strong>
                            <span style={{ fontWeight:400, color:"#6a6860", marginLeft:8, fontSize:11 }}>— different values per class group</span>
                          </div>
                          <div style={{ display:"grid", gap:0, border:"1px solid #D8D2FF", borderRadius:8, overflow:"hidden" }}>
                            {/* Header */}
                            <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr 1fr 32px", background:"#ede9fe", padding:"6px 12px", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#9B8EF5", gap:8 }}>
                              <span>Class Group</span>
                              {store.schedulingMode === 'period-based' ? <>
                                <span>{T.sessions}/week</span>
                                <span>Min/session</span>
                                <span>Max/day</span>
                              </> : <>
                                <span>Req hrs/year</span>
                                <span>{T.sessions}/week AUTO</span>
                                <span>Min/session</span>
                              </>}
                              <span></span>
                            </div>
                            {allGroups.map((cls, ci) => {
                              const cc = getCC(i, cls)
                              return (
                                <div key={cls} style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr 1fr 32px", padding:"8px 12px", background: ci%2===0?"#EDE9FF":"#f5f0ff", borderTop:"1px solid #ede9fe", alignItems:"center", gap:8 }}>
                                  <span style={{ fontSize:12, fontWeight:600, color:"#7C6FE0" }}>{cls}</span>
                                  {store.schedulingMode === 'period-based' ? <>
                                    <div>
                                      <input type="number" min={1} defaultValue={cc.periodsPerWeek} key={cls+'-pw-'+s.id}
                                        onBlur={e => updateCC(i,cls,'periodsPerWeek',Math.max(1,+e.target.value))}
                                        style={{...ccS, width:54}} />
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                      <input type="number" min={10} max={180} defaultValue={cc.sessionDuration} key={cls+'-sd-'+s.id}
                                        onBlur={e => updateCC(i,cls,'sessionDuration',Math.max(10,+e.target.value))}
                                        style={{...ccS, width:50}} />
                                      <span style={{ fontSize:10, color:"#a8a59e" }}>m</span>
                                    </div>
                                    <div>
                                      <input type="number" min={1} max={6} defaultValue={cc.maxPeriodsPerDay} key={cls+'-mpd-'+s.id}
                                        onBlur={e => updateCC(i,cls,'maxPeriodsPerDay',Math.max(1,+e.target.value))}
                                        style={{...ccS, width:44}} />
                                    </div>
                                  </> : <>
                                    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                      <input type="number" min={0} defaultValue={(cc as any).requiredHours ?? 0} key={cls+'-rh-'+s.id}
                                        onBlur={e => updateCC(i,cls,'requiredHours',+e.target.value)}
                                        style={{...ccS, width:60}} />
                                      <span style={{ fontSize:10, color:"#a8a59e" }}>hrs</span>
                                    </div>
                                    <span style={{ fontSize:12, fontWeight:600, color:"#7C6FE0", background:"#f0fdf4", padding:"2px 8px", borderRadius:4, textAlign:"center" as const }}>{cc.periodsPerWeek}</span>
                                    <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                                      <input type="number" min={10} max={180} defaultValue={cc.sessionDuration} key={cls+'-sd2-'+s.id}
                                        onBlur={e => updateCC(i,cls,'sessionDuration',Math.max(10,+e.target.value))}
                                        style={{...ccS, width:50}} />
                                      <span style={{ fontSize:10, color:"#a8a59e" }}>m</span>
                                    </div>
                                  </>}
                                  <button onClick={() => {
                                    const n = [...subjects] as any[]
                                    n[i] = { ...n[i], classConfigs: (n[i].classConfigs ?? []).filter((c: any) => c.sectionName !== cls) }
                                    setSubjects(n)
                                  }} style={{ width:20, height:20, borderRadius:3, border:"none", background:"transparent", cursor:"pointer", color:"#c4b5fd", fontSize:14 }}>×</button>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ fontSize:10, color:"#9B8EF5", marginTop:8 }}>
                            💡 Default values (from main row) apply to classes not listed here.
                            Class groups auto-populate once you set up your classes.
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
        <button onClick={() => setSubjects([...subjects, {
            id:crypto.randomUUID(), name:`New ${T.resource}`,
            periodsPerWeek:2, sessionDuration:40, maxPeriodsPerDay:2,
            color:"bg-gray-100 text-gray-700", sections:[], classConfigs:[]
          }])}
          style={{ width:"100%", padding:"10px 12px", border:"none", borderTop:"1.5px dashed #e8e5de", background:"transparent", cursor:"pointer", fontSize:12, color:"#a8a59e", textAlign:"left" as const }}>
          ＋ Add {T.resource}
        </button>
      </div>

      <div style={{ fontSize:11, color:"#6a6860", marginBottom:16 }}>
        {store.schedulingMode === 'period-based'
          ? `💡 /day auto-calculated · Click ⚙ Set to configure different values per class group`
          : `💡 Formula: (hrs × 60) ÷ (min/session × ${workingWeeks} weeks) = ${T.sessions.toLowerCase()}s/week`}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:20, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(2)} style={{ padding:"10px 20px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => setStep(4)} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Save & Continue →</button>
      </div>
    </div>
  )
}
