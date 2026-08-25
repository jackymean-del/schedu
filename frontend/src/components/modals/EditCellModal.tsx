import { useState, useMemo } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { ORG_CONFIGS } from "@/lib/orgData"
import { rebuildTeacherTT } from "@/lib/aiEngine"
import { detectConflicts } from "@/lib/schedulingEngine"
import { parseCellSubject } from "@/components/timetable/TimetableCell"

interface Props {
  target: { section: string; day: string; periodId: string }
  onClose: () => void
  /** Pre-selected subject (from period pool drag-and-drop) */
  initialSubject?: string
}

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
}

// 8-colour palette for subject pills — cycles via index
const SUBJECT_COLORS = [
  { bg: "#EDE9FF", border: "#D8D2FF", text: "#4338ca" },  // indigo
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },  // amber
  { bg: "#ecfdf5", border: "#6ee7b7", text: "#065f46" },  // emerald
  { bg: "#fdf2f8", border: "#f9a8d4", text: "#9d174d" },  // pink
  { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },  // blue
  { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },  // orange
  { bg: "#f5f3ff", border: "#c4b5fd", text: "#6358C4" },  // violet
  { bg: "#ecfeff", border: "#67e8f9", text: "#164e63" },  // cyan
]

// ── Colours for group mode ────────────────────────────────────────────────────
const OR_C  = { bg: "#FFFBEB", bdr: "#FDE68A", text: "#92400E", tag: "#D97706" }
const AND_C = { bg: "#EDE9FF", bdr: "#C4B5FD", text: "#3730A3", tag: "#685DBC" }

type CellMode = "single" | "OR" | "AND"
type GroupAsgn = { teacher: string; room: string }

function buildGroupSubject(logic: "OR" | "AND", subjects: string[]) {
  return subjects.length >= 2 ? subjects.join(` ${logic} `) : subjects[0] ?? ""
}

