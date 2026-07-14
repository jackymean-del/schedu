"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LiveDemo — a REAL interactive Live board on the marketing page.
 * Not a movie: the visitor drags the scrubber themselves (same pointer
 * mechanics as the product's MomentScrubber, calendar.tsx 1675-1742),
 * flips the Lightest/Heaviest sort, and marks a faculty member absent to
 * see the ranked-substitute flow. Data is illustrative (Eden's Academy);
 * the initial scrub position and ring percentages follow the real clock.
 */

const DAY_START = 9 * 60, DAY_END = 15.5 * 60; // 9:00 – 15:30
const SEGS: [number, number][] = [[6, 0], [20, 1], [4, 0], [22, 0.85], [22, 1], [26, 0], [24, 0.7], [22, 1], [20, 0]];
const HOURS = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"];

type Card = { n: string; s: string; t: string; fg: string; bg: string };
const MORNING: Card[] = [
  { n: "VI-A", s: "Science", t: "M. Esther", fg: "#6B7280", bg: "#F3F4F6" },
  { n: "VI-B", s: "French", t: "R. Naomi", fg: "#C2740E", bg: "#FEF3C7" },
  { n: "VII-A", s: "Mathematics", t: "J. Abraham", fg: "#1D4ED8", bg: "#DBEAFE" },
  { n: "VIII-C", s: "English", t: "D. Samuel", fg: "#166534", bg: "#DCFCE7" },
];
const NOON: Card[] = [
  { n: "VI-C", s: "Geography", t: "T. Moses", fg: "#EA580C", bg: "#FFEDD5" },
  { n: "IX-A", s: "Mathematics", t: "J. Abraham", fg: "#1D4ED8", bg: "#DBEAFE" },
];
const AFTERNOON: Card[] = [
  { n: "IX-B", s: "Science", t: "M. Esther", fg: "#6B7280", bg: "#F3F4F6" },
  { n: "X-A", s: "English", t: "D. Samuel", fg: "#166534", bg: "#DCFCE7" },
  { n: "X-B", s: "Art", t: "P. Daniel", fg: "#7C2D3F", bg: "#FCE7F3" },
];
const FREE: Record<string, [string, number][]> = {
  morning: [["P. Daniel", 1], ["T. Moses", 2], ["E. Ruth", 4]],
  noon: [["D. Samuel", 2], ["P. Daniel", 1], ["R. Naomi", 3], ["E. Ruth", 4], ["M. Esther", 3]],
  afternoon: [["R. Naomi", 1], ["J. Abraham", 3], ["T. Moses", 4]],
};

function fmt(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function fmtSec(min: number): string {
  const total = Math.floor(min * 60);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function LiveDemo() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null); // null = follow the real clock
  const [now, setNow] = useState<number>(11 * 60);
  const [sort, setSort] = useState<"light" | "heavy">("light");
  const [absent, setAbsent] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // A marketing Live board must ALWAYS look alive — a visitor at 11 PM must
    // still see a class in session. So "now" is a genuine ticking clock (it
    // advances one real second per second, seconds visible in the badge) but
    // anchored inside a morning teaching window and gently wrapped, so it is
    // always mid-lesson. It is honestly labelled "demo time", not the
    // visitor's wall clock — we never fake real local time. Dragging the
    // scrubber ahead of this tick opens the plan-ahead / mark-absent flow.
    const WIN_START = 9 * 60 + 45, WIN_END = 11 * 60 + 5; // always teaching
    const mounted = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - mounted) / 1000; // seconds → demo seconds
      setNow(WIN_START + (elapsed % ((WIN_END - WIN_START) * 60)) / 60);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const value = scrub ?? now;
  const pct = ((value - DAY_START) / (DAY_END - DAY_START)) * 100;
  const zone = value < 11.5 * 60 ? "morning" : value < 12.75 * 60 ? "noon" : "afternoon";
  const cards = zone === "morning" ? MORNING : zone === "noon" ? NOON : AFTERNOON;
  const ringPct = Math.min(99, Math.max(5, Math.round(((value % 40) / 40) * 100)));
  // You plan cover for periods that haven't happened yet — marking someone
  // absent for a finished lesson makes no sense. So "mark absent" only
  // appears once the visitor scrubs AHEAD of the real clock.
  const isFuture = value > now + 1;

  const q = query.trim().toLowerCase();
  const matches = (c: Card) => !q || c.t.toLowerCase().includes(q) || c.s.toLowerCase().includes(q) || c.n.toLowerCase().includes(q);

  const free = [...FREE[zone]]
    .filter(([n]) => n !== absent)
    .filter(([n]) => !q || n.toLowerCase().includes(q))
    .sort((a, b) => (sort === "light" ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0]));

  const seek = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const m = DAY_START + ((clientX - r.left) / r.width) * (DAY_END - DAY_START);
    setScrub(Math.max(DAY_START, Math.min(DAY_END, Math.round(m))));
  };
  const onDown = (e: React.PointerEvent) => {
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const visibleCards = (absent ? cards.filter((c) => c.t !== absent || covered) : cards).filter(matches);

  return (
    <div className="ld-wrap">
      <div className="ld-card">
        <div className="ld-head">
          <div className="ld-clockrow">
            <b className="ld-clock">{fmtSec(value)}</b>
            <span className="ld-status">{isFuture ? `Previewing ${fmt(value)}` : zone === "noon" ? "Lunch window · mixed" : "In session"}</span>
          </div>
          <div className="ld-headright">
            <span className="ld-demo-tag">demo clock</span>
            <span className="ld-livebadge" style={{ color: scrub === null ? "#16A34A" : "#9A95BC" }}>
              <i style={{ background: scrub === null ? "#16A34A" : "#CBC9DA" }} />
              {scrub === null ? "Live" : "Paused"}
            </span>
            <button className="ld-nowbtn" onClick={() => { setScrub(null); setAbsent(null); setCovered(false); }}>Now</button>
          </div>
        </div>

        <div className="ld-scrubwrap">
          <div ref={trackRef} className="ld-track" onPointerDown={onDown} role="slider" aria-label="Drag through the school day" aria-valuemin={DAY_START} aria-valuemax={DAY_END} aria-valuenow={Math.round(value)} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setScrub(Math.min(DAY_END, value + 15)); if (e.key === "ArrowLeft") setScrub(Math.max(DAY_START, value - 15)); }}>
            {SEGS.map(([w, tf], i) => (
              <span key={i} className="ld-band" style={{ flex: w }}>
                {tf > 0 && <i style={{ flex: tf, background: "#B9AFF0" }} />}
                {tf < 1 && <i style={{ flex: 1 - tf, background: "#F7D9A0" }} />}
              </span>
            ))}
            {HOURS.slice(1).map((_, i) => <i key={i} className="ld-hr" style={{ left: `${(((i + 1) * 60) / (DAY_END - DAY_START)) * 100}%` }} />)}
            <i className="ld-nowtick" style={{ left: `${((now - DAY_START) / (DAY_END - DAY_START)) * 100}%` }} />
            <span className="ld-handle" style={{ left: `${pct}%` }}><i className="ld-hline" /><i className="ld-knob" /></span>
          </div>
          <div className="ld-hours">{HOURS.map((h) => <span key={h}>{h}</span>)}</div>
          <div className="ld-legend">
            <span><i style={{ background: "#B9AFF0" }} />Teaching</span>
            <span><i style={{ background: "#F7D9A0" }} />Break / free</span>
            <span className="ld-hint">← drag ahead to plan cover</span>
          </div>
        </div>

        <div className="ld-body">
          <div className="ld-toprow">
            <div className="ld-seclabel" style={{ color: isFuture ? "#7C6FE0" : "#16A34A", margin: 0 }}>
              <i style={{ background: isFuture ? "#7C6FE0" : "#16A34A" }} />
              {isFuture ? `Upcoming at ${fmt(value)} · ${visibleCards.length}` : `In session · ${visibleCards.length}`}
            </div>
            <input className="ld-search" type="search" placeholder="🔎 search faculty, class, or subject…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search faculty, class, or subject" />
          </div>
          {!isFuture && !absent && (
            <div className="ld-plan-hint">Planning cover? Drag the timeline <b>ahead of the red &ldquo;now&rdquo; tick</b> — you mark an absence for an upcoming period, not one that&rsquo;s already over.</div>
          )}
          <div className="ld-grid">
            {visibleCards.map((c) => (
              <div key={c.n} className="ld-session">
                <span className="ld-ring">
                  <svg width="38" height="38" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#F0EEFA" strokeWidth="4" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke={c.fg} strokeWidth="4" strokeLinecap="round" strokeDasharray="100.5" strokeDashoffset={100.5 * (1 - ringPct / 100)} style={{ transition: "stroke-dashoffset 0.4s" }} />
                  </svg>
                  <b style={{ color: c.fg }}>{ringPct}%</b>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="ld-entity">{c.n}</div>
                  <span className="ld-subj" style={{ background: c.bg, color: c.fg }}>{c.s}</span>
                  <div className="ld-teacher">
                    {c.t === absent && covered ? <><s>{c.t}</s> → T. Moses <b className="ld-green">(sub) ✓</b></> : c.t}
                  </div>
                  {c.t !== absent && !absent && isFuture && (
                    <button className="ld-absent-btn" onClick={() => { setAbsent(c.t); setCovered(false); }}>mark absent</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {absent && !covered && (
            <div className="ld-subpanel">
              <b>{absent} marked absent for the {fmt(value)} period.</b> Ranked cover for this slot:
              <div className="ld-cands">
                <button className="ld-cand ld-cand-top" onClick={() => setCovered(true)}>① T. Moses · Tier 1 · free now · 1 today ✓ — <u>assign</u></button>
                <span className="ld-cand">② E. Ruth · Tier 2 · free · 4 today</span>
              </div>
              <button className="ld-reset" onClick={() => setAbsent(null)}>undo</button>
            </div>
          )}
          {absent && covered && (
            <div className="ld-covered-note">✓ T. Moses is covering — fairness-checked (first extra duty this week). <button className="ld-reset" onClick={() => { setAbsent(null); setCovered(false); }}>reset demo</button></div>
          )}

          <div className="ld-freerow">
            <div className="ld-seclabel" style={{ color: "#9A95BC", margin: 0 }}><i style={{ background: "#9A95BC" }} />Free now · {free.length}</div>
            <span className="ld-sort">
              {(["light", "heavy"] as const).map((k) => (
                <button key={k} className={sort === k ? "is-on" : ""} onClick={() => setSort(k)}>{k === "light" ? "Lightest first" : "Heaviest first"}</button>
              ))}
            </span>
          </div>
          <div className="ld-chips">
            {free.map(([n, l]) => (
              <span key={n} className="ld-chip">{n} <b style={{ color: l <= 2 ? "#16A34A" : l <= 4 ? "#B45309" : "#DC2626" }}>{l} today</b></span>
            ))}
          </div>
        </div>
      </div>
      <p className="ld-caption">Illustrative data · the clock, drag, sort, and substitution flow are the real mechanics.</p>

      <style>{`
        .ld-wrap { width: 100%; max-width: 880px; margin: 0 auto; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ld-card { background: #fff; border: 1px solid #ECE9FB; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 70px rgba(124,111,224,0.16); }
        .ld-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px 18px 10px; }
        .ld-clockrow { display: flex; align-items: baseline; gap: 12px; }
        .ld-clock { font-size: 28px; font-weight: 800; color: #13111E; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
        .ld-status { font-size: 13px; color: #6B7280; }
        .ld-headright { display: flex; align-items: center; gap: 10px; }
        .ld-livebadge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
        .ld-livebadge i { width: 8px; height: 8px; border-radius: 4px; }
        .ld-nowbtn { padding: 7px 14px; border-radius: 9px; border: 1px solid #E3DEF7; background: #fff; font-size: 12.5px; font-weight: 700; color: #7C6FE0; cursor: pointer; font-family: inherit; }
        .ld-demo-tag { font-size: 10px; font-weight: 700; color: #8B87AD; background: #F4F2FE; border: 1px solid #ECE9FB; border-radius: 8px; padding: 4px 9px; text-transform: uppercase; letter-spacing: 0.04em; }
        .ld-scrubwrap { padding: 0 18px 12px; }
        .ld-track { position: relative; height: 46px; border-radius: 12px; background: #F4F2FE; border: 1px solid #ECE9FB; cursor: pointer; touch-action: none; user-select: none; display: flex; gap: 2px; padding: 6px 0; }
        .ld-band { display: flex; flex-direction: column; border-radius: 6px; overflow: hidden; border: 1px solid rgba(19,17,30,0.07); pointer-events: none; }
        .ld-band i { display: block; }
        .ld-hr { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(19,17,30,0.14); pointer-events: none; }
        .ld-nowtick { position: absolute; top: 0; bottom: 0; width: 2px; background: #EF4444; opacity: 0.5; pointer-events: none; }
        .ld-handle { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; }
        .ld-hline { position: absolute; top: -3px; bottom: -3px; left: -1.5px; width: 3px; background: #7C6FE0; border-radius: 3px; box-shadow: 0 0 0 3px rgba(124,111,224,0.18); }
        .ld-knob { position: absolute; top: 50%; left: 0; transform: translate(-50%, -50%); width: 15px; height: 15px; border-radius: 50%; background: #7C6FE0; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(124,111,224,0.4); }
        .ld-hours { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9.5px; font-weight: 700; color: #A9A4C8; }
        .ld-legend { display: flex; gap: 14px; margin-top: 6px; align-items: center; }
        .ld-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; color: #8B87AD; }
        .ld-legend i { width: 10px; height: 10px; border-radius: 3px; border: 1px solid rgba(19,17,30,0.08); }
        .ld-hint { color: #7C6FE0 !important; margin-left: auto; }
        .ld-body { border-top: 1px solid #F2F0FB; padding: 16px 18px; background: #FBFAFF; }
        .ld-toprow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .ld-search { border: 1px solid #E3DEF7; border-radius: 9px; padding: 6px 12px; font-size: 12px; font-family: inherit; color: #13111E; background: #fff; outline: none; min-width: 240px; }
        .ld-search:focus { border-color: #7C6FE0; box-shadow: 0 0 0 3px rgba(124,111,224,0.12); }
        .ld-plan-hint { margin-bottom: 12px; background: #F5F3FF; border: 1px solid #DDD8FF; border-radius: 9px; padding: 8px 12px; font-size: 11.5px; color: #5B52A8; }
        .ld-seclabel { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
        .ld-seclabel i { width: 7px; height: 7px; border-radius: 4px; }
        .ld-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .ld-session { display: flex; gap: 11px; align-items: center; background: #fff; border: 1px solid #ECE9FB; border-radius: 13px; padding: 11px 12px; }
        .ld-ring { position: relative; width: 38px; height: 38px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
        .ld-ring b { position: absolute; font-size: 9.5px; font-weight: 800; }
        .ld-entity { font-size: 12px; font-weight: 700; color: #9A95BC; }
        .ld-subj { display: inline-block; font-size: 11px; font-weight: 800; border-radius: 6px; padding: 1.5px 8px; margin: 2px 0; white-space: nowrap; }
        .ld-teacher { font-size: 11px; color: #6B7280; }
        .ld-green { color: #059669; }
        .ld-absent-btn { margin-top: 3px; font-size: 9.5px; font-weight: 700; color: #B45309; background: #FFFBF3; border: 1px solid #E5C078; border-radius: 6px; padding: 2px 7px; cursor: pointer; font-family: inherit; }
        .ld-subpanel { margin-top: 12px; background: #fff; border: 1px solid #ECE9FB; border-radius: 12px; padding: 12px 14px; font-size: 12px; color: #374151; }
        .ld-cands { display: flex; flex-direction: column; gap: 5px; margin-top: 7px; }
        .ld-cand { text-align: left; font-size: 11.5px; padding: 6px 10px; border-radius: 8px; border: 1px solid #F0EEFA; color: #4B5275; background: #fff; font-family: inherit; }
        .ld-cand-top { border-color: #A7F3D0; background: #F0FDF9; cursor: pointer; color: #13111E; font-weight: 600; }
        .ld-covered-note { margin-top: 12px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 9px 12px; font-size: 12px; font-weight: 600; color: #166534; }
        .ld-reset { margin-left: 8px; font-size: 10px; color: #7C6FE0; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: inherit; }
        .ld-freerow { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; }
        .ld-sort { display: inline-flex; gap: 2px; padding: 2px; background: #F1EEFB; border-radius: 8px; }
        .ld-sort button { font-size: 11px; font-weight: 700; color: #8B87AD; padding: 4px 10px; border-radius: 6px; border: none; background: transparent; cursor: pointer; font-family: inherit; }
        .ld-sort button.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 1px 4px rgba(124,111,224,0.18); }
        .ld-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
        .ld-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 8px; background: #fff; border: 1px solid #ECE9FB; font-size: 12.5px; font-weight: 600; color: #6B7280; }
        .ld-chip b { font-size: 10.5px; font-weight: 800; background: #F6F4FD; padding: 1px 6px; border-radius: 6px; }
        .ld-caption { margin-top: 10px; text-align: center; font-size: 11px; color: #8B87AD; }
      `}</style>
    </div>
  );
}
