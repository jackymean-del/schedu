"use client";

import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const TEACHERS = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul", "Mr. Sharma"];
const SUBJECTS = ["Maths", "Science", "English", "Social Sci."];
const VENUES = ["R-12", "Lab-1", "R-04", "R-08"];
const REASONS = ["Least-loaded teacher qualified for this subject", "Matches subject expertise, room free", "Balances weekly load across the section", "Keeps class-teacher continuity"];
const TINTS: Record<string, string> = { Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7", "Social Sci.": "#FCE7F3" };

const CELLS = Array.from({ length: 20 }, (_, i) => ({
  subject: SUBJECTS[i % SUBJECTS.length],
  teacher: TEACHERS[i % TEACHERS.length],
  venue: VENUES[i % VENUES.length],
  reason: REASONS[i % REASONS.length],
  conflict: i === 17 || i === 18,
}));

export function Beat5Allocation() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const rm = reducedMotion();
  const p = rm ? 1 : progress;
  const filled = Math.round(Math.min(1, Math.max(0, (p - 0.06) / 0.84)) * 20);

  return (
    <section ref={ref} data-beat={4} className="beat beat5">
      <div className="b5-caption">Every teacher. Every period. Auto-assigned.</div>
      <div className="b5-grid">
        {CELLS.map((c, i) => {
          const shown = i < filled;
          const flagged = c.conflict && shown && p > 0.9;
          return (
            <div key={i} className={`b5-cell ${shown ? "is-shown" : ""} ${flagged ? "is-flagged" : ""}`} style={{ background: shown ? TINTS[c.subject] : "#FAFAFE" }}>
              {shown && (
                <>
                  <div className="b5-subject">{c.subject}</div>
                  <div className="b5-meta">{c.teacher} · {c.venue}</div>
                  <div className="b5-tooltip">{c.teacher} — {c.reason}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="b5-hint">Hover any cell to see who's assigned and why</div>
      <div className="b5-illustrative">Illustrative demo</div>

      <style>{`
        .beat5 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #fff; }
        .b5-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b5-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; max-width: 560px; }
        .b5-cell { position: relative; border-radius: 8px; padding: 8px 10px; min-height: 56px; transition: background 0.3s, transform 0.25s; transform: scale(0.94); }
        .b5-cell.is-shown { transform: scale(1); }
        .b5-cell.is-flagged { outline: 2px solid #EF4444; }
        .b5-subject { font: 700 12px 'Plus Jakarta Sans', sans-serif; color: #13111E; }
        .b5-meta { font: 500 10px 'Plus Jakarta Sans', sans-serif; color: #4B5275; }
        .b5-tooltip {
          position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          background: #13111E; color: #fff; font-size: 10.5px; padding: 6px 10px; border-radius: 8px;
          white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.15s; z-index: 5;
        }
        .b5-cell:hover .b5-tooltip { opacity: 1; }
        .b5-hint { font-size: 12px; color: #8B87AD; margin-top: 16px; }
        .b5-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
