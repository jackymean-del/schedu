"use client";

import { useEffect, useState } from "react";

/**
 * CalendarShowcase — a full-width, day-wise Calendar-mode timetable with the
 * hour TIMELINE as the heading and the real red Playhead sweeping it.
 *
 * Mirrors the product's Calendar Day view (frontend/src/pages/calendar.tsx):
 * proportional blocks per row, amber lunch bands, and the full-height red
 * "now" line with the time badge — driven by the visitor's REAL clock, to
 * the second. The four lens tabs (Classes / Faculty / Venues / Subjects)
 * are genuinely clickable and re-render the same day through each lens.
 * Rows are illustrative (Eden's Academy); the Playhead is not.
 */

const DAY_START = 8, DAY_END = 15; // hour axis 8 AM – 3 PM
const HOURS = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"];

type Block = { s: number; e: number; label: string; sub?: string; tint: string; text: string; lunch?: boolean };
type Row = { name: string; meta: string; blocks: Block[] };

const T = {
  maths: ["#EDE9FF", "#4C3FB8"], science: ["#DBEAFE", "#1D4ED8"], english: ["#DCFCE7", "#166534"],
  french: ["#FEF3C7", "#B45309"], history: ["#FFEDD5", "#C2410C"], geo: ["#FCE7F3", "#9D174D"],
  art: ["#FAE8FF", "#86198F"], music: ["#E0F2FE", "#0369A1"], lunch: ["#FEF3C7", "#92702A"],
} as const;
const B = (s: number, e: number, label: string, sub: string | undefined, k: keyof typeof T, lunch = false): Block =>
  ({ s, e, label, sub, tint: T[k][0], text: T[k][1], lunch });
const LUNCH = (s = 11.5, e = 12.25) => B(s, e, "Lunch", undefined, "lunch", true);

const LENSES: Record<string, { label: string; icon: string; rows: Row[] }> = {
  class: {
    label: "Classes", icon: "🎓",
    rows: [
      { name: "VI-A", meta: "7 periods", blocks: [B(8.15, 9.2, "Maths", "J. Abraham", "maths"), B(9.2, 10.2, "Science", "M. Esther", "science"), B(10.4, 11.5, "English", "D. Samuel", "english"), LUNCH(), B(12.25, 13.3, "French", "R. Naomi", "french"), B(13.3, 14.5, "History", "T. Moses", "history")] },
      { name: "VII-B", meta: "7 periods", blocks: [B(8.15, 9.2, "Science", "M. Esther", "science"), B(9.2, 10.2, "Maths", "J. Abraham", "maths"), B(10.4, 11.5, "Geography", "T. Moses", "geo"), LUNCH(), B(12.25, 13.3, "Art", "P. Daniel", "art"), B(13.3, 14.5, "English", "D. Samuel", "english")] },
      { name: "IX-A", meta: "8 periods", blocks: [B(8.15, 9.2, "English", "D. Samuel", "english"), B(9.2, 10.2, "History", "T. Moses", "history"), B(10.4, 11.5, "Maths", "J. Abraham", "maths"), LUNCH(), B(12.25, 13.3, "Science", "M. Esther", "science"), B(13.3, 14.5, "Music", "E. Ruth", "music")] },
      { name: "X-B", meta: "8 periods", blocks: [B(8.15, 9.2, "French", "R. Naomi", "french"), B(9.2, 10.2, "English", "D. Samuel", "english"), B(10.4, 11.5, "Science", "M. Esther", "science"), LUNCH(), B(12.25, 13.3, "Maths", "J. Abraham", "maths"), B(13.3, 14.5, "Geography", "T. Moses", "geo")] },
    ],
  },
  teacher: {
    label: "Faculty", icon: "👥",
    rows: [
      { name: "J. Abraham", meta: "Maths · 6/day", blocks: [B(8.15, 9.2, "VI-A", "Maths", "maths"), B(9.2, 10.2, "VII-B", "Maths", "maths"), B(10.4, 11.5, "IX-A", "Maths", "maths"), LUNCH(), B(12.25, 13.3, "X-B", "Maths", "maths")] },
      { name: "M. Esther", meta: "Science · 5/day", blocks: [B(8.15, 9.2, "VII-B", "Science", "science"), B(9.2, 10.2, "VI-A", "Science", "science"), LUNCH(), B(12.25, 13.3, "IX-A", "Science", "science"), B(13.3, 14.5, "X-B", "Science", "science")] },
      { name: "D. Samuel", meta: "English · 6/day", blocks: [B(8.15, 9.2, "IX-A", "English", "english"), B(9.2, 10.2, "X-B", "English", "english"), B(10.4, 11.5, "VI-A", "English", "english"), LUNCH(), B(13.3, 14.5, "VII-B", "English", "english")] },
      { name: "R. Naomi", meta: "French · 4/day", blocks: [B(8.15, 9.2, "X-B", "French", "french"), LUNCH(), B(12.25, 13.3, "VI-A", "French", "french")] },
    ],
  },
  room: {
    label: "Venues", icon: "🏛",
    rows: [
      { name: "Lab-1", meta: "Science lab", blocks: [B(8.15, 9.2, "VII-B", "Science", "science"), B(9.2, 10.2, "VI-A", "Science", "science"), B(10.4, 11.5, "X-B", "Science", "science"), LUNCH(), B(12.25, 13.3, "IX-A", "Science", "science")] },
      { name: "R-201", meta: "Classroom", blocks: [B(8.15, 9.2, "VI-A", "Maths", "maths"), B(9.2, 10.2, "VII-B", "Maths", "maths"), LUNCH(), B(12.25, 13.3, "X-B", "Maths", "maths"), B(13.3, 14.5, "IX-A", "Music", "music")] },
      { name: "Hall", meta: "Assembly hall", blocks: [B(10.4, 11.5, "VII-B", "Geography", "geo"), LUNCH(), B(13.3, 14.5, "X-B", "Geography", "geo")] },
      { name: "Art studio", meta: "Practical room", blocks: [B(9.2, 10.2, "IX-A", "Art", "art"), LUNCH(), B(12.25, 13.3, "VII-B", "Art", "art")] },
    ],
  },
  subject: {
    label: "Subjects", icon: "📖",
    rows: [
      { name: "Maths", meta: "4 classes/day", blocks: [B(8.15, 9.2, "VI-A", "J. Abraham", "maths"), B(9.2, 10.2, "VII-B", "J. Abraham", "maths"), B(10.4, 11.5, "IX-A", "J. Abraham", "maths"), B(12.25, 13.3, "X-B", "J. Abraham", "maths")] },
      { name: "Science", meta: "4 classes/day", blocks: [B(8.15, 9.2, "VII-B", "M. Esther", "science"), B(9.2, 10.2, "VI-A", "M. Esther", "science"), B(12.25, 13.3, "IX-A", "M. Esther", "science"), B(13.3, 14.5, "X-B", "M. Esther", "science")] },
      { name: "English", meta: "4 classes/day", blocks: [B(8.15, 9.2, "IX-A", "D. Samuel", "english"), B(9.2, 10.2, "X-B", "D. Samuel", "english"), B(10.4, 11.5, "VI-A", "D. Samuel", "english"), B(13.3, 14.5, "VII-B", "D. Samuel", "english")] },
      { name: "French", meta: "2 classes/day", blocks: [B(8.15, 9.2, "X-B", "R. Naomi", "french"), B(12.25, 13.3, "VI-A", "R. Naomi", "french")] },
    ],
  },
};

