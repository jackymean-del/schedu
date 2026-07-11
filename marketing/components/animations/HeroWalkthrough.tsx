"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "./useInView";

/**
 * HeroWalkthrough — the simulated product walkthrough hero.
 * Spec: design/hero-walkthrough/ (00-frame-and-loop.md + one doc per scene).
 *
 * A browser-frame device containing miniature but faithful reproductions of
 * the REAL app screens (dashboard, wizard steps 1-5, timetable, export,
 * Live board, task/substitution flows, reports), driven by a simulated
 * cursor. Every screen's copy, colors and control shapes were read from the
 * actual frontend source before being drawn here — deviations from reality
 * are documented in design/hero-walkthrough/99-open-questions.md, not
 * papered over. Illustrative data uses one coherent demo school
 * ("Sunrise Public School"); the only real data shown is the wall clock.
 *
 * Conventions:
 *  - .hw-in            appears (opacity/translate) at an inline animation-delay
 *  - .hw-swap/.hw-sa/.hw-sb  before/after state swap at an inline delay
 *  - .hw-type          typed-text reveal (width steps) + blinking caret
 *  - Cursor            pointer w/ click rings; per-scene path keyframe
 *  - Reduced motion    pins to scene 7; dots still step through resolved frames
 */

const SCENES: { key: string; caption: string; dur: number }[] = [
  { key: "dash", caption: "Start here.", dur: 2600 },
  { key: "res", caption: "Pick your board. It fills the rest.", dur: 2800 },
  { key: "bell", caption: "Set the start. Every period times itself.", dur: 3000 },
  { key: "alloc", caption: "Every teacher, matched automatically.", dur: 2600 },
  { key: "combo", caption: "One teacher, two subjects — handled.", dur: 3000 },
  { key: "gen", caption: "Every conflict — resolved.", dur: 3400 },
  { key: "tt", caption: "Your timetable. Done.", dur: 2000 },
  { key: "print", caption: "Same schedule. Ready to print.", dur: 2200 },
  { key: "live", caption: "See who's free. Right now.", dur: 3200 },
  { key: "task", caption: "Assigned fairly. Automatically.", dur: 3000 },
  { key: "sub", caption: "Absent? Covered — instantly.", dur: 3000 },
  { key: "rep", caption: "Track it, term over term.", dur: 2200 },
  { key: "close", caption: "The last schedule you'll ever fix by hand.", dur: 2600 },
];
const RM_PIN = 6; // scene 7 — finished timetable (most informative frame)

