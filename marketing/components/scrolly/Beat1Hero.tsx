"use client";

import { useRef, useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";
import { appHref } from "@/lib/appUrl";

const CONFLICT_CELLS = new Set([3, 11]);

export function Beat1Hero() {
  const { ref, progress, inView } = useScrollProgress<HTMLElement>();
  const [dragNudge, setDragNudge] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null);
  const rm = reducedMotion();

  const p = rm ? 1 : progress;
  const fader1 = dragNudge ?? Math.min(1, p / 0.35);
  const fader2 = Math.min(1, Math.max(0, (p - 0.35) / 0.2));
  const badgeCount = p < 0.35 ? 2 : p < 0.55 ? 1 : 0;
  const stampVisible = p > 0.55;
  const exitFade = p > 0.7 ? 1 - Math.min(1, (p - 0.7) / 0.3) * 0.15 : 1;

  function onFaderDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientY, startVal: fader1 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onFaderMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const delta = (dragRef.current.startX - e.clientY) / 90;
    setDragNudge(Math.min(1, Math.max(0, dragRef.current.startVal + delta)));
  }
  function onFaderUp() {
    dragRef.current = null;
    setTimeout(() => setDragNudge(null), 600);
  }

  return (
    <section ref={ref} data-beat={0} className="beat beat1" style={{ opacity: exitFade }}>
      <div className="b1-grid-layout">
        <div className="b1-copy">
          <h1 className="b1-h1">The last schedule you&rsquo;ll ever <span className="italic">fix by hand.</span></h1>
          <p className="b1-sub">
            Tune it like sound, resolve it like a puzzle — across every building, room,
            and combination your institution runs.
          </p>
          <div className="b1-cta">
            <a href={appHref("/login")} className="no-underline">
              <button className="b1-btn-primary">Start free — no credit card</button>
            </a>
            <a href="#beat-2" className="no-underline">
              <button className="b1-btn-secondary">See how it works</button>
            </a>
          </div>
        </div>

        <div className="b1-scene">
          <div className="b1-caption">Your full timetable. Built in seconds.</div>
          <svg viewBox="0 0 380 220" className="b1-svg">
            <g className="b1-console">
              {[0, 1, 2].map((f) => {
                const val = f === 0 ? fader1 : f === 1 ? fader2 : 0.5;
                return (
                  <g key={f} transform={`translate(${20 + f * 26}, 20)`}>
                    <line x1={0} y1={0} x2={0} y2={90} stroke="#E8E4FF" strokeWidth={6} strokeLinecap="round" />
                    <circle
                      className={f === 0 ? "b1-drag-knob" : ""}
                      cx={0}
                      cy={90 - val * 70}
                      r={7}
                      fill="#D4920E"
                      style={{ cursor: f === 0 ? "grab" : "default" }}
                      onPointerDown={f === 0 ? onFaderDown : undefined}
                      onPointerMove={f === 0 ? onFaderMove : undefined}
                      onPointerUp={f === 0 ? onFaderUp : undefined}
                    />
                  </g>
                );
              })}
            </g>
            <g transform="translate(120, 20)">
              {Array.from({ length: 20 }, (_, i) => {
                const col = i % 5, row = Math.floor(i / 5);
                const isConflict = CONFLICT_CELLS.has(i);
                const resolved = isConflict && (i === 3 ? p > 0.35 : p > 0.55);
                return (
                  <g key={i} transform={`translate(${col * 46}, ${row * 24})`}>
                    <rect width={40} height={18} rx={4} fill={["#EDE9FF", "#DBEAFE", "#DCFCE7", "#FCE7F3"][i % 4]} opacity={0.85} />
                    {isConflict && !resolved && (
                      <rect width={40} height={18} rx={4} fill="none" stroke="#EF4444" strokeWidth={2} />
                    )}
                  </g>
                );
              })}
            </g>
            {stampVisible && (
              <g transform="translate(260, 190)" className="b1-stamp">
                <rect width={110} height={26} rx={13} fill="#13111E" />
                <circle cx={16} cy={13} r={5} fill="#D4920E" />
                <text x={28} y={18} fontSize={11} fontWeight={800} fill="#fff" fontFamily="'Plus Jakarta Sans',sans-serif">
                  {badgeCount === 0 ? "0 conflicts" : `${badgeCount} conflict${badgeCount > 1 ? "s" : ""}`}
                </text>
              </g>
            )}
          </svg>
          <div className="b1-illustrative">Illustrative demo</div>
        </div>
      </div>

      <style>{`
        .beat1 { min-height: 100vh; display: flex; align-items: center; padding: 90px 6vw 40px; background: linear-gradient(180deg, #F8F7FF 0%, #fff 100%); }
        .b1-grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; width: 100%; max-width: 1200px; margin: 0 auto; }
        .b1-h1 { font-size: clamp(30px, 4.2vw, 48px); font-weight: 400; line-height: 1.12; letter-spacing: -1.2px; color: #13111E; margin-bottom: 16px; }
        .b1-h1 .italic { font-style: italic; color: #7C6FE0; }
        .b1-sub { font-size: 16px; line-height: 1.75; color: #4B5275; max-width: 480px; margin-bottom: 28px; }
        .b1-cta { display: flex; gap: 12px; flex-wrap: wrap; }
        .b1-btn-primary { background: #7C6FE0; color: #fff; font-weight: 700; font-size: 14px; padding: 13px 26px; border-radius: 9px; border: none; box-shadow: 0 4px 18px rgba(124,111,224,0.38); cursor: pointer; }
        .b1-btn-secondary { background: #fff; color: #4B5275; font-weight: 700; font-size: 14px; padding: 13px 26px; border-radius: 9px; border: 1px solid #E8E4FF; cursor: pointer; }
        .b1-scene { position: relative; background: #13111E; border-radius: 20px; padding: 20px; box-shadow: 0 30px 80px rgba(19,17,30,0.3); }
        .b1-svg { width: 100%; height: auto; display: block; }
        .b1-caption { position: absolute; top: 16px; left: 20px; font: 700 12px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.85); z-index: 2; }
        .b1-illustrative { position: absolute; bottom: 10px; right: 16px; font-size: 10px; color: rgba(255,255,255,0.4); }
        .b1-drag-knob { filter: drop-shadow(0 0 6px rgba(212,146,14,0.6)); }
        .b1-stamp { animation: b1-stamp-in 0.4s cubic-bezier(.2,.9,.3,1.1) both; }
        @keyframes b1-stamp-in { 0%{opacity:0; transform: scale(.7) translate(260px,190px) translate(-260px,-190px);} 100%{opacity:1;} }
        @media (max-width: 860px) {
          .b1-grid-layout { grid-template-columns: 1fr; text-align: center; }
          .b1-cta { justify-content: center; }
          .b1-sub { margin-left: auto; margin-right: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .b1-stamp { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
