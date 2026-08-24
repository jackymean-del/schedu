/**
 * Reusable export controls — a simple Export dropdown (Excel + PDF) plus a
 * prominent Print button. Both PDF and Print open the shared, standardized
 * PrintPreview (institution header on top, schedU watermark footer, paper-saving
 * toggle). Paper size + orientation are chosen in the printer dialog.
 */
import { useState, useRef, useEffect } from 'react'
import { exportSheetsToXLSX, type ExportSheet } from '@/lib/exportData'
import { PrintPreview, DataTable, type PrintItem } from '@/components/PrintDoc'

export function ExportControls({ filename, sheets, title = 'Report' }: {
  filename: string
  sheets: () => ExportSheet[]
  /** Document heading shown in the printed/PDF header (e.g. "Master Data"). */
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<PrintItem[] | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const openPreview = () => {
    // One block per table (Classes, Subjects, …) so the printer can pack them.
    setPreview(sheets().map(sh => ({ key: sh.name, node: <DataTable sheet={sh} /> })))
    setOpen(false)
  }

  const menuItem: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px',
    border: 'none', background: 'none', textAlign: 'left', fontSize: 12.5, color: '#374151', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Export dropdown — Excel + PDF */}
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', border: '1px solid #E5EBF5', borderRadius: 8, background: '#fff', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          ↑ Export ▾
        </button>
        {open && (
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300, background: '#fff', border: '1px solid #E5EBF5', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 200, padding: '6px 0' }}>
            <button style={menuItem}
              onClick={() => {
                setExportError(null)
                // The promise was previously dropped: when the workbook could not
                // be built the menu closed and no file appeared, with nothing said.
                exportSheetsToXLSX(filename, sheets())
                  .catch(err => setExportError(err?.message ? String(err.message) : 'Could not build the Excel file.'))
                setOpen(false)
              }}>
              <span style={{ fontSize: 15 }}>📊</span> Export to Excel
            </button>
            <button style={menuItem} onClick={openPreview}>
              <span style={{ fontSize: 15 }}>📄</span> Export to PDF
            </button>
          </div>
        )}
      </div>

      {exportError && (
        <div role="alert" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 301,
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8,
          padding: '7px 10px', fontSize: 11.5, maxWidth: 280, lineHeight: 1.45 }}>
          {exportError}{' '}
          <button onClick={() => setExportError(null)}
            style={{ background: 'none', border: 'none', color: '#991B1B', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Prominent Print button — opens the shared preview */}
      <button onClick={openPreview}
        title="Print this page"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', border: 'none', borderRadius: 8, background: '#685DBC', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,111,224,0.35)' }}>
        🖨️ Print
      </button>

      <PrintPreview
        open={preview !== null}
        title={title}
        subtitle={preview ? `${title} · ${preview.length} table${preview.length !== 1 ? 's' : ''}` : ''}
        items={preview ?? []}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}