export function HeroWalkthrough() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [idx, setIdx] = useState(0);
  const [rm, setRm] = useState(false);
  const manualRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRm(true);
      setIdx(RM_PIN);
    }
  }, []);

  useEffect(() => {
    if (!inView || rm) return;
    // Manual dot click pauses autoplay for 8s before resuming from there.
    const delay = manualRef.current ? 8000 : SCENES[idx].dur;
    manualRef.current = false;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SCENES.length), delay);
    return () => clearTimeout(t);
  }, [idx, inView, rm]);

  const jump = (i: number) => {
    manualRef.current = true;
    setIdx(i);
  };

  const scene = SCENES[idx];

  return (
    <div ref={ref} className="hw-wrap">
      <div className="hw-frame">
        <div className="hw-chrome">
          <span className="hw-dot" style={{ background: "#EF4444" }} />
          <span className="hw-dot" style={{ background: "#F59E0B" }} />
          <span className="hw-dot" style={{ background: "#22C55E" }} />
          <span className="hw-url">app.schedu.bhusku.com</span>
          <span className="hw-chrome-right">⟳ ⋯ 🔒</span>
        </div>
        <div key={idx} className="hw-stage">
          {scene.key === "dash" && <S1Dash />}
          {scene.key === "res" && <S2Resources />}
          {scene.key === "bell" && <S3Bell />}
          {scene.key === "alloc" && <S4Alloc />}
          {scene.key === "combo" && <S5Combo />}
          {scene.key === "gen" && <S6Generate />}
          {scene.key === "tt" && <S7Timetable />}
          {scene.key === "print" && <S8Print />}
          {scene.key === "live" && <S9Live />}
          {scene.key === "task" && <S10Task />}
          {scene.key === "sub" && <S11Sub />}
          {scene.key === "rep" && <S12Reports />}
          {scene.key === "close" && <S13Close />}
        </div>
      </div>

      <div className="hw-caption" aria-live="polite">{scene.caption}</div>
      <div className="hw-dots" role="tablist" aria-label="Walkthrough scenes">
        {SCENES.map((s, i) => (
          <button
            key={s.key}
            className={`hw-seg ${i === idx ? "is-on" : ""} ${i < idx ? "is-past" : ""}`}
            aria-label={`Scene ${i + 1}: ${s.caption}`}
            aria-selected={i === idx}
            role="tab"
            onClick={() => jump(i)}
          >
            <span className="hw-seg-fill" style={i === idx && inView && !rm ? { animationDuration: `${s.dur}ms` } : undefined} />
          </button>
        ))}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ─── Cursor ──────────────────────────────────────────────────────────────
function Cursor({ move, clicks, dur, grab }: { move: string; clicks: number[]; dur: number; grab?: [number, number] }) {
  return (
    <div className="hw-cursor" style={{ animationName: move, animationDuration: `${dur}ms` }}>
      <span className="hw-cur-glyphs">
        <svg viewBox="0 0 24 24" width="18" height="18" className="hw-cur-arrow" style={grab ? { animation: `hw-hide 1ms linear ${grab[0]}ms both, hw-show 1ms linear ${grab[1]}ms both` } : undefined}>
          <path d="M4 2 L4 20 L9 15.5 L12.5 22 L15 20.5 L11.5 14 L18 14 Z" fill="#fff" stroke="#13111E" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {grab && (
          <span className="hw-cur-hand" style={{ animation: `hw-show 1ms linear ${grab[0]}ms both, hw-hide 1ms linear ${grab[1]}ms both` }}>✊</span>
        )}
      </span>
      {clicks.map((t, i) => <span key={i} className="hw-ring" style={{ animationDelay: `${t}ms` }} />)}
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────
const TEACHERS = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul", "Mr. Sharma"];
const TINT: Record<string, string> = { Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7", Hindi: "#FCE7F3", "S.St": "#FEF9C3" };

function In({ d, children, className, style }: { d: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`hw-in ${className ?? ""}`} style={{ ...style, animationDelay: `${d}ms` }}>{children}</div>;
}

// ─── Scene 1 · Dashboard ────────────────────────────────────────────────
function S1Dash() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div>
          <div className="hw-h1">Good morning, Priya</div>
          <div className="hw-sub">Sunrise Public School · AY 2026–27</div>
        </div>
        <span className="hw-cta hw-press" style={{ animationDelay: "1200ms" }}>＋ New schedule</span>
      </div>
      <div className="hw-pulse-strip">● All 24 classes covered today · 2 teachers on leave</div>
      <div className="hw-row-between" style={{ marginTop: 12 }}>
        <div className="hw-h2">Your schedules</div><span className="hw-faint">3 total</span>
      </div>
      <div className="hw-cards3">
        {[["AY 2026–27", "🟢 Published"], ["VI–X TT", "🟡 Draft"], ["Exam block", "🟡 Draft"]].map(([n, s]) => (
          <div key={n} className="hw-mini-card"><div className="hw-mini-name">{n}</div><div className="hw-mini-status">{s}</div></div>
        ))}
      </div>
      {/* click outcome: create modal slides up */}
      <In d={1350} className="hw-overlay">
        <div className="hw-modal">
          <div className="hw-h2">Create new schedule</div>
          <div className="hw-sub">AI will generate all defaults — you only refine.</div>
          <div className="hw-field-label" style={{ marginTop: 10 }}>Schedule name <b className="hw-req">*</b></div>
          <div className="hw-input hw-faint">e.g. AY 2025–26 · Main Schedule</div>
        </div>
      </In>
      <Cursor move="hw-c1" clicks={[1200]} dur={2600} />
    </div>
  );
}

// ─── Scene 2 · Board pick → Step 1 Resources ────────────────────────────
function S2Resources() {
  return (
    <div className="hw-scene hw-app">
      {/* Layer A — the create modal (board pick) */}
      <div className="hw-layer hw-sa" style={{ animationDelay: "1450ms" }}>
        <div className="hw-modal hw-modal-center">
          <div className="hw-h2">Create new schedule</div>
          <div className="hw-field-label" style={{ marginTop: 10 }}>Board <b className="hw-req">*</b></div>
          <div className="hw-chips-row">
            {["CBSE", "ICSE", "IB", "State", "Custom"].map((b) => (
              <span key={b} className={`hw-board-chip ${b === "CBSE" ? "hw-board-on" : ""}`}>{b}</span>
            ))}
          </div>
          <In d={550} className="hw-ai-tags">
            <div className="hw-ai-tags-head">✨ schedU will auto-create editable</div>
            <div className="hw-chips-row">
              {["Class I–X · 24 sections", "~38 subjects", "42 teachers", "Rooms 101–160"].map((t, i) => (
                <In key={t} d={600 + i * 90} className="hw-tag">{t}</In>
              ))}
            </div>
          </In>
          <div className="hw-row-between" style={{ marginTop: 12 }}>
            <span className="hw-btn-ghost">Cancel</span>
            <span className="hw-faint" style={{ fontSize: 9 }}>You&rsquo;ll refine everything in the wizard →</span>
            <span className="hw-btn-ink hw-press" style={{ animationDelay: "1300ms" }}>Open wizard →</span>
          </div>
        </div>
      </div>
      {/* Layer B — Step 1 Resources shell */}
      <div className="hw-layer hw-sb" style={{ animationDelay: "1450ms" }}>
        <div className="hw-wizard">
          <div className="hw-side">
            {[["Classes", 24], ["Subjects", 38], ["Faculty", 42], ["Venues", 60]].map(([l, n], i) => (
              <In key={String(l)} d={1550 + i * 90} className={`hw-side-item ${i === 0 ? "is-on" : ""}`}>
                <span>{l}</span><b>{n}</b>
              </In>
            ))}
          </div>
          <div className="hw-panel">
            <div className="hw-table-head"><span>Name</span><span>Grade</span><span>Room</span><span>Class teacher</span></div>
            {[["I-A", "I", "R-101"], ["I-B", "I", "R-102"], ["II-A", "II", "R-103"], ["II-B", "II", "R-104"], ["III-A", "III", "R-105"]].map((r, i) => (
              <In key={r[0]} d={1650 + i * 70} className="hw-table-row"><span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span><span className="hw-faint">(auto)</span></In>
            ))}
            <div className="hw-ai-pill hw-swap" style={{ marginTop: 8 }}>
              <In d={1600} className="hw-sa2" style={{ animationDelay: "2300ms" }}>Applying CBSE curriculum standards…</In>
              <In d={2300} className="hw-green">✓ CBSE curriculum assigned</In>
            </div>
          </div>
        </div>
        <div className="hw-wiz-foot"><span>← Back</span><span>Step 1 of 5</span><span className="hw-violet-b">Next: Shift &amp; timing →</span></div>
      </div>
      <Cursor move="hw-c2" clicks={[500, 1300]} dur={2800} />
    </div>
  );
}

// ─── Scene 3 · Shift & Timing (Schedule Rhythm) ─────────────────────────
const BELL_SINGLE = [
  ["08:00", "Assembly", "Assembly", "Assembly"],
  ["08:10", "P1", "P1", "P1"],
  ["09:30", "P2 · P3", "P2 · P3", "P2 · P3"],
  ["11:00", "LUNCH", "LUNCH", "LUNCH"],
  ["11:40", "P4 · P5", "P4 · P5", "P4 · P5"],
];
const BELL_SMART = [
  ["08:00", "Assembly", "Assembly", "Assembly"],
  ["08:10", "P1 · P2", "P1 · P2", "P1 · P2"],
  ["11:00", "LUNCH", "P4", "P4"],
  ["11:40", "P4", "LUNCH", "P5"],
  ["12:20", "P5", "P5", "LUNCH"],
];
function S3Bell() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-card-lite">
        <div className="hw-card-head">⧉ Main Shift <span className="hw-faint" style={{ fontWeight: 500 }}>· Schedule Rhythm</span></div>
        <div className="hw-fields-row">
          <div><div className="hw-field-label">Start time</div><div className="hw-input hw-mono"><span className="hw-type" style={{ ["--ch" as string]: "5ch", animationDelay: "550ms", animationDuration: "500ms" }}>08:00</span><span className="hw-caret" /></div></div>
          <div><div className="hw-field-label">End time</div><div className="hw-input hw-mono">02:10 PM ✎</div><div className="hw-hint">generation target</div></div>
          <div><div className="hw-field-label">Duration (min)</div><div className="hw-input hw-mono">40</div></div>
          <div><div className="hw-field-label">Max/day</div><div className="hw-input hw-mono">8</div></div>
        </div>
        <div className="hw-field-label" style={{ marginTop: 8 }}>LUNCH BREAK MODE</div>
        <div className="hw-lunch-row">
          <span className="hw-lunch-card">🕐 <b>Single Lunch</b><i>All classes share one slot.</i></span>
          <span className="hw-lunch-card hw-lunch-smart" style={{ animationDelay: "1850ms" }}>🧠 <b>Smart Lunch</b><i>Each age group eats at a different time. Avoids canteen rush.</i></span>
        </div>
      </div>
      <div className="hw-bell-grid hw-swap" style={{ marginTop: 10 }}>
        <div className="hw-sa2" style={{ animationDelay: "2000ms" }}>
          <BellTable rows={BELL_SINGLE} startDelay={1100} />
        </div>
        <In d={2000}>
          <BellTable rows={BELL_SMART} startDelay={2000} />
        </In>
      </div>
      <Cursor move="hw-c3" clicks={[550, 1850]} dur={3000} />
    </div>
  );
}
function BellTable({ rows, startDelay }: { rows: string[][]; startDelay: number }) {
  return (
    <div className="hw-bell-table">
      <div className="hw-bell-row hw-bell-header"><span /><span>I–V</span><span>VI–VIII</span><span>IX–X</span></div>
      {rows.map((r, i) => (
        <In key={i} d={startDelay + i * 80} className="hw-bell-row">
          <span className="hw-mono hw-faint">{r[0]}</span>
          {r.slice(1).map((c, j) => <span key={j} className={c === "LUNCH" ? "hw-lunch-band" : "hw-bell-cell"}>{c}</span>)}
        </In>
      ))}
    </div>
  );
}

// ─── Scene 4 · Allocation ────────────────────────────────────────────────
const ALLOC = [
  ["IX-A", "5", "4+1L", "5", "4", "4", "23/24"],
  ["IX-B", "5", "4+1L", "5", "4", "4", "23/24"],
  ["X-A", "6", "5+1L", "5", "4", "4", "25/25"],
  ["X-B", "6", "5+1L", "5", "4", "4", "25/25"],
];
function S4Alloc() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-tabs-row">
        <span className="hw-tab is-on">Period allocation</span>
        <span className="hw-tab hw-flash" style={{ animationDelay: "1250ms" }}>Validation</span>
        <span className="hw-tab">Teacher allocation</span>
      </div>
      <div className="hw-swap" style={{ marginTop: 8 }}>
        <div className="hw-sa2" style={{ animationDelay: "1400ms" }}>
          <div className="hw-alloc-grid">
            <div className="hw-alloc-row hw-alloc-head"><span /><span>Maths</span><span>Science</span><span>English</span><span>Hindi</span><span>S.St</span><span>Total</span></div>
            {ALLOC.map((r, ri) => (
              <div key={r[0]} className="hw-alloc-row">
                <span className="hw-alloc-sec">{r[0]}</span>
                {r.slice(1, 6).map((c, ci) => (
                  <In key={ci} d={100 + (ri * 5 + ci) * 50} className="hw-alloc-cell hw-mono">{c}</In>
                ))}
                <In d={100 + (ri * 5 + 5) * 50} className="hw-alloc-total hw-mono">{r[6]} <b className="hw-green">✓</b></In>
              </div>
            ))}
          </div>
        </div>
        <In d={1400}>
          <div className="hw-valid-panel">
            {["Period totals fit weekly capacity", "Every allocated cell has a teacher", "No teacher over daily cap"].map((c, i) => (
              <In key={c} d={1500 + i * 150} className="hw-check"><b className="hw-green">✓</b> {c}</In>
            ))}
            <In d={2000} className="hw-success-banner">All checks passed. Ready to proceed to Student Groups.</In>
          </div>
        </In>
      </div>
      <div className="hw-wiz-foot"><span /><span>Step 3 of 5 · Period allocation → Teacher allocation → Validation</span><span /></div>
      <Cursor move="hw-c4" clicks={[1250]} dur={2600} />
    </div>
  );
}

