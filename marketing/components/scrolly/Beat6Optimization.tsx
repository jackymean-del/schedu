"use client";

import { useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const TINTS = ["#EDE9FF", "#DBEAFE", "#DCFCE7", "#FCE7F3"];
const CONFLICT_IDX = [3, 14];

export function Beat6Optimization() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [clicked, setClicked] = useState<Set<number>>(new Set());
  const rm = reducedMotion();
  const p = rm ? 1 : progress;

  const autoResolved = (idx: number) => (idx === 3 ? p > 0.5 : p > 0.9);
  const resolved = (idx: number) => clicked.has(idx) || autoResolved(idx);
  const allResolved = CONFLICT_IDX.every(resolved);

  return (
    <section ref={ref} data-beat={5} className="beat beat6">
      <div className="b6-caption">Every conflict — found and fixed.</div>
      <div className="b6-grid">
        {Array.from({ length: 20 }, (_, i) => {
          const isConflict = CONFLICT_IDX.includes(i);
          const isResolved = isConflict && resolved(i);
          return (
            <div key={i} className="b6-cell" style={{ background: TINTS[i % 4], opacity: isConflict && !isResolved ? 0.6 : 1 }}>
              {isConflict && !isResolved && (
                <button type="button" className="b6-badge" onClick={() => setClicked((s) => new Set(s).add(i))}>!</button>
              )}
            </div>
          );
        })}
      </div>
      {allResolved && <div className="b6-clean">✓ 0 conflicts</div>}
      <div className="b6-hint">Click a conflict badge to resolve it now</div>
      <div className="b6-illustrative">Illustrative demo</div>

      <style>{`
        .beat6 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #FAFAFE; }
        .b6-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b6-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; max-width: 480px; }
        .b6-cell { position: relative; border-radius: 8px; min-height: 44px; transition: opacity 0.4s; }
        .b6-badge {
          position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; border-radius: 50%;
          background: #EF4444; color: #fff; font-weight: 800; font-size: 12px; border: 2px solid #fff;
          cursor: pointer; animation: b6-pulse 1.4s ease-in-out infinite;
        }
        @keyframes b6-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        .b6-clean { margin-top: 20px; font: 700 15px 'Plus Jakarta Sans', sans-serif; color: #16A34A; }
        .b6-hint { font-size: 12px; color: #8B87AD; margin-top: 12px; }
        .b6-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
        @media (prefers-reduced-motion: reduce) { .b6-badge { animation: none; } }
      `}</style>
    </section>
  );
}
