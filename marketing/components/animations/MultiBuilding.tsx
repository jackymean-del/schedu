"use client";

import { useInView } from "./useInView";

/**
 * 02 · Multi-building / room allocation. See design/marketing-motion/02-multi-building.md.
 * Budget: 14 KB raw / ≤4 KB gzip · no JS. Single 9s CSS loop; windows share
 * one `<defs>` rect via `<use>`, staggered per-period via animation-delay.
 */

const TINTS = ["#DDD6FE", "#BFDBFE", "#FBCFE8", "#FDE68A"];

// Each window: which building/position it sits at, which period (0-3) it
// lights up in, and a subject tint. Deliberately interleaved across
// buildings within a period to read as cross-building placement.
const WINDOWS = [
  { x: 60, y: 130, period: 0, tint: 0 },
  { x: 84, y: 130, period: 1, tint: 1 },
  { x: 60, y: 156, period: 0, tint: 2 },
  { x: 84, y: 156, period: 2, tint: 0 },
  { x: 190, y: 100, period: 0, tint: 1 },
  { x: 214, y: 100, period: 1, tint: 3 },
  { x: 238, y: 100, period: 0, tint: 2 },
  { x: 190, y: 126, period: 2, tint: 0 },
  { x: 214, y: 126, period: 0, tint: 1 },
  { x: 238, y: 126, period: 1, tint: 3 },
  { x: 190, y: 152, period: 2, tint: 2 },
  { x: 214, y: 152, period: 0, tint: 0 },
  { x: 238, y: 152, period: 1, tint: 1 },
  { x: 330, y: 145, period: 1, tint: 1, wide: true },
];

const PERIODS = ["P1", "P2", "P3", "P4"];

export function MultiBuilding() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="mb-wrap" style={{ contentVisibility: "auto", position: "relative" }}>
      <svg viewBox="0 0 400 220" className={`mb-campus ${inView ? "is-playing" : ""}`} role="img" aria-label="Illustrative animation of schedU assigning rooms across buildings">
        <ellipse cx={200} cy={196} rx={170} ry={10} fill="#F0EDFF" />

        {/* Science Block */}
        <g>
          <rect x={40} y={90} width={70} height={80} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <rect x={110} y={100} width={14} height={70} fill="#EDE9FF" stroke="#13111E" strokeWidth={1.5} />
          <text x={40} y={82} className="mb-label">Science Block</text>
        </g>

        {/* Main Block */}
        <g>
          <rect x={170} y={60} width={100} height={110} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <rect x={270} y={72} width={16} height={98} fill="#EDE9FF" stroke="#13111E" strokeWidth={1.5} />
          <text x={170} y={52} className="mb-label">Main Block</text>
        </g>

        {/* Sports Hall */}
        <g>
          <rect x={305} y={128} width={72} height={42} fill="#FAF9F5" stroke="#13111E" strokeWidth={1.5} />
          <text x={305} y={122} className="mb-label">Sports Hall</text>
        </g>

        {/* windows */}
        <defs>
          <rect id="mb-win" width={16} height={16} rx={3} />
        </defs>
        {WINDOWS.map((w, i) => (
          <use
            key={i}
            href="#mb-win"
            x={w.wide ? w.x : w.x}
            y={w.y}
            width={w.wide ? 40 : 16}
            className={`mb-window mb-window-p${w.period}`}
            style={{ fill: TINTS[w.tint], animationDelay: `${(i % 5) * 0.06}s` }}
          />
        ))}

        {/* period ticker */}
        <g transform="translate(40, 200)">
          <line x1={0} y1={0} x2={300} y2={0} stroke="#E8E4FF" strokeWidth={2} />
          {PERIODS.map((p, i) => (
            <text key={p} x={i * 100} y={16} className="mb-tick-label">{p}</text>
          ))}
          <circle className="mb-knob" cy={0} r={5} fill="#D4920E" />
        </g>
      </svg>
      <div className="mb-caption">Illustrative demo</div>

      <style>{`
        .mb-wrap { width: 100%; max-width: 480px; }
        .mb-campus { width: 100%; height: auto; display: block; }
        .mb-label { font: 700 8px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; }
        .mb-tick-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; text-anchor: middle; }
        .mb-caption { margin-top: 8px; text-align: right; font-size: 11px; color: #8B87AD; font-weight: 500; }

        .mb-window { opacity: 0; }
        .mb-window, .mb-knob {
          animation-duration: 9s;
          animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite;
          animation-play-state: paused;
        }
        .is-playing .mb-window, .is-playing .mb-knob { animation-play-state: running; }

        @keyframes mb-lit-p0 { 0%,9%{opacity:0} 12%,75%{opacity:1} 91%{opacity:0.6} 100%{opacity:0} }
        @keyframes mb-lit-p1 { 0%,29%{opacity:0} 33%,75%{opacity:1} 91%{opacity:0.6} 100%{opacity:0} }
        @keyframes mb-lit-p2 { 0%,56%{opacity:0} 60%,75%{opacity:1} 91%{opacity:0.6} 100%{opacity:0} }
        @keyframes mb-lit-p3 { 0%,76%{opacity:0} 80%,90%{opacity:1} 91%{opacity:0.6} 100%{opacity:0} }
        .mb-window-p0 { animation-name: mb-lit-p0; }
        .mb-window-p1 { animation-name: mb-lit-p1; }
        .mb-window-p2 { animation-name: mb-lit-p2; }
        .mb-window-p3 { animation-name: mb-lit-p3; }

        @keyframes mb-knob-move {
          0%,9%   { transform: translateX(0); }
          29%     { transform: translateX(100px); }
          56%     { transform: translateX(200px); }
          76%,90% { transform: translateX(300px); }
          100%    { transform: translateX(0); }
        }
        .mb-knob { animation-name: mb-knob-move; }

        @media (prefers-reduced-motion: reduce) {
          .mb-window, .mb-knob { animation: none !important; }
          /* Campus fully lit, dot on P4 — everything placed */
          .mb-window { opacity: 1 !important; }
          .mb-knob { transform: translateX(300px) !important; }
        }
      `}</style>
    </div>
  );
}
