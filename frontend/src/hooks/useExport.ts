import { useTimetableStore } from "@/store/timetableStore"
import { ORG_CONFIGS } from "@/lib/orgData"

// ─── Excel format types ────────────────────────────────────────────────
export type ExcelFormat =
  | "class-day"       // Class-wise, each tab = one day
  | "class-class"     // Class-wise, each tab = one class
  | "teacher-day"     // Teacher-wise, each tab = one day
  | "teacher-teacher" // Teacher-wise, each tab = one teacher
  | "room-day"        // Room-wise, each tab = one day
  | "room-room"       // Room-wise, each tab = one room

export function useExport() {
  const { config, sections, staff, periods, classTT, teacherTT } = useTimetableStore()

  const exportXLSX = async (format: ExcelFormat = "class-class") => {
    if (!sections.length) return
    const XLSX = await import("xlsx")

    const wb   = XLSX.utils.book_new()
    const days = config.workDays
    const classPeriods = periods.filter(p => p.type === "class")
    const org  = ORG_CONFIGS[config.orgType ?? "school"]

    // Collect all unique rooms from timetable
    const allRooms = [...new Set(
      sections.flatMap(sec =>
        days.flatMap(day =>
          classPeriods
            .map(p => classTT[sec.name]?.[day]?.[p.id]?.room)
            .filter(Boolean) as string[]
        )
      )
    )].sort()

    // Utility: header row for period columns
    const periodHeader = (includeBreaks = true) =>
      (includeBreaks ? periods : classPeriods).map(p =>
        p.type === "class" ? `${p.name}` : p.name
      )

    // ── Class-wise (Days in Tabs) ────────────────────────────────────
    // Each sheet = one day; rows = sections; cols = periods
    if (format === "class-day") {
      days.forEach(day => {
        const rows: string[][] = [
          [org.sectionLabel ?? "Class", ...periodHeader()],
        ]
        sections.forEach(sec => {
          const row = [sec.name]
          periods.forEach(p => {
            if (p.type !== "class") { row.push(p.name); return }
            const cell = classTT[sec.name]?.[day]?.[p.id]
            row.push([cell?.subject ?? "", cell?.teacher ?? "", cell?.room ?? ""].filter(Boolean).join("\n"))
          })
          rows.push(row)
        })
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), day.slice(0,10))
      })
    }

    // ── Class-wise (Classes in Tabs) ────────────────────────────────
    // Each sheet = one class; rows = days; cols = periods
    else if (format === "class-class") {
      sections.forEach(sec => {
        const rows: string[][] = [
          ["Day", ...periodHeader()],
        ]
        days.forEach(day => {
          const row = [day]
          periods.forEach(p => {
            if (p.type !== "class") { row.push(p.name); return }
            const cell = classTT[sec.name]?.[day]?.[p.id]
            row.push([cell?.subject ?? "", cell?.teacher ?? "", cell?.room ?? ""].filter(Boolean).join("\n"))
          })
          rows.push(row)
        })
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, sec.name.replace(/[^\w]/g,"_").slice(0,25))
      })
    }

    // ── Teacher-wise (Days in Tabs) ──────────────────────────────────
    // Each sheet = one day; rows = teachers; cols = periods
    else if (format === "teacher-day") {
      days.forEach(day => {
        const rows: string[][] = [
          [org.staffLabel ?? "Teacher", ...classPeriods.map(p => p.name)],
        ]
        staff.forEach(st => {
          const row = [st.name]
          classPeriods.forEach(p => {
            const cell = teacherTT[st.name]?.schedule[day]?.[p.id]
            row.push(cell?.subject ?? "FREE")
          })
          rows.push(row)
        })
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), day.slice(0,10))
      })
    }

    // ── Teacher-wise (Teachers in Tabs) ─────────────────────────────
    // Each sheet = one teacher; rows = days; cols = periods
    else if (format === "teacher-teacher") {
      staff.forEach(st => {
        const tdata = teacherTT[st.name]
        const rows: string[][] = [
          [`${st.name}${st.isClassTeacher ? ` | CT: ${st.isClassTeacher}` : ""}`],
          ["Day", ...classPeriods.map(p => `${p.name}`)],
        ]
        days.forEach(day => {
          const row = [day]
          classPeriods.forEach(p => {
            const cell = tdata?.schedule[day]?.[p.id]
            row.push(cell?.subject ?? "FREE")
          })
          rows.push(row)
        })
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, st.name.replace(/[^\w]/g,"_").slice(0,25))
      })
    }

    // ── Room-wise (Days in Tabs) ─────────────────────────────────────
    // Each sheet = one day; rows = rooms; cols = periods
    else if (format === "room-day") {
      days.forEach(day => {
        const rows: string[][] = [
          ["Room", ...classPeriods.map(p => p.name)],
        ]
        allRooms.forEach(room => {
          const row = [room]
          classPeriods.forEach(p => {
            const hit = sections.find(sec => {
              const c = classTT[sec.name]?.[day]?.[p.id]
              return c?.room === room && c?.subject
            })
            const cell = hit ? classTT[hit.name][day][p.id] : null
            row.push(cell?.subject ? `${cell.subject} (${hit?.name ?? ""})` : "")
          })
          rows.push(row)
        })
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), day.slice(0,10))
      })
    }

    // ── Room-wise (Rooms in Tabs) ────────────────────────────────────
    // Each sheet = one room; rows = days; cols = periods
    else if (format === "room-room") {
      allRooms.forEach(room => {
        const rows: string[][] = [
          ["Day", ...classPeriods.map(p => p.name)],
        ]
        days.forEach(day => {
          const row = [day]
          classPeriods.forEach(p => {
            const hit = sections.find(sec => {
              const c = classTT[sec.name]?.[day]?.[p.id]
              return c?.room === room && c?.subject
            })
            const cell = hit ? classTT[hit.name][day][p.id] : null
            row.push(cell?.subject ? `${cell.subject}\n${hit?.name ?? ""}` : "")
          })
          rows.push(row)
        })
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, room.replace(/[^\w]/g,"_").slice(0,25))
      })
    }

    // Write file
    const label = format.replace("-","_")
    XLSX.writeFile(wb, `${config.timetableName || "SmartSched"}_${label}_${new Date().getFullYear()}.xlsx`)
  }

  return { exportXLSX }
}
