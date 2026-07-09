"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const CHIPS = [
  { key: "faculty", label: "Faculty", max: 42, range: [0.08, 0.27] as [number, number] },
  { key: "class", label: "Classes", max: 24, range: [0.27, 0.46] as [number, number] },
  { key: "venue", label: "Venues", max: 9, range: [0.46, 0.58] as [number, number] },
  { key: "subject", label: "Subjects", max: 18, range: [0.58, 0.7] as [number, number] },
];
const TINTS = ["#EDE9FF", "#DBEAFE", "#DCFCE7", "#FCE7F3"];

export function Beat2DataFeeding() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [manualMode, setManualMode] = useState<"visual" | "data" | null>(null);
  const rm = reducedMotion();
  const p = rm ? 1 : progress;

  const counts = CHIPS.map((c) => {
    const [a, b] = c.range;
    const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
    return Math.round(t * c.max);
  });
  const litCells = counts.reduce((n, c, i) => n + (c >= CHIPS[i].max ? 5 : 0), 0);
  const showLinked = p > 0.72 && p < 0.9;
  const autoMode = p > 0.9 ? "data" : "visual";
  const mode = manualMode ?? autoMode;

  return (
    <section ref={ref} data-beat={1} id="beat-2" className="beat beat2">
      <div className="b2-caption">Add teachers, classes, rooms — in seconds.</div>
      <div className="b2-layout">
        <div className="b2-chips">
          {CHIPS.map((c, i) => (
            <div key={c.key} className="b2-chip">
              <div className="b2-chip-num">{counts[i]}</div>
              <div className="b2-chip-label">{c.label}</div>
              {c.key === "faculty" && showLinked && counts[i] >= c.max && (
                <div className="b2-linked">Mr. Rao — linked ✓</div>
              )}
            </div>
          ))}
          <button
            type="button"
            className="b2-toggle"
            onClick={() => setManualMode(mode === "visual" ? "data" : "visual")}
          >
            {mode === "visual" ? "Visual mode" : "Data mode"} — click to flip
          </button>
        </div>

        <div className="b2-stage">
          {mode === "visual" ? (
            <div className="b2-grid">
              {Array.from({ length: 20 }, (_, i) => (
                <div key={i} className="b2-cell" style={{ background: i < litCells ? TINTS[i % 4] : "#FAFAFE", opacity: i < litCells ? 1 : 0.4 }} />
              ))}
            </div>
          ) : (
            <table className="b2-table">
              <thead><tr><th>Type</th><th>Count</th></tr></thead>
              <tbody>
                {CHIPS.map((c, i) => <tr key={c.key}><td>{c.label}</td><td>{counts[i]}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="b2-illustrative">Illustrative demo</div>

      <style>{`
        .beat2 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 60px 6vw; background: #FAFAFE; position: relative; }
        .b2-caption { text-align: center; font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 36px; }
        .b2-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; max-width: 1000px; margin: 0 auto; align-items: center; width: 100%; }
        .b2-chips { display: flex; flex-direction: column; gap: 14px; }
        .b2-chip { background: #fff; border: 1px solid #E8E4FF; border-radius: 14px; padding: 14px 18px; position: relative; }
        .b2-chip-num { font-size: 28px; font-weight: 800; color: #13111E; font-family: 'Plus Jakarta Sans', sans-serif; }
        .b2-chip-label { font-size: 11px; font-weight: 700; color: #8B87AD; text-transform: uppercase; letter-spacing: 0.06em; }
        .b2-linked { position: absolute; top: 10px; right: 14px; font-size: 10px; font-weight: 700; color: #16A34A; background: #F0FDF4; border-radius: 6px; padding: 3px 7px; }
        .b2-toggle { margin-top: 6px; font-size: 12px; font-weight: 700; color: #7C6FE0; background: #EDE9FF; border: none; border-radius: 999px; padding: 8px 14px; cursor: pointer; }
        .b2-stage { background: #fff; border: 1px solid #E8E4FF; border-radius: 16px; padding: 20px; min-height: 220px; }
        .b2-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        .b2-cell { height: 34px; border-radius: 6px; transition: background 0.3s, opacity 0.3s; }
        .b2-table { width: 100%; border-collapse: collapse; font-family: 'Plus Jakarta Sans', sans-serif; }
        .b2-table th, .b2-table td { border: 1px solid #E8E4FF; padding: 8px 10px; font-size: 13px; text-align: left; }
        .b2-table th { background: #F8F7FF; color: #4B5275; }
        .b2-illustrative { text-align: center; margin-top: 20px; font-size: 11px; color: #8B87AD; }
        @media (max-width: 780px) { .b2-layout { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
