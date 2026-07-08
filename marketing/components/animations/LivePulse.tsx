"use client";

import { useEffect, useState } from "react";
import { useInView } from "./useInView";

/**
 * 04 · Live / Pulse — "who's free now". See design/marketing-motion/04-live-pulse.md.
 * Budget: 16 KB raw / ≤5 KB gzip, JS ≤0.5 KB (list content swap only).
 * Mirrors the real Live board's visual language (teaching/break bands,
 * IN SESSION / FREE NOW columns) — an honest preview, not an invented UI.
 */

// Teaching (lavender) vs break (sand) bands across the illustrated window.
const BANDS = [
  { w: 14, type: "teach" }, { w: 4, type: "break" }, { w: 18, type: "teach" },
  { w: 3, type: "break" }, { w: 20, type: "teach" }, { w: 5, type: "break" },
  { w: 16, type: "teach" }, { w: 4, type: "break" }, { w: 16, type: "teach" },
];

const CLOCKS = ["10:25 AM", "11:05 AM", "11:35 AM", "12:10 PM", "12:40 PM"];

type Phase = 0 | 1 | 2 | 3 | 4;
const PHASE_DURATIONS: Record<Phase, number> = { 0: 500, 1: 3500, 2: 4000, 3: 2500, 4: 1500 };

const SESSIONS: Record<Phase, { id: string; label: string; fresh?: boolean }[]> = {
  0: [
    { id: "a", label: "VIII-A · Maths · Mr. Rao" },
    { id: "b", label: "VI-B · Science · Ms. Paul" },
    { id: "c", label: "IX-C · English · Mr. Das" },
    { id: "d", label: "X-A · History · Mrs. Iyer" },
  ],
  1: [
    { id: "b", label: "VI-B · Science · Ms. Paul" },
    { id: "c", label: "IX-C · English · Mr. Das" },
    { id: "d", label: "X-A · History · Mrs. Iyer" },
    { id: "e", label: "VII-C · English · Ms. Iyer", fresh: true },
  ],
  2: [{ id: "e", label: "VII-C · English · Ms. Iyer" }],
  3: [
    { id: "e", label: "VII-C · English · Ms. Iyer" },
    { id: "f", label: "VIII-B · Maths · Mr. Sharma", fresh: true },
  ],
  4: [
    { id: "e", label: "VII-C · English · Ms. Iyer" },
    { id: "f", label: "VIII-B · Maths · Mr. Sharma" },
  ],
};

const FREE: Record<Phase, string[]> = {
  0: ["Ms. Iyer", "Mr. Das", "Mr. Sharma"],
  1: ["Mr. Das", "Mr. Sharma"],
  2: ["Mr. Rao", "Mr. Das", "Mr. Sharma", "Mrs. Iyer"],
  3: ["Mr. Rao", "Mrs. Iyer"],
  4: ["Mr. Rao", "Ms. Paul", "Mr. Das"],
};

export function LivePulse() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion: freeze on the 4-8s designed static frame — no JS cycling either.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(2);
      return;
    }
    let cancelled = false;
    let current: Phase = 0;
    setPhase(0);
    function tick() {
      if (cancelled) return;
      const timer = setTimeout(() => {
        if (cancelled) return;
        current = ((current + 1) % 5) as Phase;
        setPhase(current);
        tick();
      }, PHASE_DURATIONS[current]);
      return timer;
    }
    const t = tick();
    return () => { cancelled = true; if (t) clearTimeout(t); };
  }, [inView]);

  const clockIdx = Math.min(phase, CLOCKS.length - 1);

  return (
    <div ref={ref} className="lp-wrap">
      <div className="lp-header">
        <div>
          <span className="lp-clock">{CLOCKS[clockIdx]}</span>
          <span className="lp-sub">
            {phase === 2 ? "Break" : "In session · updating"}
          </span>
        </div>
        <span className="lp-live"><span className="lp-live-dot" /> Live</span>
      </div>

      <svg viewBox="0 0 640 40" className={`lp-scrub ${inView ? "is-playing" : ""}`}>
        <g>
          {(() => {
            let x = 0;
            return BANDS.map((b, i) => {
              const rect = (
                <rect
                  key={i}
                  x={x}
                  y={12}
                  width={b.w * 6.3}
                  height={16}
                  rx={6}
                  fill={b.type === "teach" ? "#DDD6FE" : "#F5E9C9"}
                />
              );
              x += b.w * 6.3;
              return rect;
            });
          })()}
        </g>
        <circle className="lp-playhead" cy={20} r={7} fill="#D4920E" />
      </svg>

      <div className="lp-cols">
        <div className="lp-col">
          <div className="lp-col-label">IN SESSION · {SESSIONS[phase].length}</div>
          <ul className="lp-list">
            {SESSIONS[phase].map((s) => (
              <li key={s.id} className={`lp-card ${s.fresh ? "lp-fresh" : ""}`}>{s.label}</li>
            ))}
          </ul>
        </div>
        <div className="lp-col">
          <div className="lp-col-label">FREE NOW · {FREE[phase].length}</div>
          <ul className="lp-list lp-chips">
            {FREE[phase].map((name) => (
              <li key={name} className="lp-chip">{name}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="lp-caption">Illustrative demo — the Live board with sample data</div>

      <style>{`
        .lp-wrap { width: 100%; max-width: 640px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .lp-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .lp-clock { font-size: 18px; font-weight: 800; color: #13111E; margin-right: 10px; }
        .lp-sub { font-size: 12px; color: #8B87AD; }
        .lp-live { font-size: 12px; font-weight: 700; color: #16A34A; display: inline-flex; align-items: center; gap: 5px; }
        .lp-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22C55E; animation: lp-live-pulse 1.6s ease-in-out infinite; }
        @keyframes lp-live-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        .lp-scrub { width: 100%; height: 24px; display: block; margin-bottom: 16px; }
        .lp-playhead { animation-duration: 12s; animation-timing-function: linear; animation-iteration-count: infinite; animation-play-state: paused; offset-path: path("M 0 20 L 640 20"); }
        .is-playing .lp-playhead { animation-play-state: running; }
        @keyframes lp-scrub-move { 0%,4%{offset-distance:0%} 87.5%{offset-distance:98%} 100%{offset-distance:98%} }
        .lp-playhead { animation-name: lp-scrub-move; }

        .lp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .lp-col-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8B87AD; margin-bottom: 8px; }
        .lp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 120px; }
        .lp-card {
          background: #FAFAFE; border: 1px solid #E8E4FF; border-radius: 8px;
          padding: 7px 10px; font-size: 12px; color: #13111E;
          animation: lp-fade-in 0.4s ease both;
        }
        .lp-fresh { border-color: #C4B5FD; background: #F5F3FF; }
        .lp-chips { flex-direction: row; flex-wrap: wrap; align-content: flex-start; }
        .lp-chip {
          background: #EDE9FF; color: #7C6FE0; border-radius: 999px;
          padding: 5px 12px; font-size: 12px; font-weight: 600;
          animation: lp-fade-in 0.4s ease both;
        }
        @keyframes lp-fade-in { 0%{ opacity:0; transform: translateY(6px); } 100%{ opacity:1; transform: translateY(0); } }

        .lp-caption { margin-top: 12px; font-size: 11px; color: #8B87AD; font-weight: 500; }

        @media (prefers-reduced-motion: reduce) {
          .lp-live-dot, .lp-playhead { animation: none !important; }
          .lp-card, .lp-chip { animation: none !important; }
          .lp-playhead { offset-distance: 55%; }
        }
      `}</style>
    </div>
  );
}
