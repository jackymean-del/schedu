"use client";

import { useRef, useState } from "react";
import { useScrollProgress, reducedMotion } from "./useScrollProgress";

const CLOCKS = ["10:25 AM", "11:05 AM", "11:35 AM", "12:10 PM", "12:40 PM"];
const SESSIONS = [
  ["VIII-A · Maths · Mr. Rao", "VI-B · Science · Ms. Paul", "IX-C · English · Mr. Das", "X-A · History · Mrs. Iyer"],
  ["VI-B · Science · Ms. Paul", "IX-C · English · Mr. Das", "X-A · History · Mrs. Iyer", "VII-C · English · Ms. Iyer"],
  ["VII-C · English · Ms. Iyer"],
  ["VII-C · English · Ms. Iyer", "VIII-B · Maths · Mr. Sharma"],
  ["VII-C · English · Ms. Iyer", "VIII-B · Maths · Mr. Sharma"],
];
const FREE = [
  ["Ms. Iyer", "Mr. Das", "Mr. Sharma"],
  ["Mr. Das", "Mr. Sharma"],
  ["Mr. Rao", "Mr. Das", "Mr. Sharma", "Mrs. Iyer"],
  ["Mr. Rao", "Mrs. Iyer"],
  ["Mr. Rao", "Ms. Paul", "Mr. Das"],
];

export function Beat8LivePulse() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const [dragT, setDragT] = useState<number | null>(null);
  const dragging = useRef(false);
  const rm = reducedMotion();
  const t = dragT ?? (rm ? 0.6 : progress);
  const idx = Math.min(4, Math.floor(t * 5));
  const showToast = idx === 2 && t > 0.4;

  function onTrackClick(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragT(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    dragging.current = true;
  }
  function onTrackMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragT(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  }

  return (
    <section ref={ref} data-beat={7} className="beat beat8">
      <div className="b8-caption">See who&rsquo;s free. Right now.</div>
      <div className="b8-card">
        <div className="b8-head">
          <span className="b8-clock">{CLOCKS[idx]}</span>
          <span className="b8-live"><span className="b8-live-dot" />Live</span>
        </div>
        <div className="b8-scrub" onPointerDown={onTrackClick} onPointerMove={onTrackMove} onPointerUp={() => (dragging.current = false)}>
          <div className="b8-band" />
          <div className="b8-knob" style={{ left: `${t * 100}%` }} />
        </div>
        <div className="b8-cols">
          <div>
            <div className="b8-col-label">In session · {SESSIONS[idx].length}</div>
            <ul className="b8-list">{SESSIONS[idx].map((s) => <li key={s} className="b8-card-item">{s}</li>)}</ul>
          </div>
          <div>
            <div className="b8-col-label">Free now · {FREE[idx].length}</div>
            <ul className="b8-list b8-chips">{FREE[idx].map((n) => <li key={n} className="b8-chip">{n}</li>)}</ul>
          </div>
        </div>
        {showToast && <div className="b8-toast">Mr. Das is out P4 — Ms. Iyer auto-assigned, Room 4</div>}
      </div>
      <div className="b8-hint">Drag the timeline to scrub through the day</div>
      <div className="b8-illustrative">Illustrative demo — the Live board with sample data</div>

      <style>{`
        .beat8 { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 6vw; background: #FAFAFE; }
        .b8-caption { font-size: 22px; font-weight: 600; color: #13111E; margin-bottom: 24px; }
        .b8-card { width: 100%; max-width: 560px; background: #fff; border: 1.5px solid #E8E4FF; border-radius: 16px; padding: 20px; position: relative; }
        .b8-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
        .b8-clock { font-size: 18px; font-weight: 800; color: #13111E; }
        .b8-live { font-size: 12px; font-weight: 700; color: #16A34A; display: inline-flex; align-items: center; gap: 5px; }
        .b8-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22C55E; }
        .b8-scrub { position: relative; height: 24px; cursor: grab; margin-bottom: 16px; }
        .b8-band { position: absolute; inset: 8px 0; background: #EDE9FF; border-radius: 6px; }
        .b8-knob { position: absolute; top: 4px; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: #D4920E; box-shadow: 0 0 0 4px rgba(212,146,14,0.15); }
        .b8-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .b8-col-label { font-size: 10px; font-weight: 700; color: #8B87AD; text-transform: uppercase; margin-bottom: 6px; }
        .b8-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .b8-card-item { background: #FAFAFE; border: 1px solid #E8E4FF; border-radius: 7px; padding: 6px 9px; font-size: 11px; }
        .b8-chips { flex-direction: row; flex-wrap: wrap; }
        .b8-chip { background: #EDE9FF; color: #7C6FE0; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 600; }
        .b8-toast { position: absolute; bottom: -14px; left: 20px; right: 20px; background: #13111E; color: #fff; font-size: 11px; padding: 8px 12px; border-radius: 8px; }
        .b8-hint { font-size: 12px; color: #8B87AD; margin-top: 24px; }
        .b8-illustrative { font-size: 11px; color: #8B87AD; margin-top: 4px; }
      `}</style>
    </section>
  );
}