export function EditCellModal({ target, onClose, initialSubject }: Props) {
  const {
    config, classTT, staff, subjects, sections, periods, facilities,
    updateCell, setTeacherTT, setConflicts,
  } = useTimetableStore()
  const org = ORG_CONFIGS[config.orgType ?? "school"]

  // Memoised: the `?? {}` minted a new object whenever the slot was empty,
  // which is exactly when this modal is opened to fill one.
  const cell       = useMemo(
    () => classTT[target.section]?.[target.day]?.[target.periodId] ?? {},
    [classTT, target.section, target.day, target.periodId],
  )
  const section    = sections.find(s => s.name === target.section)
  const periodObj  = periods.find(p => p.id === target.periodId)

  // ── Determine initial mode from existing cell subject ──────────────────────
  const existingParsed = parseCellSubject(cell.subject ?? initialSubject ?? "")
  const initMode: CellMode = existingParsed.type === "group" ? existingParsed.logic : "single"
  const initGroupSubs: string[] = existingParsed.type === "group" ? existingParsed.subjects : []

  // ── Mode + group subjects ─────────────────────────────────────────────────
  const [mode,           setMode]           = useState<CellMode>(initMode)
  const [groupSubjects,  setGroupSubjects]  = useState<string[]>(initGroupSubs)
  const [groupTextInput, setGroupTextInput] = useState(
    existingParsed.type === "group"
      ? buildGroupSubject(existingParsed.logic, existingParsed.subjects)
      : ""
  )
  const [useTextInput, setUseTextInput] = useState(false)

  // ── Per-subject assignments (teacher + room per subject in group mode) ─────
  const initGroupAsgn: Record<string, GroupAsgn> = {}
  if (cell.groupAssignments) {
    for (const ga of cell.groupAssignments) {
      initGroupAsgn[ga.subject] = { teacher: ga.teacher ?? "", room: ga.room ?? "" }
    }
  }
  const [groupAsgn, setGroupAsgn] = useState<Record<string, GroupAsgn>>(initGroupAsgn)

  // ── Single-mode state ─────────────────────────────────────────────────────
  const [selectedSubject, setSelectedSubject] = useState(
    existingParsed.type === "single" ? (cell.subject || initialSubject || "") : ""
  )
  const [selectedTeacher, setSelectedTeacher] = useState(cell.teacher || "")
  const [selectedRoom,    setSelectedRoom]    = useState(cell.room    || "")

  // ── Active group subjects (chip vs text) ──────────────────────────────────
  const activeGroupSubjects = useMemo(() => {
    if (mode === "single") return []
    if (useTextInput) {
      // Parse text: split on " OR " or " AND "
      return groupTextInput.trim()
        .split(new RegExp(`\\s+${mode}\\s+`, "i"))
        .map(s => s.trim())
        .filter(Boolean)
    }
    return groupSubjects
  }, [mode, useTextInput, groupTextInput, groupSubjects])

  // ── Derived: effective subject string ─────────────────────────────────────
  const effectiveSubject: string = useMemo(() => {
    if (mode === "single") return selectedSubject
    if (useTextInput) return groupTextInput.trim()
    return buildGroupSubject(mode, groupSubjects)
  }, [mode, selectedSubject, useTextInput, groupTextInput, groupSubjects])

  // ── Subjects that apply to this section ──────────────────────────────────
  const sectionSubjects = useMemo(() =>
    subjects.filter(sub => {
      const secs = sub.sections ?? []
      return secs.length === 0 || secs.includes(target.section)
    }),
    [subjects, target.section]
  )

  // ── Teacher eligibility helper ────────────────────────────────────────────
  const getEligibleTeachers = (subjectName: string) => {
    const sectionKey = `${target.section}::${subjectName}`
    return staff
      .map(st => {
        const subs: string[] = st.subjects ?? []
        const hasSectionSpecific = subs.some(s => s.includes("::"))
        let match = false
        if (hasSectionSpecific) {
          match = subs.some(s => s === sectionKey || s.endsWith(`::${subjectName}`))
        } else {
          match = subjectName ? subs.includes(subjectName) : false
        }
        const conflictSection =
          Object.keys(classTT).find(sec => {
            if (sec === target.section) return false
            return classTT[sec]?.[target.day]?.[target.periodId]?.teacher === st.name
          }) ?? null
        return { ...st, match, conflictSection }
      })
      .sort((a, b) => {
        if (a.match !== b.match)                         return a.match ? -1 : 1
        if (!!a.conflictSection !== !!b.conflictSection) return a.conflictSection ? 1 : -1
        return a.name.localeCompare(b.name)
      })
  }

  // ── Single-mode teacher list ───────────────────────────────────────────────
  const eligibleTeachers = useMemo(
    () => getEligibleTeachers(selectedSubject),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSubject, staff, classTT, target.section, target.day, target.periodId]
  )

  // ── Conflict detection for single mode ────────────────────────────────────
  const conflictWith = useMemo(() => {
    if (!selectedTeacher) return null
    return (
      Object.keys(classTT).find(sec => {
        if (sec === target.section) return false
        return classTT[sec]?.[target.day]?.[target.periodId]?.teacher === selectedTeacher
      }) ?? null
    )
  }, [selectedTeacher, classTT, target])

  // ── Conflict detection for group mode (per subject) ───────────────────────
  const groupConflicts = useMemo(() => {
    const result: Record<string, string | null> = {}
    for (const sub of activeGroupSubjects) {
      const t = groupAsgn[sub]?.teacher
      if (!t) { result[sub] = null; continue }
      result[sub] = Object.keys(classTT).find(sec =>
        sec !== target.section && classTT[sec]?.[target.day]?.[target.periodId]?.teacher === t
      ) ?? null
    }
    return result
  }, [activeGroupSubjects, groupAsgn, classTT, target])

  const hasGroupConflict = useMemo(
    () => Object.values(groupConflicts).some(c => c !== null),
    [groupConflicts]
  )

  // ── Room options ──────────────────────────────────────────────────────────
  const roomOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: string[] = []
    const add = (r?: string) => { if (r && !seen.has(r)) { seen.add(r); opts.push(r) } }
    add(section?.room)
    facilities.forEach(f => add(f.actualName || f.generatedName))
    sections.forEach(s => add(s.room))
    return opts
  }, [section, facilities, sections])

  // ── Add subject to group + auto-fill teacher ──────────────────────────────
  const addToGroup = (subName: string) => {
    setGroupSubjects(p => [...p, subName])
    // Auto-fill teacher if not already assigned
    if (!groupAsgn[subName]?.teacher) {
      const eligible = getEligibleTeachers(subName)
      const best =
        eligible.find(t => t.match && !t.conflictSection) ??
        eligible.find(t => !t.conflictSection) ??
        null
      setGroupAsgn(prev => ({
        ...prev,
        [subName]: {
          teacher: best?.name ?? "",
          room: section?.room ?? prev[subName]?.room ?? "",
        },
      }))
    }
  }

  // ── Set per-subject teacher / room ────────────────────────────────────────
  const setSubjectTeacher = (sub: string, teacher: string) =>
    setGroupAsgn(prev => ({ ...prev, [sub]: { ...(prev[sub] ?? { room: "" }), teacher } }))

  const setSubjectRoom = (sub: string, room: string) =>
    setGroupAsgn(prev => ({ ...prev, [sub]: { ...(prev[sub] ?? { teacher: "" }), room } }))

  // ── Bidirectional auto-fill (single mode) ─────────────────────────────────
  const handleSubjectChange = (subjectName: string) => {
    setSelectedSubject(subjectName)
    if (!subjectName) return
    const eligible = getEligibleTeachers(subjectName)
    const best =
      eligible.find(t => t.match && !t.conflictSection) ??
      eligible.find(t => !t.conflictSection) ??
      null
    if (best) setSelectedTeacher(best.name)
    if (section?.room) setSelectedRoom(section.room)
  }

  const handleTeacherChange = (teacherName: string) => {
    setSelectedTeacher(teacherName)
    if (!selectedSubject && teacherName) {
      const st = staff.find(s => s.name === teacherName)
      if (st) {
        const subs: string[] = st.subjects ?? []
        const secSpecific = subs.find(s => s.startsWith(`${target.section}::`))
        if (secSpecific) {
          const subName = secSpecific.replace(/.*::/, "")
          if (sectionSubjects.find(s => s.name === subName)) setSelectedSubject(subName)
        }
      }
    }
    if (!selectedRoom && section?.room) setSelectedRoom(section.room)
  }

  // ── Persist helpers ───────────────────────────────────────────────────────
  const commitAndRebuild = (cellPatch: {
    subject: string; teacher: string; room: string
    groupAssignments?: Array<{ subject: string; teacher?: string; room?: string }>
  }) => {
    updateCell(target.section, target.day, target.periodId, cellPatch)
    const freshState = useTimetableStore.getState()
    const newTeacherTT = JSON.parse(JSON.stringify(freshState.teacherTT))
    rebuildTeacherTT(freshState.classTT, newTeacherTT, freshState.config.workDays)
    setTeacherTT(newTeacherTT)
    setConflicts(detectConflicts(freshState.classTT, freshState.periods))
    onClose()
  }

  const save = () => {
    if (mode === "single") {
      commitAndRebuild({ subject: effectiveSubject, teacher: selectedTeacher, room: selectedRoom })
    } else {
      // Build groupAssignments from activeGroupSubjects + groupAsgn map
      const assignments = activeGroupSubjects.map(sub => ({
        subject: sub,
        teacher: groupAsgn[sub]?.teacher ?? "",
        room:    groupAsgn[sub]?.room    ?? "",
      }))
      const first = assignments[0]
      commitAndRebuild({
        subject: effectiveSubject,
        teacher: first?.teacher ?? "",  // top-level: first subject's teacher (backward compat)
        room:    first?.room    ?? "",
        groupAssignments: assignments.length > 0 ? assignments : undefined,
      })
    }
  }

  const clearPeriod = () =>
    commitAndRebuild({ subject: "", teacher: "", room: "" })

  // ── isDirty / canSave ─────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (mode === "single") {
      return (
        effectiveSubject !== (cell.subject ?? "") ||
        selectedTeacher  !== (cell.teacher  ?? "") ||
        selectedRoom     !== (cell.room     ?? "")
      )
    }
    if (effectiveSubject !== (cell.subject ?? "")) return true
    const newAsgn = activeGroupSubjects.map(s => ({
      subject: s,
      teacher: groupAsgn[s]?.teacher ?? "",
      room:    groupAsgn[s]?.room    ?? "",
    }))
    return JSON.stringify(newAsgn) !== JSON.stringify(
      (cell.groupAssignments ?? []).map(ga => ({
        subject: ga.subject,
        teacher: ga.teacher ?? "",
        room:    ga.room    ?? "",
      }))
    )
  }, [mode, effectiveSubject, selectedTeacher, selectedRoom, cell, activeGroupSubjects, groupAsgn])

  const canSave = isDirty && (
    mode === "single"
      ? (!!effectiveSubject || !!selectedTeacher)
      : activeGroupSubjects.length >= 2
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed" as const, inset: 0,
        background: "rgba(0,0,0,0.42)",
        display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
        zIndex: 1000, padding: 12,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 480, background: "#fff", borderRadius: 14,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        display: "flex", flexDirection: "column" as const,
        maxHeight: "calc(100vh - 24px)", overflow: "hidden",
        animation: "ecmSlideIn 0.2s ease",
      }}>
        <style>{`
          @keyframes ecmSlideIn {
            from { opacity: 0; transform: translateX(24px) }
            to   { opacity: 1; transform: translateX(0) }
          }
        `}</style>

        {/* ── Header ── */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
              ✏️ Edit Period
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, fontFamily: "monospace" }}>
              <span style={{ color: "#685DBC", fontWeight: 600 }}>{target.section}</span>
              {" · "}{DAY_LABEL[target.day] ?? target.day}
              {" · "}{periodObj?.name ?? target.periodId}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1px solid #e2e8f0", background: "#f8fafc",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 14, color: "#64748b",
          }}>✕</button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column" as const, gap: 18 }}>

          {/* ── Mode selector ── */}
          <div>
            <label style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
              letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 8,
            }}>Period type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["single", "OR", "AND"] as CellMode[]).map(m => {
                const active = mode === m
                const col = m === "OR" ? OR_C : m === "AND" ? AND_C : null
                return (
                  <button key={m} onClick={() => { setMode(m); setUseTextInput(false) }} style={{
                    flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                    border: `2px solid ${active ? (col?.tag ?? "#685DBC") : "#e2e8f0"}`,
                    background: active ? (col?.bg ?? "#EDE9FF") : "#f8fafc",
                    color: active ? (col?.text ?? "#4338CA") : "#64748b",
                    fontSize: 11, fontWeight: active ? 800 : 500, fontFamily: "inherit",
                    transition: "all 0.12s",
                  }}>
                    {m === "single" ? "Single subject" : `${m} group`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Group subject picker (OR / AND mode) ── */}
          {mode !== "single" && (() => {
            const col = mode === "OR" ? OR_C : AND_C
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                    letterSpacing: "0.08em", color: "#94a3b8",
                  }}>
                    {mode} subjects
                    <span style={{ color: "#c0c0c0", fontWeight: 400, marginLeft: 6 }}>
                      select 2+ or type below
                    </span>
                  </label>
                  <button
                    onClick={() => setUseTextInput(p => !p)}
                    style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                      border: `1px solid ${useTextInput ? col.tag : "#e2e8f0"}`,
                      background: useTextInput ? col.bg : "#f8fafc",
                      color: useTextInput ? col.text : "#94a3b8",
                      fontFamily: "inherit", fontWeight: 600,
                    }}
                  >
                    ✏️ Type directly
                  </button>
                </div>

                {useTextInput ? (
                  /* Free-text input */
                  <div>
                    <input
                      value={groupTextInput}
                      onChange={e => setGroupTextInput(e.target.value)}
                      placeholder={`e.g. PHY ${mode} CHEM ${mode} BIO`}
                      style={{
                        width: "100%", boxSizing: "border-box" as const,
                        padding: "8px 12px", borderRadius: 8, outline: "none",
                        border: `1.5px solid ${col.bdr}`, fontSize: 13,
                        fontFamily: "'DM Mono', monospace", color: col.text,
                        background: col.bg,
                      }}
                    />
                    <p style={{ fontSize: 10.5, color: "#94a3b8", margin: "4px 0 0" }}>
                      Separate subject names with " {mode} " (with spaces) — exactly as you want it to appear in the cell.
                    </p>
                  </div>
                ) : (
                  /* Chip picker */
                  <div>
                    {/* Selected chips */}
                    {groupSubjects.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginBottom: 8 }}>
                        {groupSubjects.map(s => (
                          <span key={s} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            background: col.bg, border: `1.5px solid ${col.bdr}`,
                            color: col.text, borderRadius: 5,
                            padding: "3px 8px", fontSize: 11.5, fontWeight: 700,
                          }}>
                            {s}
                            <button
                              onClick={() => setGroupSubjects(p => p.filter(x => x !== s))}
                              style={{ background: "none", border: "none", cursor: "pointer",
                                       color: "inherit", padding: 0, fontSize: 12, opacity: 0.7, lineHeight: 1 }}
                            >✕</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Preview label */}
                    {groupSubjects.length >= 2 && (
                      <div style={{
                        padding: "5px 10px", borderRadius: 6, marginBottom: 8,
                        background: col.bg, border: `1px solid ${col.bdr}`,
                        fontSize: 11.5, fontWeight: 700, color: col.text,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                        <span style={{
                          fontSize: 8, fontWeight: 900, background: col.tag,
                          color: "#fff", borderRadius: 3, padding: "0 4px 1px",
                        }}>{mode}</span>
                        {groupSubjects.join(` ${mode} `)}
                      </div>
                    )}

                    {/* Subject picker pills */}
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                      {sectionSubjects
                        .filter(s => !groupSubjects.includes(s.name))
                        .map((sub, i) => {
                          const c = SUBJECT_COLORS[i % SUBJECT_COLORS.length]
                          return (
                            <button
                              key={sub.id ?? sub.name}
                              onClick={() => addToGroup(sub.name)}
                              style={{
                                padding: "5px 12px", borderRadius: 20,
                                border: `1.5px solid ${c.border}`,
                                background: "#f8fafc", color: "#64748b",
                                fontSize: 12, fontWeight: 500,
                                cursor: "pointer", transition: "all 0.1s",
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = c.bg
                                e.currentTarget.style.color = c.text
                                e.currentTarget.style.borderColor = c.border
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = "#f8fafc"
                                e.currentTarget.style.color = "#64748b"
                              }}
                            >
                              + {sub.name}
                            </button>
                          )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Per-Subject Teacher + Room (group mode, any input method) ── */}
          {mode !== "single" && activeGroupSubjects.length > 0 && (() => {
            const col = mode === "OR" ? OR_C : AND_C
            return (
              <div>
                <label style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                  letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 8,
                }}>
                  Per-Subject {org.staffLabel} &amp; Room
                </label>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  {activeGroupSubjects.map(sub => {
                    const eligible = getEligibleTeachers(sub)
                    const asgn = groupAsgn[sub] ?? { teacher: "", room: "" }
                    const conflict = groupConflicts[sub] ?? null
                    return (
                      <div key={sub} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px", borderRadius: 8,
                        background: col.bg, border: `1px solid ${conflict ? "#fca5a5" : col.bdr}`,
                      }}>
                        {/* Subject badge */}
                        <span style={{
                          fontSize: 11, fontWeight: 800, color: col.text,
                          minWidth: 52, flexShrink: 0,
                          background: col.bdr, borderRadius: 4,
                          padding: "2px 6px", textAlign: "center" as const,
                        }}>
                          {sub}
                        </span>

                        {/* Teacher select */}
                        <select
                          value={asgn.teacher}
                          onChange={e => setSubjectTeacher(sub, e.target.value)}
                          style={{
                            flex: 1.6, padding: "5px 7px", borderRadius: 6, fontSize: 11,
                            border: `1.5px solid ${conflict ? "#fca5a5" : asgn.teacher ? "#D8D2FF" : "#e2e8f0"}`,
                            background: "#fff", cursor: "pointer", outline: "none",
                            minWidth: 0,
                          }}
                        >
                          <option value="">— {org.staffLabel.toLowerCase()} —</option>
                          {eligible.map(t => (
                            <option key={t.id ?? t.name} value={t.name}>
                              {t.match ? "★ " : ""}{t.name}
                              {t.conflictSection ? ` ⚠ ${t.conflictSection}` : ""}
                            </option>
                          ))}
                        </select>

                        {/* Room select */}
                        <select
                          value={asgn.room}
                          onChange={e => setSubjectRoom(sub, e.target.value)}
                          style={{
                            flex: 1, padding: "5px 7px", borderRadius: 6, fontSize: 11,
                            border: "1.5px solid #e2e8f0",
                            background: "#fff", cursor: "pointer", outline: "none",
                            minWidth: 0,
                          }}
                        >
                          <option value="">— room —</option>
                          {roomOptions.map(r => (
                            <option key={r} value={r}>
                              {r}{section?.room === r ? " ✓" : ""}
                            </option>
                          ))}
                        </select>

                        {/* Conflict indicator */}
                        {conflict && (
                          <span
                            title={`⚠ ${asgn.teacher} is already in ${conflict} this period`}
                            style={{ fontSize: 15, flexShrink: 0, cursor: "help" }}
                          >⚠️</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>★ = eligible for this subject</span>
                  <span style={{ fontSize: 10, color: "#f59e0b" }}>⚠ = already booked this period</span>
                </div>
              </div>
            )
          })()}

          {/* ── Subject pills (single mode) ── */}
          {mode === "single" && <div>
            <label style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
              letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 8,
            }}>
              {org.subjectLabel}
            </label>

            {sectionSubjects.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                No subjects configured for {target.section}.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 7 }}>
                {sectionSubjects.map((sub, i) => {
                  const c = SUBJECT_COLORS[i % SUBJECT_COLORS.length]
                  const isSelected = selectedSubject === sub.name
                  return (
                    <button
                      key={sub.id ?? sub.name}
                      onClick={() => handleSubjectChange(isSelected ? "" : sub.name)}
                      style={{
                        padding: "6px 14px", borderRadius: 20,
                        border: `1.5px solid ${isSelected ? c.border : "#e2e8f0"}`,
                        background: isSelected ? c.bg : "#f8fafc",
                        color: isSelected ? c.text : "#64748b",
                        fontSize: 12, fontWeight: isSelected ? 700 : 400,
                        cursor: "pointer", transition: "all 0.12s",
                        boxShadow: isSelected ? `0 0 0 2px ${c.border}` : "none",
                      }}
                    >
                      {sub.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>}

          {/* ── Single-mode conflict warning ── */}
          {mode === "single" && conflictWith && (
            <div style={{
              padding: "10px 14px", background: "#fef2f2",
              border: "1.5px solid #fca5a5", borderRadius: 8,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>Teacher Conflict Detected</div>
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2, lineHeight: 1.5 }}>
                  <strong>{selectedTeacher}</strong> is already assigned to{" "}
                  <strong>{conflictWith}</strong> during this period.
                  Saving will create a double-booking.
                </div>
              </div>
            </div>
          )}

          {/* ── Group-mode conflict summary ── */}
          {mode !== "single" && hasGroupConflict && (
            <div style={{
              padding: "10px 14px", background: "#fef2f2",
              border: "1.5px solid #fca5a5", borderRadius: 8,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>Teacher Conflict(s) in Group</div>
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2, lineHeight: 1.5 }}>
                  {activeGroupSubjects
                    .filter(s => groupConflicts[s])
                    .map(s => (
                      <div key={s}>
                        <strong>{groupAsgn[s]?.teacher}</strong> ({s}) is already in{" "}
                        <strong>{groupConflicts[s]}</strong> this period.
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Single mode: Teacher selector ── */}
          {mode === "single" && (
            <div>
              <label style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 8,
              }}>
                {org.staffLabel}
              </label>
              <select
                value={selectedTeacher}
                onChange={e => handleTeacherChange(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px",
                  border: `1.5px solid ${conflictWith ? "#fca5a5" : selectedTeacher ? "#D8D2FF" : "#e2e8f0"}`,
                  borderRadius: 8, fontSize: 12, outline: "none",
                  background: "#fff", cursor: "pointer",
                }}
              >
                <option value="">— Select {org.staffLabel.toLowerCase()} —</option>
                {eligibleTeachers.map(t => (
                  <option key={t.id ?? t.name} value={t.name}>
                    {t.match ? "★ " : "  "}
                    {t.name}
                    {t.role ? ` (${t.role})` : ""}
                    {t.match ? " — eligible" : ""}
                    {t.conflictSection ? ` ⚠ busy in ${t.conflictSection}` : ""}
                  </option>
                ))}
                {eligibleTeachers.length === 0 && selectedSubject && (
                  <option disabled>No teachers found for this subject</option>
                )}
              </select>
              <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>★ = eligible for this subject</span>
                <span style={{ fontSize: 10, color: "#f59e0b" }}>⚠ = already booked this period</span>
              </div>
            </div>
          )}

          {/* ── Single mode: Room selector ── */}
          {mode === "single" && (
            <div>
              <label style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 8,
              }}>
                Room
              </label>
              {roomOptions.length > 0 ? (
                <select
                  value={selectedRoom}
                  onChange={e => setSelectedRoom(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 8, fontSize: 12, outline: "none",
                    background: "#fff", cursor: "pointer",
                  }}
                >
                  <option value="">— Select room —</option>
                  {roomOptions.map(r => (
                    <option key={r} value={r}>
                      {r}{section?.room === r ? " (class default)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedRoom}
                  onChange={e => setSelectedRoom(e.target.value)}
                  placeholder="Room number or name"
                  style={{
                    width: "100%", padding: "8px 12px",
                    border: "1.5px solid #e2e8f0", borderRadius: 8,
                    fontSize: 12, outline: "none", boxSizing: "border-box" as const,
                  }}
                />
              )}
            </div>
          )}

          {/* ── Assignment preview card ── */}
          {(effectiveSubject || selectedTeacher || selectedRoom || activeGroupSubjects.some(s => groupAsgn[s]?.teacher)) && (
            <div style={{
              padding: "12px 14px", background: "#f8fafc",
              border: "1.5px solid #e2e8f0", borderRadius: 9,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8,
              }}>
                Cell Preview
              </div>

              {mode === "single" ? (
                /* Single mode preview */
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {effectiveSubject && (
                    <span style={{
                      fontSize: 11, background: "#EDE9FF", color: "#4338ca",
                      padding: "3px 10px", borderRadius: 5, fontWeight: 600,
                    }}>📚 {effectiveSubject}</span>
                  )}
                  {selectedTeacher && (
                    <span style={{
                      fontSize: 11,
                      background: conflictWith ? "#fef2f2" : "#f0fdf4",
                      color: conflictWith ? "#dc2626" : "#166534",
                      padding: "3px 10px", borderRadius: 5, fontWeight: 600,
                    }}>👤 {selectedTeacher}</span>
                  )}
                  {selectedRoom && (
                    <span style={{
                      fontSize: 11, background: "#fff7ed", color: "#9a3412",
                      padding: "3px 10px", borderRadius: 5, fontWeight: 600,
                    }}>🚪 {selectedRoom}</span>
                  )}
                  {conflictWith && (
                    <span style={{
                      fontSize: 11, background: "#fef2f2", color: "#dc2626",
                      padding: "3px 10px", borderRadius: 5, fontWeight: 600,
                    }}>⚠️ Conflict: {conflictWith}</span>
                  )}
                </div>
              ) : (
                /* Group mode preview: subject → teacher · room per row */
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
                  {effectiveSubject && (
                    <div style={{
                      fontSize: 11, fontFamily: "'DM Mono', monospace",
                      background: mode === "OR" ? OR_C.bg : AND_C.bg,
                      color: mode === "OR" ? OR_C.text : AND_C.text,
                      border: `1px solid ${mode === "OR" ? OR_C.bdr : AND_C.bdr}`,
                      padding: "3px 10px", borderRadius: 5, fontWeight: 700,
                      display: "inline-flex", gap: 6, alignItems: "center",
                    }}>
                      <span style={{
                        fontSize: 8, fontWeight: 900,
                        background: mode === "OR" ? OR_C.tag : AND_C.tag,
                        color: "#fff", borderRadius: 3, padding: "0 4px 1px",
                      }}>{mode}</span>
                      {effectiveSubject}
                    </div>
                  )}
                  {activeGroupSubjects.map(sub => {
                    const asgn = groupAsgn[sub]
                    const hasAsgn = asgn?.teacher || asgn?.room
                    if (!hasAsgn) return null
                    return (
                      <div key={sub} style={{ display: "flex", gap: 5, alignItems: "center", paddingLeft: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", minWidth: 48 }}>{sub}</span>
                        {asgn?.teacher && (
                          <span style={{
                            fontSize: 10, background: groupConflicts[sub] ? "#fef2f2" : "#f0fdf4",
                            color: groupConflicts[sub] ? "#dc2626" : "#166534",
                            padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                          }}>👤 {asgn.teacher}{groupConflicts[sub] ? " ⚠" : ""}</span>
                        )}
                        {asgn?.room && (
                          <span style={{
                            fontSize: 10, background: "#fff7ed", color: "#9a3412",
                            padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                          }}>🚪 {asgn.room}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, gap: 8,
        }}>
          <button
            onClick={clearPeriod}
            title="Remove all assignments for this period"
            style={{
              padding: "8px 14px", borderRadius: 7,
              border: "1px solid #fca5a5", background: "#fef2f2",
              fontSize: 12, color: "#dc2626", fontWeight: 600, cursor: "pointer",
            }}
          >
            🗑️ Clear Period
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 18px", borderRadius: 7,
                border: "1px solid #e2e8f0", background: "#fff",
                fontSize: 12, color: "#64748b", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              style={{
                padding: "8px 22px", borderRadius: 7, border: "none",
                background: canSave
                  ? ((conflictWith || hasGroupConflict) ? "#D4920E" : "#685DBC")
                  : "#e2e8f0",
                color: canSave ? "#fff" : "#94a3b8",
                fontSize: 12, fontWeight: 700,
                cursor: canSave ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}
            >
              {(conflictWith || hasGroupConflict) ? "⚠️ Save Anyway" : "✅ Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
