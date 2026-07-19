/**
 * Reusable export helpers — Excel (SheetJS, lazily loaded on demand) and
 * shared print branding (institution info + schedU mark). The actual Print/PDF
 * preview lives in components/PrintDoc.tsx (the standardized PrintPreview).
 */
import { useAuthStore } from '@/store/authStore'
import { useTimetableStore } from '@/store/timetableStore'

export interface ExportSheet {
  name: string
  /** Array-of-arrays: first row is the header. */
  rows: (string | number)[][]
}

/** Download one or more sheets as a single .xlsx workbook. */
export async function exportSheetsToXLSX(filename: string, sheets: ExportSheet[]): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.length ? s.rows : [['(no data)']])
    XLSX.utils.book_append_sheet(wb, ws, (s.name || 'Sheet').slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/** schedU Fader-U mark (white stroke + gold knob) for the print footer watermark. */
export const SCHEDU_MARK = `<svg width="22" height="22" viewBox="0 0 52 52" fill="none"><path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" stroke="white" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="36" cy="12.5" r="4.5" fill="#D4920E"/></svg>`

/**
 * Institution branding for print/PDF headers, read from the stores
 * (best-effort). `isPaid` controls whether the schedU footer watermark shows.
 * Product decision: exports are watermark-free on EVERY tier — a printed
 * timetable is the school's own document, so we never brand it. Pro is
 * differentiated by capacity/limits, not by watermarking Free. Hence isPaid is
 * always true here; the field is kept so print components need no change.
 */
export function institutionInfo(): { name: string; logo?: string; address?: string; isPaid: boolean } {
  const user = useAuthStore.getState().user as any
  const cfg = useTimetableStore.getState().config as any
  const org = (useTimetableStore.getState() as any).organization
  const name =
    user?.schoolName || org?.name || cfg?.schoolName || cfg?.orgName || cfg?.institutionName || 'Your Institution'
  const logo = org?.logoUrl || cfg?.logoUrl || user?.logoUrl || undefined
  const address = org?.address || cfg?.address || user?.address || undefined
  const isPaid = true // watermark-free for all tiers (see note above)
  return { name, logo, address, isPaid }
}

