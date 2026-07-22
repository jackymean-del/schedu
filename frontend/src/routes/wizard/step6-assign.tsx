import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { ORG_CONFIGS, getCountry } from "@/lib/orgData"

type Tab = "matrix" | "staff"

function getBaseClasses(sections: { name: string }[]): string[] {
  const bases = sections.map(s => {
    const match = s.name.match(/^(.+?)[-\s][A-E]$/i)
    return match ? match[1].trim() : s.name
  })
  return [...new Set(bases)]
}

function getSectionsForClass(sections: { name: string }[], baseClass: string): string[] {
  return sections
    .filter(s => s.name === baseClass || s.name.startsWith(baseClass + '-') || s.name.startsWith(baseClass + ' '))
    .map(s => s.name)
}

// Get subjects assigned to a specific class
function getSubjectsForClass(subjects: { name: string; sections?: string[]; periodsPerWeek: number }[], sections: { name: string }[], baseClass: string) {
  const classSecs = getSectionsForClass(sections, baseClass)
  return subjects.filter(sub => classSecs.some(s => (sub.sections ?? []).includes(s)) || (sub.sections ?? []).length === 0)
}

export function Step6Assign() {
  const { config, sections, staff, subjects, setStaff, setSubjects, setStep } = useTimetableStore()
  const [tab, setTab] = useState<Tab>("matrix")
  const [allocated, setAllocated] = useState(false)
  const org      = ORG_CONFIGS[config.orgType ?? "school"]
  const country  = getCountry(config.countryCode ?? "IN")
  const baseClasses = getBaseClasses(sections)

  // ── Matrix helpers ──
  const toggleSubForAllSections = (si: number, baseClass: string, checked: boolean) => {
    const classSecs = getSectionsForClass(sections, baseClass)
    const updated = [...subjects]
    const cur = updated[si].sections ?? []
    updated[si] = { ...updated[si], sections: checked ? [...new Set([...cur, ...classSecs])] : cur.filter(s => !classSecs.includes(s)) }
    setSubjects(updated)
  }
  const isAllChecked  = (si: number, cls: string) => { const secs = getSectionsForClass(sections, cls); return secs.length > 0 && secs.every(s => (subjects[si].sections ?? []).includes(s)) }
  const isSomeChecked = (si: number, cls: string) => { const secs = getSectionsForClass(sections, cls); const asgn = subjects[si].sections ?? []; return secs.some(s => asgn.includes(s)) && !isAllChecked(si, cls) }

  // ── Staff: toggle subject for a specific class ──
  const toggleSubjectForClass = (stIdx: number, subName: string, baseClass: string, checked: boolean) => {
    const key = `${baseClass}::${subName}`
    const n = [...staff]
    const cur = n[stIdx].subjects ?? []
    // Store as "ClassName::SubjectName" pairs for class-specific assignment
    if (checked) {
      n[stIdx] = { ...n[stIdx], subjects: [...new Set([...cur, key])] }
    } else {
      n[stIdx] = { ...n[stIdx], subjects: cur.filter(s => s !== key) }
    }
    setStaff(n)
  }

  const isSubjectCheckedForClass = (stIdx: number, subName: string, baseClass: string) => {
    const key = `${baseClass}::${subName}`
    return (staff[stIdx].subjects ?? []).includes(key)
  }

  // ── AI Auto-allocate ──
  const handleAutoAllocate = () => {
    // 1. Auto-assign all subjects to all classes in matrix
    const updatedSubjects = subjects.map(sub => ({
      ...sub,
      sections: sections.map(s => s.name)
    }))
    setSubjects(updatedSubjects)

    // 2. Distribute teachers: each teacher gets some base classes
    const perTeacher = Math.max(1, Math.ceil(baseClasses.length / Math.max(1, staff.length)))
    const updatedStaff = staff.map((st, i) => {
      const startIdx = (i * perTeacher) % baseClasses.length
      const assignedBaseClasses = baseClasses.slice(startIdx, startIdx + perTeacher)
      const fallback = baseClasses[i % baseClasses.length]
      const myClasses = assignedBaseClasses.length ? assignedBaseClasses : [fallback]

      // Expand to sections
      const expandedClasses: string[] = []
      myClasses.forEach(cls => {
        const secs = getSectionsForClass(sections, cls)
        expandedClasses.push(...(secs.length ? secs : [cls]))
      })

      // Assign all subjects for those classes
      const mySubjectKeys: string[] = []
      myClasses.forEach(cls => {
        updatedSubjects.forEach(sub => {
          mySubjectKeys.push(`${cls}::${sub.name}`)
        })
      })

      return {
        ...st,
        classes: [...new Set(expandedClasses)],
        subjects: mySubjectKeys,
      }
    })

    setStaff(updatedStaff)
    setAllocated(true)
  }

  const thS: React.CSSProperties = { padding:"8px 10px", background:"#f7f6f2", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", textAlign:"left" as const, borderBottom:"1px solid #e8e5de", whiteSpace:"nowrap" as const }
  const tdS: React.CSSProperties = { padding:"7px 10px", borderBottom:"1px solid #f0ede7", verticalAlign:"middle", fontSize:11 }

  return (
    <div>
      <h1 style={{ fontFamily:"'Plus Jakarta Sans',Georgia,serif", fontSize:28, marginBottom:8 }}>
        Assign {org.subjectsLabel} & {org.staffsLabel}
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:16, lineHeight:1.65 }}>
        Step 1: Assign which {org.subjectsLabel.toLowerCase()} apply to which classes in the matrix.<br />
        Step 2: Assign {org.staffsLabel.toLowerCase()} to specific classes and subjects per class.
      </p>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"2px solid #e8e5de", marginBottom:16 }}>
        {([["matrix",`1️⃣ ${org.subjectLabel} → Class Matrix`],["staff",`2️⃣ ${org.staffLabel} Assignments`]] as [Tab,string][]).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:"9px 18px", border:"none", borderBottom: tab===t?"2px solid #7C6FE0":"2px solid transparent", marginBottom:-2, background:"transparent", fontSize:12, fontWeight: tab===t?700:500, color: tab===t?"#7C6FE0":"#6a6860", cursor:"pointer", whiteSpace:"nowrap" as const }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── MATRIX TAB ── */}
      {tab === "matrix" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" as const }}>
            <button onClick={() => setSubjects(subjects.map(s => ({ ...s, sections: sections.map(x => x.name) })))}
              style={{ padding:"7px 14px", borderRadius:7, border:"1.5px solid #e8e5de", background:"#fff", fontSize:12, cursor:"pointer" }}>✅ Check All</button>
            <button onClick={() => setSubjects(subjects.map(s => ({ ...s, sections: [] })))}
              style={{ padding:"7px 14px", borderRadius:7, border:"1.5px solid #e8e5de", background:"#fff", fontSize:12, cursor:"pointer" }}>☐ Clear All</button>
            <div style={{ flex:1, background:"#eaecf8", borderRadius:7, padding:"7px 12px", fontSize:11, color:"#3730a3" }}>
              💡 Check a class column = assign subject to ALL sections of that class. Use <strong>+ All</strong> to assign to every class.
            </div>
          </div>
          <div style={{ overflowX:"auto", border:"1.5px solid #e8e5de", borderRadius:12 }}>
            <table style={{ borderCollapse:"collapse", fontSize:11, minWidth:"100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thS, minWidth:150, position:"sticky" as const, left:0, background:"#f7f6f2", zIndex:1 }}>{org.subjectLabel} / Freq</th>
                  {baseClasses.map(cls => (
                    <th key={cls} style={{ ...thS, textAlign:"center" as const, minWidth:80 }}>
                      {cls}<div style={{ fontSize:9, color:"#c8c5bc", fontWeight:400, marginTop:1 }}>{getSectionsForClass(sections, cls).length} sec.</div>
                    </th>
                  ))}
                  <th style={{ ...thS, textAlign:"center" as const, minWidth:60, background:"#f0fdf4", color:"#7C6FE0" }}>All</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub, si) => (
                  <tr key={sub.id} style={{ background: si%2===0?"#fff":"#fafaf9" }}>
                    <td style={{ ...tdS, position:"sticky" as const, left:0, background: si%2===0?"#fff":"#fafaf9", zIndex:1, fontWeight:500 }}>
                      {sub.name}<div style={{ fontSize:10, fontFamily:"monospace", color:"#a8a59e" }}>{sub.periodsPerWeek}×/wk</div>
                    </td>
                    {baseClasses.map(cls => {
                      const all  = isAllChecked(si, cls)
                      const some = isSomeChecked(si, cls)
                      return (
                        <td key={cls} style={{ ...tdS, textAlign:"center" as const }}>
                          <input type="checkbox" checked={all}
                            ref={el => { if (el) el.indeterminate = some }}
                            onChange={e => toggleSubForAllSections(si, cls, e.target.checked)}
                            style={{ width:14, height:14, accentColor:"#7C6FE0", cursor:"pointer" }} />
                          {some && <div style={{ fontSize:8, color:"#D4920E" }}>partial</div>}
                        </td>
                      )
                    })}
                    <td style={{ ...tdS, textAlign:"center" as const, background: si%2===0?"#f0fdf4":"#ecfdf5" }}>
                      <button onClick={() => setSubjects(subjects.map((s,i) => i===si ? { ...s, sections: sections.map(x=>x.name) } : s))}
                        style={{ fontSize:10, padding:"2px 8px", borderRadius:4, border:"1px solid #D8D2FF", background:"#fff", color:"#7C6FE0", cursor:"pointer", fontWeight:600 }}>+ All</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop:12, padding:"8px 12px", background:"#f7f6f2", borderRadius:8, fontSize:11, color:"#6a6860" }}>
            ℹ️ Checking a class assigns the subject to all sections of that class (e.g. "I" → I-A, I-B, I-C).
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
            <button onClick={() => setTab("staff")}
              style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              Continue to {org.staffLabel} Assignments →
            </button>
          </div>
        </div>
      )}

      {/* ── STAFF TAB ── */}
      {tab === "staff" && (
        <div>
          <div style={{ background:"#f0fdf4", border:"1.5px solid #D8D2FF", borderRadius:10, padding:"12px 16px", marginBottom:12, fontSize:12, color:"#14532d" }}>
            <strong>How to assign:</strong> Select classes for each {org.staffLabel.toLowerCase()} → subjects for those classes appear as separate columns → check which subjects they teach per class → click <strong>🤖 Auto-allocate</strong> to auto-fill everything, then fine-tune.
          </div>

          {/* Auto-allocate */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, padding:"12px 16px", background: allocated?"#f0fdf4":"#eaecf8", borderRadius:10, border:`1.5px solid ${allocated?"#D8D2FF":"#D8D2FF"}` }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color: allocated?"#14532d":"#3730a3" }}>
                {allocated ? "✅ Sections auto-allocated!" : "🤖 AI Auto-allocate Everything"}
              </div>
              <div style={{ fontSize:11, color: allocated?"#7C6FE0":"#7C6FE0", marginTop:2 }}>
                {allocated ? "Classes, sections and subjects auto-assigned. Review and edit below." : "the engine will assign all classes, sections and subjects to teachers optimally. You can edit after."}
              </div>
            </div>
            <button onClick={handleAutoAllocate}
              style={{ padding:"9px 18px", borderRadius:8, border:"none", background: allocated?"#7C6FE0":"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" as const }}>
              {allocated ? "Re-allocate" : "🤖 Auto-allocate"}
            </button>
          </div>

          {/* Staff cards */}
          <div style={{ display:"flex", flexDirection:"column" as const, gap:12 }}>
            {staff.map((st, i) => {
              const assignedBaseClasses = baseClasses.filter(cls =>
                (st.classes ?? []).some(c => c === cls || getSectionsForClass(sections, cls).includes(c))
              )
              const load = assignedBaseClasses.reduce((total, cls) => {
                const clsSubs = subjects.filter(sub => isSubjectCheckedForClass(i, sub.name, cls))
                return total + clsSubs.reduce((a, s) => a + s.periodsPerWeek, 0)
              }, 0)
              const maxP = st.maxPeriodsPerWeek ?? country.maxPeriodsWeek
              const pct  = Math.min(150, Math.round(load / maxP * 100))
              const barColor = pct>100?"#ef4444":pct>85?"#f59e0b":"#7C6FE0"

              return (
                <div key={st.id} style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden" }}>
                  {/* Teacher header */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#f7f6f2", borderBottom:"1px solid #e8e5de" }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#7C6FE0", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, flexShrink:0 }}>
                      {i+1}
                    </div>
                    <div style={{ flex:1 }}>
                      <input value={st.name} onChange={e=>{const n=[...staff];n[i]={...n[i],name:e.target.value};setStaff(n)}}
                        style={{ fontSize:13, fontWeight:600, background:"transparent", border:"none", outline:"none", width:"100%", color:"#1c1b18" }} />
                      {st.isClassTeacher && <div style={{ fontSize:10, color:"#7C6FE0" }}>★ Class Teacher: {st.isClassTeacher}</div>}
                    </div>
                    <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                      <div style={{ fontSize:11, fontFamily:"monospace", color:"#1c1b18" }}>{load}/{maxP} {org.loadUnit}</div>
                      <div style={{ width:90, height:5, background:"#e8e5de", borderRadius:3, marginTop:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(100,pct)}%`, background:barColor, borderRadius:3, transition:"width 0.3s" }} />
                      </div>
                      <div style={{ fontSize:9, color:"#a8a59e", marginTop:2 }}>{pct}% loaded</div>
                    </div>
                  </div>

                  {/* Body: Classes column + per-class subject columns */}
                  <div style={{ display:"flex", overflowX:"auto" as const }}>
                    {/* Classes column */}
                    <div style={{ minWidth:160, borderRight:"1px solid #f0ede7", padding:"10px 12px", flexShrink:0 }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:6 }}>Classes</div>
                      <div style={{ fontSize:10, color:"#6a6860", marginBottom:8 }}>Select class groups</div>
                      {baseClasses.map(cls => {
                        const secs = getSectionsForClass(sections, cls)
                        const isChecked = (st.classes ?? []).some(c => c === cls || secs.includes(c))
                        return (
                          <label key={cls} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", padding:"4px 6px", borderRadius:5, marginBottom:2, background: isChecked?"#eaecf8":"transparent" }}>
                            <input type="checkbox" checked={isChecked} style={{ accentColor:"#7C6FE0", width:13, height:13 }}
                              onChange={e => {
                                const n=[...staff]
                                const curClasses = n[i].classes ?? []
                                if (e.target.checked) {
                                  // Add all sections of this class
                                  const newClasses = [...new Set([...curClasses, ...secs.length ? secs : [cls]])]
                                  n[i] = { ...n[i], classes: newClasses }
                                } else {
                                  // Remove this class and all its sections
                                  n[i] = { ...n[i], classes: curClasses.filter(c => c !== cls && !secs.includes(c)) }
                                  // Also clear subject assignments for this class
                                  const curSubs = n[i].subjects ?? []
                                  n[i] = { ...n[i], subjects: curSubs.filter(s => !s.startsWith(cls + '::')) }
                                }
                                setStaff(n)
                                setAllocated(false)
                              }} />
                            <span style={{ fontSize:12, fontWeight: isChecked?600:400, color: isChecked?"#3730a3":"#1c1b18" }}>{cls}</span>
                            <span style={{ fontSize:9, color:"#a8a59e", marginLeft:"auto" }}>{secs.length} sec.</span>
                          </label>
                        )
                      })}
                    </div>

                    {/* Per-class subject columns */}
                    {assignedBaseClasses.length === 0 ? (
                      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", color:"#a8a59e", fontSize:12, fontStyle:"italic" }}>
                        ← Select classes to see {org.subjectsLabel.toLowerCase()} per class
                      </div>
                    ) : (
                      assignedBaseClasses.map((cls, ci) => {
                        const clsSubjects = getSubjectsForClass(subjects, sections, cls)
                        return (
                          <div key={cls} style={{ minWidth:150, borderRight: ci < assignedBaseClasses.length-1 ? "1px solid #f0ede7" : "none", padding:"10px 12px", flexShrink:0 }}>
                            {/* Class header */}
                            <div style={{ fontSize:11, fontWeight:700, color:"#7C6FE0", marginBottom:2 }}>{cls}</div>
                            <div style={{ fontSize:9, color:"#a8a59e", marginBottom:8 }}>
                              {getSectionsForClass(sections, cls).join(", ")}
                            </div>
                            {/* Subjects for this class */}
                            {clsSubjects.length === 0 ? (
                              <div style={{ fontSize:10, color:"#a8a59e", fontStyle:"italic" }}>No subjects assigned to {cls} yet</div>
                            ) : clsSubjects.map(sub => {
                              const checked = isSubjectCheckedForClass(i, sub.name, cls)
                              return (
                                <label key={sub.name} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", padding:"3px 5px", borderRadius:4, marginBottom:2, background: checked?"#f0fdf4":"transparent" }}>
                                  <input type="checkbox" checked={checked} style={{ accentColor:"#7C6FE0", width:12, height:12 }}
                                    onChange={e => toggleSubjectForClass(i, sub.name, cls, e.target.checked)} />
                                  <span style={{ fontSize:11, fontWeight: checked?600:400, color: checked?"#14532d":"#1c1b18", flex:1 }}>{sub.name}</span>
                                  <span style={{ fontSize:9, color:"#a8a59e", fontFamily:"monospace" }}>{sub.periodsPerWeek}×</span>
                                </label>
                              )
                            })}
                            {/* Check all / clear for this class */}
                            <div style={{ display:"flex", gap:4, marginTop:8 }}>
                              <button onClick={() => clsSubjects.forEach(sub => toggleSubjectForClass(i, sub.name, cls, true))}
                                style={{ flex:1, fontSize:9, padding:"2px 4px", borderRadius:3, border:"1px solid #D8D2FF", background:"#f0fdf4", color:"#7C6FE0", cursor:"pointer" }}>All ✓</button>
                              <button onClick={() => clsSubjects.forEach(sub => toggleSubjectForClass(i, sub.name, cls, false))}
                                style={{ flex:1, fontSize:9, padding:"2px 4px", borderRadius:3, border:"1px solid #e8e5de", background:"#fff", color:"#6a6860", cursor:"pointer" }}>Clear</button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #e8e5de", marginTop:16 }}>
        <button onClick={() => setStep(5)} style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => setStep(7)} style={{ padding:"9px 18px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          ✨ Generate Timetable →
        </button>
      </div>
    </div>
  )
}
