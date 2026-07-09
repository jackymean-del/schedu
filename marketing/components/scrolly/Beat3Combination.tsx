"use client";

import { useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const CLUSTERS = [
  { key: "phy", x: 260, y: 70, label: "Physics" },
  { key: "chem", x: 260, y: 170, label: "Chemistry" },
];
const GROUPS = [
  { key: "pe", x: 480, y: 70, label: "PE" },
  { key: "paint", x: 480, y: 170, label: "Painting" },
];
const ROWS = [{ y: 40, count: 4 }, { y: 120, count: 3 }, { y: 200, count: 4 }];

function bezier(from: { x: number; y: number }, to: { x: number; y: number }, midX: number) {
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

export function Beat3Combination() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [rerouted, setRerouted] = useState<Set<string>>(new Set());
  const rm = reducedMotion();
  const p = rm ? 0.75 : progress;

  const mergeT = Math.min(1, Math.max(0, (p - 0.1) / 0.28));
  const splitT = Math.min(1, Math.max(0, (p - 0.46) / 0.42));
  const showAndChip = p < 0.46;

  const dots = ROWS.flatMap((row, ri) =>
    Array.from({ length: row.count }, (_, i) => {
      const id = `${ri}-${i}`;
      const cluster = CLUSTERS[(ri + i) % 2];
      const defaultGroup = GROUPS[(ri + i * 2) % 2];
      const group = rerouted.has(id) ? GROUPS.find((g) => g.key !== defaultGroup.key)! : defaultGroup;
      const mergeD = bezier({ x: 40, y: row.y }, cluster, 150);
      const splitD = bezier(cluster, group, 370);
      return { id, mergeD, splitD, delay: (ri * 3 + i) * 0.03 };
    })
  );

  return (
    <section ref={ref} data-beat={2} className="beat beat3">
      <div className="b3-caption">One teacher, two subjects, zero clash.</div>
      <svg viewBox="0 0 560 240" className="b3-svg">
        {ROWS.map((row, ri) => (
          <g key={ri}>
            {Array.from({ length: row.count }, (_, i) => (
              <circle key={i} cx={40 + i * 14} cy={row.y} r={4} fill="#13111E" opacity={0.6} />
            ))}
          </g>
        ))}
        {dots.map((d) => {
          const pathD = showAndChip ? d.mergeD : d.splitD;
          const dist = showAndChip ? Math.max(0, mergeT - d.delay) : Math.max(0, splitT - d.delay);
          return (
            <circle
              key={d.id}
              r={4.5}
              fill="#13111E"
              className="b3-dot"
              style={{ offsetPath: `path("${pathD}")`, offsetDistance: `${Math.min(1, dist) * 100}%`, opacity: dist > 0 ? 1 : 0 }}
              onPointerEnter={() => setRerouted((s) => new Set(s).add(d.id))}
              onPointerLeave={() => setRerouted((s) => { const n = new Set(s); n.delete(d.id); return n; })}
            />
          );
        })}
        {CLUSTERS.map((c) => (
          <g key={c.key} transform={`translate(${c.x},${c.y})`} style={{ opacity: showAndChip ? mergeT : 1 - splitT }}>
            <circle r={26} fill="#EDE9FF" stroke="#7C6FE0" strokeWidth={1.5} />
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="'Plus Jakarta Sans',sans-serif" fill="#13111E">{c.label}</text>
          </g>
        ))}
        {GROUPS.map((g) => (
          <g key={g.key} transform={`translate(${g.x},${g.y})`} style={{ opacity: showAndChip ? 0 : splitT }}>
            <circle r={24} fill={g.key === "pe" ? "#DCFCE7" : "#FCE7F3"} stroke={g.key === "pe" ? "#16A34A" : "#DB2777"} strokeWidth={1.5} />
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="'Plus Jakarta Sans',sans-serif" fill="#13111E">{g.label}</text>
          </g>
        ))}
        <g transform="translate(180, 10)">
          <rect width={200} height={24} rx={12} fill="#13111E" />
          <text x={100} y={16} textAnchor="middle" fontSize={11} fontFamily="'DM Mono',monospace" fill="#fff">
            {showAndChip ? "Physics AND Chemistry" : "PE OR Painting"}
          </text>
        </g>
      </svg>
      <div className="b3-hint">Hover a dot to move it to the other group</div>
      <div className="b3-illustrative">Illustrative demo of the Academic Combination Matrix</div>

      <style>{`
        .beat3 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #fff; }
        .b3-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; text-align: center; }
        .b3-svg { width: 100%; max-width: 720px; height: auto; }
        .b3-dot { offset-rotate: 0deg; transition: opacity 0.2s; }
        .b3-hint { font-size: 12px; color: #8B87AD; margin-top: 8px; }
        .b3-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
