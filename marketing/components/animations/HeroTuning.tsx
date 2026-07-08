"use client";

import { useInView } from "./useInView";

/**
 * 01 · Hero — "Self-tuning" loop. See design/marketing-motion/01-hero-self-tuning.md.
 * Budget: 24 KB raw / ≤7 KB gzip. Pure CSS keyframes on a single 11s loop —
 * every element shares the same clock, so nothing can drift out of sync
 * (no setTimeout sequencer needed).
 */

const TINTS = ["#EDE9FF", "#FEF3C7", "#DCFCE7", "#DBEAFE", "#FCE7F3"];
const COLS = 6;
const ROWS = 5;
const CELL_W = 76;
const CELL_H = 52;
const GRID_GAP = 8;
const GRID_X = 300;
const GRID_Y = 30;

// Two cells start flagged as conflicts; they resolve (lose the red outline)
// at different points in the loop, echoing the two-wave storyboard.
const CONFLICT_CELLS = new Set([3, 17]);

export function HeroTuning() {
  const { ref, inView } = useInView<HTMLDivElement>();

  const cells = Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const isConflict = CONFLICT_CELLS.has(i);
    return {
      i,
      x: GRID_X + col * (CELL_W + GRID_GAP),
      y: GRID_Y + row * (CELL_H + GRID_GAP),
      tint: TINTS[i % TINTS.length],
      isConflict,
    };
  });

  return (
    <div
      ref={ref}
      className="hero-tune-wrap"
      style={{ contentVisibility: "auto", position: "relative" }}
    >
      <svg
        viewBox="0 0 720 400"
        className={`hero-tune ${inView ? "is-playing" : ""}`}
        role="img"
        aria-label="Illustrative animation of schedU's Tuner Console resolving timetable conflicts"
      >
        <g className="ht-console">
          {[0, 1, 2].map((f) => {
            const y = 60 + f * 90;
            return (
              <g key={f} className={`ht-fader ht-fader-${f}`}>
                <line x1={60} y1={y} x2={60} y2={y + 60} stroke="#EDE9FF" strokeWidth={8} strokeLinecap="round" />
                <circle className="ht-knob" cx={60} cy={y + 30} r={9} fill="#D4920E" />
              </g>
            );
          })}
          <text x={30} y={280} className="ht-console-label">Workload</text>
          <text x={30} y={300} className="ht-console-label" style={{ opacity: 0.7 }}>Gaps · Double periods</text>
        </g>

        <g className="ht-grid">
          {cells.map((c) => (
            <g key={c.i}>
              <rect
                x={c.x}
                y={c.y}
                width={CELL_W}
                height={CELL_H}
                rx={8}
                fill={c.tint}
                opacity={0.85}
              />
              {c.isConflict && (
                <rect
                  className={`ht-conflict ht-conflict-${c.i}`}
                  x={c.x}
                  y={c.y}
                  width={CELL_W}
                  height={CELL_H}
                  rx={8}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={2.5}
                />
              )}
            </g>
          ))}
        </g>

        <g className="ht-badge" transform={`translate(${GRID_X + COLS * (CELL_W + GRID_GAP) - 34}, ${GRID_Y - 18})`}>
          <circle r={13} fill="#EF4444" />
          <text className="ht-badge-2" textAnchor="middle" dy={5}>2</text>
          <text className="ht-badge-1" textAnchor="middle" dy={5}>1</text>
          <text className="ht-badge-0" textAnchor="middle" dy={5}>0</text>
        </g>

        <g className="ht-stamp" transform={`translate(${GRID_X}, ${GRID_Y + ROWS * (CELL_H + GRID_GAP) + 8})`}>
          <rect width={140} height={30} rx={15} fill="#13111E" />
          <circle cx={18} cy={15} r={5} fill="#D4920E" />
          <text x={32} y={20} className="ht-stamp-text">0 conflicts</text>
        </g>
      </svg>
      <div className="ht-caption">Illustrative demo</div>

      <style>{`
        .hero-tune-wrap { width: 100%; max-width: 640px; }
        .hero-tune { width: 100%; height: auto; display: block; }
        .ht-console-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; }
        .ht-stamp-text { font: 700 12px 'Plus Jakarta Sans', sans-serif; fill: #fff; }
        .ht-badge text { font: 800 12px 'Plus Jakarta Sans', sans-serif; fill: #fff; }
        .ht-caption {
          position: absolute; bottom: 4px; left: 8px;
          font-size: 11px; color: #8B87AD; font-weight: 500;
        }

        .ht-knob, .ht-conflict, .ht-badge-2, .ht-badge-1, .ht-badge-0, .ht-stamp {
          animation-duration: 11s;
          animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite;
          animation-play-state: paused;
        }
        .is-playing .ht-knob, .is-playing .ht-conflict,
        .is-playing .ht-badge-2, .is-playing .ht-badge-1, .is-playing .ht-badge-0,
        .is-playing .ht-stamp { animation-play-state: running; }

        @keyframes ht-knob-0 { 0%,10%{transform:translateY(0)} 18%,100%{transform:translateY(-14px)} }
        @keyframes ht-knob-1 { 0%,30%{transform:translateY(0)} 38%,100%{transform:translateY(8px)} }
        .ht-fader-0 .ht-knob { animation-name: ht-knob-0; }
        .ht-fader-1 .ht-knob { animation-name: ht-knob-1; }
        .ht-fader-2 .ht-knob { animation: none; }

        @keyframes ht-resolve-early { 0%,18%{opacity:1} 30%,100%{opacity:0} }
        @keyframes ht-resolve-late  { 0%,38%{opacity:1} 51%,100%{opacity:0} }
        .ht-conflict-3  { animation-name: ht-resolve-early; }
        .ht-conflict-17 { animation-name: ht-resolve-late; }

        .ht-badge-2, .ht-badge-1, .ht-badge-0 { opacity: 0; }
        @keyframes ht-badge-2 { 0%,16%{opacity:1} 30%,100%{opacity:0} }
        @keyframes ht-badge-1 { 0%,30%{opacity:0} 33%,49%{opacity:1} 52%,100%{opacity:0} }
        @keyframes ht-badge-0 { 0%,51%{opacity:0} 55%,100%{opacity:1} }
        .ht-badge-2 { animation-name: ht-badge-2; }
        .ht-badge-1 { animation-name: ht-badge-1; }
        .ht-badge-0 { animation-name: ht-badge-0; }

        .ht-stamp { opacity: 0; transform-origin: 0 15px; }
        @keyframes ht-stamp {
          0%,51%{ opacity:0; transform:scale(.7); }
          58%{ opacity:1; transform:scale(1.05); }
          62%,85%{ opacity:1; transform:scale(1); }
          86%{ opacity:0.85; }
          90%,96%{ opacity:1; }
          100%{ opacity:0; transform:scale(.9); }
        }
        .ht-stamp { animation-name: ht-stamp; }

        @media (prefers-reduced-motion: reduce) {
          .ht-knob, .ht-conflict, .ht-badge-2, .ht-badge-1, .ht-badge-0, .ht-stamp {
            animation: none !important;
          }
          /* Pin to the resolved end state: faders settled, no conflicts, stamp visible */
          .ht-fader-0 .ht-knob { transform: translateY(-14px); }
          .ht-fader-1 .ht-knob { transform: translateY(8px); }
          .ht-conflict { opacity: 0 !important; }
          .ht-badge-2, .ht-badge-1 { opacity: 0 !important; }
          .ht-badge-0 { opacity: 1 !important; }
          .ht-stamp { opacity: 1 !important; transform: scale(1) !important; }
        }
      `}</style>
    </div>
  );
}