// ─── Scene 5 · Groups & Combos ──────────────────────────────────────────
function S5Combo() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div className="hw-tabs-row" style={{ margin: 0 }}>
          <span className="hw-tab is-on">AND Groups</span>
          <span className="hw-tab hw-flash" style={{ animationDelay: "2200ms" }}>OR Groups</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className="hw-btn-amber hw-press" style={{ animationDelay: "450ms" }}>✨ AI Suggest</span>
          <span className="hw-cta" style={{ padding: "4px 10px", fontSize: 9.5 }}>＋ New block</span>
        </div>
      </div>
      <In d={600} className="hw-block-card">
        <div className="hw-block-title">Block: Science IX–X</div>
        <div className="hw-alloc-grid">
          <div className="hw-alloc-row hw-alloc-head" style={{ gridTemplateColumns: "1fr 1fr 1fr 0.8fr" }}><span>Section</span><span>Physics</span><span>Chemistry</span><span>Total</span></div>
          {[["IX-A", "28", "24", "52"], ["IX-B", "26", "26", "52"]].map((r) => (
            <div key={r[0]} className="hw-alloc-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 0.8fr" }}>
              <span className="hw-alloc-sec">{r[0]}</span>
              <span className="hw-alloc-cell hw-mono">{r[1]}</span>
              <span className="hw-alloc-cell hw-mono">{r[2]}</span>
              <span className="hw-alloc-total hw-mono">{r[3]} <b className="hw-green">✓</b></span>
            </div>
          ))}
        </div>
        <div className="hw-merge-row">
          <span className="hw-faint" style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase" }}>Global merge:</span>
          <span className="hw-merge-pair">Section <i className="hw-merge-off" style={{ animationDelay: "1250ms" }}>Same</i><i className="hw-merge-on" style={{ animationDelay: "1250ms" }}>Cross</i></span>
          <span className="hw-merge-pair">Grade <i style={{ background: "#7C6FE0", color: "#fff" }}>Same</i><i>Cross</i></span>
          <span className="hw-btn-violet hw-press" style={{ animationDelay: "1700ms" }}>Generate teaching groups</span>
        </div>
        <div className="hw-group-chips hw-swap">
          <div className="hw-sa2" style={{ animationDelay: "1850ms", display: "flex", gap: 6 }}>
            <span className="hw-gchip">Physics · IX-A · 28</span>
            <span className="hw-gchip">Physics · IX-B · 26</span>
          </div>
          <In d={1850} style={{ display: "flex", gap: 6 }}>
            <span className="hw-gchip hw-gchip-merged">Physics · IX-A+B · 54 · Lab-1</span>
            <span className="hw-gchip hw-gchip-merged">Chemistry · IX-A+B · 50 · Lab-2</span>
          </In>
        </div>
      </In>
      <In d={2300} className="hw-or-card">
        <b>Painting OR PE</b> — students pick one option; one runs at a time. <span className="hw-faint">(OR Groups)</span>
      </In>
      <Cursor move="hw-c5" clicks={[450, 1250, 1700]} dur={3000} />
    </div>
  );
}

// ─── Scene 6 · Generate (the solve) ─────────────────────────────────────
const SOLVE_LABELS = [
  "Reading school setup…",
  "Matching teachers to subjects…",
  "Building the weekly schedule…",
  "Ensuring no teacher is double-booked…",
  "Checking for conflicts and gaps…",
];
const FEED = ["IX-A → Maths · Mr. Rao", "X-B → Science · Ms. Iyer", "VII-C → English · Mr. Das", "VI-A → Hindi · Mrs. Paul", "IX-B → S.St · Mr. Sharma", "X-A → Maths · Mr. Rao"];
function S6Generate() {
  return (
    <div className="hw-scene hw-app hw-center-col">
      <div className="hw-preflight">✓ Every class fits its weekly capacity — ready to generate.</div>
      <span className="hw-cta hw-press hw-sa2" style={{ animationDelay: "450ms", animationDuration: "400ms" }}>✨ Generate Schedule</span>
      <In d={600} className="hw-solve">
        <div className="hw-ring-row">
          <svg viewBox="0 0 44 44" width="52" height="52">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#EDE9FF" strokeWidth="5" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="#7C6FE0" strokeWidth="5" strokeLinecap="round"
              strokeDasharray="113" strokeDashoffset="113" transform="rotate(-90 22 22)" className="hw-ring-arc" />
          </svg>
          <div className="hw-solve-labels">
            {SOLVE_LABELS.map((l, i) => (
              <span key={l} className="hw-solve-label" style={{ animationDelay: `${650 + i * 380}ms` }}>{l}</span>
            ))}
          </div>
        </div>
        <div className="hw-feed">
          {FEED.map((f, i) => (
            <In key={f} d={800 + i * 220} className="hw-feed-line"><b className="hw-green">✓</b> {f}</In>
          ))}
        </div>
      </In>
      <In d={2600} className="hw-done-row">
        <span className="hw-conflict-pill"><i /> 0 conflicts</span>
        <span className="hw-cta hw-press" style={{ animationDelay: "3100ms" }}>View Schedule (Draft) →</span>
      </In>
      <Cursor move="hw-c6" clicks={[450, 3100]} dur={3400} />
    </div>
  );
}

