import { useState } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import type { BoardType } from "@/types"

const BOARDS = [
  { value:"CBSE",      label:"CBSE",      sub:"Central Board of Secondary Education" },
  { value:"ICSE",      label:"ICSE",      sub:"Council for the Indian School Certificate" },
  { value:"STATE",     label:"State",     sub:"State Board Curriculum" },
  { value:"IB",        label:"IB",        sub:"International Baccalaureate" },
  { value:"CAMBRIDGE", label:"Cambridge", sub:"IGCSE / A-Level" },
  { value:"OTHER",     label:"Other",     sub:"Custom / Other Curriculum" },
]

const TIMEZONES = [
  "Asia/Kolkata","Asia/Dubai","Asia/Singapore","Asia/Tokyo","Asia/Karachi",
  "Asia/Dhaka","Asia/Colombo","Europe/London","America/New_York","Australia/Sydney",
]

const GRADE_GROUPS = [
  { id:"pre",       label:"Pre-School",               grades:"Nursery, LKG, UKG",  profile:"fixed",    color:"#7C6FE0",  desc:"Students stay fixed, teachers rotate" },
  { id:"primary",   label:"Primary  (Class I – V)",   grades:"I, II, III, IV, V",  profile:"fixed",    color:"#7C6FE0",  desc:"Students stay fixed, teachers rotate" },
  { id:"middle",    label:"Middle   (Class VI – VIII)",grades:"VI, VII, VIII",      profile:"standard", color:"#7C6FE0",  desc:"Subject-wise teaching, teacher movement" },
  { id:"secondary", label:"Secondary (Class IX – X)",  grades:"IX, X",              profile:"standard", color:"#7C6FE0",  desc:"Subject-wise teaching, teacher movement" },
  { id:"senior",    label:"Senior Secondary (XI – XII)",grades:"XI, XII",           profile:"dynamic",  color:"#9B8EF5",  desc:"Optional subjects, instructional clusters, parallel blocks" },
]

const MODE_LABEL: Record<string,string> = {
  fixed:"Mode 1 — Fixed Classroom", standard:"Mode 2 — Standard", dynamic:"Mode 3 — Dynamic Elective"
}

const h = (text: string): React.CSSProperties => ({})

