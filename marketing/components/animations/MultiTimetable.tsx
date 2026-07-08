"use client";

import { useEffect, useState } from "react";
import { useInView } from "./useInView";

/**
 * 05 · Multi-timetable scale — real schedule card, transpose toggle, and
 * staggered class-wise breaks. See design/marketing-motion/05-multi-timetable.md
 * (substantially extended per feedback): the front card shows real
 * subject/teacher/venue data with periods as the header row (time reads
 * left-to-right) and days as rows by default, a real Transpose control
 * (days as header / periods as rows — the app's actual traditional-view
 * toggle), and a lunch break whose position shifts per class-group —
 * younger grades break earlier, exactly like a real staggered school day.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TODAY_ROW = 2; // Wednesday
const REAL_PERIODS = ["P1", "P2", "P3", "P4", "P5"];

const TEACHERS = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul", "Mr. Sharma", "Ms. Nair", "Mr. Khan"];
const VENUES = ["R-12", "R-04", "Lab-2", "Lab-1", "Hall", "R-08", "R-15"];

const TINTS = ["#EDE9FF", "#DBEAFE", "#DCFCE7", "#FCE7F3", "#FEF3C7"];
function tint(subject: string) {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h += subject.charCodeAt(i);
  return TINTS[h % TINTS.length];
}

interface Schedule { label: string; subjects: string[]; breakAfter: number }
// breakAfter = real-period index after which lunch falls — staggered by
// grade, youngest first, mirroring a real staggered school day.
const SCHEDULES: Schedule[] = [
  { label: "VI-VIII", subjects: ["English", "Maths", "EVS", "Art", "PE"], breakAfter: 0 },
  { label: "IX-X", subjects: ["Maths", "Science", "English", "Social Sci.", "Hindi"], breakAfter: 1 },
  { label: "XI Commerce", subjects: ["Economics", "Accountancy", "Business St.", "English", "Maths"], breakAfter: 2 },
  { label: "XI Science", subjects: ["Physics", "Chemistry", "Maths", "English", "Biology"], breakAfter: 3 },
];

function buildGrid(sched: Schedule) {
  return REAL_PERIODS.map((_, r) =>
    DAYS.map((_, c) => {
      const idx = (r * 5 + c) % sched.subjects.length;
      const subject = sched.subjects[idx];
      const teacher = TEACHERS[(r + c * 2) % TEACHERS.length];
      const venue = VENUES[(r * 2 + c) % VENUES.length];
      return { subject, teacher, venue };
    })
  );
}

// The 6-slot sequence (5 periods + 1 break) for a schedule, break spliced
// in right after its breakAfter index.
function periodSeq(sched: Schedule) {
  const seq: { label: string; realIdx: number; isBreak?: boolean }[] = [];
  REAL_PERIODS.forEach((label, i) => {
    seq.push({ label, realIdx: i });
    if (i === sched.breakAfter) seq.push({ label: "Lunch", realIdx: -1, isBreak: true });
  });
  return seq;
}

const PHASE_MS = 3400;

export function MultiTimetable() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [active, setActive] = useState(0);
  const [daysAsColumns, setDaysAsColumns] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % SCHEDULES.length), PHASE_MS);
    return () => clearInterval(id);
  }, [inView]);

  const sched = SCHEDULES[active];
  const grid = buildGrid(sched);
  const seq = periodSeq(sched);
  const others = SCHEDULES.filter((_, i) => i !== active);

  const cols = daysAsColumns ? DAYS.map((d) => ({ label: d, isBreak: false })) : seq;
  const rows = daysAsColumns ? seq : DAYS.map((d) => ({ label: d, isBreak: false }));

  function cellFor(rowIdx: number, colIdx: number) {
    const dayIdx = daysAsColumns ? colIdx : rowIdx;
    const slot = daysAsColumns ? rows[rowIdx] : cols[colIdx];
    if ("isBreak" in slot && slot.isBreak) return { isBreak: true as const };
    const realIdx = (slot as { realIdx: number }).realIdx;
    return { isBreak: false as const, ...grid[realIdx][dayIdx] };
  }

  const nSlots = seq.length; // 6 — always periods+break, whichever axis it's on

  return (
    <div ref={ref} className="mt2-wrap">
      <div className="mt2-stage">
        {others.slice(0, 3).map((s, i) => (
          <div key={s.label} className={`mt2-ghost mt2-ghost-${i}`}>
            <span className="mt2-ghost-label">{s.label}</span>
          </div>
        ))}

        <div className="mt2-front">
          <div className="mt2-front-head">
            <span className="mt2-front-title">{sched.label}</span>
            <div className="mt2-front-right">
              <button
                type="button"
                className="mt2-transpose"
                onClick={() => setDaysAsColumns((v) => !v)}
                aria-pressed={daysAsColumns}
                title="Transpose view"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" className={daysAsColumns ? "is-flipped" : ""}>
                  <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
                </svg>
                Transpose
              </button>
              <span className="mt2-live"><span className="mt2-live-dot" /> Live</span>
            </div>
          </div>

          <div className="mt2-grid-wrap">
            <div
              className={`mt2-grid ${daysAsColumns ? "mode-days-cols" : "mode-periods-cols"}`}
              style={{
                gridTemplateColumns: `44px repeat(${cols.length}, 1fr)`,
                gridTemplateRows: `20px repeat(${rows.length}, ${daysAsColumns ? 34 : 40}px)`,
              }}
            >
              <div className="mt2-corner" />
              {cols.map((c, i) => (
                <div key={i} className={`mt2-col-head ${"isBreak" in c && c.isBreak ? "is-break" : ""}`}>
                  {c.label}
                </div>
              ))}
              {rows.map((r, ri) => (
                <div key={ri} style={{ display: "contents" }}>
                  <div className={`mt2-row-head ${"isBreak" in r && r.isBreak ? "is-break" : ""} ${!daysAsColumns && ri === TODAY_ROW ? "is-today" : ""}`}>
                    {r.label}
                  </div>
                  {cols.map((c, ci) => {
                    const isTodayCol = daysAsColumns && ci === TODAY_ROW;
                    const cell = cellFor(ri, ci);
                    if (cell.isBreak) {
                      return <div key={ci} className="mt2-cell mt2-break-cell">Lunch</div>;
                    }
                    return (
                      <div
                        key={ci}
                        className={`mt2-cell ${isTodayCol ? "is-today" : ""}`}
                        style={{ background: tint(cell.subject!) }}
                      >
                        <div className="mt2-cell-subject">{cell.subject}</div>
                        <div className="mt2-cell-meta">{cell.teacher} · {cell.venue}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              className={`mt2-playhead ${daysAsColumns ? "vertical" : "horizontal"} ${inView ? "is-playing" : ""}`}
              style={{ ["--slots" as string]: nSlots }}
            >
              <span className="mt2-playhead-knob" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt2-caption">Illustrative demo — several schedules, each with its own staggered lunch</div>

      <style>{`
        .mt2-wrap { width: 100%; max-width: 460px; }
        .mt2-stage { position: relative; width: 100%; min-height: 260px; padding-top: 30px; }

        .mt2-ghost {
          position: absolute; top: 0; left: 50%; width: 92%; height: 60px;
          border-radius: 14px 14px 0 0; background: #FAF9F5; border: 1.5px solid #E8E4FF;
          border-bottom: none; transform-origin: bottom center;
        }
        .mt2-ghost-0 { transform: translateX(-50%) rotate(-6deg); opacity: 0.6; z-index: 1; }
        .mt2-ghost-1 { transform: translateX(-50%) rotate(5deg); opacity: 0.42; z-index: 0; }
        .mt2-ghost-2 { transform: translateX(-50%) rotate(-2.5deg); opacity: 0.28; z-index: -1; }
        .mt2-ghost-label {
          position: absolute; top: 8px; left: 14px;
          font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #8B87AD;
        }

        .mt2-front {
          position: relative; z-index: 2;
          width: 100%; border-radius: 14px; background: #fff;
          border: 1.5px solid #E8E4FF; box-shadow: 0 12px 32px rgba(124,111,224,0.14);
          padding: 12px 14px 14px;
        }
        .mt2-front-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
        .mt2-front-title { font: 800 13px 'Plus Jakarta Sans', sans-serif; color: #13111E; }
        .mt2-front-right { display: flex; align-items: center; gap: 10px; }
        .mt2-transpose {
          display: inline-flex; align-items: center; gap: 5px;
          font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #7C6FE0;
          background: #EDE9FF; border: none; border-radius: 999px;
          padding: 4px 9px 4px 7px; cursor: pointer;
          transition: background 0.15s ease;
        }
        .mt2-transpose:hover { background: #DDD6FE; }
        .mt2-transpose svg { transition: transform 0.35s cubic-bezier(.45,0,.25,1); }
        .mt2-transpose svg.is-flipped { transform: rotate(90deg); }
        .mt2-live { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #16A34A; display: inline-flex; align-items: center; gap: 4px; }
        .mt2-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22C55E; animation: mt2-pulse 1.6s ease-in-out infinite; }
        @keyframes mt2-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        .mt2-grid-wrap { position: relative; }
        .mt2-grid {
          display: grid; gap: 2px;
          transition: opacity 0.2s ease;
        }
        .mt2-corner { background: transparent; }
        .mt2-col-head, .mt2-row-head {
          display: flex; align-items: center; justify-content: center;
          font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #8B87AD;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .mt2-col-head.is-break, .mt2-row-head.is-break { color: #C08A1E; }
        .mt2-row-head.is-today, .mt2-col-head.is-today { color: #7C6FE0; }
        .mt2-cell {
          border-radius: 6px; padding: 3px 5px;
          display: flex; flex-direction: column; justify-content: center;
          overflow: hidden;
        }
        .mt2-cell.is-today { outline: 1.5px solid #C4B5FD; outline-offset: -1.5px; }
        .mt2-cell-subject { font: 700 9.5px 'Plus Jakarta Sans', sans-serif; color: #13111E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mt2-cell-meta { font: 500 7.5px 'Plus Jakarta Sans', sans-serif; color: #4B5275; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mt2-break-cell {
          background: #F5E9C9; align-items: center; justify-content: center;
          font: 700 8.5px 'Plus Jakarta Sans', sans-serif; color: #92702A;
          text-transform: uppercase; letter-spacing: 0.06em;
        }

        .mt2-playhead {
          position: absolute; pointer-events: none;
          animation-duration: 10s;
          animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite;
          animation-play-state: paused;
        }
        .mt2-playhead.is-playing { animation-play-state: running; }

        /* Horizontal mode (default): sweeps across period columns within today's (Wed) row */
        .mt2-playhead.horizontal {
          top: calc(20px + ${TODAY_ROW} * 42px + 2px);
          left: 44px; width: calc((100% - 44px) / var(--slots));
          height: 38px; border-left: 2px solid #D4920E;
          background: rgba(212,146,14,0.08);
          animation-name: mt2-sweep-x;
        }
        .mt2-playhead.horizontal .mt2-playhead-knob { position: absolute; top: -5px; left: -5px; width: 8px; height: 8px; border-radius: 50%; background: #D4920E; }
        @keyframes mt2-sweep-x {
          0%, 3%    { transform: translateX(calc(0   * 100%)); }
          17%       { transform: translateX(calc(1   * 100%)); }
          33%       { transform: translateX(calc(2   * 100%)); }
          50%       { transform: translateX(calc(3   * 100%)); }
          67%       { transform: translateX(calc(4   * 100%)); }
          83%, 97%  { transform: translateX(calc(5   * 100%)); }
          100%      { transform: translateX(calc(0   * 100%)); }
        }

        /* Vertical mode (transposed): sweeps down period rows within today's (Wed) column */
        .mt2-playhead.vertical {
          left: calc(44px + ${TODAY_ROW} * ((100% - 44px) / 5) + 2px);
          width: calc((100% - 44px) / 5 - 2px);
          top: 20px; height: calc((100% - 20px) / var(--slots));
          border-top: 2px solid #D4920E;
          background: rgba(212,146,14,0.08);
          animation-name: mt2-sweep-y;
        }
        .mt2-playhead.vertical .mt2-playhead-knob { position: absolute; top: -5px; left: -5px; width: 8px; height: 8px; border-radius: 50%; background: #D4920E; }
        @keyframes mt2-sweep-y {
          0%, 3%    { transform: translateY(calc(0 * 100%)); }
          17%       { transform: translateY(calc(1 * 100%)); }
          33%       { transform: translateY(calc(2 * 100%)); }
          50%       { transform: translateY(calc(3 * 100%)); }
          67%       { transform: translateY(calc(4 * 100%)); }
          83%, 97%  { transform: translateY(calc(5 * 100%)); }
          100%      { transform: translateY(calc(0 * 100%)); }
        }

        .mt2-caption { margin-top: 10px; font-size: 11px; color: #8B87AD; font-weight: 500; }

        @media (prefers-reduced-motion: reduce) {
          .mt2-live-dot { animation: none !important; }
          .mt2-playhead { animation: none !important; }
          .mt2-playhead.horizontal { transform: translateX(300%); }
          .mt2-playhead.vertical { transform: translateY(300%); }
          .mt2-transpose svg { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