// ─── Scene 7 · Finished timetable ───────────────────────────────────────
const TT_ROWS: [string, string[]][] = [
  ["P1 · 8:10", ["Maths", "English", "Maths", "Science", "Hindi"]],
  ["P2 · 8:50", ["Science", "Maths", "S.St", "English", "Maths"]],
  ["P3 · 9:30", ["English", "S.St", "Science", "Maths", "S.St"]],
  ["LUNCH", []],
  ["P4 · 11:40", ["Hindi", "Science", "English", "S.St", "Science"]],
  ["P5 · 12:20", ["S.St", "Hindi", "Hindi", "Hindi", "English"]],
];
function S7Timetable() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div className="hw-h2">AY 2026–27 · Main Schedule <span className="hw-draft-chip">🟡 Draft</span></div>
        <span className="hw-input" style={{ padding: "3px 8px", fontSize: 9.5 }}>IX-A ▾</span>
      </div>
      <div className="hw-tt-grid">
        <div className="hw-tt-row hw-tt-head"><span /><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div>
        {TT_ROWS.map(([p, cells], ri) =>
          p === "LUNCH" ? (
            <In key={p} d={300 + ri * 110} className="hw-tt-lunch">Lunch Break</In>
          ) : (
            <div key={p} className="hw-tt-row">
              <span className="hw-tt-p hw-mono">{p}</span>
              {cells.map((c, ci) => (
                <In key={ci} d={200 + ci * 120 + ri * 40} className="hw-tt-cell" style={{ background: TINT[c] }}>
                  <b>{c}</b><i>{TEACHERS[(ri + ci) % 5]}</i>
                </In>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Scene 8 · Export → Print / PDF ─────────────────────────────────────
function S8Print() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-dim-bg" />
      <div className="hw-export-panel">
        <div className="hw-h2">Export formats</div>
        {[["📊", "Excel workbook"], ["📄", "Master data (CSV)"], ["🖨", "Print / PDF"]].map(([ic, l], i) => (
          <div key={l} className={`hw-fmt-card ${i === 2 ? "hw-fmt-sel" : ""}`} style={i === 2 ? { animationDelay: "750ms" } : undefined}>
            <span>{ic} {l}</span>{i === 2 && <b className="hw-fmt-check" style={{ animationDelay: "750ms" }}>✓</b>}
          </div>
        ))}
        <div className="hw-row-between" style={{ marginTop: 8 }}>
          <span className="hw-faint hw-swap" style={{ fontSize: 9 }}>
            <span className="hw-sa2" style={{ animationDelay: "750ms" }}>Choose formats, then click Export</span>
            <In d={750}>1 format selected</In>
          </span>
          <span className="hw-cta hw-press" style={{ padding: "5px 14px", fontSize: 10, animationDelay: "1200ms" }}>Export</span>
        </div>
      </div>
      <In d={1350} className="hw-print-sheet">
        <div className="hw-print-head">
          <svg viewBox="0 0 52 52" width="14" height="14"><path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#000" strokeWidth="9" strokeLinecap="round" /></svg>
          <b>schedU</b> · Sunrise Public School · IX-A
        </div>
        <div className="hw-print-grid">
          {Array.from({ length: 15 }, (_, i) => <span key={i} className="hw-print-cell">{["Maths", "Sci", "Eng", "Hin", "S.St"][i % 5]}</span>)}
        </div>
      </In>
      <Cursor move="hw-c8" clicks={[750, 1200]} dur={2200} />
    </div>
  );
}

// ─── Scene 9 · Live + scrubber drag (real clock) ────────────────────────
function S9Live() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const frac = now ? Math.max(0.04, Math.min(0.96, ((now.getHours() + now.getMinutes() / 60) - 8) / 7)) : 0.45;

  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div><b className="hw-live-clock hw-mono">{clock}</b> <span className="hw-sub" style={{ display: "inline" }}>Period 3 · 18 min left</span></div>
        <div><span className="hw-live-badge">● Live</span> <span className="hw-now-btn hw-flash" style={{ animationDelay: "2400ms" }}>Now</span></div>
      </div>
      <div className="hw-live-track">
        {[14, 4, 18, 3, 20, 5, 16].map((w, i) => (
          <span key={i} style={{ flex: w, background: i % 2 === 0 ? "#B9AFF0" : "#F7D9A0" }} />
        ))}
        <span className="hw-playhead" style={{ left: `${frac * 100}%` }}>
          <span className="hw-playhead-drag">
            <i className="hw-ph-line" />
            <b className="hw-ph-badge hw-swap">
              <span className="hw-sa2" style={{ animationDelay: "850ms" }}>{clock}</span>
              <span className="hw-ph-pin" style={{ animation: "hw-show 1ms linear 850ms both, hw-hide 1ms linear 2500ms both" }}>pinned</span>
              <span style={{ animation: "hw-hide 1ms linear 0ms both, hw-show 1ms linear 2500ms both" }}>{clock}</span>
            </b>
          </span>
        </span>
      </div>
      <div className="hw-legend"><span><i style={{ background: "#B9AFF0" }} />Teaching</span><span><i style={{ background: "#F7D9A0" }} />Break / free</span></div>
      <div className="hw-live-section" style={{ color: "#16A34A" }}>● In session · 2</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[["VIII-A", "Maths", "Mr. Rao", 62, "#7C6FE0"], ["IX-C", "Science", "Ms. Iyer", 38, "#0EA5E9"]].map(([n, s, t, pct, ac]) => (
          <div key={String(n)} className="hw-live-card">
            <svg width="26" height="26" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="15" fill="none" stroke="#F0EEFA" strokeWidth="5" />
              <circle cx="20" cy="20" r="15" fill="none" stroke={String(ac)} strokeWidth="5" strokeDasharray="94" strokeDashoffset={94 - (Number(pct) / 100) * 94} strokeLinecap="round" transform="rotate(-90 20 20)" />
            </svg>
            <div><b>{n}</b> <span className="hw-live-subj" style={{ background: String(ac) }}>{s}</span><i className="hw-faint">{t}</i></div>
          </div>
        ))}
      </div>
      <div className="hw-live-section" style={{ color: "#9A95BC", marginTop: 6 }}>● Free now · 3</div>
      <div style={{ display: "flex", gap: 6 }}>
        {[["Mr. Das", 2], ["Mrs. Paul", 4], ["Mr. Sharma", 1]].map(([n, l]) => (
          <span key={String(n)} className="hw-free-chip">{n} <b style={{ color: Number(l) <= 2 ? "#16A34A" : "#B45309" }}>{l} today</b> <i className="hw-plus">＋</i></span>
        ))}
      </div>
      <Cursor move="hw-c9" clicks={[850, 2400]} dur={3200} grab={[850, 2000]} />
    </div>
  );
}

// ─── Scene 10 · Assign a task ───────────────────────────────────────────
function S10Task() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-live-section" style={{ color: "#9A95BC" }}>● Free now · 3</div>
      <div style={{ display: "flex", gap: 6 }}>
        <span className="hw-free-chip">Mr. Das <b style={{ color: "#16A34A" }}>2 today</b>
          <span className="hw-swap" style={{ display: "inline-grid" }}>
            <i className="hw-plus hw-sa2" style={{ animationDelay: "2350ms" }}>＋</i>
            <In d={2350} className="hw-task-tag" style={{ display: "inline" }}>Exam invig. · P4 ✓</In>
          </span>
        </span>
        <span className="hw-free-chip">Mrs. Paul <b style={{ color: "#B45309" }}>4 today</b> <i className="hw-plus">＋</i></span>
      </div>
      <In d={600} className="hw-overlay hw-sa2-wrap">
        <div className="hw-sa2" style={{ animationDelay: "2350ms", width: "100%", display: "flex", justifyContent: "center" }}>
          <div className="hw-modal hw-assign-modal">
            <div className="hw-assign-head">📌 <b>Assign a task</b><br /><span>Teacher: <b>Mr. Das</b> · Period 4 · 2026-07-11</span></div>
            <div className="hw-assign-body">
              <In d={800} className="hw-fair">● This would be Mr. Das&rsquo;s first extra duty this week — a fair pick. 💪</In>
              <div className="hw-field-label" style={{ marginTop: 6 }}>What should this slot be used for? <b className="hw-req">*</b></div>
              <div className="hw-input"><span className="hw-type" style={{ ["--ch" as string]: "17ch", animationDelay: "1300ms", animationDuration: "600ms" }}>Exam invigilation</span><span className="hw-caret" /></div>
              <div className="hw-chips-row" style={{ marginTop: 6 }}>
                {["Substitution cover", "Exam invigilation", "Library duty", "Admin support"].map((c, i) => (
                  <span key={c} className={`hw-task-chip ${i === 1 ? "hw-task-chip-sel" : ""}`} style={i === 1 ? { animationDelay: "1300ms" } : undefined}>{c}</span>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                <span className="hw-btn-ghost">Cancel</span>
                <span className="hw-btn-violet hw-press" style={{ animationDelay: "2200ms" }}>Assign</span>
              </div>
            </div>
          </div>
        </div>
      </In>
      <Cursor move="hw-c10" clicks={[450, 1300, 2200]} dur={3000} />
    </div>
  );
}

// ─── Scene 11 · Substitution ────────────────────────────────────────────
function S11Sub() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <b className="hw-swap" style={{ fontSize: 11.5 }}>
          <span className="hw-sa2" style={{ animationDelay: "600ms" }}>Mrs. Paul</span>
          <span style={{ color: "#DC2626", animation: "hw-show 1ms linear 600ms both" }}>Mrs. Paul · on leave</span>
        </b>
        <div style={{ display: "flex", gap: 5 }}>
          <span className="hw-leave-btn hw-press" style={{ animationDelay: "450ms" }}>⚑ Leave</span>
          <span className="hw-sub-btn hw-press" style={{ animationDelay: "1100ms" }}>⇄ Sub</span>
          <span className="hw-faint" style={{ fontSize: 9 }}>6 periods</span>
        </div>
      </div>
      <div className="hw-day-track">
        <span className="hw-day-block hw-swap" style={{ flex: 3 }}>
          <span className="hw-sa2" style={{ animationDelay: "2150ms" }}>
            <span className="hw-uncover" style={{ animationDelay: "600ms" }}>X-B Maths</span>
          </span>
          <In d={2150} className="hw-covered">X-B Maths · Mr. Sharma <i>(sub)</i> ✓</In>
        </span>
        <span className="hw-day-block hw-day-lunch" style={{ flex: 2 }}>Lunch</span>
        <span className="hw-day-block" style={{ flex: 3 }}><span className="hw-uncover" style={{ animationDelay: "600ms" }}>IX-A Sci</span></span>
      </div>
      <In d={1250} className="hw-sub-panel hw-sa2-wrap">
        <div className="hw-sa2" style={{ animationDelay: "2150ms" }}>
          <div className="hw-h2" style={{ fontSize: 10.5 }}>Substitute — Mrs. Paul · Period 2 · X-B Maths</div>
          {[
            ["①", "Mr. Sharma", "Tier 1 · free now · 1 today · light week ✓", true],
            ["②", "Mr. Das", "Tier 2 · free · 2 today", false],
            ["③", "Ms. Iyer", "Tier 2 · free · 3 today", false],
          ].map(([r, n, meta, top], i) => (
            <In key={String(n)} d={1350 + i * 130} className={`hw-cand ${top ? "hw-cand-top" : ""}`}>
              <b>{r} {n}</b><span className="hw-faint">{meta}</span>
            </In>
          ))}
          <In d={1800} style={{ textAlign: "right" }}>
            <span className="hw-btn-violet hw-press" style={{ animationDelay: "2000ms" }}>Assign Mr. Sharma</span>
          </In>
        </div>
      </In>
      <Cursor move="hw-c11" clicks={[450, 1100, 2000]} dur={3000} />
    </div>
  );
}

