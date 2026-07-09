"use client";

import { useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const TINTS = ["#DDD6FE", "#BFDBFE", "#FBCFE8", "#FDE68A"];
const WINDOWS = [
  { x: 60, y: 130, period: 0, tint: 0, bldg: "sci" },
  { x: 84, y: 130, period: 1, tint: 1, bldg: "sci" },
  { x: 60, y: 156, period: 0, tint: 2, bldg: "sci" },
  { x: 190, y: 100, period: 0, tint: 1, bldg: "main" },
  { x: 214, y: 100, period: 1, tint: 3, bldg: "main" },
  { x: 238, y: 100, period: 2, tint: 2, bldg: "main" },
  { x: 190, y: 126, period: 1, tint: 0, bldg: "main" },
  { x: 214, y: 126, period: 0, tint: 1, bldg: "main" },
  { x: 238, y: 126, period: 3, tint: 3, bldg: "main" },
  { x: 190, y: 152, period: 2, tint: 2, bldg: "main" },
  { x: 214, y: 152, period: 0, tint: 0, bldg: "main" },
  { x: 330, y: 145, period: 1, tint: 1, bldg: "hall", wide: true },
];

export function Beat4RoomBuilding() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [zoom, setZoom] = useState<string | null>(null);
  const rm = reducedMotion();
  const p = rm ? 1 : progress;

  const period = p < 0.28 ? 0 : p < 0.55 ? 1 : p < 0.7 ? 2 : 3;
  const sciBreak = p > 0.35 && p < 0.7;
  const mainBreak = p > 0.55 && p < 0.85;

  return (
    <section ref={ref} data-beat={3} className="beat beat4">
      <div className="b4-caption">Every building. Every room. Synced.</div>
      <svg viewBox="0 0 400 220" className="b4-svg">
        <ellipse cx={200} cy={196} rx={170} ry={10} fill="#F0EDFF" />

        <g className={`b4-bldg ${zoom === "sci" ? "is-zoomed" : zoom ? "is-dim" : ""}`} onClick={() => setZoom(zoom === "sci" ? null : "sci")}>
          <rect x={40} y={90} width={70} height={80} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <rect x={110} y={100} width={14} height={70} fill="#EDE9FF" stroke="#13111E" strokeWidth={1.5} />
          <text x={40} y={82} className="b4-label">Science Block</text>
          {sciBreak && <rect x={44} y={100} width={62} height={10} rx={3} fill="#F5E9C9" />}
        </g>

        <g className={`b4-bldg ${zoom === "main" ? "is-zoomed" : zoom ? "is-dim" : ""}`} onClick={() => setZoom(zoom === "main" ? null : "main")}>
          <rect x={170} y={60} width={100} height={110} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <rect x={270} y={72} width={16} height={98} fill="#EDE9FF" stroke="#13111E" strokeWidth={1.5} />
          <text x={170} y={52} className="b4-label">Main Block</text>
          {mainBreak && <rect x={176} y={72} width={88} height={10} rx={3} fill="#F5E9C9" />}
        </g>

        <g className={`b4-bldg ${zoom === "hall" ? "is-zoomed" : zoom ? "is-dim" : ""}`} onClick={() => setZoom(zoom === "hall" ? null : "hall")}>
          <rect x={305} y={128} width={72} height={42} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <text x={305} y={122} className="b4-label">Sports Hall</text>
        </g>

        <defs><rect id="b4-win" width={16} height={16} rx={3} /></defs>
        {WINDOWS.map((w, i) => {
          const lit = w.period <= period;
          return (
            <use key={i} href="#b4-win" x={w.x} y={w.y} width={w.wide ? 40 : 16}
              fill={lit ? TINTS[w.tint] : "#EDE9FF"} opacity={lit ? 1 : 0.3} style={{ transition: "opacity 0.4s, fill 0.4s" }} />
          );
        })}

        <g transform="translate(40, 200)">
          <line x1={0} y1={0} x2={300} y2={0} stroke="#E8E4FF" strokeWidth={2} />
          {["P1", "P2", "P3", "P4"].map((lb, i) => (
            <text key={lb} x={i * 100} y={16} className="b4-tick">{lb}</text>
          ))}
          <circle cx={period * 100} cy={0} r={5} fill="#D4920E" style={{ transition: "cx 0.4s" }} />
        </g>
      </svg>
      <div className="b4-hint">Click a building to zoom into its rooms</div>
      <div className="b4-illustrative">Illustrative demo</div>

      <style>{`
        .beat4 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #FAFAFE; }
        .b4-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b4-svg { width: 100%; max-width: 640px; height: auto; }
        .b4-bldg { cursor: pointer; transition: opacity 0.3s, transform 0.3s; transform-origin: center; }
        .b4-bldg.is-zoomed { transform: scale(1.15); }
        .b4-bldg.is-dim { opacity: 0.3; }
        .b4-label { font: 700 8px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; }
        .b4-tick { font: 700 10px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; text-anchor: middle; }
        .b4-hint { font-size: 12px; color: #8B87AD; margin-top: 12px; }
        .b4-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
