import { useTimetableStore } from "@/store/timetableStore"
import { safeSheetName } from '@/lib/sheetNames'
import { ORG_CONFIGS } from "@/lib/orgData"
import { buildExportSheets, exportFileName, type ExcelFormat } from '@/lib/exportSheets'

export type { ExcelFormat }

/**
 * Excel exports of the timetable. What goes in each sheet is decided by
 * lib/exportSheets (pure, checked by export-verify); this only writes the file.
 */
export function useExport() {
  const { config, sections, staff, periods, classTT } = useTimetableStore()

  const exportXLSX = async (format: ExcelFormat = "class-class") => {
    if (!sections.length) return
    const XLSX = await import("xlsx")
    const org = ORG_CONFIGS[config.orgType ?? "school"]
    const sheets = buildExportSheets(format, {
      config, sections, staff, periods, classTT,
      sectionLabel: org.sectionLabel, staffLabel: org.staffLabel,
    })
    const wb = XLSX.utils.book_new()
    // One workbook, so one register of names: two sections called I-A - which
    // this app allows - would otherwise collide and produce no file.
    const usedSheets = new Set<string>()
    for (const sh of sheets) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), safeSheetName(sh.name, usedSheets))
    }
    XLSX.writeFile(wb, exportFileName(config.timetableName, format))
  }

  return { exportXLSX }
}
