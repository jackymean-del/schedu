# Scene 8 — Export → Print / PDF

**Caption:** "Same schedule. Ready to print."
**Duration:** 2200ms
**Source of truth:** `frontend/src/components/master/PublishExportPanel.tsx`
— format cards incl. "Print / PDF" ("opens new tab, auto-triggers browser
print", header comment line 8; label at 86), footer "N formats selected" /
"Choose formats, then click Export" (266, 456-457);
`frontend/src/lib/timetableExport.ts` `buildPrintHTML`.

## Real mechanics (verified — DEVIATION FROM BRIEF)

The brief scripted a "toggle flips grid to print layout." **There is no
Digital/Print toggle in the product.** The real flow: the Publish/Export
panel lists format cards (Excel workbook · Master data CSV · **Print / PDF**
· …); selecting Print/PDF and clicking Export opens a print-formatted page
(monochrome-safe, subject names always text — timetableExport comment
"grayscale prints stay legible", calendar.tsx:1747 shares the principle).
The scene shows that real flow, condensed.

## Mockup structure

```
┌ Export panel ──────────────────────────┐   ┌ print preview ┐
│ Export formats                          │   │ ┌───────────┐ │
│ ┌ 📊 Excel workbook      ┐              │   │ │ B/W grid  │ │
│ ┌ 📄 Master data (CSV)   ┐              │ → │ │ dashed pg │ │
│ ┌ 🖨 Print / PDF        ✓┐  ← selected  │   │ │ border    │ │
│ 1 format selected   [Export]            │   │ └───────────┘ │
└─────────────────────────────────────────┘   └───────────────┘
```

## Cursor path & timing

| ms | action |
|---|---|
| 0–400 | export panel slides in over the scene-7 grid (dimmed behind) |
| 400–700 | cursor to the **Print / PDF** card, **click** at 750 — card gets a ✓ + violet border; footer swaps "Choose formats…" → "1 format selected" |
| 900–1150 | cursor to **Export**, **click** at 1200 |
| 1350 | **outcome:** a "new tab" sheet slides up inside the device frame showing the same IX-A grid re-rendered print-safe: grayscale, hairline borders, dashed page outline, letterhead U-mark + "schedU" wordmark (the Phase-2 print header) |
| 1500–2200 | hold on the print preview |

## RM frame

Print preview sheet visible with the export panel's selected state behind.

## Fidelity notes

- Condensation: the real print flow opens an actual browser tab; the mockup
  represents it as an in-frame sheet. Same artifact, honest rendering.
- The grayscale-legibility trait is real and worth showing — it's a design
  decision the product actually makes.
