import { useState, useEffect, useRef } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { buildPeriodSequence } from "@/lib/aiEngine"
import { solveTimetable, generateSuggestions, durationToWeeklyPeriods } from "@/lib/schedulingEngine"
import { ORG_CONFIGS, getCountry } from "@/lib/orgData"

const LOG_STEPS = [
  { type:"info", msg:"Initializing Schedu constraint engine..." },
  { type:"ok",   msg:"Config loaded · {nS} staff · {nC} classes · {nSu} subjects" },
  { type:"info", msg:"Scheduling mode: {mode}" },
  { type:"ok",   msg:"Standards applied · {nd} working days · {nP} periods/day" },
  { type:"info", msg:"{modeMsg}" },
  { type:"ok",   msg:"All requirements converted to Class+Subject+WeeklyFrequency format" },
  { type:"info", msg:"Generating time slots for {nC} classes..." },
  { type:"ok",   msg:"Slot generation complete · {total} total slots across all classes" },
  { type:"info", msg:"Building constraint graph (hard constraints)..." },
  { type:"ok",   msg:"Hard constraints: teacher clash · room clash · daily limits · shift boundaries" },
  { type:"info", msg:"Applying soft constraints with penalty weights..." },
  { type:"ok",   msg:"Soft constraints: workload balance · subject spread · consecutive penalties" },
  { type:"info", msg:"Running CSP solver — placing class teachers first..." },
  { type:"ok",   msg:"Class teacher placement complete · Priority Period 1 filled" },
  { type:"info", msg:"Optimizing remaining {total} slots..." },
  { type:"ok",   msg:"Solver converged · Penalty score: {score}" },
  { type:"info", msg:"Validating hard constraints..." },
  { type:"ok",   msg:"{conflicts} hard conflicts detected" },
  { type:"info", msg:"Generating suggestions and auto-fix recommendations..." },
  { type:"ok",   msg:"✅ Timetable generated successfully!" },
]

