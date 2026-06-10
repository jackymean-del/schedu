import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { ORG_CONFIGS } from "@/lib/orgData"
import type { TeacherPool } from "@/types"

// Parse numeric grade from string like "I","II","III","1","2","KG" etc.
function gradeToNum(g: string): number {
  const roman: Record<string,number> = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12 }
  if (roman[g.toUpperCase()]) return roman[g.toUpperCase()]
  const n = parseInt(g)
  return isNaN(n) ? 0 : n
}

const POOL_COLORS = ['#7C6FE0','#7C6FE0','#D4920E','#dc2626','#9B8EF5','#7C6FE0','#db2777']

export function Step4Pools() {
  const store = useTimetableStore()
  const { config, subjects, teacherPools, setTeacherPools, setStaff, setStep } = store
  const org = ORG_CONFIGS[config.orgType ?? "school"]
  const [expanded, setExpanded] = useState<string|null>(null)

  // Get unique base grades from config
  const numGrades = Math.max(1, Math.ceil((config.numSections ?? 8) / 5))

  const addPool = () => {
    const sub = subjects[teacherPools.length % Math.max(1,subjects.length)]
    const pool: TeacherPool = {
      id: crypto.randomUUID(),
      name: `${sub?.name ?? org.subjectLabel} Pool ${teacherPools.length + 1}`,
      subjectName: sub?.name ?? '',
      gradeRangeStart: 1,
      gradeRangeEnd: numGrades,
      teacherCount: 2,
      maxPeriodsPerWeek: 36,
      teachers: [],
    }
    setTeacherPools([...teacherPools, pool])
  }

  const updatePool = (id: string, updates: Partial<TeacherPool>) => {
    setTeacherPools(teacherPools.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const removePool = (id: string) => {
    setTeacherPools(teacherPools.filter(p => p.id !== id))
  }

  // Generate teacher names from pools → populate staff
  const handleContinue = () => {
    // Convert pools into individual staff entries for the solver
    const generatedStaff = teacherPools.flatMap(pool =>
      Array.from({ length: pool.teacherCount }, (_, i) => ({
        id: `${pool.id}-t${i+1}`,
        name: `${pool.name} ${i+1}`,
        role: pool.name,
        subjects: [pool.subjectName],
        classes: [],
        isClassTeacher: '',
        maxPeriodsPerWeek: pool.maxPeriodsPerWeek,
        poolId: pool.id,
        gradeRangeStart: pool.gradeRangeStart,
        gradeRangeEnd: pool.gradeRangeEnd,
      }))
    )
    setStaff(generatedStaff as any)
    setStep(5)
  }

  const totalTeachers = teacherPools.reduce((a, p) => a + p.teacherCount, 0)

  return (
    <div>
      <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, marginBottom:8 }}>
        {org.staffsLabel} Pools
      </h1>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:16, lineHeight:1.65 }}>
        Instead of adding individual {org.staffsLabel.toLowerCase()}, create <strong>pools</strong> by subject and grade range.
        Schedu auto-generates {org.staffsLabel.toLowerCase()} and assigns them optimally.
      </p>

      {/* How it works */}
      <div style={{ background:"#f0fdf4", border:"1.5px solid #D8D2FF", borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:12, color:"#14532d" }}>
        <div style={{ fontWeight:700, marginBottom:6 }}>How pools work:</div>
        <div style={{ lineHeight:1.8 }}>
          1. Create a pool for each subject + grade group (e.g. "Primary Maths" for grades 1–5)<br/>
          2. Set how many {org.staffsLabel.toLowerCase()} are in that pool<br/>
          3. Schedu auto-names them: <strong>Primary Maths Teacher 1</strong>, <strong>Primary Maths Teacher 2</strong>, etc.<br/>
          4. The solver assigns only eligible {org.staffsLabel.toLowerCase()} (matching grade range) to each class
        </div>
      </div>

      {/* Example */}
      <div style={{ background:"#eaecf8", borderLeft:"4px solid #7C6FE0", borderRadius:"0 8px 8px 0", padding:"10px 14px", marginBottom:20, fontSize:12, color:"#3730a3" }}>
        📋 Example: | Pool: "Primary Maths" | Subject: Maths | Grades: 1–5 | Count: 4 |<br/>
        → Auto-generates: Primary Maths Teacher 1, 2, 3, 4 (only assigned to Grades 1–5)
      </div>

      {/* Pool cards */}
      <div style={{ display:"flex", flexDirection:"column" as const, gap:10, marginBottom:16 }}>
        {teacherPools.map((pool, pi) => {
          const color = POOL_COLORS[pi % POOL_COLORS.length]
          const isExp = expanded === pool.id
          return (
            <div key={pool.id} style={{ border:`2px solid ${color}22`, borderRadius:12, overflow:"hidden" }}>
              {/* Pool header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:`${color}0d`, borderBottom: isExp?`1px solid ${color}22`:"none" }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
                <input value={pool.name} onChange={e => updatePool(pool.id, { name: e.target.value })}
                  style={{ flex:1, fontSize:14, fontWeight:600, background:"transparent", border:"none", outline:"none", color:"#1c1b18" }}
                  placeholder="Pool name (e.g. Primary Maths Teachers)" />
                <span style={{ fontSize:11, color:"#6a6860", background:"#fff", padding:"3px 10px", borderRadius:20, border:"1px solid #e8e5de", whiteSpace:"nowrap" as const }}>
                  {pool.teacherCount} {org.staffsLabel.toLowerCase()}
                </span>
                <button onClick={() => setExpanded(isExp ? null : pool.id)}
                  style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #e8e5de", background:"#fff", fontSize:11, cursor:"pointer", color:"#6a6860" }}>
                  {isExp ? "▲ Collapse" : "▼ Edit"}
                </button>
                <button onClick={() => removePool(pool.id)}
                  style={{ width:24, height:24, borderRadius:4, border:"none", background:"#fee2e2", color:"#dc2626", cursor:"pointer", fontSize:16 }}>
                  ×
                </button>
              </div>

              {/* Summary row (always visible) */}
              {!isExp && (
                <div style={{ display:"flex", gap:24, padding:"8px 14px", fontSize:11, color:"#6a6860" }}>
                  <span>📖 Subject: <strong style={{ color:"#1c1b18" }}>{pool.subjectName || "—"}</strong></span>
                  <span>📊 Grades: <strong style={{ color:"#1c1b18" }}>{pool.gradeRangeStart}–{pool.gradeRangeEnd}</strong></span>
                  <span>👤 Count: <strong style={{ color:"#1c1b18" }}>{pool.teacherCount}</strong></span>
                  <span>⏱ Max/week: <strong style={{ color:"#1c1b18" }}>{pool.maxPeriodsPerWeek}</strong></span>
                </div>
              )}

              {/* Expanded edit form */}
              {isExp && (
                <div style={{ padding:"14px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {/* Subject */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", marginBottom:5 }}>Subject / Resource</div>
                    <select value={pool.subjectName} onChange={e => updatePool(pool.id, { subjectName: e.target.value })}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e8e5de", fontSize:12, background:"#fff", outline:"none", cursor:"pointer" }}>
                      <option value="">— Select subject —</option>
                      {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>

                  {/* Teacher count */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", marginBottom:5 }}>Number of {org.staffsLabel}</div>
                    <input type="number" min={1} max={50} value={pool.teacherCount}
                      onChange={e => updatePool(pool.id, { teacherCount: Math.max(1, +e.target.value) })}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e8e5de", fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                    <div style={{ fontSize:10, color:"#6a6860", marginTop:4 }}>
                      Will auto-generate: {pool.name} 1 … {pool.name} {pool.teacherCount}
                    </div>
                  </div>

                  {/* Grade range */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", marginBottom:5 }}>Grade Range (Eligible)</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <input type="number" min={1} max={12} value={pool.gradeRangeStart}
                        onChange={e => updatePool(pool.id, { gradeRangeStart: Math.max(1, +e.target.value) })}
                        style={{ width:60, padding:"8px", borderRadius:8, border:"1.5px solid #e8e5de", fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                      <span style={{ color:"#a8a59e", fontSize:12 }}>to</span>
                      <input type="number" min={1} max={12} value={pool.gradeRangeEnd}
                        onChange={e => updatePool(pool.id, { gradeRangeEnd: Math.max(pool.gradeRangeStart, +e.target.value) })}
                        style={{ width:60, padding:"8px", borderRadius:8, border:"1.5px solid #e8e5de", fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                      <span style={{ fontSize:11, color:"#6a6860" }}>Only assigned to classes in this range</span>
                    </div>
                  </div>

                  {/* Max periods */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, color:"#a8a59e", marginBottom:5 }}>Max {org.loadUnit}/week per {org.staffLabel}</div>
                    <input type="number" min={1} max={60} value={pool.maxPeriodsPerWeek}
                      onChange={e => updatePool(pool.id, { maxPeriodsPerWeek: Math.max(1, +e.target.value) })}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1.5px solid #e8e5de", fontSize:13, fontFamily:"monospace", textAlign:"center" as const, outline:"none" }} />
                  </div>

                  {/* Preview */}
                  <div style={{ gridColumn:"1/-1", background:"#f7f6f2", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#374151" }}>
                    <div style={{ fontWeight:600, marginBottom:6 }}>✨ Auto-generated {org.staffsLabel.toLowerCase()}:</div>
                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                      {Array.from({ length: Math.min(pool.teacherCount, 6) }, (_, i) => (
                        <span key={i} style={{ padding:"3px 10px", borderRadius:20, background:`${color}15`, color, fontSize:11, fontWeight:500, border:`1px solid ${color}30` }}>
                          {pool.name} {i+1}
                        </span>
                      ))}
                      {pool.teacherCount > 6 && <span style={{ fontSize:11, color:"#a8a59e" }}>+{pool.teacherCount-6} more...</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add pool button */}
      <button onClick={addPool}
        style={{ width:"100%", padding:"12px", borderRadius:10, border:"1.5px dashed #d4d1c8", background:"transparent", fontSize:13, color:"#6a6860", cursor:"pointer", fontWeight:500, marginBottom:16 }}>
        ＋ Add {org.staffLabel} Pool
      </button>

      {/* Summary */}
      {teacherPools.length > 0 && (
        <div style={{ background:"#f0fdf4", border:"1px solid #D8D2FF", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#14532d" }}>
          ✅ <strong>{teacherPools.length} pools</strong> · <strong>{totalTeachers} {org.staffsLabel.toLowerCase()}</strong> will be auto-generated
          {teacherPools.map(p => ` · ${p.name} (${p.teacherCount})`).join('')}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={() => setStep(3)} style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, fontWeight:500, cursor:"pointer" }}>← Back</button>
        <button onClick={handleContinue} disabled={teacherPools.length === 0}
          style={{ padding:"9px 18px", borderRadius:8, border:"none", fontSize:13, fontWeight:600, cursor: teacherPools.length>0?"pointer":"not-allowed", background: teacherPools.length>0?"#7C6FE0":"#d4d1c8", color:"#fff" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  )
}
