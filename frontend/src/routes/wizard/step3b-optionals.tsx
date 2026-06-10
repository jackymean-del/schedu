import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { useTerminology } from "@/hooks/useTerminology"
import { generateCombinations, validateStrengths, deriveSubjectPools } from "@/lib/optionalEngine"
import type { ClassOptionalConfig, OptionalLine, OptionalCombination } from "@/types"

const S = {
  card: (active: boolean): React.CSSProperties => ({
    padding:16, borderRadius:10, cursor:"pointer", textAlign:"left" as const,
    border: active?"2px solid #7C6FE0":"1.5px solid #e8e5de",
    background: active?"#eaecf8":"#fff",
  }),
  badge: (color: string): React.CSSProperties => ({
    padding:"2px 8px", borderRadius:12, fontSize:10, fontWeight:600,
    background: color+"22", color, border:`1px solid ${color}44`,
  }),
  inp: { padding:"6px 10px", border:"1.5px solid #e8e5de", borderRadius:7, fontSize:12, outline:"none", width:"100%" } as React.CSSProperties,
  tag: (color = "#7C6FE0"): React.CSSProperties => ({
    display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px",
    borderRadius:20, fontSize:11, fontWeight:600,
    background: color+"15", color, border:`1px solid ${color}33`,
  }),
}