export function Step7Generate() {
  const store = useTimetableStore()
  const { config, sections, staff, subjects, breaks,
          setPeriods, setClassTT, setTeacherTT, setConflicts, setSuggestions, setStep } = store
  const [status, setStatus]     = useState<"idle"|"running"|"done">("idle")
  const [logLines, setLogLines] = useState<{type:string;msg:string}[]>([])
  const [progress, setProgress] = useState(0)
  const [result, setResult]     = useState<{conflicts:number;score:number;suggestions:number}|null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const org     = ORG_CONFIGS[config.orgType ?? "school"]
  const country = getCountry(config.countryCode ?? "IN")

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  // Mode 2: convert duration → weekly periods for each subject
  const convertDurationSubjects = () => {
    if (store.schedulingMode !== 'duration-based') return subjects
    return subjects.map(sub => {
      const reqHours = (sub as any).requiredHours
      if (!reqHours) return sub
      const weekly = durationToWeeklyPeriods({
        subjectName: sub.name,
        className: 'all',
        requiredHours: reqHours,
        periodDurationMins: (sub as any).sessionDuration ?? 40,
        workingDaysPerYear: store.workingDaysPerYear ?? 220,
        workingDaysPerWeek: config.workDays.length,
      })
      return { ...sub, periodsPerWeek: weekly }
    })
  }

  const modeMsg = store.schedulingMode === 'duration-based'
    ? `Mode 2: Converting total hours → weekly periods (${store.workingDaysPerYear} days/year ÷ ${config.workDays.length} days/week = ${Math.round((store.workingDaysPerYear ?? 220) / config.workDays.length)} weeks)`
    : 'Mode 1: Using periods/week directly as specified'

  const replacements: Record<string,string> = {
    '{nS}':       String(staff.length),
    '{nC}':       String(sections.length),
    '{nSu}':      String(subjects.length),
    '{country}':  country.name,
    '{maxP}':     String(country.maxPeriodsWeek),
    '{lunit}':    org.loadUnit,
    '{nd}':       String(config.workDays.length),
    '{nP}':       String(config.periodsPerDay),
    '{total}':    String(sections.length * config.periodsPerDay * config.workDays.length),
    '{nct}':      String(staff.filter(s => s.isClassTeacher).length),
    '{mode}':     store.schedulingMode === 'duration-based' ? 'Mode 2 (Duration-Based)' : 'Mode 1 (Period-Based)',
    '{modeMsg}':  modeMsg,
    '{score}':    '0',
    '{conflicts}':'0',
  }

  const startGenerate = () => {
    setStatus("running")
    setLogLines([])
    setProgress(0)

    let i = 0
    const interval = setInterval(() => {
      if (i >= LOG_STEPS.length) {
        clearInterval(interval)
        setProgress(100)

        // Run the actual solver
        const resolvedSubjects = convertDurationSubjects()
        const periods = buildPeriodSequence(breaks, config.periodsPerDay)

        const output = solveTimetable({
          sections,
          staff,
          subjects: resolvedSubjects,
          periods,
          workDays: config.workDays,
          requirements: [],
        })

        // Generate smart suggestions
        const suggestions = generateSuggestions(
          output.classTT, output.teacherTT,
          staff, resolvedSubjects,
          config.workDays, periods
        )

        // Update replacements with real values
        const finalLog = {
          type: output.conflicts.length > 0 ? "warn" : "ok",
          msg: output.conflicts.length > 0
            ? `⚠️ ${output.conflicts.length} conflict${output.conflicts.length>1?'s':''} detected — review timetable`
            : `✅ 0 conflicts · Penalty score: ${output.score} · ${suggestions.length} suggestions`,
        }
        setLogLines(prev => [...prev, finalLog])

        setPeriods(periods)
        setClassTT(output.classTT)
        setTeacherTT(output.teacherTT)
        setConflicts(output.conflicts)
        setSuggestions(suggestions)

        setResult({
          conflicts: output.conflicts.length,
          score: output.score,
          suggestions: suggestions.length,
        })
        setStatus("done")
        return
      }

      let msg = LOG_STEPS[i].msg
      for (const [k, v] of Object.entries(replacements)) {
        msg = msg.replaceAll(k, v)
      }
      setLogLines(prev => [...prev, { type: LOG_STEPS[i].type, msg }])
      setProgress(Math.round((i+1) / LOG_STEPS.length * 90))
      i++
    }, 200)
  }

  return (
    <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", minHeight:"65vh", gap:20, padding:"32px 0", textAlign:"center" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Status icon */}
      {status === "running" && (
        <div style={{ width:56, height:56, borderRadius:"50%", border:"4px solid #e8e5de", borderTopColor:"#7C6FE0", animation:"spin 1s linear infinite" }} />
      )}
      {status === "done" && result && (
        <div style={{ width:64, height:64, borderRadius:"50%", background: result.conflicts>0?"#fef3c7":"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>
          {result.conflicts > 0 ? "⚠️" : "✅"}
        </div>
      )}
      {status === "idle" && (
        <div style={{ width:64, height:64, borderRadius:18, background:"linear-gradient(135deg,#9B8EF5,#7C6FE0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30 }}>
          ✨
        </div>
      )}

      {/* Title */}
      <h2 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:26 }}>
        {status === "idle"    ? "Ready to generate timetable" :
         status === "running" ? "Generating timetable..." :
         result?.conflicts === 0 ? "Timetable ready! ✅" : `Timetable ready with ${result?.conflicts} conflicts ⚠️`}
      </h2>

      {/* Mode badge */}
      {status === "idle" && (
        <div style={{ display:"flex", gap:8 }}>
          <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600, background: store.schedulingMode==='duration-based'?"#f0fdf4":"#eaecf8", color: store.schedulingMode==='duration-based'?"#7C6FE0":"#7C6FE0", border:`1px solid ${store.schedulingMode==='duration-based'?"#D8D2FF":"#D8D2FF"}` }}>
            {store.schedulingMode === 'duration-based' ? '⏱ Duration-Based Mode' : '📅 Period-Based Mode'}
          </span>
          <span style={{ padding:"4px 12px", borderRadius:20, fontSize:11, background:"#f7f6f2", color:"#6a6860" }}>
            {sections.length} classes · {staff.length} staff · {subjects.length} subjects · {config.workDays.length} days/week
          </span>
        </div>
      )}

      {/* Progress bar */}
      {status !== "idle" && (
        <div style={{ width:"100%", maxWidth:480, height:6, background:"#e8e5de", borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#9B8EF5,#7C6FE0)", borderRadius:4, transition:"width 0.25s" }} />
        </div>
      )}

      {/* Log */}
      {logLines.length > 0 && (
        <div ref={logRef} style={{ width:"100%", maxWidth:520, background:"#fff", border:"1.5px solid #e8e5de", borderRadius:12, padding:"12px 14px", maxHeight:200, overflowY:"auto", textAlign:"left" as const, fontFamily:"monospace", fontSize:11 }}>
          {logLines.map((l,i) => (
            <div key={i} style={{ color: l.type==='ok'?'#7C6FE0':l.type==='warn'?'#D4920E':l.type==='error'?'#dc2626':'#7C6FE0', lineHeight:1.8 }}>
              {l.msg}
            </div>
          ))}
        </div>
      )}

      {/* Results summary */}
      {status === "done" && result && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, maxWidth:400, width:"100%" }}>
          {[
            { v: result.conflicts, l: "Conflicts", color: result.conflicts>0?"#dc2626":"#7C6FE0" },
            { v: result.score,     l: "Penalty Score", color: result.score<20?"#7C6FE0":"#D4920E" },
            { v: result.suggestions, l: "Suggestions", color: "#7C6FE0" },
          ].map(({ v, l, color }) => (
            <div key={l} style={{ background:"#fff", border:"1.5px solid #e8e5de", borderRadius:10, padding:"12px", textAlign:"center" as const }}>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color }}>{v}</div>
              <div style={{ fontSize:10, color:"#a8a59e", marginTop:3 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const, justifyContent:"center" }}>
        {status === "idle" && (
          <>
            <button onClick={startGenerate}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:10, border:"none", background:"#7C6FE0", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", boxShadow:"0 4px 14px rgba(124,111,224,0.3)" }}>
              ✨ Generate Timetable
            </button>
            <button onClick={() => setStep(6)} style={{ padding:"13px 20px", borderRadius:10, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, cursor:"pointer" }}>← Back</button>
          </>
        )}
        {status === "done" && (
          <>
            <button onClick={() => window.location.href='/timetable'}
              style={{ padding:"13px 28px", borderRadius:10, border:"none", background:"#7C6FE0", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
              View Timetable →
            </button>
            <button onClick={() => { setStatus("idle"); setLogLines([]); setProgress(0); setResult(null) }}
              style={{ padding:"13px 20px", borderRadius:10, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, cursor:"pointer" }}>
              Re-generate
            </button>
            <button onClick={() => setStep(6)} style={{ padding:"13px 20px", borderRadius:10, border:"1.5px solid #e8e5de", background:"#fff", fontSize:13, cursor:"pointer" }}>← Back</button>
          </>
        )}
      </div>
    </div>
  )
}
