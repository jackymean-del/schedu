"use client";

import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const CHIPS = [
  { name: "Mr. Rao", load: 18 },
  { name: "Ms. Iyer", load: 14 },
  { name: "Mr. Das", load: 20 },
  { name: "Mrs. Paul", load: 16 },
];
const ASSIGNED = "Ms. Iyer";

export function Beat9TaskManagement() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const rm = reducedMotion();
  const p = rm ? 1 : progress;
  const landed = p > 0.35;
  const showNote = p > 0.55;

  return (
    <section ref={ref} data-beat={8} className="beat beat9">
      <div className="b9-caption">Assigned fairly. Automatically.</div>
      <div className="b9-stage">
        <div className="b9-chips">
          {CHIPS.map((c) => {
            const isTarget = c.name === ASSIGNED && landed;
            return (
              <div key={c.name} className={`b9-chip ${isTarget ? "is-target" : ""}`}>
                <span className="b9-chip-name">{c.name}</span>
                <span className="b9-chip-load">{c.load + (isTarget ? 1 : 0)}</span>
                {isTarget && <div className="b9-task-card">Cover P4 — Room 4, Grade 8B</div>}
              </div>
            );
          })}
        </div>
        {showNote && <div className="b9-note">Ms. Iyer has the lightest load this week — assigned.</div>}
      </div>
      <div className="b9-hint">Hover any name to see their current workload</div>
      <div className="b9-illustrative">Illustrative demo</div>

      <style>{`
        .beat9 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #fff; }
        .b9-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b9-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; max-width: 460px; }
        .b9-chip { position: relative; background: #FAFAFE; border: 1px solid #E8E4FF; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; transition: border-color 0.3s, background 0.3s; }
        .b9-chip.is-target { border-color: #7C6FE0; background: #F5F3FF; }
        .b9-chip-name { font: 700 13px 'Plus Jakarta Sans', sans-serif; color: #13111E; }
        .b9-chip-load { font: 700 12px 'Plus Jakarta Sans', sans-serif; color: #8B87AD; opacity: 0; transition: opacity 0.15s; }
        .b9-chip:hover .b9-chip-load { opacity: 1; }
        .b9-task-card {
          position: absolute; top: -34px; left: 0; right: 0; background: #13111E; color: #fff;
          font-size: 10.5px; padding: 6px 10px; border-radius: 8px; text-align: center;
          animation: b9-in 0.4s cubic-bezier(.2,.9,.3,1.1) both;
        }
        @keyframes b9-in { 0%{opacity:0; transform: translateY(6px);} 100%{opacity:1; transform: translateY(0);} }
        @media (prefers-reduced-motion: reduce) { .b9-task-card { animation: none !important; } }
        .b9-note { margin-top: 18px; font-size: 12px; color: #4B5275; text-align: center; max-width: 320px; }
        .b9-hint { font-size: 12px; color: #8B87AD; margin-top: 16px; }
        .b9-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
