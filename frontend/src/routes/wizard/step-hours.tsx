import { useState, useMemo } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { generateSections, generateStaff, generateSubjects, generateBreaks } from "@/lib/orgData"
import type { Subject } from "@/types"

// ─── Types ────────────────────────────────────────────────────
interface ClassConfig {
  classId: string   // section id
  className: string
  periodsPerWeek: number
  sessionDuration: number    // minutes per session (maps to Subject.sessionDuration)
  maxPeriodsPerDay: number   // max periods per day (maps to Subject.maxPeriodsPerDay)
}

// ─── Helpers ─────────────────────────────────────────────────
const CBSE_NORMS: Record<string, number> = {
  "Mathematics": 6, "English": 5, "Hindi": 5, "Science": 6,
  "Social Studies": 5, "Computer": 3, "Physical Education": 3,
  "Art & Craft": 2, "Music": 2, "Dance": 2, "EVS": 4,
  "G.K.": 1, "CCA": 2, "Odia": 4,
}

function getCbseSuggestion(subjectName: string): number {
  return CBSE_NORMS[subjectName] ?? 4
}

export function StepHours() {
  const { config, sections, subjects, staff, setSubjects, setStep, setConfig, setBreaks } = useTimetableStore()
  const store = useTimetableStore()

  // ── Generate data if store is empty ──────────────────────────
  const needsGenerate = sections.length === 0 || subjects.length === 0 || staff.length === 0
  const handleGenerate = () => {
    const orgType = config.orgType ?? "school"
    const cc      = config.countryCode ?? "IN"
    store.setSections(generateSections(orgType, cc, config.numSections))
    store.setStaff(generateStaff(orgType, cc, config.numStaff))
    store.setSubjects(generateSubjects(orgType, cc, config.numSubjects) as Subject[])
    setBreaks(generateBreaks(orgType, config.numBreaks))
  }

  // Local per-subject-per-class overrides: subjectId → classId → ClassConfig partial
  const [overrides, setOverrides] = useState<Record<string, Record<string, Partial<ClassConfig>>>>({})

  // Base class names (unique, derived from section names)
  const baseClasses = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    sections.forEach(s => {
      const m = s.name.match(/^(.+?)[\s\-–]?([A-E\d])$/i)
      const base = m ? m[1].trim() : s.name
      if (!seen.has(base)) seen.set(base, { id: s.id, name: base })
    })
    return [...seen.values()].slice(0, 12) // cap at 12 classes for display
  }, [sections])

  const getVal = (subId: string, classId: string, key: keyof ClassConfig, globalVal: number): number => {
    return (overrides[subId]?.[classId]?.[key] as number) ?? globalVal
  }

  const setOverride = (subId: string, classId: string, key: keyof ClassConfig, val: number) => {
    setOverrides(prev => ({
      ...prev,
      [subId]: {
        ...(prev[subId] ?? {}),
        [classId]: {
          ...(prev[subId]?.[classId] ?? {}),
          [key]: val,
        }
      }
    }))
  }

  const isOverridden = (subId: string, classId: string) =>
    !!overrides[subId]?.[classId] && Object.keys(overrides[subId][classId]).length > 0

  const clearOverride = (subId: string, classId: string) => {
    setOverrides(prev => {
      const next = { ...prev }
      if (next[subId]) {
        next[subId] = { ...next[subId] }
        delete next[subId][classId]
      }
      return next
    })
  }

  // Total weekly periods for a class across all subjects
  const totalForClass = (classId: string) =>
    subjects.reduce((sum, s) => sum + getVal(s.id, classId, "periodsPerWeek", s.periodsPerWeek ?? getCbseSuggestion(s.name)), 0)

  // Apply CBSE auto-fill (global)
  const autoCbse = () => {
    setSubjects(subjects.map(s => ({
      ...s,
      periodsPerWeek: getCbseSuggestion(s.name),
      sessionDuration: s.sessionDuration ?? 45,
      maxPeriodsPerDay: s.maxPeriodsPerDay ?? 2,
    })))
  }

  const handleContinue = () => {
    // Persist class-wise overrides into subject.classConfigs
    setSubjects(subjects.map(s => {
      const classConfigs = Object.entries(overrides[s.id] ?? {}).map(([classId, ov]) => ({
        classId,
        sectionName: baseClasses.find(c => c.id === classId)?.name ?? classId,
        periodsPerWeek: (ov.periodsPerWeek ?? s.periodsPerWeek ?? getCbseSuggestion(s.name)),
        sessionDuration: (ov.sessionDuration ?? s.sessionDuration ?? 45),
        maxPeriodsPerDay: (ov.maxPeriodsPerDay ?? s.maxPeriodsPerDay ?? 2),
      }))
      return { ...s, classConfigs: classConfigs.length ? classConfigs : (s.classConfigs ?? []) }
    }))
    setStep(5)
  }

  const periodsPerDay = config.periodsPerDay ?? 8
  const workDaysCount = config.workDays?.length ?? 6
  const totalSlotsPerClass = periodsPerDay * workDaysCount

  // ── Styles ──
  const thS: React.CSSProperties = {
    padding:"7px 10px", background:"#f7f6f2", fontSize:10, fontWeight:700,
    textTransform:"uppercase", letterSpacing:"0.06em", color:"#a8a59e",
    textAlign:"center", borderBottom:"1.5px solid #e8e5de",
    whiteSpace:"nowrap", position:"sticky", top:0, zIndex:2,
  }
  const thLeft: React.CSSProperties = { ...thS, textAlign:"left", position:"sticky", left:0, zIndex:3, background:"#f7f6f2" }
  const tdS: React.CSSProperties = { padding:"5px 6px", borderBottom:"1px solid #f0ede7", verticalAlign:"middle", textAlign:"center" }
  const tdLeft: React.CSSProperties = { ...tdS, textAlign:"left", position:"sticky", left:0, background:"#fff", zIndex:1, borderRight:"1px solid #e8e5de" }
  const numInp: React.CSSProperties = {
    width:34, padding:"3px 4px", border:"1px solid #e8e5de", borderRadius:5,
    fontSize:12, fontFamily:"monospace", textAlign:"center", outline:"none",
    background:"#fff",
  }

  if (needsGenerate) {
    return (
      <div style={{ textAlign:"center", padding:"48px 24px" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⚙️</div>
        <h2 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:22, marginBottom:8 }}>No resource data yet</h2>
        <p style={{ color:"#6a6860", fontSize:13, marginBottom:24 }}>
          Go back and complete the Resources step, or generate placeholder data now.
        </p>
        <button onClick={handleGenerate}
          style={{ padding:"11px 28px", borderRadius:9, border:"none", fontSize:14, fontWeight:600, cursor:"pointer", background:"#7C6FE0", color:"#fff" }}>
          ✨ Generate Placeholder Data
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#9B8EF5,#6358C4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📊</div>
        <div>
          <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, margin:0 }}>Subject Hours Matrix</h1>
          <p style={{ color:"#6a6860", fontSize:12, margin:0 }}>Step 4 of 6 — Periods/Week per Subject per Class</p>
        </div>
      </div>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:16, lineHeight:1.7 }}>
        Set how many periods per week each subject gets. Global values apply to all classes — click any cell to override for a specific class. Purple cells indicate class-specific values.
      </p>

      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={autoCbse}
          style={{ padding:"7px 14px", borderRadius:8, border:"1.5px solid #9B8EF5", background:"#f5f3ff", fontSize:12, fontWeight:600, cursor:"pointer", color:"#6358C4" }}>
          🏫 Auto-fill CBSE norms
        </button>
        <div style={{ fontSize:11, color:"#6a6860" }}>
          📅 {workDaysCount} days/week · {periodsPerDay} periods/day · {totalSlotsPerClass} slots/class/week
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <span style={{ display:"inline-block", width:12, height:12, borderRadius:2, background:"#9B8EF520", border:"1.5px solid #9B8EF5" }} />
          <span style={{ fontSize:10, color:"#6a6860" }}>Class-specific override</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, overflow:"hidden" }}>
        <div style={{ overflowX:"auto", maxHeight:"calc(100vh - 340px)", overflowY:"auto" }}>
          <table style={{ borderCollapse:"collapse", tableLayout:"fixed" as const }}>
            <thead>
              <tr>
                <th style={{...thLeft, width:160, minWidth:160}}>Subject</th>
                <th style={{...thS, width:80}}>Global<br/><span style={{ fontWeight:400, textTransform:"none", fontSize:9 }}>Per/wk</span></th>
                <th style={{...thS, width:60}}>Min<br/><span style={{ fontWeight:400, textTransform:"none", fontSize:9 }}>/ sess.</span></th>
                <th style={{...thS, width:60}}>Max<br/><span style={{ fontWeight:400, textTransform:"none", fontSize:9 }}>/ day</span></th>
                <th style={{...thS, width:8, background:"#e8e5de"}}></th>
                {baseClasses.map(c => (
                  <th key={c.id} style={{...thS, width:90, minWidth:90}}>
                    <div style={{ fontWeight:700, color:"#1c1b18", fontSize:11 }}>{c.name}</div>
                    <div style={{ fontSize:8, fontWeight:400, color: totalForClass(c.id) > totalSlotsPerClass ? "#ef4444" : "#7C6FE0" }}>
                      {totalForClass(c.id)}/{totalSlotsPerClass} used
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, si) => {
                const globalPw  = s.periodsPerWeek ?? getCbseSuggestion(s.name)
                const globalMin = s.sessionDuration ?? 45
                const globalMax = s.maxPeriodsPerDay ?? 2

                return (
                  <tr key={s.id} style={{ background: si%2===0?"#fff":"#fafaf9" }}>
                    {/* Subject name (sticky) */}
                    <td style={{...tdLeft, background: si%2===0?"#fff":"#fafaf9"}}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#1c1b18" }}>{s.name}</div>
                      {s.isOptional && (
                        <span style={{ fontSize:9, padding:"1px 5px", borderRadius:10, background:"#f5f3ff", color:"#9B8EF5", fontWeight:600 }}>Optional</span>
                      )}
                    </td>

                    {/* Global Per/wk */}
                    <td style={tdS}>
                      <input type="number" min={0} max={14} value={globalPw}
                        style={numInp}
                        onChange={e => {
                          const v = Math.max(0, +e.target.value)
                          setSubjects(subjects.map(x => x.id === s.id ? { ...x, periodsPerWeek: v } : x))
                        }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor="#9B8EF5"}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor="#e8e5de"} />
                    </td>

                    {/* Global Session duration (min) */}
                    <td style={tdS}>
                      <input type="number" min={20} max={120} value={globalMin}
                        style={numInp}
                        title="Session duration (minutes)"
                        onChange={e => {
                          const v = Math.max(20, +e.target.value)
                          setSubjects(subjects.map(x => x.id === s.id ? { ...x, sessionDuration: v } : x))
                        }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor="#9B8EF5"}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor="#e8e5de"} />
                    </td>

                    {/* Global Max/day */}
                    <td style={tdS}>
                      <input type="number" min={1} max={4} value={globalMax}
                        style={numInp}
                        title="Max periods per day"
                        onChange={e => {
                          const v = Math.max(1, +e.target.value)
                          setSubjects(subjects.map(x => x.id === s.id ? { ...x, maxPeriodsPerDay: v } : x))
                        }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor="#9B8EF5"}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor="#e8e5de"} />
                    </td>

                    {/* Divider */}
                    <td style={{ borderBottom:"1px solid #f0ede7", background:"#f0ede7", width:8 }} />

                    {/* Per-class cells */}
                    {baseClasses.map(c => {
                      const ov = isOverridden(s.id, c.id)
                      const cPw  = getVal(s.id, c.id, "periodsPerWeek", globalPw)
                      const cMin = getVal(s.id, c.id, "sessionDuration", globalMin)
                      const cMax = getVal(s.id, c.id, "maxPeriodsPerDay", globalMax)

                      return (
                        <td key={c.id} style={{
                          ...tdS, padding:"4px 6px",
                          background: ov ? "#9B8EF510" : "transparent",
                          border: ov ? "1px solid #9B8EF540" : undefined,
                        }}>
                          <div style={{ display:"flex", gap:3, justifyContent:"center", alignItems:"center" }}>
                            <input type="number" min={0} max={14} value={cPw}
                              title="Periods/week"
                              style={{ ...numInp, width:28, background: ov?"#f5f3ff":"#fff", borderColor: ov?"#c4b5fd":"#e8e5de" }}
                              onChange={e => setOverride(s.id, c.id, "periodsPerWeek", Math.max(0, +e.target.value))}
                              onFocus={e => (e.target as HTMLInputElement).style.borderColor="#9B8EF5"}
                              onBlur={e => (e.target as HTMLInputElement).style.borderColor=ov?"#c4b5fd":"#e8e5de"} />
                          </div>
                          {ov && (
                            <div style={{ display:"flex", justifyContent:"center", marginTop:2 }}>
                              <button onClick={() => clearOverride(s.id, c.id)}
                                style={{ fontSize:8, color:"#9B8EF5", background:"none", border:"none", cursor:"pointer", padding:0, textDecoration:"underline" }}>
                                reset
                              </button>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ background:"#f7f6f2", borderTop:"2px solid #e8e5de" }}>
                <td style={{...tdLeft, background:"#f7f6f2", fontSize:11, fontWeight:700, color:"#374151"}}>Total / Class</td>
                <td style={tdS}>
                  <span style={{ fontSize:11, fontWeight:700, fontFamily:"monospace" }}>
                    {subjects.reduce((s, sub) => s + (sub.periodsPerWeek ?? getCbseSuggestion(sub.name)), 0)}
                  </span>
                </td>
                <td style={tdS} colSpan={2} />
                <td style={{ background:"#e8e5de" }} />
                {baseClasses.map(c => {
                  const total = totalForClass(c.id)
                  const over  = total > totalSlotsPerClass
                  return (
                    <td key={c.id} style={{...tdS, fontWeight:700, fontFamily:"monospace", fontSize:12, color: over?"#ef4444":"#7C6FE0" }}>
                      {total}
                      {over && <div style={{ fontSize:8, color:"#ef4444" }}>-{total - totalSlotsPerClass} over</div>}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ marginTop:12, padding:"9px 14px", background:"#EDE9FF", border:"1px solid #e9d5ff", borderRadius:8, fontSize:11, color:"#6358C4", lineHeight:1.7 }}>
        💡 <strong>Tip:</strong> Click a class column cell to override periods for that specific class.
        Grey = using global value. Purple = class-specific override. Red total = overloaded (exceeds {totalSlotsPerClass} weekly slots).
      </div>

      {/* Footer */}
      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, marginTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(3)}
          style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>
          ← Back
        </button>
        <button onClick={handleContinue}
          style={{ padding:"11px 28px", borderRadius:9, border:"none", fontSize:14, fontWeight:600, cursor:"pointer", background:"#9B8EF5", color:"#fff" }}>
          Continue → Review & Generate
        </button>
      </div>
    </div>
  )
}
