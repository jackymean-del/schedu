import { useEffect, useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { generateSections, generateStaff, generateSubjects, ORG_CONFIGS, getCountry } from "@/lib/orgData"

type Tab = "classes" | "subjects" | "assign"

// Get unique base class groups e.g. ["Nursery","LKG","I","II"...]
function getGroups(sections: { name: string }[]) {
  const map = new Map<string, string[]>()
  sections.forEach(s => {
    const m = s.name.match(/^(.+?)[-\s][A-E]$/i)
    const group = m ? m[1].trim() : s.name
    if (!map.has(group)) map.set(group, [])
    map.get(group)!.push(s.name)
  })
  return map
}

export function Step2Setup() {
  const store = useTimetableStore()
  const { config, sections, staff, subjects, setSections, setStaff, setSubjects, setStep } = store
  const T = useTerminology()
  const [tab, setTab] = useState<Tab>("classes")
  const org = ORG_CONFIGS[config.orgType ?? "school"]
  const country = getCountry(config.countryCode ?? "IN")

  // Auto-generate on first load
  useEffect(() => {
    if (!sections.length) setSections(generateSections(config.orgType ?? "school", config.countryCode ?? "IN", config.numSections))
    if (!staff.length) setStaff(generateStaff(config.orgType ?? "school", config.countryCode ?? "IN", config.numStaff))
    if (!subjects.length) setSubjects(generateSubjects(config.orgType ?? "school", config.countryCode ?? "IN", config.numSubjects))
  }, [])

  const groups = getGroups(sections)
  const groupNames = [...groups.keys()]

  const toggleSubjectForSection = (secName: string, subName: string, checked: boolean) => {
    const updated = subjects.map(sub => {
      if (sub.name !== subName) return sub
      const secs = sub.sections ?? []
      return { ...sub, sections: checked ? [...new Set([...secs, secName])] : secs.filter(s => s !== secName) }
    })
    setSubjects(updated)
  }

  const toggleSubjectForGroup = (groupName: string, subName: string, checked: boolean) => {
    const groupSections = groups.get(groupName) ?? []
    const updated = subjects.map(sub => {
      if (sub.name !== subName) return sub
      const secs = sub.sections ?? []
      return { ...sub, sections: checked
        ? [...new Set([...secs, ...groupSections])]
        : secs.filter(s => !groupSections.includes(s)) }
    })
    setSubjects(updated)
  }

  const isGroupChecked = (groupName: string, subName: string) => {
    const groupSections = groups.get(groupName) ?? []
    const sub = subjects.find(s => s.name === subName)
    return groupSections.length > 0 && groupSections.every(s => (sub?.sections ?? []).includes(s))
  }

  const isGroupPartial = (groupName: string, subName: string) => {
    const groupSections = groups.get(groupName) ?? []
    const sub = subjects.find(s => s.name === subName)
    const asgn = sub?.sections ?? []
    return groupSections.some(s => asgn.includes(s)) && !isGroupChecked(groupName, subName)
  }

  const thS: React.CSSProperties = { padding:"8px 10px", background:"#f7f6f2", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", textAlign:"left" as const, borderBottom:"1px solid #e8e5de", whiteSpace:"nowrap" as const }
  const tdS: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid #f0ede7", verticalAlign:"middle", fontSize:12 }
  const inp: React.CSSProperties = { width:"100%", padding:"3px 6px", border:"none", borderBottom:"1px dashed transparent", fontSize:12, background:"transparent", outline:"none" }

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:6 }}>
        Review & Assign
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:20, lineHeight:1.65 }}>
        Schedu has auto-generated your {T.groups.toLowerCase()}, {T.participants.toLowerCase()} and {T.resources.toLowerCase()}.
        Edit names and assign {T.resources.toLowerCase()} to each class.
      </p>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"2px solid #e8e5de", marginBottom:20 }}>
        {([
          ["classes",  `📚 ${T.groups} (${sections.length})`],
          ["subjects", `📖 ${T.resources} (${subjects.length})`],
          ["assign",   "✅ Assign Subjects to Classes"],
        ] as [Tab,string][]).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:"9px 18px", border:"none", borderBottom: tab===t?"2px solid #7C6FE0":"2px solid transparent", marginBottom:-2, background:"transparent", fontSize:12, fontWeight: tab===t?700:500, color: tab===t?"#7C6FE0":"#6a6860", cursor:"pointer", whiteSpace:"nowrap" as const }}>
            {l}
          </button>
        ))}
      </div>

      {/* Classes tab */}
      {tab === "classes" && (
        <div>
          <div style={{ fontSize:11, color:"#6a6860", marginBottom:12 }}>
            Edit class names, rooms and class teachers. Auto-named from your country standards — change anything inline.
          </div>
          <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={{...thS, width:36}}>#</th>
                <th style={thS}>Group</th>
                <th style={thS}>Class / Section</th>
                <th style={{...thS, width:110}}>Room</th>
                <th style={thS}>Class Teacher</th>
                <th style={{...thS, width:32}}></th>
              </tr></thead>
              <tbody>
                {sections.map((s, i) => (
                  <tr key={s.id} style={{ background: i%2===0?"#fff":"#fafaf9" }}>
                    <td style={{...tdS, color:"#a8a59e", fontSize:10, fontFamily:"monospace"}}>{i+1}</td>
                    <td style={{...tdS, color:"#6a6860", fontSize:11}}>
                      {(() => { const m = s.name.match(/^(.+?)[-\s][A-E]$/i); return m?m[1].trim():'' })()}
                    </td>
                    <td style={tdS}>
                      <input style={inp} value={s.name}
                        onChange={e=>{const n=[...sections];n[i]={...n[i],name:e.target.value};setSections(n)}}
                        onFocus={e=>(e.target as HTMLInputElement).style.borderBottomColor="#7C6FE0"}
                        onBlur={e=>(e.target as HTMLInputElement).style.borderBottomColor="transparent"} />
                    </td>
                    <td style={tdS}>
                      <input style={inp} value={s.room??""} placeholder="Auto"
                        onChange={e=>{const n=[...sections];n[i]={...n[i],room:e.target.value};setSections(n)}} />
                    </td>
                    <td style={tdS}>
                      <select style={{ fontSize:11, border:"1px solid #e8e5de", borderRadius:6, padding:"3px 6px", width:"100%", background:"#fff" }}
                        value={s.classTeacher??""} onChange={e=>{const n=[...sections];n[i]={...n[i],classTeacher:e.target.value};setSections(n)}}>
                        <option value="">— None —</option>
                        {staff.map(st=><option key={st.id} value={st.name}>{st.name}</option>)}
                      </select>
                    </td>
                    <td style={tdS}>
                      <button onClick={()=>setSections(sections.filter((_,j)=>j!==i))}
                        style={{ width:22, height:22, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#c8c5bc", fontSize:16 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => {
              const nextNum = sections.length + 1
              setSections([...sections, { id:crypto.randomUUID(), name:`Class ${nextNum}`, room:`Room ${nextNum}`, grade:"", classTeacher:"" }])
            }} style={{ width:"100%", padding:"10px 12px", border:"none", borderTop:"1.5px dashed #e8e5de", background:"transparent", cursor:"pointer", fontSize:12, color:"#a8a59e", textAlign:"left" as const }}>
              ＋ Add Class
            </button>
          </div>
        </div>
      )}

      {/* Subjects tab */}
      {tab === "subjects" && (
        <div>
          <div style={{ fontSize:11, color:"#6a6860", marginBottom:12 }}>
            Edit subject names and set default periods/week. Use the Assign tab to assign subjects to specific classes.
          </div>
          <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={{...thS, width:36}}>#</th>
                <th style={thS}>Subject Name</th>
                <th style={{...thS, width:100}}>Periods/week</th>
                <th style={{...thS, width:90}}>Min/session</th>
                <th style={{...thS, width:80}}>Max/day</th>
                <th style={{...thS, width:32}}></th>
              </tr></thead>
              <tbody>
                {subjects.map((s, i) => (
                  <tr key={s.id} style={{ background: i%2===0?"#fff":"#fafaf9" }}>
                    <td style={{...tdS, color:"#a8a59e", fontSize:10, fontFamily:"monospace"}}>{i+1}</td>
                    <td style={tdS}>
                      <input style={inp} value={s.name}
                        onChange={e=>{const n=[...subjects] as any[];n[i]={...n[i],name:e.target.value};setSubjects(n)}}
                        onFocus={e=>(e.target as HTMLInputElement).style.borderBottomColor="#7C6FE0"}
                        onBlur={e=>(e.target as HTMLInputElement).style.borderBottomColor="transparent"} />
                    </td>
                    <td style={tdS}>
                      <input type="number" min={1} max={30} value={s.periodsPerWeek}
                        onChange={e=>{const n=[...subjects] as any[];n[i]={...n[i],periodsPerWeek:Math.max(1,+e.target.value)};setSubjects(n)}}
                        style={{ width:54, padding:"3px 6px", border:"1px solid #e8e5de", borderRadius:6, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                    </td>
                    <td style={tdS}>
                      <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                        <input type="number" min={10} max={180} value={s.sessionDuration??40}
                          onChange={e=>{const n=[...subjects] as any[];n[i]={...n[i],sessionDuration:+e.target.value};setSubjects(n)}}
                          style={{ width:48, padding:"3px 6px", border:"1px solid #e8e5de", borderRadius:6, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                        <span style={{ fontSize:10, color:"#a8a59e" }}>m</span>
                      </div>
                    </td>
                    <td style={tdS}>
                      <input type="number" min={1} max={6} value={s.maxPeriodsPerDay??2}
                        onChange={e=>{const n=[...subjects] as any[];n[i]={...n[i],maxPeriodsPerDay:+e.target.value};setSubjects(n)}}
                        style={{ width:42, padding:"3px 6px", border:"1px solid #e8e5de", borderRadius:6, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                    </td>
                    <td style={tdS}>
                      <button onClick={()=>setSubjects(subjects.filter((_,j)=>j!==i))}
                        style={{ width:22, height:22, borderRadius:4, border:"none", background:"transparent", cursor:"pointer", color:"#c8c5bc", fontSize:16 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setSubjects([...subjects, { id:crypto.randomUUID(), name:"New Subject", periodsPerWeek:2, sessionDuration:40, maxPeriodsPerDay:2, color:"bg-gray-100 text-gray-700", sections:[], classConfigs:[] }])}
              style={{ width:"100%", padding:"10px 12px", border:"none", borderTop:"1.5px dashed #e8e5de", background:"transparent", cursor:"pointer", fontSize:12, color:"#a8a59e", textAlign:"left" as const }}>
              ＋ Add Subject
            </button>
          </div>
        </div>
      )}

      {/* Assign tab — Group → Sections × Subjects matrix */}
      {tab === "assign" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" as const }}>
            <button onClick={() => setSubjects(subjects.map(s => ({ ...s, sections: sections.map(x=>x.name) })))}
              style={{ padding:"6px 14px", borderRadius:7, border:"1.5px solid #e8e5de", background:"#fff", fontSize:12, cursor:"pointer" }}>✅ Select All</button>
            <button onClick={() => setSubjects(subjects.map(s => ({ ...s, sections: [] })))}
              style={{ padding:"6px 14px", borderRadius:7, border:"1.5px solid #e8e5de", background:"#fff", fontSize:12, cursor:"pointer" }}>☐ Clear All</button>
            <div style={{ fontSize:11, color:"#6a6860", display:"flex", alignItems:"center" }}>
              💡 First column = class group. Check box = assign subject to all sections of that group. Expand to set individual sections.
            </div>
          </div>
          <div style={{ overflowX:"auto" as const, border:"1.5px solid #e8e5de", borderRadius:12 }}>
            <table style={{ borderCollapse:"collapse", minWidth:"100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thS, minWidth:160, position:"sticky" as const, left:0, background:"#f7f6f2", zIndex:2 }}>Subject / Freq</th>
                  {groupNames.map(g => (
                    <th key={g} style={{ ...thS, textAlign:"center" as const, minWidth:90 }}>
                      <div>{g}</div>
                      <div style={{ fontSize:9, color:"#c8c5bc", fontWeight:400 }}>{groups.get(g)?.length} sec.</div>
                    </th>
                  ))}
                  <th style={{ ...thS, textAlign:"center" as const, minWidth:60, background:"#f0fdf4", color:"#7C6FE0" }}>All</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub, si) => (
                  <tr key={sub.id} style={{ background: si%2===0?"#fff":"#fafaf9" }}>
                    <td style={{ ...tdS, position:"sticky" as const, left:0, background: si%2===0?"#fff":"#fafaf9", zIndex:1, fontWeight:500 }}>
                      {sub.name}
                      <div style={{ fontSize:10, fontFamily:"monospace", color:"#a8a59e" }}>{sub.periodsPerWeek}×/wk</div>
                    </td>
                    {groupNames.map(g => {
                      const allChk = isGroupChecked(g, sub.name)
                      const partial = isGroupPartial(g, sub.name)
                      return (
                        <td key={g} style={{ ...tdS, textAlign:"center" as const }}>
                          <input type="checkbox" checked={allChk}
                            ref={el => { if (el) el.indeterminate = partial }}
                            onChange={e => toggleSubjectForGroup(g, sub.name, e.target.checked)}
                            style={{ width:15, height:15, accentColor:"#7C6FE0", cursor:"pointer" }}
                            title={`${sub.name} → all ${g} sections`} />
                        </td>
                      )
                    })}
                    <td style={{ ...tdS, textAlign:"center" as const, background: si%2===0?"#f0fdf4":"#ecfdf5" }}>
                      <button onClick={() => setSubjects(subjects.map((s,j) => j===si ? { ...s, sections: sections.map(x=>x.name) } : s))}
                        style={{ fontSize:10, padding:"2px 8px", borderRadius:4, border:"1px solid #D8D2FF", background:"#fff", color:"#7C6FE0", cursor:"pointer", fontWeight:600 }}>+All</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop:10, fontSize:11, color:"#6a6860" }}>
            Checked = subject assigned to all sections of that class group. Individual section control available in the next step.
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:20, borderTop:"1px solid #e8e5de", marginTop:20 }}>
        <button onClick={() => setStep(1)} style={{ padding:"10px 20px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => setStep(3)} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  )
}
