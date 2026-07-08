/**
 * timetableExport — pure data-formatting helpers for timetable exports.
 *
 * Each function returns a plain 2-D array (AoA = array-of-arrays) that
 * SheetJS can consume directly via `XLSX.utils.aoa_to_sheet`.
 *
 * Three export shapes are supported:
 *   classSheet(section)   — one sheet per class  (periods × days grid)
 *   teacherSheet(teacher) — one sheet per teacher (periods × days grid)
 *   flatRows()            — every assignment as a flat CSV-friendly row
 *
 * Pure functions. No React, no SheetJS, no side effects.
 */

import type { Section, Staff, Subject, Period, ClassTimetable } from '@/types'

// ─── Types ────────────────────────────────────────────────

export interface ExportOptions {
  classTT: ClassTimetable
  sections: Section[]
  staff: Staff[]
  subjects: Subject[]
  periods: Period[]
  workDays: string[]
  /** Include teacher name in cell alongside subject (default true). */
  showTeacher?: boolean
  /** Include room in cell (default false). */
  showRoom?: boolean
}

/** A single cell's formatted text for a timetable grid. */
export function formatCell(
  cell: any,
  { showTeacher = true, showRoom = false }: Pick<ExportOptions, 'showTeacher' | 'showRoom'> = {},
): string {
  if (!cell?.subject) return ''
  let s = cell.subject
  if (showTeacher && cell.teacher) s += `\n${cell.teacher}`
  if (showRoom    && cell.room)    s += `\n[${cell.room}]`
  return s
}

// ─── Per-class sheet ─────────────────────────────────────

/**
 * Build a 2-D array for one section's timetable:
 *   Row 0   : header — empty | Mon | Tue | Wed | Thu | Fri …
 *   Row 1…  : period name | cell content per day
 */
export function buildClassSheet(
  sectionName: string,
  options: ExportOptions,
): (string | number)[][] {
  const { classTT, periods, workDays, showTeacher = true, showRoom = false } = options

  // Header row
  const header: string[] = ['Period / Day', ...workDays]

  const rows: (string | number)[][] = [header]

  periods.forEach(period => {
    const label = period.type === 'break'
      ? `— ${period.name} —`
      : period.name
    const row: (string | number)[] = [label]

    if (period.type === 'break') {
      // Break row — shade entire row with a marker
      workDays.forEach(() => row.push(''))
    } else {
      workDays.forEach(day => {
        const cell = classTT[sectionName]?.[day]?.[period.id]
        row.push(formatCell(cell, { showTeacher, showRoom }))
      })
    }
    rows.push(row)
  })

  return rows
}

// ─── Per-teacher sheet ───────────────────────────────────

/**
 * Build a 2-D array for one teacher's timetable (derived by scanning
 * classTT for cells assigned to that teacher):
 *   Row 0   : header — Period / Day | Mon | Tue | …
 *   Row 1…  : period label | "Subject (Section)" per day
 */
export function buildTeacherSheet(
  teacherName: string,
  options: ExportOptions,
): (string | number)[][] {
  const { classTT, periods, workDays, showRoom = false } = options

  const header: string[] = ['Period / Day', ...workDays]
  const rows: (string | number)[][] = [header]

  periods.forEach(period => {
    const label = period.type === 'break'
      ? `— ${period.name} —`
      : period.name
    const row: (string | number)[] = [label]

    if (period.type === 'break') {
      workDays.forEach(() => row.push(''))
    } else {
      workDays.forEach(day => {
        // Find any section where this teacher is scheduled at this slot
        let found = ''
        Object.entries(classTT).forEach(([secName, secData]) => {
          const cell: any = secData[day]?.[period.id]
          if (cell?.teacher === teacherName && cell?.subject) {
            const base = `${cell.subject} (${secName})`
            found = showRoom && cell.room ? `${base}\n[${cell.room}]` : base
          }
        })
        row.push(found)
      })
    }
    rows.push(row)
  })

  return rows
}

// ─── Master summary sheet ────────────────────────────────

/**
 * Build a flat "master" sheet that lists every assigned cell:
 *   Columns: Section | Day | Period | Subject | Teacher | Room
 * Useful as a data-interchange / mail-merge source.
 */
export function buildFlatSheet(options: ExportOptions): (string | number)[][] {
  const { classTT, periods, workDays } = options

  const header = ['Section', 'Day', 'Period', 'Subject', 'Teacher', 'Room']
  const rows: (string | number)[][] = [header]

  Object.entries(classTT).forEach(([secName, secData]) => {
    workDays.forEach(day => {
      periods.forEach(period => {
        if (period.type === 'break') return
        const cell: any = secData[day]?.[period.id]
        if (!cell?.subject) return
        rows.push([
          secName,
          day,
          period.name,
          cell.subject ?? '',
          cell.teacher ?? '',
          cell.room ?? '',
        ])
      })
    })
  })

  return rows
}