// ─── Scene 12 · Reports & Analytics ─────────────────────────────────────
function S12Reports() {
  const W = 300, H = 90, P = 18;
  const pts = [62, 68, 71, 75, 84, 91].map((v, i, a) => [P + (i / (a.length - 1)) * (W - P * 2), H - P - (v / 100) * (H - P * 2)]);
  const path = pts.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0]} ${c[1]}`).join(" ");
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div><div className="hw-h2">📊 Reports &amp; Analytics</div><div className="hw-sub">Combined insight across all 2 active schedules.</div></div>
        <span className="hw-btn-ghost" style={{ fontSize: 9 }}>Export ⭳</span>
      </div>
      <div className="hw-tabs-row">
        {["Summary", "Faculty", "Class", "Trends", "Leave Types"].map((t, i) => (
          <span key={t} className={`hw-tab ${i === 0 ? "is-on" : ""}`}>{t}</span>
        ))}
      </div>
      <div className="hw-stat-tiles">
        {[["94%", "coverage"], ["31", "substitutions"], ["4", "cancelled"], ["12", "extra duties"]].map(([v, l], i) => (
          <In key={String(l)} d={100 + i * 110} className="hw-stat-tile"><b>{v}</b><span>{l}</span></In>
        ))}
      </div>
      <div className="hw-chart-card">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#E8E4FF" />
          <path d={path} fill="none" stroke="#7C6FE0" strokeWidth="2" strokeLinecap="round" className="hw-chart-line" />
          {pts.map((c, i) => (
            <circle key={i} cx={c[0]} cy={c[1]} r={i === pts.length - 1 ? 3.5 : 2.5} fill={i === pts.length - 1 ? "#D4920E" : "#7C6FE0"} className="hw-chart-pt" style={{ animationDelay: `${500 + i * 180}ms` }} />
          ))}
          <g className="hw-chart-tip">
            <rect x={pts[5][0] - 20} y={pts[5][1] - 24} width="40" height="16" rx="4" fill="#13111E" />
            <text x={pts[5][0]} y={pts[5][1] - 12} textAnchor="middle" fontSize="8" fill="#fff">91%</text>
          </g>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <text key={d} x={pts[i][0]} y={H - 5} textAnchor="middle" fontSize="6.5" fill="#8B87AD">{d}</text>
          ))}
        </svg>
      </div>
      <Cursor move="hw-c12" clicks={[]} dur={2200} />
    </div>
  );
}

// ─── Scene 13 · Brand close ─────────────────────────────────────────────
function S13Close() {
  return (
    <div className="hw-scene hw-close" aria-hidden="true">
      <svg viewBox="0 0 52 52" className="hw-close-mark">
        <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" className="hw-u-path" />
        <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" className="hw-u-knob" />
      </svg>
      <In d={1300} className="hw-close-h">The last schedule you&rsquo;ll ever fix by hand.</In>
      <In d={1700}><span className="hw-close-cta">Start free — no credit card</span></In>
      <Cursor move="hw-c13" clicks={[]} dur={2600} />
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────
const CSS = `
.hw-wrap { width: 100%; max-width: 1080px; margin: 0 auto; padding: 18px clamp(10px,2vw,24px) 0; font-family: 'Plus Jakarta Sans', sans-serif; }
.hw-frame { border-radius: 14px; overflow: hidden; box-shadow: 0 30px 90px rgba(124,111,224,0.28), 0 0 0 1px #ECE9FB; background: #fff; }
.hw-chrome { display: flex; align-items: center; gap: 5px; padding: 8px 12px; background: #F4F2FE; border-bottom: 1px solid #ECE9FB; }
.hw-dot { width: 9px; height: 9px; border-radius: 50%; }
.hw-url { flex: 1; text-align: center; font: 500 10.5px 'DM Mono', monospace; color: #6B7280; background: #fff; border-radius: 6px; padding: 3px 10px; margin: 0 12px; }
.hw-chrome-right { font-size: 9px; color: #9CA3AF; letter-spacing: 2px; }
.hw-stage { position: relative; height: clamp(400px, calc(100dvh - 230px), 560px); background: #fff; overflow: hidden; }
.hw-caption { margin: 14px 0 8px; text-align: center; font: 700 clamp(15px,2.2vw,19px)/1.35 'Plus Jakarta Sans', sans-serif; color: #13111E; animation: hw-cap-in 0.4s ease both; }
@keyframes hw-cap-in { 0%{opacity:0; transform:translateY(5px)} 100%{opacity:1; transform:translateY(0)} }
.hw-dots { display: flex; justify-content: center; gap: 5px; padding-bottom: 6px; }
.hw-seg { width: 26px; height: 4px; border-radius: 2px; background: #E4E0F5; border: none; padding: 0; cursor: pointer; overflow: hidden; }
.hw-seg.is-past { background: #C9C0F0; }
.hw-seg-fill { display: block; height: 100%; width: 0; background: #7C6FE0; }
.hw-seg.is-on .hw-seg-fill { animation-name: hw-fill; animation-timing-function: linear; animation-fill-mode: both; }
.hw-seg.is-past .hw-seg-fill { width: 100%; background: #C9C0F0; }
@keyframes hw-fill { 0%{width:0} 100%{width:100%} }

.hw-scene { position: absolute; inset: 0; padding: clamp(14px,2.4vw,26px); animation: hw-scene-in 0.4s ease both; overflow: hidden; }
@keyframes hw-scene-in { 0%{opacity:0; transform: scale(0.985)} 100%{opacity:1; transform: scale(1)} }
.hw-app { background: #FAFAFE; }

/* primitives */
.hw-in { opacity: 0; animation: hw-in 0.4s cubic-bezier(.2,.9,.3,1.05) both; }
@keyframes hw-in { 0%{opacity:0; transform: translateY(7px)} 100%{opacity:1; transform: translateY(0)} }
@keyframes hw-show { to { opacity: 1; visibility: visible; } }
@keyframes hw-hide { to { opacity: 0; visibility: hidden; } }
.hw-swap { display: grid; }
.hw-swap > * { grid-area: 1 / 1; }
.hw-sa, .hw-sa2 { animation: hw-hide 1ms linear both; animation-delay: inherit; }
.hw-sa { position: absolute; inset: 0; animation-name: hw-hide; }
.hw-sb { position: absolute; inset: 0; opacity: 0; visibility: hidden; animation: hw-show 1ms linear both; }
.hw-sa2 { animation: hw-hide 1ms linear both; }
.hw-sa2-wrap > .hw-sa2 { width: 100%; }
.hw-layer { padding: clamp(14px,2.4vw,26px); }
.hw-press { animation-name: hw-press; animation-duration: 300ms; animation-fill-mode: both; }
@keyframes hw-press { 0%,100%{ transform: scale(1);} 45%{ transform: scale(0.93);} }
.hw-flash { animation-name: hw-flash-k; animation-duration: 500ms; animation-fill-mode: both; }
@keyframes hw-flash-k { 0%,100%{ box-shadow: none; } 40%{ box-shadow: 0 0 0 3px rgba(124,111,224,0.35); } }
.hw-type { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation-name: hw-type-k; animation-timing-function: steps(12); animation-fill-mode: both; }
@keyframes hw-type-k { to { width: var(--ch); } }
.hw-caret { display: inline-block; width: 1.5px; height: 0.9em; background: #7C6FE0; vertical-align: -0.1em; animation: hw-caret-k 0.9s steps(1) infinite; }
@keyframes hw-caret-k { 0%,49%{opacity:1} 50%,100%{opacity:0} }

.hw-cursor { position: absolute; left: 0; top: 0; width: 18px; height: 18px; z-index: 9; pointer-events: none; animation-timing-function: cubic-bezier(.5,0,.2,1); animation-fill-mode: both; }
.hw-cur-glyphs { position: relative; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); }
.hw-cur-hand { position: absolute; left: 0; top: 0; font-size: 14px; opacity: 0; visibility: hidden; }
.hw-ring { position: absolute; left: 1px; top: 1px; width: 15px; height: 15px; border-radius: 50%; border: 2px solid #D4920E; opacity: 0; animation: hw-ring-k 500ms ease-out both; }
@keyframes hw-ring-k { 0%{opacity:0; transform:scale(.3)} 25%{opacity:.9; transform:scale(1)} 100%{opacity:0; transform:scale(2.4)} }

/* text/ui atoms */
.hw-h1 { font-size: 15px; font-weight: 700; color: #13111E; letter-spacing: -0.2px; }
.hw-h2 { font-size: 12px; font-weight: 700; color: #13111E; }
.hw-sub { font-size: 9.5px; color: #6B7280; }
.hw-faint { font-size: 9px; color: #9CA3AF; }
.hw-mono { font-family: 'DM Mono', monospace; }
.hw-green { color: #059669; }
.hw-req { color: #EF4444; }
.hw-row-between { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.hw-cta { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 9px; background: linear-gradient(135deg,#7C6FE0,#5D4FCF); color: #fff; font-size: 10.5px; font-weight: 700; box-shadow: 0 4px 12px rgba(124,111,224,0.28); }
.hw-btn-ink { padding: 6px 12px; border-radius: 7px; background: #13111E; color: #fff; font-size: 9.5px; font-weight: 700; }
.hw-btn-ghost { padding: 5px 11px; border-radius: 7px; border: 1px solid #D1D5DB; background: #fff; color: #374151; font-size: 9.5px; font-weight: 600; }
.hw-btn-violet { padding: 5px 11px; border-radius: 7px; background: #7C6FE0; color: #fff; font-size: 9px; font-weight: 700; }
.hw-btn-amber { padding: 5px 11px; border-radius: 7px; border: 1.5px solid #FDE68A; background: #FFFBEB; color: #92400E; font-size: 9.5px; font-weight: 700; }
.hw-input { border: 1px solid #D1D5DB; border-radius: 7px; padding: 6px 9px; font-size: 10px; color: #13111E; background: #fff; }
.hw-field-label { font-size: 9px; font-weight: 600; color: #374151; margin-bottom: 3px; }
.hw-hint { font-size: 7.5px; color: #9CA3AF; margin-top: 2px; }
.hw-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; padding: 16px; }
.hw-modal { background: #fff; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 20px 60px rgba(0,0,0,0.2); padding: 16px 18px; width: min(320px, 92%); }
.hw-modal-center { margin: 0 auto; }
.hw-chips-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.hw-board-chip { padding: 4px 11px; border-radius: 6px; font-size: 9.5px; font-weight: 500; border: 1.5px solid #D1D5DB; color: #374151; background: #fff; }
.hw-board-on { background: #059669; border-color: #059669; color: #fff; }
.hw-ai-tags { background: #F0FDF9; border: 1px solid #A7F3D0; border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
.hw-ai-tags-head { font-size: 9px; font-weight: 600; color: #065F46; }
.hw-tag { padding: 2px 8px; border-radius: 20px; background: #fff; border: 1px solid #6EE7B7; font-size: 8.5px; color: #065F46; }

/* dashboard */
.hw-pulse-strip { margin-top: 10px; padding: 7px 11px; border-radius: 9px; background: #F5F3FF; border: 1px solid #DDD8FF; font-size: 9.5px; color: #5B52A8; font-weight: 600; }
.hw-cards3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
.hw-mini-card { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.hw-mini-name { font-size: 10px; font-weight: 700; color: #13111E; }
.hw-mini-status { font-size: 8.5px; color: #6B7280; margin-top: 3px; }

/* wizard shell */
.hw-wizard { display: grid; grid-template-columns: 120px 1fr; gap: 12px; }
.hw-side { display: flex; flex-direction: column; gap: 4px; }
.hw-side-item { display: flex; justify-content: space-between; padding: 6px 9px; border-radius: 7px; font-size: 9.5px; color: #4B5275; background: #fff; border: 1px solid #EFEDF9; }
.hw-side-item.is-on { background: #F5F3FF; border-color: #DDD8FF; color: #5B52A8; font-weight: 700; }
.hw-panel { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.hw-table-head, .hw-table-row { display: grid; grid-template-columns: 1fr 0.7fr 0.9fr 1.2fr; gap: 6px; font-size: 9px; padding: 4px 2px; }
.hw-table-head { font-weight: 700; color: #8B87AD; text-transform: uppercase; font-size: 7.5px; border-bottom: 1px solid #F3F4F6; }
.hw-table-row { color: #13111E; border-bottom: 1px solid #FAFAFA; }
.hw-ai-pill { font-size: 9px; font-weight: 600; color: #5B52A8; }
.hw-wiz-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; padding: 8px 18px; font-size: 8.5px; color: #9CA3AF; border-top: 1px solid #F3F4F6; background: #fff; }
.hw-violet-b { color: #7C6FE0; font-weight: 700; }

/* bell */
.hw-card-lite { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.hw-card-head { font-size: 10.5px; font-weight: 700; color: #374151; margin-bottom: 8px; }
.hw-fields-row { display: flex; gap: 10px; flex-wrap: wrap; }
.hw-lunch-row { display: flex; gap: 8px; margin-top: 4px; }
.hw-lunch-card { flex: 1; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 7px 9px; font-size: 8.5px; color: #6B7280; }
.hw-lunch-card b { display: block; font-size: 9.5px; color: #111827; }
.hw-lunch-card i { display: block; font-style: normal; font-size: 7.5px; color: #9CA3AF; margin-top: 2px; }
.hw-lunch-smart { animation: hw-lunch-on 300ms ease both; }
@keyframes hw-lunch-on { to { border: 2px solid #7C6FE0; background: #F5F3FF; } }
.hw-bell-table { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; }
.hw-bell-row { display: grid; grid-template-columns: 52px 1fr 1fr 1fr; gap: 4px; padding: 2px 0; }
.hw-bell-header { font-size: 8px; font-weight: 700; color: #8B87AD; text-transform: uppercase; }
.hw-bell-cell { font-size: 8.5px; color: #13111E; background: #F4F2FE; border-radius: 5px; padding: 3px 6px; text-align: center; }
.hw-lunch-band { font-size: 8px; font-weight: 700; color: #D97706; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 5px; padding: 3px 6px; text-align: center; }

/* allocation */
.hw-tabs-row { display: flex; gap: 4px; margin-bottom: 4px; }
.hw-tab { padding: 5px 10px; border-radius: 7px; font-size: 9px; font-weight: 700; color: #6B7280; background: #F4F2FE; }
.hw-tab.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 1px 3px rgba(19,17,30,0.1); }
.hw-alloc-grid { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; }
.hw-alloc-row { display: grid; grid-template-columns: 0.9fr repeat(5, 1fr) 1.1fr; gap: 4px; padding: 2px 0; align-items: center; }
.hw-alloc-head { font-size: 8px; font-weight: 700; color: #8B87AD; text-transform: uppercase; }
.hw-alloc-sec { font-size: 9.5px; font-weight: 700; color: #13111E; }
.hw-alloc-cell { font-size: 9.5px; color: #13111E; background: #FAFAFE; border: 1px solid #F0EEFA; border-radius: 5px; padding: 3px 0; text-align: center; }
.hw-alloc-total { font-size: 8.5px; color: #4B5275; text-align: center; }
.hw-valid-panel { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.hw-check { font-size: 10px; color: #374151; }
.hw-success-banner { margin-top: 4px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 8px 11px; font-size: 10px; font-weight: 600; color: #166534; }

/* combos */
.hw-block-card { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
.hw-block-title { font-size: 10px; font-weight: 700; color: #13111E; margin-bottom: 6px; }
.hw-merge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding: 6px 8px; background: #F5F2FF; border: 1px solid #E8E4FF; border-radius: 7px; }
.hw-merge-pair { display: inline-flex; align-items: center; border: 1.5px solid #E4E0FF; border-radius: 5px; overflow: hidden; font-size: 8px; font-weight: 700; color: #8B87AD; padding-left: 5px; gap: 0; background: #fff; }
.hw-merge-pair i { font-style: normal; padding: 2px 6px; color: #C4C0DC; }
.hw-merge-off { background: #7C6FE0; color: #fff !important; animation: hw-merge-off-k 1ms linear both; }
@keyframes hw-merge-off-k { to { background: #fff; color: #C4C0DC; } }
.hw-merge-on { animation: hw-merge-on-k 1ms linear both; }
@keyframes hw-merge-on-k { to { background: #F59E0B; color: #fff; } }
.hw-group-chips { margin-top: 8px; min-height: 22px; }
.hw-gchip { font-size: 8.5px; font-weight: 700; color: #4B5275; background: #FAFAFE; border: 1px solid #E8E4FF; border-radius: 999px; padding: 3px 9px; }
.hw-gchip-merged { color: #5B52A8; background: #EDE9FF; border-color: #C4B5FD; }
.hw-or-card { margin-top: 8px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 9px; padding: 8px 11px; font-size: 9.5px; color: #78350F; }

/* generate */
.hw-center-col { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.hw-preflight { font-size: 10px; color: #15803D; font-weight: 600; }
.hw-solve { width: min(380px, 94%); background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
.hw-ring-row { display: flex; align-items: center; gap: 12px; }
.hw-ring-arc { animation: hw-ring-fill 2000ms cubic-bezier(.4,0,.4,1) 600ms both; }
@keyframes hw-ring-fill { 0%{ stroke-dashoffset: 113; } 100%{ stroke-dashoffset: 3; } }
.hw-solve-labels { position: relative; flex: 1; height: 16px; text-align: left; }
.hw-solve-label { position: absolute; left: 0; top: 0; font-size: 10px; font-weight: 600; color: #4B5275; opacity: 0; animation: hw-label-k 420ms linear both; white-space: nowrap; }
@keyframes hw-label-k { 0%{opacity:0} 10%,88%{opacity:1} 100%{opacity:0} }
.hw-feed { margin-top: 8px; text-align: left; display: flex; flex-direction: column; gap: 3px; }
.hw-feed-line { font-size: 9px; color: #374151; font-family: 'DM Mono', monospace; }
.hw-done-row { display: flex; align-items: center; gap: 10px; }
.hw-conflict-pill { display: inline-flex; align-items: center; gap: 6px; background: #13111E; color: #fff; font-size: 11px; font-weight: 800; border-radius: 999px; padding: 7px 16px; }
.hw-conflict-pill i { width: 8px; height: 8px; border-radius: 50%; background: #D4920E; }

/* timetable */
.hw-draft-chip { font-size: 8.5px; font-weight: 600; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
.hw-tt-grid { margin-top: 8px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; }
.hw-tt-row { display: grid; grid-template-columns: 64px repeat(5, 1fr); gap: 4px; padding: 2px 0; }
.hw-tt-head { font-size: 8px; font-weight: 700; color: #8B87AD; text-transform: uppercase; text-align: center; }
.hw-tt-p { font-size: 8px; color: #6B7280; align-self: center; }
.hw-tt-cell { border-radius: 6px; padding: 4px 6px; }
.hw-tt-cell b { display: block; font-size: 8.5px; color: #13111E; }
.hw-tt-cell i { display: block; font-style: normal; font-size: 7px; color: #4B5275; }
.hw-tt-lunch { text-align: center; font-size: 8px; font-weight: 700; color: #D97706; background: #FEF3C7; border-radius: 6px; padding: 3px; margin: 2px 0; }

/* print/export */
.hw-dim-bg { position: absolute; inset: 0; background: rgba(19,17,30,0.35); }
.hw-export-panel { position: relative; width: min(280px, 90%); margin: 8px auto 0; background: #fff; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 16px 50px rgba(0,0,0,0.18); padding: 12px 14px; }
.hw-fmt-card { display: flex; justify-content: space-between; align-items: center; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 7px 10px; font-size: 9.5px; font-weight: 600; color: #374151; margin-top: 6px; }
.hw-fmt-sel { animation: hw-fmt-sel-k 300ms ease both; }
@keyframes hw-fmt-sel-k { to { border-color: #7C6FE0; background: #F5F3FF; } }
.hw-fmt-check { color: #7C6FE0; opacity: 0; animation: hw-show 1ms linear both; }
.hw-print-sheet { position: absolute; right: clamp(10px,4vw,40px); top: 18px; width: min(200px, 38%); background: #fff; border: 1px solid #D1D5DB; outline: 2px dashed #CBD5E1; outline-offset: 5px; border-radius: 4px; padding: 10px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); }
.hw-print-head { display: flex; align-items: center; gap: 5px; font-size: 8px; color: #000; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 6px; }
.hw-print-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; }
.hw-print-cell { border: 0.5px solid #9CA3AF; font-size: 6.5px; color: #111; text-align: center; padding: 3px 0; }

/* live */
.hw-live-clock { font-size: 15px; color: #13111E; }
.hw-live-badge { font-size: 9.5px; font-weight: 700; color: #16A34A; }
.hw-now-btn { font-size: 9px; font-weight: 700; color: #7C6FE0; background: #fff; border: 1px solid #E3DEF7; border-radius: 7px; padding: 2px 8px; }
.hw-live-track { position: relative; display: flex; height: 26px; border-radius: 8px; background: #F4F2FE; border: 1px solid #ECE9FB; overflow: visible; margin-top: 8px; }
.hw-live-track > span:not(.hw-playhead) { height: 100%; border-right: 1px solid rgba(19,17,30,0.06); }
.hw-live-track > span:first-child { border-radius: 8px 0 0 8px; }
.hw-playhead { position: absolute; top: -14px; bottom: 0; width: 0; }
.hw-playhead-drag { position: absolute; inset: 0; animation: hw-scrub-k 3200ms cubic-bezier(.45,0,.25,1) both; }
@keyframes hw-scrub-k { 0%,26%{ transform: translateX(0); } 42%{ transform: translateX(90px); } 58%{ transform: translateX(-70px); } 74%,100%{ transform: translateX(0); } }
.hw-ph-line { position: absolute; top: 14px; bottom: 0; left: -1px; width: 2px; background: #EF4444; }
.hw-ph-badge { position: absolute; top: 0; left: 0; transform: translateX(-50%); font-size: 8px; font-weight: 800; color: #EF4444; white-space: nowrap; display: inline-grid; }
.hw-ph-badge > * { grid-area: 1/1; }
.hw-ph-pin { opacity: 0; visibility: hidden; color: #7C6FE0; }
.hw-legend { display: flex; gap: 12px; margin: 6px 0 8px; }
.hw-legend span { display: inline-flex; align-items: center; gap: 4px; font-size: 8.5px; color: #6B7280; }
.hw-legend i { width: 8px; height: 8px; border-radius: 2px; }
.hw-live-section { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin: 4px 0; }
.hw-live-card { display: flex; align-items: center; gap: 7px; background: #fff; border: 1px solid #ECE9FB; border-radius: 10px; padding: 6px 10px; }
.hw-live-card b { font-size: 9px; color: #13111E; }
.hw-live-subj { color: #fff; font-size: 8px; font-weight: 700; border-radius: 999px; padding: 1px 6px; margin: 0 4px; }
.hw-live-card i { font-style: normal; font-size: 8.5px; }
.hw-free-chip { display: inline-flex; align-items: center; gap: 5px; background: #fff; border: 1px solid #ECE9FB; border-radius: 8px; padding: 4px 9px; font-size: 9.5px; font-weight: 600; color: #13111E; }
.hw-free-chip b { font-size: 8px; }
.hw-plus { font-style: normal; color: #7C6FE0; font-weight: 800; }
.hw-task-tag { font-style: normal; font-size: 8px; font-weight: 700; color: #92400E; background: #FEF3C7; border-radius: 5px; padding: 1px 6px; }

/* task modal */
.hw-assign-modal { padding: 0; overflow: hidden; width: min(300px, 92%); }
.hw-assign-head { background: linear-gradient(135deg,#C2740E,#D4920E); color: #fff; padding: 10px 14px; font-size: 9px; }
.hw-assign-head b { font-size: 11px; }
.hw-assign-body { padding: 10px 14px 12px; }
.hw-fair { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 7px 10px; font-size: 9px; color: #166534; line-height: 1.45; }
.hw-task-chip { font-size: 8px; font-weight: 700; color: #B45309; border: 1px solid #F3D9A8; border-radius: 7px; padding: 3px 7px; }
.hw-task-chip-sel { animation: hw-task-sel-k 300ms ease both; }
@keyframes hw-task-sel-k { to { background: #FEF3C7; border-color: #D4920E; color: #92400E; } }

/* substitution */
.hw-leave-btn { font-size: 8.5px; font-weight: 700; color: #B45309; background: #FFFBF3; border: 1px solid #E5C078; border-radius: 6px; padding: 2px 7px; }
.hw-sub-btn { font-size: 8.5px; font-weight: 700; color: #2563EB; background: #E8F0FF; border-radius: 6px; padding: 2px 7px; }
.hw-day-track { display: flex; gap: 3px; height: 34px; margin-top: 8px; }
.hw-day-block { border-radius: 6px; background: #F4F2FE; font-size: 8.5px; font-weight: 700; color: #13111E; display: flex; align-items: center; justify-content: center; position: relative; }
.hw-day-lunch { background: #FEF3C7; color: #92702A; }
.hw-uncover { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; animation: hw-uncover-k 1ms linear both; }
@keyframes hw-uncover-k { to { background: repeating-linear-gradient(45deg, #FEE2E2, #FEE2E2 4px, #fff 4px, #fff 8px); color: #DC2626; border-radius: 6px; } }
.hw-covered { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #E8F0FF; border-radius: 6px; font-size: 8px; font-weight: 700; color: #1D4ED8; }
.hw-covered i { font-style: normal; font-weight: 500; margin: 0 3px; }
.hw-sub-panel { margin-top: 10px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.hw-cand { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-radius: 7px; border: 1px solid #F0EEFA; margin-top: 4px; font-size: 9px; }
.hw-cand b { color: #13111E; }
.hw-cand-top { border-color: #A7F3D0; background: #F0FDF9; }

/* reports */
.hw-stat-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
.hw-stat-tile { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; text-align: center; }
.hw-stat-tile b { display: block; font-size: 15px; color: #13111E; font-family: 'DM Mono', monospace; }
.hw-stat-tile span { font-size: 7.5px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.04em; }
.hw-chart-card { margin-top: 8px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; }
.hw-chart-line { stroke-dasharray: 400; stroke-dashoffset: 400; animation: hw-chart-k 1100ms ease 500ms both; }
@keyframes hw-chart-k { to { stroke-dashoffset: 0; } }
.hw-chart-pt { opacity: 0; animation: hw-show 1ms linear both; }
.hw-chart-tip { opacity: 0; animation: hw-show 200ms ease 1650ms both; }

/* close */
.hw-close { background: radial-gradient(120% 140% at 50% -10%, #232048 0%, #13111E 60%, #0B0A14 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
.hw-close-mark { width: 64px; height: 64px; }
.hw-u-path { stroke-dasharray: 80; stroke-dashoffset: 80; animation: hw-u-k 900ms ease 300ms both; }
@keyframes hw-u-k { to { stroke-dashoffset: 0; } }
.hw-u-knob { opacity: 0; animation: hw-knob-k 300ms cubic-bezier(.2,.9,.3,1.4) 1100ms both; }
@keyframes hw-knob-k { 0%{opacity:0; transform: scale(0.3); transform-origin: 36px 12.5px;} 100%{opacity:1; transform: scale(1);} }
.hw-close-h { font-size: clamp(14px, 2.4vw, 20px); font-weight: 400; color: #fff; text-align: center; max-width: 340px; }
.hw-close-cta { background: #D4920E; color: #13111E; font-weight: 800; font-size: 11px; padding: 9px 20px; border-radius: 8px; box-shadow: 0 0 30px rgba(212,146,14,0.35); }

/* cursor paths (left/top in % of scene) */
@keyframes hw-c1 { 0%{left:10%; top:80%; opacity:0} 12%{opacity:1} 20%,42%{left:78%; top:9%} 60%,100%{left:60%; top:55%; opacity:1} }
@keyframes hw-c2 { 0%{left:60%; top:55%; opacity:1} 14%,22%{left:38%; top:34%} 40%,46%{left:66%; top:74%} 62%{left:40%; top:40%} 100%{left:30%; top:60%; opacity:1} }
@keyframes hw-c3 { 0%{left:70%; top:70%; opacity:0} 8%{opacity:1} 16%,38%{left:14%; top:17%} 55%,66%{left:64%; top:38%} 100%{left:50%; top:75%; opacity:1} }
@keyframes hw-c4 { 0%{left:60%; top:60%; opacity:0} 10%{opacity:1} 42%,55%{left:23%; top:9%} 80%,100%{left:45%; top:55%; opacity:1} }
@keyframes hw-c5 { 0%{left:50%; top:70%; opacity:0} 8%{opacity:1} 13%,20%{left:72%; top:7%} 38%,45%{left:34%; top:56%} 53%,60%{left:76%; top:56%} 78%,100%{left:40%; top:80%; opacity:1} }
@keyframes hw-c6 { 0%{left:20%; top:20%; opacity:0} 8%{opacity:1} 11%,18%{left:50%; top:22%} 40%,80%{left:70%; top:65%} 89%,100%{left:56%; top:83%; opacity:1} }
@keyframes hw-c8 { 0%{left:20%; top:75%; opacity:0} 12%{opacity:1} 28%,42%{left:42%; top:48%} 50%,58%{left:60%; top:70%} 75%,100%{left:75%; top:45%; opacity:1} }
@keyframes hw-c9 { 0%{left:10%; top:10%; opacity:0} 8%{opacity:1} 22%,26%{left:45%; top:24%} 40%{left:73%; top:24%} 55%{left:23%; top:24%} 68%,72%{left:45%; top:24%} 76%,82%{left:88%; top:8%} 92%,100%{left:60%; top:70%; opacity:1} }
@keyframes hw-c10 { 0%{left:60%; top:60%; opacity:0} 8%{opacity:1} 12%,18%{left:30%; top:19%} 36%,48%{left:44%; top:56%} 66%,76%{left:66%; top:76%} 88%,100%{left:40%; top:30%; opacity:1} }
@keyframes hw-c11 { 0%{left:30%; top:60%; opacity:0} 8%{opacity:1} 12%,18%{left:62%; top:8%} 32%,40%{left:72%; top:8%} 60%,70%{left:74%; top:78%} 85%,100%{left:45%; top:40%; opacity:1} }
@keyframes hw-c12 { 0%{left:20%; top:80%; opacity:0} 15%{opacity:1} 60%,100%{left:80%; top:62%; opacity:1} }
@keyframes hw-c13 { 0%{left:80%; top:15%; opacity:0} 15%{opacity:1} 60%,100%{left:52%; top:76%; opacity:1} }

@media (prefers-reduced-motion: reduce) {
  .hw-scene, .hw-caption { animation: none !important; }
  .hw-in { animation: none !important; opacity: 1 !important; transform: none !important; }
  .hw-sa, .hw-sa2 { animation: none !important; opacity: 0 !important; visibility: hidden !important; }
  .hw-sb { animation: none !important; opacity: 1 !important; visibility: visible !important; }
  .hw-cursor, .hw-ring, .hw-caret { display: none !important; }
  .hw-type { animation: none !important; width: auto !important; }
  .hw-seg.is-on .hw-seg-fill { animation: none !important; width: 100% !important; }
  .hw-press, .hw-flash { animation: none !important; }
  .hw-lunch-smart { animation: none !important; border: 2px solid #7C6FE0 !important; background: #F5F3FF !important; }
  .hw-fmt-sel { animation: none !important; border-color: #7C6FE0 !important; background: #F5F3FF !important; }
  .hw-fmt-check, .hw-chart-pt, .hw-chart-tip { animation: none !important; opacity: 1 !important; }
  .hw-merge-on { animation: none !important; background: #F59E0B !important; color: #fff !important; }
  .hw-merge-off { animation: none !important; background: #fff !important; color: #C4C0DC !important; }
  .hw-task-chip-sel { animation: none !important; background: #FEF3C7 !important; border-color: #D4920E !important; color: #92400E !important; }
  .hw-uncover { animation: none !important; background: repeating-linear-gradient(45deg, #FEE2E2, #FEE2E2 4px, #fff 4px, #fff 8px) !important; color: #DC2626 !important; }
  .hw-ring-arc { animation: none !important; stroke-dashoffset: 3 !important; }
  .hw-solve-label { animation: none !important; opacity: 0 !important; }
  .hw-solve-label:last-child { opacity: 1 !important; }
  .hw-chart-line { animation: none !important; stroke-dashoffset: 0 !important; }
  .hw-u-path { animation: none !important; stroke-dashoffset: 0 !important; }
  .hw-u-knob { animation: none !important; opacity: 1 !important; }
  .hw-playhead-drag { animation: none !important; }
  .hw-ph-pin { display: none !important; }
}
@media (max-width: 640px) {
  .hw-cursor { display: none; }
  .hw-cards3, .hw-stat-tiles { grid-template-columns: repeat(2, 1fr); }
  .hw-wizard { grid-template-columns: 1fr; }
  .hw-side { flex-direction: row; flex-wrap: wrap; }
  .hw-print-sheet { position: relative; right: auto; top: auto; margin: 10px auto 0; }
}
`;