export function CalendarShowcase() {
  const [lens, setLens] = useState<keyof typeof LENSES>("class");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now ? now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600 : 10.5;
  const inDay = h >= DAY_START && h <= DAY_END;
  const frac = Math.max(0, Math.min(1, (h - DAY_START) / (DAY_END - DAY_START)));
  const clock = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
  const pos = (t: number) => `${((t - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
  const width = (s: number, e: number) => `${((e - s) / (DAY_END - DAY_START)) * 100}%`;
  const L = LENSES[lens];

  return (
    <div className="cs-wrap">
      <div className="cs-toolbar">
        <div className="cs-tabs" role="tablist" aria-label="Calendar lens">
          {(Object.keys(LENSES) as (keyof typeof LENSES)[]).map((k) => (
            <button key={k} role="tab" aria-selected={lens === k} className={`cs-tab ${lens === k ? "is-on" : ""}`} onClick={() => setLens(k)}>
              {LENSES[k].icon} {LENSES[k].label}
            </button>
          ))}
        </div>
        <span className="cs-livechip"><i className={inDay ? "cs-dot-red" : "cs-dot-gray"} />{inDay ? `Playhead is your real clock — ${clock}` : `Your local time: ${clock} · playhead appears 8 AM–3 PM`}</span>
      </div>

      <div className="cs-board">
        {/* Timeline heading */}
        <div className="cs-timeline">
          <span className="cs-rowlabel-spacer" />
          <div className="cs-timeline-track">
            {HOURS.map((hh, i) => (
              <span key={hh} className="cs-hour" style={{ left: pos(DAY_START + i) }}>{hh}</span>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="cs-rows">
          {L.rows.map((row) => (
            <div key={row.name} className="cs-row">
              <div className="cs-rowlabel">
                <b>{row.name}</b>
                <span>{row.meta}</span>
              </div>
              <div className="cs-track">
                {HOURS.map((_, i) => <i key={i} className="cs-gridline" style={{ left: pos(DAY_START + i) }} />)}
                {row.blocks.map((b, i) => (
                  <div key={i} className={`cs-block ${b.lunch ? "cs-lunch" : ""}`}
                    style={{ left: pos(b.s), width: width(b.s, b.e), background: b.tint, color: b.text }}>
                    <b>{b.label}</b>
                    {b.sub && <span>{b.sub}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* The red Playhead — full height, real time */}
          {inDay && (
            <div className="cs-playhead" style={{ left: `calc(var(--label-w) + (100% - var(--label-w)) * ${frac})` }}>
              <span className="cs-ph-badge"><i />{clock}</span>
              <span className="cs-ph-line" />
            </div>
          )}
        </div>
      </div>
      <p className="cs-caption">Schedule data is illustrative — the red Playhead is your genuine local time, moving as you watch. Every lens carries it.</p>

      <style>{`
        .cs-wrap { width: 100%; max-width: 1240px; margin: 0 auto; font-family: 'Plus Jakarta Sans', sans-serif; --label-w: 148px; }
        .cs-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .cs-tabs { display: inline-flex; gap: 3px; padding: 3px; background: #F1EEFB; border-radius: 11px; }
        .cs-tab { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; font-size: 13px; font-weight: 700; color: #8B87AD; cursor: pointer; font-family: inherit; transition: all .15s; }
        .cs-tab.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 2px 8px rgba(124,111,224,0.2); }
        .cs-livechip { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: #4B5275; background: #fff; border: 1px solid #ECE9FB; border-radius: 999px; padding: 6px 13px; }
        .cs-livechip i { width: 8px; height: 8px; border-radius: 50%; }
        .cs-dot-red { background: #EF4444; animation: cs-pulse 1.6s ease-in-out infinite; }
        .cs-dot-gray { background: #CBC9DA; }
        @keyframes cs-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        .cs-board { background: #fff; border: 1px solid #ECE9FB; border-radius: 16px; padding: 14px 16px 16px; box-shadow: 0 24px 70px rgba(124,111,224,0.14); overflow: hidden; }
        .cs-timeline { display: flex; margin-bottom: 6px; }
        .cs-rowlabel-spacer { width: var(--label-w); flex-shrink: 0; }
        .cs-timeline-track { position: relative; flex: 1; height: 18px; }
        .cs-hour { position: absolute; transform: translateX(-50%); font-size: 11px; font-weight: 800; color: #A9A4C8; font-family: 'DM Mono', monospace; white-space: nowrap; }
        .cs-hour:first-child { transform: none; }
        .cs-rows { position: relative; display: flex; flex-direction: column; gap: 8px; }
        .cs-row { display: flex; align-items: stretch; }
        .cs-rowlabel { width: var(--label-w); flex-shrink: 0; padding-right: 12px; display: flex; flex-direction: column; justify-content: center; }
        .cs-rowlabel b { font-size: 13.5px; font-weight: 800; color: #13111E; }
        .cs-rowlabel span { font-size: 10.5px; color: #9A95BC; margin-top: 1px; }
        .cs-track { position: relative; flex: 1; height: 52px; background: #FAFAFE; border: 1px solid #F2F0FB; border-radius: 10px; }
        .cs-gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(19,17,30,0.06); }
        .cs-block { position: absolute; top: 5px; bottom: 5px; border-radius: 7px; padding: 5px 9px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; border: 1px solid rgba(19,17,30,0.06); transition: transform .15s, box-shadow .15s; }
        .cs-block:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(19,17,30,0.14); z-index: 3; }
        .cs-block b { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cs-block span { font-size: 10px; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cs-lunch { border: 1px dashed #E5C078; justify-content: center; text-align: center; }
        .cs-lunch b { font-size: 10.5px; }
        .cs-playhead { position: absolute; top: -24px; bottom: 0; width: 0; z-index: 5; pointer-events: none; }
        .cs-ph-line { position: absolute; top: 22px; bottom: 0; left: -1px; width: 2px; background: #EF4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .cs-ph-badge { position: absolute; top: 0; left: 0; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 5px; background: #EF4444; color: #fff; font-size: 11px; font-weight: 800; font-family: 'DM Mono', monospace; border-radius: 999px; padding: 3px 10px; white-space: nowrap; box-shadow: 0 4px 14px rgba(239,68,68,0.4); }
        .cs-ph-badge i { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: cs-pulse 1.2s ease-in-out infinite; }
        .cs-caption { margin-top: 10px; text-align: center; font-size: 11.5px; color: #8B87AD; }
        @media (max-width: 760px) {
          .cs-wrap { --label-w: 92px; }
          .cs-rowlabel b { font-size: 11px; }
          .cs-rowlabel span { display: none; }
          .cs-block span { display: none; }
          .cs-hour { font-size: 8.5px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cs-dot-red, .cs-ph-badge i { animation: none !important; }
          .cs-block, .cs-tab { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