// ─── Print HTML ──────────────────────────────────────────

/** Colour palette for subjects — cycles through a set of pastels. */
const SUBJECT_PALETTE = [
  '#EDE9FF', '#FEF3C7', '#DCFCE7', '#E0F2FE', '#FCE7F3',
  '#FFF7ED', '#F0FDF4', '#F5F3FF', '#FEF9C3', '#E0F7FA',
]
function subjectColor(name: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(name)
  return SUBJECT_PALETTE[Math.abs(idx) % SUBJECT_PALETTE.length]
}

/**
 * Generate a complete, self-contained HTML document for all class timetables.
 * Designed to be opened in a new tab and printed as PDF (or just printed).
 *
 * Each section gets its own page-break-separated table.
 */
export function buildPrintHTML(options: ExportOptions): string {
  const { classTT, sections, subjects, periods, workDays } = options
  const allSubjectNames = subjects.map(s => s.name)
  const classPeriods = periods.filter(p => p.type !== 'break')

  const sectionTables = sections.map(sec => {
    const rows = periods.map(period => {
      if (period.type === 'break') {
        return `
          <tr class="break-row">
            <td colspan="${workDays.length + 1}" class="break-cell">${period.name}</td>
          </tr>`
      }
      const cells = workDays.map(day => {
        const cell: any = classTT[sec.name]?.[day]?.[period.id]
        if (!cell?.subject) return `<td class="empty-cell"></td>`
        const bg = subjectColor(cell.subject, allSubjectNames)
        return `
          <td class="timetable-cell" style="background:${bg}">
            <div class="subject">${cell.subject}</div>
            ${cell.teacher ? `<div class="teacher">${cell.teacher}</div>` : ''}
            ${cell.room    ? `<div class="room">${cell.room}</div>` : ''}
          </td>`
      }).join('')
      return `<tr><td class="period-label">${period.name}</td>${cells}</tr>`
    }).join('')

    return `
      <div class="section-page">
        <div class="letterhead">
          <span class="letterhead-word">sched<span class="letterhead-u">U</span></span>
          <svg width="16" height="16" viewBox="0 0 52 52" fill="none" style="margin-bottom:1px">
            <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22.5" fill="none" stroke="#000000" stroke-width="9" stroke-linecap="round"/>
            <circle cx="36" cy="12" r="5" fill="#000000"/>
          </svg>
        </div>
        <h2 class="section-title">${sec.name}</h2>
        <table class="timetable">
          <thead>
            <tr>
              <th class="period-header">Period</th>
              ${workDays.map(d => `<th>${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Timetable Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 11px;
      color: #13111E;
      background: #fff;
    }
    .section-page {
      page-break-after: always;
      padding: 24px 28px;
    }
    .section-page:last-child { page-break-after: auto; }
    .letterhead {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      margin-bottom: 8px;
    }
    .letterhead-word {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: -0.3px;
      color: #000;
    }
    .letterhead-u {
      font-family: Georgia, serif;
      font-style: italic;
    }
    .section-title {
      font-size: 16px;
      font-weight: 800;
      color: #7C6FE0;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 2px solid #EDE9FF;
    }
    .timetable {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .timetable th, .timetable td {
      border: 1px solid #ECEAFB;
      padding: 5px 7px;
      vertical-align: top;
    }
    .timetable thead th {
      background: #F8F7FF;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7C6FE0;
      text-align: center;
    }
    .period-label {
      font-weight: 700;
      color: #4B5275;
      white-space: nowrap;
      font-size: 10px;
      background: #F8F7FF;
    }
    .period-header {
      text-align: left !important;
    }
    .timetable-cell {
      min-width: 80px;
    }
    .subject {
      font-weight: 700;
      font-size: 10.5px;
      color: #13111E;
    }
    .teacher {
      font-size: 9.5px;
      color: #4B5275;
      margin-top: 2px;
    }
    .room {
      font-size: 9px;
      color: #8B87AD;
      margin-top: 1px;
    }
    .empty-cell { background: #FAFAFE; }
    .break-row .break-cell {
      background: #F1F5F9;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #94A3B8;
      padding: 3px;
    }
    @media print {
      .section-page { padding: 12px 14px; }
      body { font-size: 10px; }
    }
  </style>
</head>
<body>
  ${sectionTables}
  <script>
    // Auto-trigger print dialog when opened in a new tab
    window.addEventListener('load', () => window.print())
  </script>
</body>
</html>`
}