export function Step1Org() {
  const { config, setConfig, setStep } = useTimetableStore()

  const [name,        setName]        = useState<string>(config.schoolName ?? "")
  const [board,       setBoard]       = useState<BoardType>(config.board ?? "CBSE")
  const [year,        setYear]        = useState<string>(config.academicYear ?? "2025-26")
  const [tz,          setTz]          = useState<string>(config.timezone ?? "Asia/Kolkata")
  const [groups,      setGroups]      = useState<string[]>(config.gradeGroups ?? ["primary","middle","secondary"])
  // Controlled count inputs — always reflect exactly what will be generated
  const [numSections, setNumSections] = useState<number>(config.numSections ?? 20)
  const [numStaff,    setNumStaff]    = useState<number>(config.numStaff ?? 10)
  const [numSubjects, setNumSubjects] = useState<number>(config.numSubjects ?? 8)

  const toggle = (id: string) =>
    setGroups(g => g.includes(id) ? g.filter(x => x !== id) : [...g, id])

  const hasXIXII = groups.includes("senior")
  const canContinue = name.trim().length > 0 && groups.length > 0

  const handleContinue = () => {
    setConfig({
      orgType: "school",
      schoolName: name, board, academicYear: year, timezone: tz,
      gradeGroups: groups,
      numSections, numStaff, numSubjects,
    })
    setStep(2)
  }

  const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    width:"100%", padding:"10px 14px", border:"1.5px solid #e8e5de", borderRadius:9,
    fontSize:14, outline:"none", boxSizing:"border-box" as const, ...extra,
  })
  const lbl: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.07em", color:"#a8a59e", marginBottom:7 }
  const fieldBox: React.CSSProperties = { display:"flex", flexDirection:"column" as const, gap:6 }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#7C6FE0,#9B8EF5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🏫</div>
        <div>
          <h1 style={{ fontFamily:"'Fraunces',Georgia,serif", fontSize:28, margin:0 }}>School Setup</h1>
          <p style={{ color:"#6a6860", fontSize:12, margin:0 }}>Step 1 of 6 — Organization & Academic Profile</p>
        </div>
      </div>
      <p style={{ color:"#6a6860", fontSize:13, marginBottom:24, lineHeight:1.7 }}>
        Tell us about your school. Schedu uses this to apply CBSE norms, calculate period loads, configure scheduling modes and build the academic structure automatically.
      </p>

      {/* ── School Name ── */}
      <div style={{ ...fieldBox, marginBottom:20 }}>
        <label style={lbl}>School / Institution Name *</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Delhi Public School, Vasant Kunj"
          style={inp({ fontSize:16 })}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor="#7C6FE0"}
          onBlur={e  => (e.target as HTMLInputElement).style.borderColor="#e8e5de"} />
      </div>

      {/* ── Board + Year + Timezone ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>

        {/* Board */}
        <div style={fieldBox}>
          <label style={lbl}>Board / Curriculum *</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
            {BOARDS.map(b => {
              const sel = board === b.value
              return (
                <button key={b.value} onClick={() => setBoard(b.value as BoardType)}
                  style={{ padding:"10px 6px", borderRadius:8, border: sel?"2px solid #7C6FE0":"1.5px solid #e8e5de", background: sel?"#eaecf8":"#fff", cursor:"pointer", textAlign:"center" as const }}>
                  <div style={{ fontSize:12, fontWeight:700, color: sel?"#3730a3":"#1c1b18" }}>{b.label}</div>
                  <div style={{ fontSize:9, color:"#a8a59e", marginTop:2, lineHeight:1.3 }}>{b.sub}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Year + Timezone */}
        <div style={{ display:"flex", flexDirection:"column" as const, gap:14 }}>
          <div style={fieldBox}>
            <label style={lbl}>Academic Year</label>
            <input value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2025-26" style={inp()} />
          </div>
          <div style={fieldBox}>
            <label style={lbl}>Timezone</label>
            <select value={tz} onChange={e => setTz(e.target.value)}
              style={{ padding:"10px 14px", border:"1.5px solid #e8e5de", borderRadius:9, fontSize:13, background:"#fff", outline:"none" }}>
              {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Grade Groups ── */}
      <div style={{ marginBottom:24 }}>
        <label style={lbl}>Grades Taught in Your School * <span style={{ textTransform:"none" as const, fontWeight:400, color:"#6a6860" }}>— select all that apply</span></label>
        <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
          {GRADE_GROUPS.map(g => {
            const sel = groups.includes(g.id)
            return (
              <button key={g.id} onClick={() => toggle(g.id)}
                style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderRadius:10, border: sel?`2px solid ${g.color}`:"1.5px solid #e8e5de", background: sel?g.color+"0d":"#fff", cursor:"pointer", textAlign:"left" as const, transition:"all 0.12s" }}>
                <div style={{ width:22, height:22, borderRadius:6, flexShrink:0, border: sel?"none":"2px solid #d1d5db", background: sel?g.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13 }}>
                  {sel && "✓"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: sel?g.color:"#1c1b18" }}>{g.label}</div>
                  <div style={{ fontSize:11, color:"#6a6860", marginTop:2 }}>Grades: {g.grades} — {g.desc}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:20, background:g.color+"18", color:g.color, border:`1px solid ${g.color}33`, flexShrink:0 }}>
                  {MODE_LABEL[g.profile]}
                </span>
              </button>
            )
          })}
        </div>

        {hasXIXII && (
          <div style={{ marginTop:12, padding:"12px 16px", background:"#f5f3ff", border:"1.5px solid #9B8EF5", borderRadius:9, fontSize:12, color:"#4c1d95", lineHeight:1.7 }}>
            🔀 <strong>XI–XII Dynamic Mode detected.</strong> After setting up resources, you'll configure the <strong>Academic Combination Matrix</strong> — where students choose optional subjects (Maths OR Biology, PE OR Painting) using AND/OR/NONE expressions. Schedu will automatically build instructional clusters and parallel blocks.
          </div>
        )}
      </div>

      {/* ── Academic Scale ── */}
      <div style={{ border:"1.5px solid #e8e5de", borderRadius:12, padding:"20px 24px", marginBottom:24, background:"#fafaf9" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#1c1b18", marginBottom:16 }}>📊 Academic Scale — How many?</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {[
            { label:"Class Sections",  sub:"Total sections (e.g. I-A, I-B = 2)", icon:"📚", value:numSections, set:setNumSections, min:1, max:500 },
            { label:"Teaching Staff",  sub:"Total teachers across all grades",     icon:"👤", value:numStaff,    set:setNumStaff,    min:1, max:1000 },
            { label:"Subjects",        sub:"Unique subjects across all grades",    icon:"📖", value:numSubjects, set:setNumSubjects, min:1, max:100 },
          ].map(f => (
            <div key={f.label} style={{ textAlign:"center" as const }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
              <div style={{ fontSize:12, fontWeight:600, color:"#374151", marginBottom:2 }}>{f.label}</div>
              <div style={{ fontSize:10, color:"#a8a59e", marginBottom:10, lineHeight:1.4 }}>{f.sub}</div>
              <input type="number" min={f.min} max={f.max}
                value={f.value}
                onChange={e => f.set(Math.max(f.min, Math.min(f.max, +e.target.value || f.min)))}
                style={{ width:"100%", padding:"8px", border:"1.5px solid #e8e5de", borderRadius:9, fontSize:26, fontWeight:700, fontFamily:"'DM Mono',monospace", textAlign:"center" as const, outline:"none", background:"#fff" }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor="#7C6FE0"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor="#e8e5de"} />
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, padding:"9px 14px", background:"#eaecf8", borderRadius:8, fontSize:11, color:"#3730a3" }}>
          ✨ Schedu will auto-generate all names (Teacher 1…N, Class I-A, I-B…). Everything is editable in the next steps.
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", paddingTop:16, borderTop:"1px solid #e8e5de" }}>
        <button onClick={handleContinue} disabled={!canContinue}
          style={{ padding:"11px 28px", borderRadius:9, border:"none", fontSize:14, fontWeight:600, cursor:canContinue?"pointer":"not-allowed", background:canContinue?"#7C6FE0":"#d4d1c8", color:"#fff" }}>
          Continue → Bell Schedule
        </button>
      </div>
    </div>
  )
}
