"use client";

import { useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const POINTS = [62, 68, 71, 75, 79, 84, 91];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Beat10ReportsAnalytics() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const rm = reducedMotion();
  const p = rm ? 1 : progress;
  const drawn = Math.min(1, Math.max(0, (p - 0.1) / 0.75));
  const visiblePoints = Math.round(drawn * (POINTS.length - 1)) + (drawn > 0 ? 1 : 0);

  const W = 480, H = 200, PAD = 30;
  const coords = POINTS.map((v, i) => ({
    x: PAD + (i / (POINTS.length - 1)) * (W - PAD * 2),
    y: H - PAD - (v / 100) * (H - PAD * 2),
  }));
  const shownCoords = coords.slice(0, Math.max(1, visiblePoints));
  const pathD = shownCoords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <section ref={ref} data-beat={9} className="beat beat10">
      <div className="b10-caption">Track workload and usage over time.</div>
      <div className="b10-card">
        <svg viewBox={`0 0 ${W} ${H}`} className="b10-svg">
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#E8E4FF" strokeWidth={1} />
          <path d={pathD} fill="none" stroke="#7C6FE0" strokeWidth={2.5} strokeLinecap="round" />
          {shownCoords.map((c, i) => (
            <g key={i} onPointerEnter={() => setHoverIdx(i)} onPointerLeave={() => setHoverIdx(null)}>
              <circle cx={c.x} cy={c.y} r={10} fill="transparent" />
              <circle cx={c.x} cy={c.y} r={i === shownCoords.length - 1 ? 5 : 3} fill={i === shownCoords.length - 1 ? "#D4920E" : "#7C6FE0"} />
            </g>
          ))}
          {shownCoords.map((c, i) => (
            <text key={i} x={c.x} y={H - 10} textAnchor="middle" fontSize={9} fill="#8B87AD" fontFamily="'Plus Jakarta Sans',sans-serif">{DAYS[i]}</text>
          ))}
          {hoverIdx !== null && (
            <g transform={`translate(${coords[hoverIdx].x}, ${coords[hoverIdx].y - 14})`}>
              <rect x={-22} y={-20} width={44} height={20} rx={5} fill="#13111E" />
              <text textAnchor="middle" y={-6} fontSize={10} fill="#fff" fontFamily="'Plus Jakarta Sans',sans-serif">{POINTS[hoverIdx]}%</text>
            </g>
          )}
        </svg>
        {visiblePoints >= POINTS.length && (
          <div className="b10-delta">▲ 12% room utilization this week</div>
        )}
      </div>
      <div className="b10-hint">Hover the chart to see exact numbers</div>
      <div className="b10-illustrative">Illustrative demo</div>

      <style>{`
        .beat10 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #FAFAFE; }
        .b10-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b10-card { width: 100%; max-width: 520px; background: #fff; border: 1.5px solid #E8E4FF; border-radius: 16px; padding: 20px; }
        .b10-svg { width: 100%; height: auto; }
        .b10-delta { text-align: center; font: 700 13px 'Plus Jakarta Sans', sans-serif; color: #16A34A; margin-top: 8px; }
        .b10-hint { font-size: 12px; color: #8B87AD; margin-top: 16px; }
        .b10-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
