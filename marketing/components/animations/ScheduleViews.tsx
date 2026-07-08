"use client";

import { useEffect, useState } from "react";
import { useInView } from "./useInView";

/**
 * View-mode showcase + generation pipeline.
 * Mirrors the real product's actual two-axis architecture (PROJECT_REFERENCE
 * §4): an ENTITY axis (Class/Section, Teacher, Room, Subject — what the rows
 * represent) that is orthogonal to a DISPLAY-MODE axis (Traditional table,
 * Calendar/timeline, Print — how it's rendered). Any entity can be viewed in
 * any mode, same as the real app's render engines. A live "now" playhead
 * appears in Traditional and Calendar modes (a live view); Print is a static
 * export, so it intentionally has none.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PERIODS = ["P1", "P2", "P3", "P4", "P5"];
const TODAY_ROW = 2; // Wednesday
const TEACHERS_POOL = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul"];
const VENUES_POOL = ["R-12", "Lab-1", "R-04", "R-08"];
const SUBJECTS_POOL = ["Maths", "Science", "English", "Social Sci."];

const TINTS: Record<string, string> = {
  Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7",
  "Social Sci.": "#FCE7F3", Hindi: "#FEF3C7",
};

const CLASS_GRID = PERIODS.map((_, r) =>
  DAYS.map((_, c) => ({
    subject: SUBJECTS_POOL[(r + c) % SUBJECTS_POOL.length],
    teacher: TEACHERS_POOL[(r + c * 2) % TEACHERS_POOL.length],
    venue: VENUES_POOL[(r * 2 + c) % VENUES_POOL.length],
  }))
);

// Wednesday, three classes — the shared relational slice Teacher/Room/
// Subject/Calendar views are all honestly derived from.
const WED_CLASSES: Record<string, { subject: string; teacher: string; venue: string }[]> = {
  "IX-A": [
    { subject: "Maths", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Science", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "English", teacher: "Mr. Das", venue: "R-04" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "Maths", teacher: "Mr. Rao", venue: "R-12" },
  ],
  "IX-B": [
    { subject: "Science", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "Maths", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "English", teacher: "Mr. Das", venue: "R-04" },
    { subject: "Science", teacher: "Ms. Iyer", venue: "Lab-1" },
  ],
  "X-A": [
    { subject: "English", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "Social Sci.", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Maths", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "English", teacher: "Mr. Das", venue: "R-04" },
  ],
};
const CLASS_NAMES = Object.keys(WED_CLASSES);

function teacherRow(teacher: string) {
  return PERIODS.map((_, p) => {
    for (const cls of CLASS_NAMES) {
      const entry = WED_CLASSES[cls][p];
      if (entry.teacher === teacher) return { cls, ...entry };
    }
    return null;
  });
}
function venueRow(venue: string) {
  return PERIODS.map((_, p) => {
    for (const cls of CLASS_NAMES) {
      const entry = WED_CLASSES[cls][p];
      if (entry.venue === venue) return { cls, ...entry };
    }
    return null;
  });
}
function subjectRow(subject: string) {
  return PERIODS.map((_, p) =>
    CLASS_NAMES.filter((cls) => WED_CLASSES[cls][p].subject === subject).map((cls) => ({ cls, ...WED_CLASSES[cls][p] }))
  );
}

// Shared row-data lookup for Teacher/Room/Subject entities (Traditional + Print).
function rowDataFor(entity: Entity, label: string) {
  return entity === "Teacher" ? teacherRow(label) : entity === "Room" ? venueRow(label) : subjectRow(label);
}
function entityRows(entity: Entity) {
  return entity === "Teacher" ? TEACHERS_POOL : entity === "Room" ? VENUES_POOL : SUBJECTS_POOL;
}
const stripTitle = (name: string) => name.replace(/^Mr\.?s?\.?\s/, "");

// Period → wall-clock timing, for Calendar mode (8:00-12:00 day span).
const CAL_SLOTS = [
  { label: "P1", realIdx: 0, start: 0, dur: 45 },
  { label: "P2", realIdx: 1, start: 45, dur: 45 },
  { label: "Lunch", isBreak: true, start: 90, dur: 15 },
  { label: "P3", realIdx: 2, start: 105, dur: 45 },
  { label: "P4", realIdx: 3, start: 150, dur: 45 },
  { label: "P5", realIdx: 4, start: 195, dur: 45 },
];
const DAY_TOTAL = 240;

const ENTITIES = ["Class", "Teacher", "Room", "Subject"] as const;
const MODES = ["Traditional", "Calendar", "Print"] as const;
type Entity = (typeof ENTITIES)[number];
type Mode = (typeof MODES)[number];

const PIPELINE = ["Input", "Academic load", "Teacher allocation", "Core timetable", "Sync & optimize", "0 conflicts"];

export function ScheduleViews() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [entityIdx, setEntityIdx] = useState(0);
  const [modeIdx, setModeIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transposed, setTransposed] = useState(false);

  useEffect(() => {
    if (!inView || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setEntityIdx(tick % ENTITIES.length);
      if (tick % ENTITIES.length === 0) setModeIdx((m) => (m + 1) % MODES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [inView, paused]);

  const entity: Entity = ENTITIES[entityIdx];
  const mode: Mode = MODES[modeIdx];

  function selectEntity(i: number) { setPaused(true); setEntityIdx(i); }
  function selectMode(i: number) { setPaused(true); setModeIdx(i); }

  return (
    <div ref={ref} className="sv-wrap">
      <div className={`sv-pipeline ${inView ? "is-playing" : ""}`} aria-hidden="true">
        {PIPELINE.map((step, i) => (
          <div key={step} className={`sv-step sv-step-${i}`}>
            <span className="sv-step-dot" />
            <span className="sv-step-label">{step}</span>
          </div>
        ))}
        <div className="sv-pipeline-line" />
        <div className="sv-pipeline-progress" />
      </div>

      <div className="sv-axis">
        <span className="sv-axis-label">View by</span>
        <div className="sv-tabs" role="tablist">
          {ENTITIES.map((e, i) => (
            <button key={e} type="button" role="tab" aria-selected={i === entityIdx}
              className={`sv-tab ${i === entityIdx ? "is-active" : ""}`}
              onClick={() => selectEntity(i)}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="sv-axis">
        <span className="sv-axis-label">Display as</span>
        <div className="sv-tabs" role="tablist">
          {MODES.map((m, i) => (
            <button key={m} type="button" role="tab" aria-selected={i === modeIdx}
              className={`sv-tab sv-tab-mode ${i === modeIdx ? "is-active" : ""}`}
              onClick={() => selectMode(i)}>
              {m}
            </button>
          ))}
        </div>
        {mode === "Traditional" && (
          <button
            type="button"
            className="sv-transpose"
            onClick={() => { setPaused(true); setTransposed((v) => !v); }}
            aria-pressed={transposed}
            title="Transpose rows/columns"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" className={transposed ? "is-flipped" : ""}>
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
            </svg>
            Transpose
          </button>
        )}
      </div>
      {paused && (
        <button type="button" className="sv-resume" onClick={() => setPaused(false)}>
          ▶ Resume auto-cycle
        </button>
      )}

      <div className="sv-card">
        {mode === "Traditional" && <Traditional entity={entity} inView={inView} transposed={transposed} />}
        {mode === "Calendar" && <Calendar entity={entity} inView={inView} />}
        {mode === "Print" && <Print entity={entity} />}
      </div>
      <div className="sv-caption">
        Illustrative demo — {entity} view · {mode} mode{mode === "Traditional" && transposed ? " (transposed)" : ""}
        {mode !== "Print" && " · live"}
      </div>

      <style>{`
        .sv-wrap { width: 100%; max-width: 560px; font-family: 'Plus Jakarta Sans', sans-serif; }

        .sv-pipeline { position: relative; display: flex; justify-content: space-between; margin-bottom: 20px; padding: 0 2px; }
        .sv-pipeline-line { position: absolute; left: 6px; right: 6px; top: 5px; height: 2px; background: #E8E4FF; z-index: 0; }
        .sv-pipeline-progress {
          position: absolute; left: 6px; top: 5px; height: 2px; background: #D4920E; z-index: 1;
          width: 0%; animation-duration: 7s; animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite; animation-play-state: paused;
        }
        .is-playing .sv-pipeline-progress { animation-play-state: running; animation-name: sv-progress; }
        @keyframes sv-progress { 0%,4%{width:0%} 85%,96%{width:100%} 100%{width:100%; opacity:0} }
        .sv-step { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; }
        .sv-step-dot { width: 11px; height: 11px; border-radius: 50%; background: #E8E4FF; border: 2px solid #fff; box-shadow: 0 0 0 1px #E8E4FF; }
        .sv-step-label { font-size: 8.5px; font-weight: 700; color: #8B87AD; text-align: center; max-width: 62px; line-height: 1.25; }
        ${PIPELINE.map((_, i) => `
        @keyframes sv-lit-${i} { 0%, ${4 + i * 15}% { background: #E8E4FF; } ${8 + i * 15}%, 100% { background: #D4920E; } }
        .is-playing .sv-step-${i} .sv-step-dot { animation: sv-lit-${i} 7s cubic-bezier(.45,0,.25,1) infinite; }
        `).join("\n")}

        .sv-axis { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .sv-axis-label { font: 700 9.5px 'Plus Jakarta Sans', sans-serif; color: #B8B4D4; text-transform: uppercase; letter-spacing: 0.06em; width: 58px; flex-shrink: 0; }
        .sv-transpose {
          display: inline-flex; align-items: center; gap: 5px; margin-left: 4px;
          font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #7C6FE0;
          background: #EDE9FF; border: none; border-radius: 999px;
          padding: 4px 9px 4px 7px; cursor: pointer; transition: background 0.15s ease;
        }
        .sv-transpose:hover { background: #DDD6FE; }
        .sv-transpose svg { transition: transform 0.35s cubic-bezier(.45,0,.25,1); }
        .sv-transpose svg.is-flipped { transform: rotate(90deg); }
        .sv-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .sv-tab {
          font: 700 11px 'Plus Jakarta Sans', sans-serif; color: #8B87AD;
          background: #FAFAFE; border: 1px solid #E8E4FF; border-radius: 999px;
          padding: 4px 11px; cursor: pointer; transition: all 0.15s;
        }
        .sv-tab.is-active { color: #fff; background: #7C6FE0; border-color: #7C6FE0; }
        .sv-tab-mode.is-active { background: #13111E; border-color: #13111E; }
        .sv-tab:hover:not(.is-active) { border-color: #C4B5FD; color: #7C6FE0; }
        .sv-resume {
          display: block; margin: 2px 0 10px; font: 700 10px 'Plus Jakarta Sans', sans-serif;
          color: #7C6FE0; background: none; border: none; cursor: pointer; padding: 0;
        }
        .sv-resume:hover { text-decoration: underline; }

        .sv-card { background: #fff; border: 1.5px solid #E8E4FF; border-radius: 14px; padding: 14px; min-height: 220px; margin-top: 6px; }
        .sv-caption { margin-top: 10px; font-size: 11px; color: #8B87AD; font-weight: 500; }

        .sv-grid-wrap { position: relative; }
        .sv-grid { display: grid; gap: 2px; }
        .sv-head { font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #8B87AD; text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: center; }
        .sv-head.is-today { color: #7C6FE0; }
        .sv-row-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #13111E; display: flex; align-items: center; padding-left: 4px; }
        .sv-cell { border-radius: 6px; padding: 4px 5px; display: flex; flex-direction: column; justify-content: center; min-height: 38px; }
        .sv-cell-today { outline: 1.5px solid #C4B5FD; outline-offset: -1.5px; }
        .sv-cell-free { background: #FAFAFE; border: 1px dashed #E8E4FF; align-items: center; justify-content: center; }
        .sv-cell-free-label { font-size: 8.5px; color: #B8B4D4; font-weight: 600; }
        .sv-cell-title { font: 700 9.5px 'Plus Jakarta Sans', sans-serif; color: #13111E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sv-cell-meta { font: 500 7.5px 'Plus Jakarta Sans', sans-serif; color: #4B5275; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sv-cell-multi { font: 600 8px 'Plus Jakarta Sans', sans-serif; color: #4B5275; line-height: 1.35; }

        /* Traditional playhead */
        .sv-ph {
          position: absolute; pointer-events: none; background: rgba(212,146,14,0.08);
          animation-duration: 9s; animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite; animation-play-state: paused;
        }
        .is-playing .sv-ph, .sv-ph.is-playing { animation-play-state: running; }
        .sv-ph-knob { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #D4920E; }
        .sv-ph-row { left: 56px; width: calc((100% - 56px) / 5); border-top: 2px solid #D4920E; animation-name: sv-sweep-x; }
        .sv-ph-row .sv-ph-knob { top: -5px; left: -5px; }
        .sv-ph-col { top: 20px; bottom: 0; width: calc((100% - 56px) / 5); border-left: 2px solid #D4920E; animation-name: sv-sweep-x; }
        .sv-ph-col .sv-ph-knob { top: -5px; left: -5px; }
        @keyframes sv-sweep-x {
          0%,3%{transform:translateX(0)} 22%{transform:translateX(100%)} 41%{transform:translateX(200%)}
          59%{transform:translateX(300%)} 78%,97%{transform:translateX(400%)} 100%{transform:translateX(0)}
        }
        .sv-ph-col-fixed { top: 20px; height: 40px; border-top: 2px solid #D4920E; animation-name: sv-sweep-y-steps; }
        .sv-ph-col-fixed .sv-ph-knob { top: -5px; left: -5px; }
        .sv-ph-row-full { left: 56px; right: 0; top: 20px; height: 40px; border-top: 2px solid #D4920E; animation-name: sv-sweep-y-steps; }
        .sv-ph-row-full .sv-ph-knob { top: -5px; left: -5px; }
        @keyframes sv-sweep-y-steps {
          0%,3%{transform:translateY(0)} 22%{transform:translateY(100%)} 41%{transform:translateY(200%)}
          59%{transform:translateY(300%)} 78%,97%{transform:translateY(400%)} 100%{transform:translateY(0)}
        }

        /* Calendar mode */
        .sv-cal-wrap { display: flex; gap: 8px; position: relative; }
        .sv-cal-hours { width: 34px; position: relative; height: 190px; flex-shrink: 0; }
        .sv-cal-hour { position: absolute; font-size: 8px; color: #B8B4D4; font-weight: 600; text-align: right; width: 100%; }
        .sv-cal-lane { flex: 1; position: relative; height: 190px; border-left: 1.5px solid #E8E4FF; min-width: 0; }
        .sv-cal-lane-label { position: absolute; top: -16px; left: 4px; font: 700 8px 'Plus Jakarta Sans', sans-serif; color: #8B87AD; }
        .sv-cal-block { position: absolute; left: 3px; right: 3px; border-radius: 5px; padding: 2px 4px; overflow: hidden; }
        .sv-cal-block.half { right: 50%; }
        .sv-cal-block.half + .sv-cal-block.half { left: 50%; right: 3px; }
        .sv-cal-break { position: absolute; left: 3px; right: 3px; background: #F5E9C9; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 700; color: #92702A; text-transform: uppercase; }
        .sv-cal-title { font: 700 8px 'Plus Jakarta Sans', sans-serif; color: #13111E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sv-cal-meta { font: 500 6.5px 'Plus Jakarta Sans', sans-serif; color: #4B5275; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sv-cal-playhead {
          position: absolute; left: 0; right: 0; height: 2px; background: #D4920E; z-index: 5;
          animation-name: sv-sweep-y; animation-duration: 12s; animation-timing-function: linear;
          animation-iteration-count: infinite; animation-play-state: paused;
        }
        .sv-cal-playhead.is-playing { animation-play-state: running; }
        .sv-cal-playhead .sv-ph-knob { top: -4px; left: -4px; }
        @keyframes sv-sweep-y { 0%{top:0%} 96%{top:100%} 100%{top:100%; opacity:0} }

        /* Print mode */
        .sv-print { border: 1.5px solid #13111E; }
        .sv-print table { width: 100%; border-collapse: collapse; }
        .sv-print th, .sv-print td { border: 1px solid #D8D4E8; padding: 4px 5px; font-size: 8.5px; text-align: left; }
        .sv-print th { background: #F8F7FF; font-weight: 700; color: #4B5275; text-transform: uppercase; font-size: 7.5px; }
        .sv-print .sv-print-key { font-weight: 700; color: #13111E; background: #FAFAFE; white-space: nowrap; }
        .sv-print-subject { font-weight: 700; color: #13111E; }
        .sv-print-meta { color: #6B7280; }
        .sv-print-head { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; }

        @media (prefers-reduced-motion: reduce) {
          .sv-pipeline-progress, .sv-ph, .sv-cal-playhead { animation: none !important; }
          ${PIPELINE.map((_, i) => `.sv-step-${i} .sv-step-dot { animation: none !important; background: #D4920E !important; }`).join("\n")}
        }
      `}</style>
    </div>
  );
}

// ---- Traditional (table) mode ----

function Traditional({ entity, inView, transposed }: { entity: Entity; inView: boolean; transposed: boolean }) {
  const isClass = entity === "Class";
  const otherAxis = isClass ? DAYS : entityRows(entity);
  const rowData = (label: string) => rowDataFor(entity, label);

  // Default: Periods as header (columns), the other axis (days / teachers / rooms / subjects) as rows.
  // Transposed: the other axis as header (columns), Periods as rows.
  const headers = transposed ? otherAxis : PERIODS;
  const rowKeys = transposed ? PERIODS : otherAxis;
  const otherCount = otherAxis.length;

  function renderCell(otherIdx: number, periodIdx: number, key: string | number) {
    if (isClass) {
      const cell = CLASS_GRID[periodIdx][otherIdx];
      const isTodayCell = otherIdx === TODAY_ROW;
      return (
        <div key={key} className={`sv-cell ${isTodayCell ? "sv-cell-today" : ""}`} style={{ background: TINTS[cell.subject] }}>
          <div className="sv-cell-title">{cell.subject}</div>
          <div className="sv-cell-meta">{cell.teacher} · {cell.venue}</div>
        </div>
      );
    }
    const label = otherAxis[otherIdx];
    const occ = rowData(label)[periodIdx];
    if (Array.isArray(occ)) {
      return (
        <div key={key} className="sv-cell" style={{ background: occ.length ? TINTS[label] : undefined }}>
          <div className="sv-cell-multi">
            {occ.length === 0 && <span className="sv-cell-free-label">—</span>}
            {occ.map((o) => <div key={o.cls}>{o.cls} · {stripTitle(o.teacher)}</div>)}
          </div>
        </div>
      );
    }
    return (
      <div key={key} className={`sv-cell ${!occ ? "sv-cell-free" : ""}`} style={occ ? { background: TINTS[occ.subject] } : undefined}>
        {occ ? (<><div className="sv-cell-title">{occ.cls}</div><div className="sv-cell-meta">{occ.subject} · {occ.venue}</div></>) : <span className="sv-cell-free-label">Free</span>}
      </div>
    );
  }

  // Playhead: for Class, "today" (Wed) is a fixed axis and periods are the moving one.
  // For Teacher/Room/Subject, the whole grid is already one day, so periods sweep across everything.
  const phVariant = isClass
    ? (transposed ? "col-fixed" : "row-fixed")
    : (transposed ? "row-full" : "col-full");

  return (
    <div className="sv-grid-wrap">
      <div className="sv-grid" style={{ gridTemplateColumns: `56px repeat(${headers.length}, 1fr)` }}>
        <div />
        {headers.map((h, i) => {
          const isTodayHeader = isClass && transposed && i === TODAY_ROW;
          return <div key={h} className={`sv-head ${isTodayHeader ? "is-today" : ""}`}>{h}</div>;
        })}
        {rowKeys.map((rk, rIdx) => {
          const isTodayRow = isClass && !transposed && rIdx === TODAY_ROW;
          return (
          <div key={rk} style={{ display: "contents" }}>
            <div className={`sv-row-label ${isTodayRow ? "is-today" : ""}`}>{rk}</div>
            {headers.map((_, cIdx) => {
              const otherIdx = transposed ? cIdx : rIdx;
              const periodIdx = transposed ? rIdx : cIdx;
              return renderCell(otherIdx, periodIdx, cIdx);
            })}
          </div>
          );
        })}
      </div>
      <Playhead variant={phVariant} inView={inView} otherCount={otherCount} />
    </div>
  );
}

function Playhead({ variant, inView, otherCount }: { variant: string; inView: boolean; otherCount: number }) {
  const playing = inView ? "is-playing" : "";
  if (variant === "row-fixed") {
    // Class, default: fixed on today's (Wed) row, sweeps across 5 period columns.
    return (
      <div className={`sv-ph sv-ph-row ${playing}`} style={{ top: `calc(20px + ${TODAY_ROW} * 42px + 2px)`, height: 38 }}>
        <span className="sv-ph-knob" />
      </div>
    );
  }
  if (variant === "col-fixed") {
    // Class, transposed: fixed on today's (Wed) column, sweeps down 5 period rows.
    const colWidth = `calc((100% - 56px) / ${otherCount})`;
    return (
      <div
        className={`sv-ph sv-ph-col-fixed ${playing}`}
        style={{ left: `calc(56px + ${TODAY_ROW} * ${colWidth} + 2px)`, width: `calc(${colWidth} - 2px)` }}
      >
        <span className="sv-ph-knob" />
      </div>
    );
  }
  if (variant === "col-full") {
    // Teacher/Room/Subject, default: spans full height, sweeps across 5 period columns.
    return (
      <div className={`sv-ph sv-ph-col ${playing}`}>
        <span className="sv-ph-knob" />
      </div>
    );
  }
  // row-full: Teacher/Room/Subject, transposed: spans full width, sweeps down 5 period rows.
  return (
    <div className={`sv-ph sv-ph-row-full ${playing}`}>
      <span className="sv-ph-knob" />
    </div>
  );
}

// ---- Calendar (timeline) mode ----

function Calendar({ entity, inView }: { entity: Entity; inView: boolean }) {
  let lanes: { key: string; content: (null | { label: string; sub: string } | { label: string; sub: string }[])[] }[];

  if (entity === "Class") {
    lanes = CLASS_NAMES.map((cls) => ({
      key: cls,
      content: WED_CLASSES[cls].map((e) => ({ label: e.subject, sub: `${e.teacher} · ${e.venue}` })),
    }));
  } else if (entity === "Teacher") {
    lanes = TEACHERS_POOL.map((t) => ({
      key: t,
      content: teacherRow(t).map((o) => (o ? { label: o.cls, sub: `${o.subject} · ${o.venue}` } : null)),
    }));
  } else if (entity === "Room") {
    lanes = VENUES_POOL.map((v) => ({
      key: v,
      content: venueRow(v).map((o) => (o ? { label: o.cls, sub: `${o.subject} · ${o.teacher}` } : null)),
    }));
  } else {
    lanes = SUBJECTS_POOL.map((s) => ({
      key: s,
      content: subjectRow(s).map((occ) => occ.map((o) => ({ label: o.cls, sub: stripTitle(o.teacher) }))),
    }));
  }

  return (
    <div className="sv-cal-wrap">
      <div className="sv-cal-hours">
        {[0, 60, 120, 180, 240].map((m) => (
          <div key={m} className="sv-cal-hour" style={{ top: `${(m / DAY_TOTAL) * 100}%` }}>
            {`${8 + Math.floor(m / 60)}:${m % 60 === 0 ? "00" : "30"}`}
          </div>
        ))}
      </div>
      {lanes.map((lane) => (
        <div key={lane.key} className="sv-cal-lane">
          <span className="sv-cal-lane-label">{lane.key}</span>
          {CAL_SLOTS.map((slot, i) => {
            const top = (slot.start / DAY_TOTAL) * 100;
            const height = (slot.dur / DAY_TOTAL) * 100;
            if (slot.isBreak) return <div key={i} className="sv-cal-break" style={{ top: `${top}%`, height: `${height}%` }}>Lunch</div>;
            const c = lane.content[slot.realIdx!];
            if (!c) return <div key={i} className="sv-cal-block" style={{ top: `${top}%`, height: `${height}%`, background: "#FAFAFE", border: "1px dashed #E8E4FF" }} />;
            if (Array.isArray(c)) {
              return c.slice(0, 2).map((entry, j) => (
                <div key={j} className="sv-cal-block half" style={{ top: `${top}%`, height: `${height}%`, background: TINTS[lane.key] || "#EDE9FF" }}>
                  <div className="sv-cal-title">{entry.label}</div>
                  <div className="sv-cal-meta">{entry.sub}</div>
                </div>
              ));
            }
            return (
              <div key={i} className="sv-cal-block" style={{ top: `${top}%`, height: `${height}%`, background: TINTS[c.label] || "#EDE9FF" }}>
                <div className="sv-cal-title">{c.label}</div>
                <div className="sv-cal-meta">{c.sub}</div>
              </div>
            );
          })}
        </div>
      ))}
      <div className={`sv-cal-playhead ${inView ? "is-playing" : ""}`}><span className="sv-ph-knob" /></div>
    </div>
  );
}

// ---- Print (static export) mode — no playhead, it's a fixed document ----

function Print({ entity }: { entity: Entity }) {
  const title = entity === "Class" ? "IX-A · Weekly Timetable" : `${entity} view · Weekly Timetable`;

  const printMark = (
    <div className="sv-print-head">
      <svg width="14" height="14" viewBox="0 0 52 52">
        <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22.5" fill="none" stroke="#000" strokeWidth={9} strokeLinecap="round" />
        <circle cx={36} cy={12} r={5} fill="#000" />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 800 }}>schedU</span>
      <span style={{ fontSize: 9, color: "#6B7280", marginLeft: 6 }}>{title}</span>
    </div>
  );

  if (entity === "Class") {
    return (
      <div className="sv-print">
        {printMark}
        <table>
          <thead><tr><th className="sv-print-key">Period</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {PERIODS.map((p, r) => (
              <tr key={p}>
                <td className="sv-print-key">{p}</td>
                {DAYS.map((_, c) => {
                  const cell = CLASS_GRID[r][c];
                  return <td key={c}><div className="sv-print-subject">{cell.subject}</div><div className="sv-print-meta">{cell.teacher} · {cell.venue}</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = entityRows(entity);
  const rowData = (label: string) => rowDataFor(entity, label);

  return (
    <div className="sv-print">
      {printMark}
      <table>
        <thead><tr><th className="sv-print-key">{entity}</th>{PERIODS.map((p) => <th key={p}>{p}</th>)}</tr></thead>
        <tbody>
          {rows.map((label) => (
            <tr key={label}>
              <td className="sv-print-key">{label}</td>
              {rowData(label).map((occ, i) => {
                if (Array.isArray(occ)) return <td key={i}>{occ.length === 0 ? "—" : occ.map((o) => o.cls).join(", ")}</td>;
                return <td key={i}>{occ ? <><div className="sv-print-subject">{occ.cls}</div><div className="sv-print-meta">{occ.subject} · {occ.venue}</div></> : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
