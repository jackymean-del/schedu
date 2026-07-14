"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LiveDemo — a REAL interactive Live board on the marketing page.
 *
 * The clock is the visitor's GENUINE local time, to the second — never a
 * simulated one. To keep the board alive for every visitor (a head of
 * school browsing at 11 PM must still see a class in session), the
 * ILLUSTRATIVE school day is anchored around that real time: the timeline
 * spans now−105min → now+285min, and the period plan places "now" inside a
 * teaching period. So the time is real, the schedule is honestly
 * illustrative, and the board is always in session.
 *
 * Mechanics mirror the product (calendar.tsx MomentScrubber/LiveBoard):
 * drag the scrubber, sort free faculty by load, and — only when scrubbed
 * AHEAD of now — mark someone absent and assign a fairness-ranked cover.
 */

const SPAN_BACK = 105;   // minutes of the day already behind "now"
const SPAN_AHEAD = 285;  // minutes still ahead — room to plan into
const DAY_MIN = SPAN_BACK + SPAN_AHEAD; // 6h30m school day

type Card = { n: string; s: string; t: string; fg: string; bg: string };
const C = (n: string, s: string, t: string, k: keyof typeof TINTS): Card => ({ n, s, t, fg: TINTS[k][1], bg: TINTS[k][0] });
const TINTS = {
  maths: ["#DBEAFE", "#1D4ED8"], science: ["#F3F4F6", "#4B5563"], english: ["#DCFCE7", "#166534"],
  french: ["#FEF3C7", "#B45309"], history: ["#FFEDD5", "#C2410C"], geo: ["#FCE7F3", "#9D174D"],
  art: ["#FAE8FF", "#86198F"], music: ["#E0F2FE", "#0369A1"],
} as const;

/** The day's plan in minutes-from-day-start. "now" is at SPAN_BACK (105),
 *  which sits inside P2 — so the board is always mid-lesson at now. */
type Period = { id: string; name: string; s: number; e: number; brk?: boolean; cards: Card[]; free: [string, number][] };
const PLAN: Period[] = [
  { id: "asm", name: "Assembly", s: 0, e: 15, brk: true, cards: [], free: [] },
  { id: "p1", name: "Period 1", s: 15, e: 70, cards: [
      C("VI-A", "Mathematics", "J. Abraham", "maths"), C("VII-B", "Science", "M. Esther", "science"),
      C("IX-A", "English", "D. Samuel", "english"), C("X-B", "French", "R. Naomi", "french"),
    ], free: [["P. Daniel", 1], ["T. Moses", 2], ["E. Ruth", 3]] },
  { id: "b1", name: "Morning break", s: 70, e: 85, brk: true, cards: [], free: [] },
  { id: "p2", name: "Period 2", s: 85, e: 145, cards: [
      C("VI-A", "Science", "M. Esther", "science"), C("VI-B", "French", "R. Naomi", "french"),
      C("VII-A", "Mathematics", "J. Abraham", "maths"), C("VIII-C", "English", "D. Samuel", "english"),
    ], free: [["P. Daniel", 1], ["T. Moses", 2], ["E. Ruth", 4]] },
  { id: "b2", name: "Break", s: 145, e: 160, brk: true, cards: [], free: [] },
  { id: "p3", name: "Period 3", s: 160, e: 220, cards: [
      C("IX-B", "History", "T. Moses", "history"), C("X-A", "Art", "P. Daniel", "art"),
      C("VII-C", "Music", "E. Ruth", "music"),
    ], free: [["J. Abraham", 3], ["M. Esther", 2], ["D. Samuel", 4], ["R. Naomi", 1]] },
  { id: "lun", name: "Lunch", s: 220, e: 265, brk: true, cards: [], free: [] },
  { id: "p4", name: "Period 4", s: 265, e: 325, cards: [
      C("VI-C", "Geography", "T. Moses", "geo"), C("IX-A", "Mathematics", "J. Abraham", "maths"),
      C("X-B", "Science", "M. Esther", "science"),
    ], free: [["D. Samuel", 2], ["P. Daniel", 1], ["R. Naomi", 3], ["E. Ruth", 4]] },
  { id: "b3", name: "Break", s: 325, e: 340, brk: true, cards: [], free: [] },
  { id: "p5", name: "Period 5", s: 340, e: 390, cards: [
      C("VIII-A", "English", "D. Samuel", "english"), C("X-A", "Mathematics", "J. Abraham", "maths"),
    ], free: [["M. Esther", 3], ["T. Moses", 4], ["P. Daniel", 2], ["R. Naomi", 2]] },
];