export function Step3bOptionals() {
  const store = useTimetableStore()
  const { sections, subjects, optionalConfigs, setOptionalConfigs, setSubjectPools, setStep } = store
  const T = useTerminology()
  const [selectedSection, setSelectedSection] = useState(sections[0]?.name ?? "")

  // Get or create config for a section
  const getConfig = (secName: string): ClassOptionalConfig => {
    return optionalConfigs.find(c => c.classId === secName) ?? {
      classId: secName,
      hasOptionals: false,
      totalStudents: 40,
      optionalLines: [],
      combinations: [],
      combinationStrengths: [],
    }
  }

  const updateConfig = (secName: string, updates: Partial<ClassOptionalConfig>) => {
    const existing = optionalConfigs.find(c => c.classId === secName)
    const newConfig = { ...getConfig(secName), ...updates }
    const updated = existing
      ? optionalConfigs.map(c => c.classId === secName ? newConfig : c)
      : [...optionalConfigs, newConfig]
    setOptionalConfigs(updated)

    // Recalculate pools whenever configs change
    const combosMap = new Map<string, OptionalCombination[]>()
    updated.forEach(cfg => {
      if (cfg.hasOptionals) combosMap.set(cfg.classId, generateCombinations(cfg))
    })
    setSubjectPools(deriveSubjectPools(updated, combosMap))
  }

  const cfg = getConfig(selectedSection)
  const combos = cfg.hasOptionals ? generateCombinations(cfg) : []
  const validation = cfg.hasOptionals ? validateStrengths(cfg, combos) : null

  const addLine = () => {
    const lines = [...cfg.optionalLines, { id: `line-${Date.now()}`, name: `Optional Line ${cfg.optionalLines.length + 1}`, subjects: [""] }]
    updateConfig(selectedSection, { optionalLines: lines })
  }

  const updateLine = (lineId: string, updates: Partial<OptionalLine>) => {
    const lines = cfg.optionalLines.map(l => l.id === lineId ? { ...l, ...updates } : l)
    updateConfig(selectedSection, { optionalLines: lines })
  }

  const updateLineSubject = (lineId: string, idx: number, val: string) => {
    const lines = cfg.optionalLines.map(l => {
      if (l.id !== lineId) return l
      const subs = [...l.subjects]
      subs[idx] = val
      return { ...l, subjects: subs }
    })
    updateConfig(selectedSection, { optionalLines: lines })
  }

  const addSubjectToLine = (lineId: string) => {
    const lines = cfg.optionalLines.map(l => l.id === lineId ? { ...l, subjects: [...l.subjects, ""] } : l)
    updateConfig(selectedSection, { optionalLines: lines })
  }

  const removeSubjectFromLine = (lineId: string, idx: number) => {
    const lines = cfg.optionalLines.map(l => {
      if (l.id !== lineId) return l
      return { ...l, subjects: l.subjects.filter((_,i) => i !== idx) }
    })
    updateConfig(selectedSection, { optionalLines: lines })
  }

  const removeLine = (lineId: string) => {
    updateConfig(selectedSection, { optionalLines: cfg.optionalLines.filter(l => l.id !== lineId) })
  }

  const setStrength = (comboId: string, count: number) => {
    const strengths = cfg.combinationStrengths.filter(s => s.sectionId !== selectedSection || s.combinationId !== comboId)
    strengths.push({ sectionId: selectedSection, combinationId: comboId, studentCount: count })
    updateConfig(selectedSection, { combinationStrengths: strengths })
  }

  const getStrength = (comboId: string) =>
    cfg.combinationStrengths.find(s => s.sectionId === selectedSection && s.combinationId === comboId)?.studentCount ?? 0

  const optionalSections = sections.filter(s => getConfig(s.name).hasOptionals)
  const normalSections = sections.filter(s => !getConfig(s.name).hasOptionals)
  const allPoolsValid = optionalSections.every(s => {
    const c = getConfig(s.name)
    const combos = generateCombinations(c)
    return validateStrengths(c, combos).valid
  })

  const LINE_COLORS = ["#7C6FE0", "#7C6FE0", "#D4920E", "#dc2626", "#9B8EF5"]

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:6 }}>
        Optional Subject Scheduling
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:24, lineHeight:1.65 }}>
        For classes (like XI-XII) where students choose different subject combinations.
        Configure which sections have optional subjects and define subject lines.
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:20 }}>

        {/* Section list */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:10 }}>
            {T.groups} ({sections.length})
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const, gap:6 }}>
            {sections.map(s => {
              const scfg = getConfig(s.name)
              const isSelected = s.name === selectedSection
              return (
                <button key={s.name} onClick={() => setSelectedSection(s.name)}
                  style={{ padding:"8px 12px", borderRadius:8, border:`1.5px solid ${isSelected?"#7C6FE0":"#e8e5de"}`, background: isSelected?"#eaecf8":"#fff", cursor:"pointer", textAlign:"left" as const, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, fontWeight: isSelected?600:400, color: isSelected?"#3730a3":"#1c1b18" }}>{s.name}</span>
                  <span style={S.badge(scfg.hasOptionals ? "#7C6FE0" : "#a8a59e")}>
                    {scfg.hasOptionals ? "Optional" : "Normal"}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Summary */}
          <div style={{ marginTop:16, padding:"10px 12px", background:"#f7f6f2", borderRadius:8, fontSize:11, color:"#374151" }}>
            <div style={{ marginBottom:4 }}>📊 Summary</div>
            <div style={{ color:"#7C6FE0" }}>✓ {optionalSections.length} with optionals</div>
            <div style={{ color:"#64748b" }}>○ {normalSections.length} normal</div>
            {allPoolsValid && optionalSections.length > 0 && (
              <div style={{ color:"#7C6FE0", marginTop:4 }}>🏊 Pools ready</div>
            )}
          </div>
        </div>

        {/* Config panel */}
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1c1b18" }}>{selectedSection}</div>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ fontSize:11, color:"#6a6860" }}>Total students:</div>
              <input type="number" min={1} max={200} value={cfg.totalStudents}
                onChange={e => updateConfig(selectedSection, { totalStudents: Math.max(1,+e.target.value) })}
                style={{ width:60, padding:"3px 8px", border:"1.5px solid #e8e5de", borderRadius:6, fontSize:12, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
            </div>
          </div>

          {/* Does this class have optionals? */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#a8a59e", marginBottom:10 }}>
              Does this class have optional subjects?
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <button style={S.card(!cfg.hasOptionals)} onClick={() => updateConfig(selectedSection, { hasOptionals: false })}>
                <div style={{ fontSize:18, marginBottom:4 }}>📋</div>
                <div style={{ fontSize:13, fontWeight:700, color: !cfg.hasOptionals?"#3730a3":"#1c1b18" }}>NO — Normal Scheduling</div>
                <div style={{ fontSize:11, color:"#6a6860", marginTop:2 }}>All students study the same subjects. Use section-based timetable.</div>
              </button>
              <button style={S.card(cfg.hasOptionals)} onClick={() => updateConfig(selectedSection, { hasOptionals: true })}>
                <div style={{ fontSize:18, marginBottom:4 }}>🔀</div>
                <div style={{ fontSize:13, fontWeight:700, color: cfg.hasOptionals?"#3730a3":"#1c1b18" }}>YES — Optional Combinations</div>
                <div style={{ fontSize:11, color:"#6a6860", marginTop:2 }}>Students choose different subject combinations. Enable advanced scheduling.</div>
              </button>
            </div>
          </div>

          {cfg.hasOptionals && (
            <>
              {/* Step 4: Define optional lines */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1c1b18" }}>Optional Subject Lines</div>
                    <div style={{ fontSize:11, color:"#6a6860", marginTop:2 }}>Subjects in the same line run simultaneously — students pick one from each line.</div>
                  </div>
                  <button onClick={addLine}
                    style={{ padding:"6px 14px", borderRadius:7, border:"none", background:"#7C6FE0", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    + Add Line
                  </button>
                </div>

                {cfg.optionalLines.length === 0 && (
                  <div style={{ padding:"20px", textAlign:"center" as const, border:"1.5px dashed #e8e5de", borderRadius:10, color:"#a8a59e", fontSize:12 }}>
                    No optional lines yet. Click "+ Add Line" to create the first optional group.
                  </div>
                )}

                <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
                  {cfg.optionalLines.map((line, li) => {
                    const color = LINE_COLORS[li % LINE_COLORS.length]
                    return (
                      <div key={line.id} style={{ border:`2px solid ${color}33`, borderRadius:10, overflow:"hidden" }}>
                        {/* Line header */}
                        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:`${color}08` }}>
                          <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
                          <input value={line.name}
                            onChange={e => updateLine(line.id, { name: e.target.value })}
                            style={{ flex:1, fontSize:13, fontWeight:600, background:"transparent", border:"none", outline:"none", color:"#1c1b18" }} />
                          <span style={{ fontSize:11, color:"#a8a59e" }}>Subjects run in parallel — students pick 1</span>
                          <button onClick={() => removeLine(line.id)}
                            style={{ width:22, height:22, borderRadius:4, border:"none", background:"#fee2e2", color:"#dc2626", cursor:"pointer", fontSize:14 }}>×</button>
                        </div>
                        {/* Subjects in line */}
                        <div style={{ padding:"10px 14px", display:"flex", flexWrap:"wrap" as const, gap:8 }}>
                          {line.subjects.map((sub, si) => (
                            <div key={si} style={{ display:"flex", alignItems:"center", gap:4 }}>
                              <div style={{ position:"relative" as const }}>
                                <input value={sub}
                                  onChange={e => updateLineSubject(line.id, si, e.target.value)}
                                  placeholder={subjects[si]?.name ?? `Subject ${si+1}`}
                                  list={`subjects-list-${line.id}-${si}`}
                                  style={{ ...S.inp, width:150, paddingRight:24 }} />
                                <datalist id={`subjects-list-${line.id}-${si}`}>
                                  {subjects.map(s => <option key={s.id} value={s.name} />)}
                                </datalist>
                              </div>
                              {line.subjects.length > 1 && (
                                <button onClick={() => removeSubjectFromLine(line.id, si)}
                                  style={{ width:18, height:18, borderRadius:3, border:"none", background:"transparent", cursor:"pointer", color:"#c8c5bc", fontSize:14 }}>×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addSubjectToLine(line.id)}
                            style={{ padding:"5px 10px", borderRadius:6, border:`1px dashed ${color}`, background:"transparent", color, fontSize:11, cursor:"pointer" }}>
                            + Subject
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Step 5-6: Combinations and strengths */}
              {combos.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1c1b18", marginBottom:4 }}>
                    Student Distribution by Combination
                  </div>
                  <div style={{ fontSize:11, color:"#6a6860", marginBottom:12 }}>
                    Enter how many students in <strong>{selectedSection}</strong> choose each combination.
                    Total must equal {cfg.totalStudents} students.
                  </div>

                  <div style={{ border:"1.5px solid #e8e5de", borderRadius:10, overflow:"hidden" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#f7f6f2" }}>
                          <th style={{ padding:"8px 12px", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", textAlign:"left" as const, borderBottom:"1px solid #e8e5de" }}>Combination</th>
                          <th style={{ padding:"8px 12px", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", textAlign:"center" as const, borderBottom:"1px solid #e8e5de", width:120 }}>Students</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combos.map((combo, ci) => {
                          const strength = getStrength(combo.id)
                          return (
                            <tr key={combo.id} style={{ background: ci%2===0?"#fff":"#fafaf9" }}>
                              <td style={{ padding:"8px 12px", borderBottom:"1px solid #f0ede7", fontSize:12 }}>
                                <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                                  {combo.subjects.map((sub, si) => (
                                    <span key={si} style={S.tag(LINE_COLORS[si % LINE_COLORS.length])}>
                                      {sub}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding:"8px 12px", borderBottom:"1px solid #f0ede7", textAlign:"center" as const }}>
                                <input type="number" min={0} max={cfg.totalStudents}
                                  value={strength || ""}
                                  onChange={e => setStrength(combo.id, Math.max(0, +e.target.value))}
                                  placeholder="0"
                                  style={{ width:70, padding:"4px 8px", border:"1.5px solid #e8e5de", borderRadius:6, fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                              </td>
                            </tr>
                          )
                        })}
                        {/* Total row */}
                        <tr style={{ background:"#f7f6f2", borderTop:"2px solid #e8e5de" }}>
                          <td style={{ padding:"8px 12px", fontSize:12, fontWeight:700 }}>Total</td>
                          <td style={{ padding:"8px 12px", textAlign:"center" as const }}>
                            <span style={{ fontSize:13, fontWeight:700, fontFamily:"monospace",
                              color: validation?.valid ? "#7C6FE0" : "#dc2626" }}>
                              {validation?.total ?? 0} / {cfg.totalStudents}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Validation message */}
                  <div style={{ marginTop:8, padding:"8px 12px", borderRadius:7, fontSize:11, fontWeight:500,
                    background: validation?.valid ? "#f0fdf4" : "#fef2f2",
                    color: validation?.valid ? "#7C6FE0" : "#dc2626",
                    border: `1px solid ${validation?.valid ? "#D8D2FF" : "#fca5a5"}` }}>
                    {validation?.message}
                  </div>
                </div>
              )}

              {/* Step 7: Subject pools preview */}
              {validation?.valid && (
                <div style={{ background:"#eaecf8", border:"1.5px solid #D8D2FF", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#3730a3", marginBottom:8 }}>
                    📊 Subject Pool Preview (across all optional sections)
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
                    {store.subjectPools.map(pool => (
                      <div key={pool.subjectName} style={{ padding:"6px 12px", borderRadius:8, background:"#fff", border:"1px solid #D8D2FF", fontSize:11 }}>
                        <div style={{ fontWeight:700, color:"#3730a3" }}>{pool.subjectName}</div>
                        <div style={{ color:"#7C6FE0", fontFamily:"monospace", marginTop:2 }}>{pool.totalStudents} students</div>
                        <div style={{ color:"#a8a59e", fontSize:9, marginTop:1 }}>{pool.sections.join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:20, borderTop:"1px solid #e8e5de", marginTop:20 }}>
        <button onClick={() => setStep(3)} style={{ padding:"10px 20px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={() => setStep(4)} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"#7C6FE0", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  )
}
