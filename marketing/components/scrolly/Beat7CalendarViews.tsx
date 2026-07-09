"use client";

import { useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const SUBJECTS = ["Maths", "Science", "English", "Social Sci."];
const TEACHERS = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul"];
const VENUES = ["R-12", "Lab-1", "R-04", "R-08"];
const TINTS: Record<string, string> = { Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7", "Social Sci.": "#FCE7F3" };
const CELLS = Array.from({ length: 16 }, (_, i) => ({ subject: SUBJECTS[i % 4], teacher: TEACHERS[i % 4], venue: VENUES[i % 4] }));

export function Beat7CalendarViews() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [manual, setManual] = useState<boolean | null>(null);
  const rm = reducedMotion();
  const p = rm ? 1 : progress;
  const autoPrint = p > 0.5 && p < 0.9;
  const isPrint = manual ?? autoPrint;

  return (
    <section ref={ref} data-beat={6} className="beat beat7">
      <div className="b7-caption">Same schedule. Screen or paper.</div>
      <label className="b7-switch">
        <input type="checkbox" checked={isPrint} onChange={(e) => setManual(e.target.checked)} />
        <span className="b7-track"><span className="b7-knob" /></span>
        <span className="b7-switch-label">{isPrint ? "Print" : "Digital"}</span>
      </label>

      <div className={`b7-card ${isPrint ? "is-print" : ""}`}>
        {isPrint && (
          <div className="b7-letterhead">
            <svg width="14" height="14" viewBox="0 0 52 52"><path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22.5" fill="none" stroke="#000" strokeWidth={9} strokeLinecap="round" /><circle cx={36} cy={12} r={5} fill="#000" /></svg>
            <span>schedU · IX-A · Weekly Timetable</span>
          </div>
        )}
        <div className="b7-grid">
          {CELLS.map((c, i) => (
            <div key={i} className="b7-cell" style={{ background: isPrint ? "#fff" : TINTS[c.subject], border: isPrint ? "1px solid #000" : "none" }}>
              <div className="b7-subject" style={{ color: "#13111E" }}>{c.subject}</div>
              <div className="b7-meta" style={{ color: isPrint ? "#333" : "#4B5275" }}>{c.teacher} · {c.venue}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="b7-illustrative">Illustrative demo</div>

      <style>{`
        .beat7 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #fff; }
        .b7-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 20px; }
        .b7-switch { display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 24px; }
        .b7-switch input { display: none; }
        .b7-track { width: 44px; height: 24px; border-radius: 999px; background: #E8E4FF; position: relative; transition: background 0.25s; display: inline-block; }
        .b7-switch input:checked + .b7-track { background: #13111E; }
        .b7-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.25s cubic-bezier(.2,.9,.3,1.1); }
        .b7-switch input:checked ~ .b7-track .b7-knob { transform: translateX(20px); }
        .b7-switch-label { font: 700 13px 'Plus Jakarta Sans', sans-serif; color: #4B5275; }
        .b7-card { width: 100%; max-width: 560px; border-radius: 16px; padding: 18px; background: #FAFAFE; border: 1.5px solid #E8E4FF; transition: background 0.3s; }
        .b7-card.is-print { background: #fff; border-color: #13111E; }
        .b7-letterhead { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font: 700 11px 'Plus Jakarta Sans', sans-serif; }
        .b7-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
        .b7-cell { border-radius: 6px; padding: 6px 8px; min-height: 44px; transition: background 0.3s; }
        .b7-subject { font: 700 11px 'Plus Jakarta Sans', sans-serif; }
        .b7-meta { font: 500 9px 'Plus Jakarta Sans', sans-serif; }
        .b7-illustrative { font-size: 11px; color: #8B87AD; margin-top: 14px; }
      `}</style>
    </section>
  );
}