function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtSec(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function LiveDemo() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<number | null>(null); // minutes from day start; null = follow now
  const [nowDate, setNowDate] = useState<Date | null>(null);
  const [sort, setSort] = useState<"light" | "heavy">("light");
  const [absent, setAbsent] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setNowDate(new Date());
    const id = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // "now" always sits at SPAN_BACK on the illustrative day axis.
  const value = offset ?? SPAN_BACK;
  const isFuture = value > SPAN_BACK + 1;
  // The real Date for whatever moment the scrubber is on.
  const valueDate = nowDate ? new Date(nowDate.getTime() + (value - SPAN_BACK) * 60000) : null;

  const period = PLAN.find((p) => value >= p.s && value < p.e) ?? PLAN[PLAN.length - 1];
  const ringPct = Math.min(99, Math.max(4, Math.round(((value - period.s) / (period.e - period.s)) * 100)));

  const q = query.trim().toLowerCase();
  const matches = (c: Card) => !q || c.t.toLowerCase().includes(q) || c.s.toLowerCase().includes(q) || c.n.toLowerCase().includes(q);
  const visibleCards = (absent ? period.cards.filter((c) => c.t !== absent || covered) : period.cards).filter(matches);
  const free = [...period.free]
    .filter(([n]) => n !== absent)
    .filter(([n]) => !q || n.toLowerCase().includes(q))
    .sort((a, b) => (sort === "light" ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0]));

  // Real clock-hour gridlines across the illustrative axis.
  const hourMarks: { at: number; label: string }[] = [];
  if (nowDate) {
    const dayStartDate = new Date(nowDate.getTime() - SPAN_BACK * 60000);
    const first = new Date(dayStartDate);
    first.setMinutes(0, 0, 0);
    if (first < dayStartDate) first.setHours(first.getHours() + 1);
    for (let t = new Date(first); (t.getTime() - dayStartDate.getTime()) / 60000 <= DAY_MIN; t.setHours(t.getHours() + 1)) {
      hourMarks.push({
        at: (t.getTime() - dayStartDate.getTime()) / 60000,
        label: t.toLocaleTimeString([], { hour: "numeric" }),
      });
    }
  }

  const pos = (m: number) => `${(m / DAY_MIN) * 100}%`;
  const seek = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const m = ((clientX - r.left) / r.width) * DAY_MIN;
    setOffset(Math.max(0, Math.min(DAY_MIN, Math.round(m))));
  };
  const onDown = (e: React.PointerEvent) => {
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="ld-wrap">
      <div className="ld-card">
        <div className="ld-head">
          <div className="ld-clockrow">
            <b className="ld-clock">{valueDate ? fmtSec(valueDate) : "—:—:—"}</b>
            <span className="ld-status">
              {period.brk
                ? `${period.name} — no classes in session`
                : <>{period.name} · <b className="ld-left">{Math.max(1, period.e - value)} min left</b></>}
            </span>
          </div>
          <div className="ld-headright">
            <span className="ld-livebadge" style={{ color: offset === null ? "#16A34A" : "#9A95BC" }}>
              <i style={{ background: offset === null ? "#16A34A" : "#CBC9DA" }} />
              {offset === null ? "Live" : "Paused"}
            </span>
            <button className="ld-nowbtn" onClick={() => { setOffset(null); setAbsent(null); setCovered(false); }}>Now</button>
          </div>
        </div>

        <div className="ld-scrubwrap">
          <div ref={trackRef} className="ld-track" onPointerDown={onDown} role="slider"
            aria-label="Drag through the school day" aria-valuemin={0} aria-valuemax={DAY_MIN} aria-valuenow={Math.round(value)} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setOffset(Math.min(DAY_MIN, value + 15)); if (e.key === "ArrowLeft") setOffset(Math.max(0, value - 15)); }}>
            {PLAN.map((p) => (
              <span key={p.id} className="ld-band" title={p.name}
                style={{ left: pos(p.s), width: pos(p.e - p.s), background: p.brk ? "#F7D9A0" : "#B9AFF0" }} />
            ))}
            {hourMarks.map((h) => <i key={h.at} className="ld-hr" style={{ left: pos(h.at) }} />)}
            <i className="ld-nowtick" style={{ left: pos(SPAN_BACK) }} title="Now — your local time" />
            <span className="ld-handle" style={{ left: pos(value) }}><i className="ld-hline" /><i className="ld-knob" /></span>
          </div>
          <div className="ld-hourrow">
            {hourMarks.map((h) => <span key={h.at} className="ld-hour" style={{ left: pos(h.at) }}>{h.label}</span>)}
          </div>
          <div className="ld-legend">
            <span><i style={{ background: "#B9AFF0" }} />Teaching</span>
            <span><i style={{ background: "#F7D9A0" }} />Break / free</span>
            <span><i className="ld-legend-now" />Now — your local time</span>
            <span className="ld-hint">← drag ahead to plan cover</span>
          </div>
        </div>

        <div className="ld-body">
          <div className="ld-toprow">
            <div className="ld-seclabel" style={{ color: isFuture ? "#7C6FE0" : "#16A34A", margin: 0 }}>
              <i style={{ background: isFuture ? "#7C6FE0" : "#16A34A" }} />
              {isFuture
                ? `Upcoming at ${valueDate ? fmt(valueDate) : ""} · ${visibleCards.length}`
                : `In session · ${visibleCards.length}`}
            </div>
            <input className="ld-search" type="search" placeholder="🔎 search faculty, class, or subject…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search faculty, class, or subject" />
          </div>
          {!isFuture && !absent && (
            <div className="ld-plan-hint">Planning cover? Drag the timeline <b>ahead of the red &ldquo;now&rdquo; tick</b> — you mark an absence for an upcoming period, not one that&rsquo;s already running.</div>
          )}

          {period.brk ? (
            <div className="ld-idle">☕ {period.name} — no classes in session right now.</div>
          ) : (
            <div className="ld-grid">
              {visibleCards.map((c) => (
                <div key={c.n + c.s} className="ld-session">
                  <span className="ld-ring">
                    <svg width="38" height="38" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#F0EEFA" strokeWidth="4" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke={c.fg} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray="100.5" strokeDashoffset={100.5 * (1 - ringPct / 100)} style={{ transition: "stroke-dashoffset 0.4s" }} />
                    </svg>
                    <b style={{ color: c.fg }}>{ringPct}%</b>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="ld-entity">{c.n}</div>
                    <span className="ld-subj" style={{ background: c.bg, color: c.fg }}>{c.s}</span>
                    <div className="ld-teacher">
                      {c.t === absent && covered ? <><s>{c.t}</s> → {SUB_PICK} <b className="ld-green">(sub) ✓</b></> : c.t}
                    </div>
                    {c.t !== absent && !absent && isFuture && (
                      <button className="ld-absent-btn" onClick={() => { setAbsent(c.t); setCovered(false); }}>mark absent</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {absent && !covered && (
            <div className="ld-subpanel">
              <b>{absent} marked absent for {period.name} ({valueDate ? fmt(valueDate) : ""}).</b> Ranked cover — scored on real workload:
              <div className="ld-cands">
                <button className="ld-cand ld-cand-top" onClick={() => setCovered(true)}>
                  ① {SUB_PICK} · free this period · {free.find(([n]) => n === SUB_PICK)?.[1] ?? 1} today · lightest eligible ✓ — <u>assign</u>
                </button>
                {free.filter(([n]) => n !== SUB_PICK).slice(0, 1).map(([n, l]) => (
                  <span key={n} className="ld-cand">② {n} · free · {l} today</span>
                ))}
              </div>
              <button className="ld-reset" onClick={() => setAbsent(null)}>undo</button>
            </div>
          )}
          {absent && covered && (
            <div className="ld-covered-note">✓ {SUB_PICK} is covering — fairness-checked (lightest load of everyone free this period). <button className="ld-reset" onClick={() => { setAbsent(null); setCovered(false); }}>reset demo</button></div>
          )}

          {!period.brk && (
            <>
              <div className="ld-freerow">
                <div className="ld-seclabel" style={{ color: "#9A95BC", margin: 0 }}><i style={{ background: "#9A95BC" }} />Free {isFuture ? "then" : "now"} · {free.length}</div>
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
            </>
          )}
        </div>
      </div>
      <p className="ld-caption">The clock and the &ldquo;now&rdquo; tick are your genuine local time. The schedule around them is an illustrative day for Eden&rsquo;s Academy — the drag, sort, and substitution mechanics are the real ones.</p>

      <style>{`
        .ld-wrap { width: 100%; max-width: 880px; margin: 0 auto; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ld-card { background: #fff; border: 1px solid #ECE9FB; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 70px rgba(124,111,224,0.16); }
        .ld-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px 18px 10px; }
        .ld-clockrow { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .ld-clock { font-size: 28px; font-weight: 800; color: #13111E; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
        .ld-status { font-size: 13px; color: #6B7280; }
        .ld-left { color: #16A34A; font-weight: 700; }
        .ld-headright { display: flex; align-items: center; gap: 10px; }
        .ld-livebadge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
        .ld-livebadge i { width: 8px; height: 8px; border-radius: 4px; }
        .ld-nowbtn { padding: 7px 14px; border-radius: 9px; border: 1px solid #E3DEF7; background: #fff; font-size: 12.5px; font-weight: 700; color: #7C6FE0; cursor: pointer; font-family: inherit; }
        .ld-scrubwrap { padding: 0 18px 12px; }
        .ld-track { position: relative; height: 46px; border-radius: 12px; background: #F4F2FE; border: 1px solid #ECE9FB; cursor: pointer; touch-action: none; user-select: none; }
        .ld-band { position: absolute; top: 6px; bottom: 6px; border-radius: 6px; border: 1px solid rgba(19,17,30,0.07); pointer-events: none; }
        .ld-hr { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(19,17,30,0.14); pointer-events: none; }
        .ld-nowtick { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #EF4444; pointer-events: none; box-shadow: 0 0 6px rgba(239,68,68,0.5); }
        .ld-handle { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; }
        .ld-hline { position: absolute; top: -3px; bottom: -3px; left: -1.5px; width: 3px; background: #7C6FE0; border-radius: 3px; box-shadow: 0 0 0 3px rgba(124,111,224,0.18); }
        .ld-knob { position: absolute; top: 50%; left: 0; transform: translate(-50%, -50%); width: 15px; height: 15px; border-radius: 50%; background: #7C6FE0; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(124,111,224,0.4); }
        .ld-hourrow { position: relative; height: 14px; margin-top: 4px; }
        .ld-hour { position: absolute; transform: translateX(-50%); font-size: 9.5px; font-weight: 700; color: #A9A4C8; white-space: nowrap; font-family: 'DM Mono', monospace; }
        .ld-legend { display: flex; gap: 14px; margin-top: 6px; align-items: center; flex-wrap: wrap; }
        .ld-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; color: #8B87AD; }
        .ld-legend i { width: 10px; height: 10px; border-radius: 3px; border: 1px solid rgba(19,17,30,0.08); }
        .ld-legend-now { background: #EF4444; width: 3px !important; height: 12px !important; border-radius: 2px !important; border: none !important; }
        .ld-hint { color: #7C6FE0 !important; margin-left: auto; }
        .ld-body { border-top: 1px solid #F2F0FB; padding: 16px 18px; background: #FBFAFF; }
        .ld-toprow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .ld-search { border: 1px solid #E3DEF7; border-radius: 9px; padding: 6px 12px; font-size: 12px; font-family: inherit; color: #13111E; background: #fff; outline: none; min-width: 240px; }
        .ld-search:focus { border-color: #7C6FE0; box-shadow: 0 0 0 3px rgba(124,111,224,0.12); }
        .ld-plan-hint { margin-bottom: 12px; background: #F5F3FF; border: 1px solid #DDD8FF; border-radius: 9px; padding: 8px 12px; font-size: 11.5px; color: #5B52A8; }
        .ld-seclabel { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
        .ld-seclabel i { width: 7px; height: 7px; border-radius: 4px; }
        .ld-idle { text-align: center; padding: 28px 16px; font-size: 13.5px; font-weight: 600; color: #6B7280; }
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
        .ld-caption { margin-top: 10px; text-align: center; font-size: 11px; color: #8B87AD; line-height: 1.6; }
        @media (max-width: 560px) { .ld-search { min-width: 100%; } .ld-hint { margin-left: 0; } }
      `}</style>
    </div>
  );
}

const SUB_PICK = "P. Daniel";
