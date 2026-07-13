"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "./useInView";
import { appHref } from "@/lib/appUrl";

/**
 * HeroWalkthrough — the simulated product walkthrough hero.
 * Spec: design/hero-walkthrough/ (00-frame-and-loop.md + one doc per scene).
 *
 * Faithful miniature reproductions of the REAL app screens, driven by a
 * simulated cursor. The cursor is NOT keyframe-guessed: on each scene mount
 * it MEASURES its targets (elements tagged data-hw) and animates through
 * their exact centers with the Web Animations API — so every click lands on
 * a real button, field, or drag handle.
 *
 * Demo school: "Eden's Academy" (user: Adam). All schedule data is
 * illustrative; the wall clock and the Live percentages derived from it are
 * genuinely real time. The Generate button in the solve scene is genuinely
 * clickable — pressing it replays the solve.
 */

const SCENES: { key: string; ch: string; caption: string; dur: number }[] = [
  { key: "dash", ch: "Dashboard", caption: "Create a schedule in one click.", dur: 4400 },
  { key: "numbers", ch: "Create a schedule", caption: "Enter just the numbers — in your own naming. schedU builds every resource.", dur: 6600 },
  { key: "res", ch: "Wizard 1/5 · Resources", caption: "All 24 classes, 38 subjects, 42 faculty, 60 venues — generated, fully editable.", dur: 5200 },
  { key: "bell", ch: "Wizard 2/5 · Shift & timing", caption: "Type start and end. schedU plans every period and break.", dur: 5600 },
  { key: "alloc", ch: "Wizard 3/5 · Allocation", caption: "Every subject allocated, every faculty member matched — and checked.", dur: 4800 },
  { key: "combo", ch: "Wizard 4/5 · Groups & combos", caption: "Electives and cross-section groups — AND/OR logic built in.", dur: 5400 },
  { key: "gen", ch: "Wizard 5/5 · Generate", caption: "One click. A conflict-free timetable.", dur: 6000 },
  { key: "views", ch: "Timetable · all views", caption: "One timetable — Class, Faculty, Venue, and Subject views.", dur: 6400 },
  { key: "dnd", ch: "Timetable · edit mode", caption: "Fine-tune by drag and drop — clashes flagged as you move.", dur: 6000 },
  { key: "load", ch: "Analytics · faculty load", caption: "Balance faculty load with one click.", dur: 5200 },
  { key: "cal", ch: "Calendar · Day", caption: "Every schedule, one combined calendar.", dur: 4400 },
  { key: "live", ch: "Live board", caption: "Live — drag through the day. Sessions and free faculty update at every minute.", dur: 9600 },
  { key: "task", ch: "Live · assign a duty", caption: "Assign duties fairly — workload is checked first.", dur: 5600 },
  { key: "sub", ch: "Substitution", caption: "An absence? Covered in Calendar and Live — in seconds.", dur: 6800 },
  { key: "print", ch: "Export · print", caption: "Print-ready — full page, or paper-saving compact.", dur: 5600 },
  { key: "rep", ch: "Reports", caption: "Insights across the term.", dur: 4000 },
  { key: "close", ch: "Get started", caption: "Add life to your schedules, smartly.", dur: 7000 },
];
const RM_PIN = 7; // views scene — the most informative resolved frame

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
    const delay = manualRef.current ? 9000 : SCENES[idx].dur;
    manualRef.current = false;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SCENES.length), delay);
    return () => clearTimeout(t);
  }, [idx, inView, rm]);

  const jump = (i: number) => { manualRef.current = true; setIdx(i); };
  const scene = SCENES[idx];
  const stageRef = useRef<HTMLDivElement>(null);

  // AUTO-FIT: every scene scales like a slide to genuinely fill the stage.
  // Measure the scene's natural content height at zoom 1, then zoom it to
  // whichever runs out first — stage height or stage width (content width
  // is capped at 1020px and centered by CSS). Set via JS so the factor the
  // cursor reads is exactly the factor in effect.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const el = stage.querySelector(".hw-scene") as HTMLElement | null;
    if (!el) return;
    const style = el.style as CSSStyleDeclaration & { zoom: string };
    style.zoom = "1";
    // The scene box is inset:0 (full stage) so scrollHeight lies about the
    // content. Measure the real extent: the bottom edge of every in-flow
    // child; for stretch overlays (modals, the centered print sheet) use
    // the inner card's own height plus breathing room.
    const sTop = el.getBoundingClientRect().top;
    const bottoms: number[] = [320];
    for (const child of Array.from(el.children) as HTMLElement[]) {
      if (child.classList.contains("hw-cursor") || child.classList.contains("hw-fly")) continue;
      if (getComputedStyle(child).position === "absolute") {
        const inner = child.firstElementChild as HTMLElement | null;
        if (inner) bottoms.push(inner.getBoundingClientRect().height + 100);
        continue;
      }
      bottoms.push(child.getBoundingClientRect().bottom - sTop);
    }
    const contentH = Math.max(...bottoms) + 18;
    const contentW = Math.min(1020, el.clientWidth);
    const z = Math.max(1, Math.min(stage.clientWidth / (contentW + 30), stage.clientHeight / contentH, 1.9));
    style.zoom = z.toFixed(3);
  }, [idx]);

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
        <div key={idx} ref={stageRef} className="hw-stage">
          <div className="hw-chapter"><b>{idx + 1}<i>/{SCENES.length}</i></b>{scene.ch}</div>
          {scene.key === "dash" && <SDash />}
          {scene.key === "numbers" && <SNumbers />}
          {scene.key === "res" && <SRes />}
          {scene.key === "bell" && <SBell />}
          {scene.key === "alloc" && <SAlloc />}
          {scene.key === "combo" && <SCombo />}
          {scene.key === "gen" && <SGen />}
          {scene.key === "views" && <SViews />}
          {scene.key === "dnd" && <SDnd />}
          {scene.key === "load" && <SLoad />}
          {scene.key === "cal" && <SCal />}
          {scene.key === "live" && <SLive />}
          {scene.key === "task" && <STask />}
          {scene.key === "sub" && <SSub />}
          {scene.key === "print" && <SPrint />}
          {scene.key === "rep" && <SRep />}
          {scene.key === "close" && <SClose />}
        </div>
      </div>

      <div className="hw-caption" aria-live="polite">{scene.caption}</div>
      <div className="hw-dots" role="tablist" aria-label="Walkthrough scenes">
        {SCENES.map((s, i) => (
          <button key={s.key} className={`hw-seg ${i === idx ? "is-on" : ""} ${i < idx ? "is-past" : ""}`}
            aria-label={`Scene ${i + 1}: ${s.caption}`} aria-selected={i === idx} role="tab" onClick={() => jump(i)}>
            <span className="hw-seg-fill" style={i === idx && inView && !rm ? { animationDuration: `${s.dur}ms` } : undefined} />
          </button>
        ))}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ─── Precision cursor ────────────────────────────────────────────────────
// Measures each target's real center on mount and drives the pointer
// through them with WAAPI. `t` = selector (data-hw), `at` = arrival ms,
// `hold` = dwell ms, `dx`/`dy` = extra offset (for drags past a handle).
type CurStep = { t: string; at: number; click?: boolean; hold?: number; dx?: number; dy?: number };
function Cursor({ steps, dur, grab }: { steps: CurStep[]; dur: number; grab?: [number, number] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cur = ref.current;
    if (!cur || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scene = cur.closest(".hw-scene") as HTMLElement | null;
    if (!scene) return;
    // Measure AFTER the 400ms scene-in scale animation has finished —
    // measuring mid-scale skews every rect by a few pixels — and after
    // state-driven first renders (the Live clock/date) settle the layout.
    // The whole point is that every click lands on the real control.
    const timer = setTimeout(() => {
    const s = scene.getBoundingClientRect();
    // The scene content is zoomed up on large stages (JS-set `zoom` on
    // .hw-scene). Rects are viewport px (post-zoom) but the cursor's own
    // translate happens inside the zoomed context, so divide by the factor.
    // Read the zoom style directly — it's the exact value in effect.
    const k = parseFloat(getComputedStyle(scene).zoom) || 1;
    const center = (sel: string) => {
      const el = scene.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (r.left - s.left + r.width / 2) / k, y: (r.top - s.top + r.height / 2) / k };
    };
    const kf: Keyframe[] = [{ offset: 0, transform: `translate(${(s.width * 0.12) / k}px, ${(s.height * 0.82) / k}px)`, opacity: 0 }];
    let lastOff = 0;
    let lastP: { x: number; y: number } | null = null;
    const push = (p: { x: number; y: number }, ms: number) => {
      const off = Math.max(lastOff + 0.001, Math.min(0.999, ms / dur));
      kf.push({ offset: off, transform: `translate(${p.x - 3}px, ${p.y - 2}px)`, opacity: 1 });
      lastOff = off; lastP = p;
    };
    for (const st of steps) {
      const base = center(st.t);
      if (!base) continue;
      const p = { x: base.x + (st.dx ?? 0), y: base.y + (st.dy ?? 0) };
      push(p, st.at);
      push(p, st.at + (st.hold ?? 450));
    }
    if (lastP) kf.push({ offset: 1, transform: `translate(${(lastP as { x: number; y: number }).x - 3}px, ${(lastP as { x: number; y: number }).y - 2}px)`, opacity: 1 });
    cur.animate(kf, { duration: dur, fill: "forwards", easing: "cubic-bezier(.5,.05,.3,1)" });
    }, 460);
    return () => clearTimeout(timer);
  }, [steps, dur]);

  return (
    <div ref={ref} className="hw-cursor">
      <span className="hw-cur-glyphs">
        <svg viewBox="0 0 24 24" width="18" height="18" style={grab ? { animation: `hw-hide 1ms linear ${grab[0]}ms both, hw-show 1ms linear ${grab[1]}ms both` } : undefined}>
          <path d="M4 2 L4 20 L9 15.5 L12.5 22 L15 20.5 L11.5 14 L18 14 Z" fill="#fff" stroke="#13111E" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        {grab && <span className="hw-cur-hand" style={{ opacity: 0, animation: `hw-show 1ms linear ${grab[0]}ms both, hw-hide 1ms linear ${grab[1]}ms both` }}>✊</span>}
      </span>
      {steps.filter((st) => st.click).map((st, i) => <span key={i} className="hw-ring" style={{ animationDelay: `${st.at + 120}ms` }} />)}
    </div>
  );
}

// A chip that flies from one measured element to another (drag ghosts).
function Fly({ from, to, start, end, className, children }: { from: string; to: string; start: number; end: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.style.display = "none"; return; }
    const scene = el.closest(".hw-scene") as HTMLElement | null;
    if (!scene) return;
    const timer = setTimeout(() => {
    const s = scene.getBoundingClientRect();
    const k = parseFloat(getComputedStyle(scene).zoom) || 1;
    const c = (sel: string) => {
      const t = scene.querySelector(sel);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: (r.left - s.left + r.width / 2) / k, y: (r.top - s.top + r.height / 2) / k };
    };
    const a = c(from), b = c(to);
    if (!a || !b) return;
    const total = end + 600;
    el.animate([
      { offset: 0, transform: `translate(${a.x}px,${a.y}px) translate(-50%,-50%)`, opacity: 0 },
      { offset: start / total, transform: `translate(${a.x}px,${a.y}px) translate(-50%,-50%)`, opacity: 0 },
      { offset: (start + 80) / total, transform: `translate(${a.x}px,${a.y}px) translate(-50%,-50%)`, opacity: 1 },
      { offset: end / total, transform: `translate(${b.x}px,${b.y}px) translate(-50%,-50%)`, opacity: 1 },
      { offset: (end + 200) / total, transform: `translate(${b.x}px,${b.y}px) translate(-50%,-50%)`, opacity: 0 },
      { offset: 1, transform: `translate(${b.x}px,${b.y}px) translate(-50%,-50%)`, opacity: 0 },
    ], { duration: total, fill: "forwards", easing: "cubic-bezier(.5,.05,.3,1)" });
    }, 460);
    return () => clearTimeout(timer);
  }, [from, to, start, end]);
  return <div ref={ref} className={`hw-fly ${className ?? ""}`}>{children}</div>;
}

// ─── Shared bits ─────────────────────────────────────────────────────────
const TINT: Record<string, string> = { Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7", French: "#FCE7F3", "History": "#FEF9C3" };
// The demo school's faculty (Eden's Academy) — used consistently everywhere.
const FACULTY = ["J. Abraham", "M. Esther", "D. Samuel", "R. Naomi", "P. Daniel"];

function In({ d, children, className, style }: { d: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`hw-in ${className ?? ""}`} style={{ ...style, animationDelay: `${d}ms` }}>{children}</div>;
}

// ─── 1 · Dashboard (pages/dashboard.tsx) ────────────────────────────────
function SDash() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div>
          <div className="hw-h1">Good morning, Adam</div>
          <div className="hw-sub">Eden&rsquo;s Academy · AY 2026–27</div>
        </div>
        <span className="hw-cta hw-press" data-hw="new" style={{ animationDelay: "2000ms" }}>＋ New schedule</span>
      </div>
      <div className="hw-pulse-strip">● All 24 classes covered today · 2 faculty on leave</div>
      <div className="hw-row-between" style={{ marginTop: 12 }}>
        <div className="hw-h2">Your schedules</div><span className="hw-faint">3 total</span>
      </div>
      <div className="hw-cards3">
        {[["AY 2026–27", "🟢 Published"], ["VI–X TT", "🟡 Draft"], ["Exam block", "🟡 Draft"]].map(([n, s]) => (
          <div key={n} className="hw-mini-card"><div className="hw-mini-name">{n}</div><div className="hw-mini-status">{s}</div></div>
        ))}
      </div>
      <In d={2400} className="hw-overlay">
        <div className="hw-modal">
          <div className="hw-h2">Create new schedule</div>
          <div className="hw-sub">AI will generate all defaults — you only refine.</div>
          <div className="hw-field-label" style={{ marginTop: 10 }}>Schedule name <b className="hw-req">*</b></div>
          <div className="hw-input"><span className="hw-type" style={{ ["--ch" as string]: "14ch", animationDelay: "3000ms", animationDuration: "900ms" }}>Eden&rsquo;s AY 26–27</span><span className="hw-caret" /></div>
        </div>
      </In>
      <Cursor dur={4400} steps={[
        { t: '[data-hw="new"]', at: 1900, click: true, hold: 500 },
      ]} />
    </div>
  );
}

// ─── 2 · Numbers only → resources (CreateTimetableModal) ────────────────
function SNumbers() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-overlay" style={{ position: "absolute" }}>
        <div className="hw-modal" style={{ width: "min(400px, 94%)" }}>
          <div className="hw-h2">Create new schedule</div>
          <div className="hw-field-label" style={{ marginTop: 8 }}>Board <b className="hw-req">*</b></div>
          <div className="hw-chips-row">
            {["CBSE", "ICSE", "IB", "State", "Custom"].map((b) => (
              <span key={b} className={`hw-board-chip ${b === "CBSE" ? "hw-board-on" : ""}`}>{b}</span>
            ))}
          </div>
          <div className="hw-field-label" style={{ marginTop: 10 }}>Class range <b className="hw-req">*</b> <span className="hw-faint" style={{ fontWeight: 500 }}>— your own naming: “KG1”, “Grade 1”, “Year 7”, “Class-I”…</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="hw-input" data-hw="from"><span className="hw-type" style={{ ["--ch" as string]: "3ch", animationDelay: "900ms", animationDuration: "400ms" }}>KG1</span><span className="hw-caret" /></div>
            <div className="hw-input" data-hw="to"><span className="hw-type" style={{ ["--ch" as string]: "7ch", animationDelay: "1800ms", animationDuration: "500ms" }}>Class-X</span></div>
          </div>
          <In d={2500} className="hw-hint" style={{ color: "#059669", fontWeight: 700 }}>✓ schedU adapts to your convention and groups the levels automatically</In>
          <div className="hw-field-label" style={{ marginTop: 8 }}>Approximate counts</div>
          <div className="hw-note-box">Enter a count and <b>schedU</b> will auto-create initial editable resources for you.</div>
          <div className="hw-nums-row">
            {[["Classes", "24", 3100], ["Faculty", "42", 3900], ["Rooms", "60", 4600]].map(([l, v, d], i) => (
              <div key={String(l)} style={{ textAlign: "center" }}>
                <div className="hw-faint" style={{ marginBottom: 3 }}>{l}</div>
                <div className="hw-num-input hw-mono" data-hw={`num${i}`}>
                  <span className="hw-type" style={{ ["--ch" as string]: "2ch", animationDelay: `${d}ms`, animationDuration: "350ms" }}>{v}</span>
                </div>
              </div>
            ))}
          </div>
          <In d={5100} className="hw-ai-tags">
            <div className="hw-ai-tags-head">✨ schedU will auto-create editable</div>
            <div className="hw-chips-row">
              {["KG1–Class-X · 24 sections", "~38 subjects", "42 faculty", "Rooms 101–160"].map((t, i) => (
                <In key={t} d={5200 + i * 120} className="hw-tag">{t}</In>
              ))}
            </div>
          </In>
          <div className="hw-row-between" style={{ marginTop: 10 }}>
            <span className="hw-btn-ghost">Cancel</span>
            <span className="hw-btn-ink hw-press" data-hw="open" style={{ animationDelay: "6100ms" }}>Open wizard →</span>
          </div>
        </div>
      </div>
      <Cursor dur={6600} steps={[
        { t: '[data-hw="from"]', at: 800, click: true, hold: 600 },
        { t: '[data-hw="to"]', at: 1700, click: true, hold: 600 },
        { t: '[data-hw="num0"]', at: 3000, click: true, hold: 500 },
        { t: '[data-hw="num1"]', at: 3800, click: true, hold: 500 },
        { t: '[data-hw="num2"]', at: 4500, click: true, hold: 500 },
        { t: '[data-hw="open"]', at: 6000, click: true, hold: 500 },
      ]} />
    </div>
  );
}

// ─── 3 · Step 1 Resources (step-resources-v2.tsx) ───────────────────────
function SRes() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-wizard">
        <div className="hw-side">
          {[["Classes", 24], ["Subjects", 38], ["Faculty", 42], ["Venues", 60]].map(([l, n], i) => (
            <In key={String(l)} d={200 + i * 150} className={`hw-side-item ${i === 0 ? "is-on" : ""}`} {...(i === 2 ? {} : {})}>
              <span data-hw={i === 2 ? "faculty" : undefined}>{l}</span><b>{n}</b>
            </In>
          ))}
          <In d={900} className="hw-ai-pill hw-swap">
            <span className="hw-sa2" style={{ animationDelay: "2200ms" }}>Applying CBSE standards…</span>
            <span className="hw-green" style={{ opacity: 0, animation: "hw-show 1ms linear 2200ms both" }}>✓ CBSE assigned</span>
          </In>
        </div>
        <div className="hw-panel hw-swap">
          <div className="hw-sa2" style={{ animationDelay: "2900ms" }}>
            <div className="hw-table-head"><span>Name</span><span>Grade</span><span>Room</span><span>Class faculty</span></div>
            {[["KG1-A", "KG1", "R-101"], ["KG1-B", "KG1", "R-102"], ["I-A", "I", "R-103"], ["I-B", "I", "R-104"], ["II-A", "II", "R-105"], ["II-B", "II", "R-106"], ["III-A", "III", "R-107"]].map((r, i) => (
              <In key={r[0]} d={300 + i * 120} className="hw-table-row"><span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span><span className="hw-faint">(auto)</span></In>
            ))}
            <In d={1300} className="hw-more-row">…and 17 more classes, up to Class-X — all 24 created ✓</In>
          </div>
          <div style={{ animation: "hw-show 1ms linear 2900ms both", opacity: 0 }}>
            <div className="hw-table-head"><span>Name</span><span>Subjects</span><span>Max/wk</span><span>Status</span></div>
            {[["J. Abraham", "Maths", "32"], ["M. Esther", "Science", "32"], ["D. Samuel", "English", "30"], ["R. Naomi", "French", "30"], ["P. Daniel", "Art · Music", "28"], ["T. Moses", "History", "30"]].map((r, i) => (
              <In key={r[0]} d={3000 + i * 120} className="hw-table-row"><span>{r[0]}</span><span>{r[1]}</span><span className="hw-mono">{r[2]}</span><span className="hw-green">✓ ready</span></In>
            ))}
            <In d={3900} className="hw-more-row">…and 36 more faculty — all 42 created ✓</In>
          </div>
        </div>
      </div>
      <div className="hw-wiz-foot"><span>← Back</span><span>Step 1 of 5</span><span className="hw-violet-b">Next: Shift &amp; timing →</span></div>
      <Cursor dur={5200} steps={[
        { t: '[data-hw="faculty"]', at: 2600, click: true, hold: 800 },
      ]} />
    </div>
  );
}

// ─── 4 · Step 2 Shift & Timing (step-bell.tsx, reactive auto-gen) ───────
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
function SBell() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-card-lite">
        <div className="hw-card-head">⧉ Main Shift <span className="hw-faint" style={{ fontWeight: 500 }}>· Schedule Rhythm</span></div>
        <div className="hw-fields-row">
          <div><div className="hw-field-label">Start time</div><div className="hw-input hw-mono" data-hw="start"><span className="hw-type" style={{ ["--ch" as string]: "5ch", animationDelay: "900ms", animationDuration: "600ms" }}>08:00</span><span className="hw-caret" /></div></div>
          <div><div className="hw-field-label">End time</div><div className="hw-input hw-mono" data-hw="end"><span className="hw-type" style={{ ["--ch" as string]: "5ch", animationDelay: "2100ms", animationDuration: "600ms" }}>14:10</span></div><div className="hw-hint">generation target</div></div>
          <div><div className="hw-field-label">Duration (min)</div><div className="hw-input hw-mono">40</div></div>
          <div><div className="hw-field-label">Max/day</div><div className="hw-input hw-mono">8</div></div>
        </div>
        <div className="hw-field-label" style={{ marginTop: 8 }}>LUNCH BREAK MODE</div>
        <div className="hw-lunch-row">
          <span className="hw-lunch-card">🕐 <b>Single Lunch</b><i>All classes share one slot.</i></span>
          <span className="hw-lunch-card hw-lunch-smart" data-hw="smart" style={{ animationDelay: "3800ms" }}>🧠 <b>Smart Lunch</b><i>Each age group eats at a different time. Avoids canteen rush.</i></span>
        </div>
      </div>
      <div className="hw-swap" style={{ marginTop: 10 }}>
        <div className="hw-sa2" style={{ animationDelay: "4100ms" }}>
          <BellTable rows={BELL_SINGLE} startDelay={2800} />
        </div>
        <In d={4100}>
          <BellTable rows={BELL_SMART} startDelay={4100} />
        </In>
      </div>
      <Cursor dur={5600} steps={[
        { t: '[data-hw="start"]', at: 800, click: true, hold: 800 },
        { t: '[data-hw="end"]', at: 2000, click: true, hold: 800 },
        { t: '[data-hw="smart"]', at: 3700, click: true, hold: 700 },
      ]} />
    </div>
  );
}
function BellTable({ rows, startDelay }: { rows: string[][]; startDelay: number }) {
  return (
    <div className="hw-bell-table">
      <div className="hw-bell-row hw-bell-header"><span /><span>I–V</span><span>VI–VIII</span><span>IX–X</span></div>
      {rows.map((r, i) => (
        <In key={i} d={startDelay + i * 140} className="hw-bell-row">
          <span className="hw-mono hw-faint">{r[0]}</span>
          {r.slice(1).map((c, j) => <span key={j} className={c === "LUNCH" ? "hw-lunch-band" : "hw-bell-cell"}>{c}</span>)}
        </In>
      ))}
    </div>
  );
}

// ─── 5 · Step 3 Allocation (step-allocation.tsx) ────────────────────────
const ALLOC = [
  ["IX-A", "5", "4+1L", "5", "4", "4", "23/24"],
  ["IX-B", "5", "4+1L", "5", "4", "4", "23/24"],
  ["X-A", "6", "5+1L", "5", "4", "4", "25/25"],
  ["X-B", "6", "5+1L", "5", "4", "4", "25/25"],
];
function SAlloc() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-tabs-row">
        <span className="hw-tab is-on">Period allocation</span>
        <span className="hw-tab">Faculty allocation</span>
        <span className="hw-tab hw-flash" data-hw="valid" style={{ animationDelay: "2700ms" }}>Validation</span>
      </div>
      <div className="hw-swap" style={{ marginTop: 8 }}>
        <div className="hw-sa2" style={{ animationDelay: "3000ms" }}>
          <div className="hw-alloc-grid">
            <div className="hw-alloc-row hw-alloc-head"><span /><span>Maths</span><span>Science</span><span>English</span><span>French</span><span>History</span><span>Total</span></div>
            {ALLOC.map((r, ri) => (
              <div key={r[0]} className="hw-alloc-row">
                <span className="hw-alloc-sec">{r[0]}</span>
                {r.slice(1, 6).map((c, ci) => (
                  <In key={ci} d={200 + (ri * 5 + ci) * 90} className="hw-alloc-cell hw-mono">{c}</In>
                ))}
                <In d={200 + (ri * 5 + 5) * 90} className="hw-alloc-total hw-mono">{r[6]} <b className="hw-green">✓</b></In>
              </div>
            ))}
          </div>
        </div>
        <In d={3000}>
          <div className="hw-valid-panel">
            {["Period totals fit weekly capacity", "Every allocated cell has a faculty member", "No one over their daily cap"].map((c, i) => (
              <In key={c} d={3100 + i * 280} className="hw-check"><b className="hw-green">✓</b> {c}</In>
            ))}
            <In d={4000} className="hw-success-banner">All checks passed. Ready to proceed to Student Groups.</In>
          </div>
        </In>
      </div>
      <div className="hw-wiz-foot"><span /><span>Step 3 of 5 · Period allocation → Faculty allocation → Validation</span><span /></div>
      <Cursor dur={4800} steps={[
        { t: '[data-hw="valid"]', at: 2600, click: true, hold: 600 },
      ]} />
    </div>
  );
}

// ─── 6 · Step 4 Groups & Combos (step-student-groups.tsx) ───────────────
function SCombo() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div className="hw-tabs-row" style={{ margin: 0 }}>
          <span className="hw-tab is-on">AND Groups</span>
          <span className="hw-tab hw-flash" style={{ animationDelay: "4300ms" }}>OR Groups</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className="hw-btn-amber hw-press" data-hw="suggest" style={{ animationDelay: "800ms" }}>✨ AI Suggest</span>
          <span className="hw-cta" style={{ padding: "4px 10px", fontSize: 9.5 }}>＋ New block</span>
        </div>
      </div>
      <In d={1050} className="hw-block-card">
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
          <span className="hw-merge-pair" data-hw="cross">Section <i className="hw-merge-off" style={{ animationDelay: "2300ms" }}>Same</i><i className="hw-merge-on" style={{ animationDelay: "2300ms" }}>Cross</i></span>
          <span className="hw-merge-pair">Grade <i style={{ background: "#7C6FE0", color: "#fff" }}>Same</i><i>Cross</i></span>
          <span className="hw-btn-violet hw-press" data-hw="gengroups" style={{ animationDelay: "3300ms" }}>Generate teaching groups</span>
        </div>
        <div className="hw-group-chips hw-swap">
          <div className="hw-sa2" style={{ animationDelay: "3600ms", display: "flex", gap: 6 }}>
            <span className="hw-gchip">Physics · IX-A · 28</span>
            <span className="hw-gchip">Physics · IX-B · 26</span>
          </div>
          <In d={3600} style={{ display: "flex", gap: 6 }}>
            <span className="hw-gchip hw-gchip-merged">Physics · IX-A+B · 54 · Lab-1</span>
            <span className="hw-gchip hw-gchip-merged">Chemistry · IX-A+B · 50 · Lab-2</span>
          </In>
        </div>
      </In>
      <In d={4400} className="hw-or-card">
        <b>Painting OR PE</b> — students pick one option; one runs at a time. <span className="hw-faint">(OR Groups)</span>
      </In>
      <Cursor dur={5400} steps={[
        { t: '[data-hw="suggest"]', at: 700, click: true, hold: 500 },
        { t: '[data-hw="cross"]', at: 2200, click: true, hold: 500 },
        { t: '[data-hw="gengroups"]', at: 3200, click: true, hold: 600 },
      ]} />
    </div>
  );
}

// ─── 7 · Step 5 Generate — REAL clickable button ────────────────────────
const SOLVE_LABELS = ["Reading school setup…", "Matching teachers to subjects…", "Building the weekly schedule…", "Ensuring no teacher is double-booked…", "Checking for conflicts and gaps…"];
const FEED = ["IX-A → Maths · J. Abraham", "X-B → Science · M. Esther", "VII-C → English · D. Samuel", "VI-A → French · R. Naomi", "IX-B → History · T. Moses", "X-A → Art · P. Daniel"];
function SGen() {
  const [run, setRun] = useState(0);
  return (
    <div className="hw-scene hw-app hw-center-col">
      <div className="hw-preflight">✓ Every class fits its weekly capacity — ready to generate.</div>
      <button className="hw-cta hw-gen-btn hw-press" data-hw="gen" style={{ animationDelay: "900ms" }} onClick={() => setRun((r) => r + 1)}>
        ✨ Generate Schedule
      </button>
      <div className="hw-try-hint">▶ this button really works — click it to re-run the solve</div>
      <div key={run} style={{ display: "contents" }}>
        <In d={run ? 100 : 1100} className="hw-solve">
          <div className="hw-ring-row">
            <svg viewBox="0 0 44 44" width="52" height="52">
              <circle cx="22" cy="22" r="18" fill="none" stroke="#EDE9FF" strokeWidth="5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="#7C6FE0" strokeWidth="5" strokeLinecap="round"
                strokeDasharray="113" strokeDashoffset="113" transform="rotate(-90 22 22)" className="hw-ring-arc" style={{ animationDelay: `${run ? 200 : 1200}ms` }} />
            </svg>
            <div className="hw-solve-labels">
              {SOLVE_LABELS.map((l, i) => (
                <span key={l} className="hw-solve-label" style={{ animationDelay: `${(run ? 300 : 1300) + i * 660}ms` }}>{l}</span>
              ))}
            </div>
          </div>
          <div className="hw-feed">
            {FEED.map((f, i) => (
              <In key={f} d={(run ? 500 : 1500) + i * 380} className="hw-feed-line"><b className="hw-green">✓</b> {f}</In>
            ))}
          </div>
        </In>
        <In d={run ? 3700 : 4700} className="hw-done-row">
          <div className="hw-done-stats">
            <span className="hw-conflict-pill"><i /> 0 conflicts</span>
            <span className="hw-done-stat"><b>620</b> lessons placed</span>
            <span className="hw-done-stat"><b>1.1</b> load stddev — fair</span>
            <span className="hw-done-stat"><b>4.8s</b> solve time</span>
          </div>
          <span className="hw-cta hw-press" data-hw="view" style={{ animationDelay: "5500ms" }}>View Schedule (Draft) →</span>
        </In>
      </div>
      <Cursor dur={6000} steps={[
        { t: '[data-hw="gen"]', at: 800, click: true, hold: 700 },
        { t: '[data-hw="view"]', at: 5400, click: true, hold: 400 },
      ]} />
    </div>
  );
}

// ─── 8 · Timetable views tour (routes/timetable.tsx VIEW_TABS) ──────────
// Periods (with real times) are always the column headings; the rows are
// the entity of the active lens — class, faculty, venue, or subject.
const VIEW_HEAD = ["", "P1 · 8:10", "P2 · 8:50", "P3 · 9:30", "P4 · 11:40", "P5 · 12:20"];
const VIEW_GRID: Record<string, { rows: [string, string[]][]; head: string[] }> = {
  class: { head: VIEW_HEAD, rows: [["IX-A", ["Maths", "Science", "English", "French", "History"]], ["IX-B", ["Science", "Maths", "History", "English", "French"]], ["X-A", ["English", "History", "Maths", "Science", "French"]], ["X-B", ["French", "English", "Science", "History", "Maths"]]] },
  teacher: { head: VIEW_HEAD, rows: [["J. Abraham", ["IX-A", "IX-B", "—", "X-A", "X-B"]], ["M. Esther", ["IX-B", "IX-A", "X-B", "—", "X-A"]], ["D. Samuel", ["X-A", "—", "IX-A", "IX-B", "—"]], ["R. Naomi", ["X-B", "—", "—", "IX-A", "IX-B"]]] },
  room: { head: VIEW_HEAD, rows: [["Lab-1", ["IX-A", "X-B", "—", "IX-B", "X-A"]], ["R-201", ["IX-B", "IX-A", "X-A", "—", "—"]], ["R-202", ["X-A", "—", "IX-B", "X-B", "IX-A"]], ["Hall", ["—", "X-A", "X-B", "—", "—"]]] },
  subject: { head: VIEW_HEAD, rows: [["Maths", ["IX-A", "IX-B", "X-A", "X-B", "—"]], ["Science", ["IX-B", "IX-A", "—", "X-A", "X-B"]], ["English", ["X-A", "—", "IX-A", "IX-B", "—"]], ["French", ["X-B", "—", "—", "IX-A", "IX-B"]]] },
};
const VIEW_ORDER = ["class", "teacher", "room", "subject"] as const;
const VIEW_LABEL: Record<string, string> = { class: "Classes", teacher: "Faculty", room: "Venues", subject: "Subjects" };
const VIEW_SWITCH = [0, 1400, 3000, 4600]; // ms each view becomes active
function SViews() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-vtoolbar">
        <div className="hw-h2" style={{ marginRight: 10 }}>Eden&rsquo;s AY 26–27 <span className="hw-draft-chip">🟡 Draft</span></div>
        <div className="hw-vtabs">
          {VIEW_ORDER.map((k, i) => (
            <span key={k} className="hw-vtab" data-hw={`vt${i}`}>
              {VIEW_LABEL[k]}
              <i className="hw-vtab-line" style={{
                animation: i === 0
                  ? `hw-show 1ms linear 0ms both, hw-hide 1ms linear ${VIEW_SWITCH[1]}ms both`
                  : `hw-hide 1ms linear 0ms both, hw-show 1ms linear ${VIEW_SWITCH[i]}ms both${i < 3 ? `, hw-hide 1ms linear ${VIEW_SWITCH[i + 1]}ms both` : ""}`,
              }} />
            </span>
          ))}
        </div>
        <span className="hw-input" style={{ padding: "3px 8px", fontSize: 9 }}>All Classes ▾</span>
      </div>
      <div className="hw-swap" style={{ marginTop: 8 }}>
        {VIEW_ORDER.map((k, i) => {
          const g = VIEW_GRID[k];
          const from = VIEW_SWITCH[i], to = VIEW_SWITCH[i + 1];
          return (
            <div key={k} style={{
              opacity: i === 0 ? 1 : 0,
              animation: i === 0
                ? `hw-hide 1ms linear ${to}ms both`
                : `hw-show 1ms linear ${from}ms both${to ? `, hw-hide 1ms linear ${to}ms both` : ""}`,
            }}>
              <div className="hw-tt-grid">
                <div className="hw-tt-row hw-tt-head">{g.head.map((h, j) => <span key={j}>{h}</span>)}</div>
                {g.rows.map(([label, cells]) => (
                  <div key={label} className="hw-tt-row">
                    <span className="hw-tt-p">{label}</span>
                    {cells.map((c, ci) => (
                      <span key={ci} className={`hw-tt-cell ${c === "—" ? "hw-tt-free" : ""}`} style={{ background: TINT[c] ?? (c === "—" ? undefined : "#F4F2FE") }}>
                        <b>{c}</b>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hw-sub" style={{ marginTop: 6, textAlign: "center" }}>Same data — flip between Classes, Faculty, Venues and Subjects instantly. Transpose any view.</div>
      <Cursor dur={6400} steps={[
        { t: '[data-hw="vt1"]', at: 1300, click: true, hold: 600 },
        { t: '[data-hw="vt2"]', at: 2900, click: true, hold: 600 },
        { t: '[data-hw="vt3"]', at: 4500, click: true, hold: 800 },
      ]} />
    </div>
  );
}

// ─── 9 · Drag & drop slot editing (timetable.tsx edit mode) ─────────────
// Periods as columns, days as rows. Beats: pick up Wed·P2 Maths → the cell
// empties and a ghost chip follows the pointer → hovering Wed·P4 flashes
// red (J. Abraham already teaches then) → drop on Fri·P4 lands with a green
// ring → toast. A status line narrates each beat so nothing is ambiguous.
const DND_T = { grab: 1400, bad: 2600, drop: 4000 };
function SDnd() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div className="hw-h2">IX-A · Edit mode <span className="hw-edit-chip">✏ editing</span></div>
        <span className="hw-swap" style={{ fontSize: 10, fontWeight: 700 }}>
          <span className="hw-sa2" style={{ animationDelay: `${DND_T.grab}ms`, color: "#8B87AD" }}>drag any lesson to move it</span>
          <span style={{ color: "#7C6FE0", opacity: 0, animation: `hw-show 1ms linear ${DND_T.grab}ms both, hw-hide 1ms linear ${DND_T.bad}ms both` }}>✊ dragging Maths · J. Abraham…</span>
          <span style={{ color: "#DC2626", opacity: 0, animation: `hw-show 1ms linear ${DND_T.bad}ms both, hw-hide 1ms linear ${DND_T.bad + 900}ms both` }}>✕ can&rsquo;t drop here — J. Abraham teaches X-B at this time</span>
          <span style={{ color: "#7C6FE0", opacity: 0, animation: `hw-show 1ms linear ${DND_T.bad + 900}ms both, hw-hide 1ms linear ${DND_T.drop}ms both` }}>✊ dragging Maths · J. Abraham…</span>
          <span style={{ color: "#059669", opacity: 0, animation: `hw-show 1ms linear ${DND_T.drop}ms both` }}>✓ dropped — no clashes, saved</span>
        </span>
      </div>
      <div className="hw-tt-grid hw-dnd-grid" style={{ marginTop: 8 }}>
        <div className="hw-tt-row hw-tt-head"><span /><span className="hw-mono">P1 · 8:10</span><span className="hw-mono">P2 · 8:50</span><span className="hw-mono">P3 · 9:30</span><span className="hw-mono">P4 · 11:40</span></div>
        {[
          ["Mon", ["Maths", "Science", "English", "French"]],
          ["Wed", ["Science", "SRC", "English", "BAD"]],
          ["Fri", ["English", "History", "Maths", "TGT"]],
        ].map(([day, cells]) => (
          <div key={String(day)} className="hw-tt-row">
            <span className="hw-tt-p">{day}</span>
            {(cells as string[]).map((c, ci) => {
              if (c === "SRC") return (
                <span key={ci} className="hw-tt-cell hw-dnd-src hw-swap" data-hw="src">
                  <b className="hw-sa2" style={{ animationDelay: `${DND_T.grab}ms`, background: TINT.Maths }}>Maths<i>J. Abraham</i></b>
                  <i className="hw-dnd-empty" style={{ opacity: 0, animation: `hw-show 1ms linear ${DND_T.grab}ms both` }} />
                </span>
              );
              if (c === "TGT") return (
                <span key={ci} className="hw-tt-cell hw-dnd-tgt hw-swap" data-hw="tgt">
                  <i className="hw-dnd-ok hw-sa2" style={{ animationDelay: `${DND_T.drop}ms` }}>free — drop here</i>
                  <b className="hw-dnd-landed" style={{ opacity: 0, animation: `hw-show 1ms linear ${DND_T.drop}ms both`, background: TINT.Maths }}>Maths<i>J. Abraham</i></b>
                </span>
              );
              if (c === "BAD") return (
                <span key={ci} className="hw-tt-cell hw-swap" data-hw="bad">
                  <span className="hw-sa2" style={{ animationDelay: `${DND_T.bad - 150}ms` }}><b style={{ background: TINT.French }}>French<i>R. Naomi</i></b></span>
                  <span className="hw-dnd-bad" style={{ opacity: 0, animation: `hw-show 1ms linear ${DND_T.bad - 150}ms both, hw-hide 1ms linear ${DND_T.bad + 900}ms both` }}><b>✕ J. Abraham busy</b></span>
                  <span style={{ opacity: 0, animation: `hw-show 1ms linear ${DND_T.bad + 900}ms both` }}><b style={{ background: TINT.French }}>French<i>R. Naomi</i></b></span>
                </span>
              );
              return <span key={ci} className="hw-tt-cell" style={{ background: TINT[c] }}><b>{c}<i>{FACULTY[(ci + 1) % 5]}</i></b></span>;
            })}
          </div>
        ))}
      </div>
      <In d={DND_T.drop + 300} className="hw-toast">✓ Moved to Fri · P4. No clashes — saved.</In>
      <Fly from='[data-hw="src"]' to='[data-hw="bad"]' start={DND_T.grab} end={DND_T.bad} className="hw-fly-chip">Maths · J. Abraham</Fly>
      <Fly from='[data-hw="bad"]' to='[data-hw="tgt"]' start={DND_T.bad + 600} end={DND_T.drop} className="hw-fly-chip">Maths · J. Abraham</Fly>
      <Cursor dur={6000} grab={[DND_T.grab, DND_T.drop]} steps={[
        { t: '[data-hw="src"]', at: DND_T.grab - 150, click: true, hold: 300 },
        { t: '[data-hw="bad"]', at: DND_T.bad, hold: 900 },
        { t: '[data-hw="tgt"]', at: DND_T.drop, click: true, hold: 1200 },
      ]} />
    </div>
  );
}

// ─── 10 · Workload optimization (ReviewDashboard load balancing) ────────
const LOADS: [string, number, number][] = [["J. Abraham", 92, 74], ["M. Esther", 55, 72], ["D. Samuel", 88, 76], ["R. Naomi", 48, 70], ["T. Moses", 78, 74]];
function SLoad() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-row-between">
        <div><div className="hw-h2">Faculty Load</div><div className="hw-sub">Weekly periods per faculty member · fairness stddev</div></div>
        <span className="hw-btn-violet hw-press" data-hw="reopt" style={{ animationDelay: "2100ms", fontSize: 10, padding: "7px 13px" }}>
          <span className="hw-swap" style={{ display: "inline-grid" }}>
            <span className="hw-sa2" style={{ animationDelay: "2300ms" }}>⚖ Optimize load</span>
            <span style={{ opacity: 0, animation: "hw-show 1ms linear 2300ms both, hw-hide 1ms linear 3400ms both" }}>Optimising…</span>
            <span style={{ opacity: 0, animation: "hw-show 1ms linear 3400ms both" }}>⚖ Optimize load</span>
          </span>
        </span>
      </div>
      <div className="hw-load-card">
        {LOADS.map(([n, w0, w1], i) => (
          <In key={n} d={300 + i * 140} className="hw-load-row">
            <span className="hw-load-name">{n}</span>
            <span className="hw-load-track">
              <i className="hw-load-bar" style={{ ["--w0" as string]: `${w0}%`, ["--w1" as string]: `${w1}%`, animationDelay: "3400ms", background: w0 > 85 ? "#F59E0B" : "#7C6FE0" }} />
            </span>
            <span className="hw-mono hw-swap" style={{ fontSize: 8.5, color: "#6B7280", display: "inline-grid" }}>
              <span className="hw-sa2" style={{ animationDelay: "3700ms" }}>{Math.round(w0 * 0.32)}/wk</span>
              <span style={{ opacity: 0, animation: "hw-show 1ms linear 3700ms both" }}>{Math.round(w1 * 0.32)}/wk</span>
            </span>
          </In>
        ))}
        <div className="hw-swap" style={{ marginTop: 8 }}>
          <div className="hw-sa2" style={{ animationDelay: "3600ms" }}><span className="hw-load-std">stddev <b className="hw-mono">4.2</b> — uneven</span></div>
          <In d={3600} className="hw-success-banner" style={{ marginTop: 0 }}>✓ Reassigned 6 lessons · stddev 4.2 → 1.1 — load balanced across the faculty.</In>
        </div>
      </div>
      <Cursor dur={5200} steps={[
        { t: '[data-hw="reopt"]', at: 2000, click: true, hold: 900 },
      ]} />
    </div>
  );
}

// ─── 11 · Calendar Day (pages/calendar.tsx Day view) ────────────────────
const CAL_ROWS = [
  { name: "J. Abraham", periods: 7, blocks: [["X-D · Maths", 2], ["X-C · Maths", 3], ["LUNCH", 2], ["VI-A · Maths", 3], ["VII-B · Maths", 3]] },
  { name: "P. Daniel", periods: 6, blocks: [["", 2], ["V-D · Art", 2], ["LUNCH", 2], ["IV-C · Music", 3], ["V-B · Art", 3]] },
  { name: "D. Samuel", periods: 7, blocks: [["II-A · English", 2], ["I-B · English", 2], ["LUNCH", 2], ["III-D · English", 3], ["II-D · English", 3]] },
];
function SCal() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-live-toolbar">
        <span className="hw-nav-btn">‹</span>
        <span className="hw-date-box hw-mono">11-07-2026 📅</span>
        <span className="hw-nav-btn">›</span>
        <span className="hw-btn-ghost" style={{ fontSize: 8.5, padding: "4px 9px" }}>Today</span>
        <span style={{ flex: 1 }} />
        <span className="hw-tabs-pill">
          <i>● Live</i><i className="is-on hw-flash" data-hw="day" style={{ animationDelay: "1000ms" }}>Day</i><i>Month</i>
        </span>
        <span className="hw-tabs-pill">
          <i className="is-on">👥 Teachers</i><i>🎓 Classes</i><i>📖 Subjects</i><i>🏛 Venues</i>
        </span>
      </div>
      <div className="hw-filter-row">
        <span className="hw-filter-chip is-on">✓ ⊞ All (2)</span>
        <span className="hw-filter-chip" data-hw="ttchip">✓ I-V TT</span>
        <span className="hw-filter-chip">✓ VI-X TT</span>
        <span className="hw-live-note">· Day shows the combined view across all active schedules</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
        {CAL_ROWS.map((row, ri) => (
          <In key={row.name} d={800 + ri * 250}>
            <div className="hw-row-between" style={{ marginBottom: 3 }}>
              <b style={{ fontSize: 10, color: "#13111E" }}>{row.name}</b>
              <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span className="hw-leave-btn">⚑ Leave</span>
                <span className="hw-sub-btn">⇄ Sub</span>
                <span className="hw-faint">{row.periods} periods</span>
              </span>
            </div>
            <div className="hw-day-track" style={{ height: 30, marginTop: 0 }}>
              {row.blocks.map(([label, w], i) =>
                label === "LUNCH" ? (
                  <span key={i} className="hw-day-block hw-day-lunch" style={{ flex: Number(w) }}>Lunch</span>
                ) : label === "" ? (
                  <span key={i} style={{ flex: Number(w) }} />
                ) : (
                  <span key={i} className="hw-day-block" style={{ flex: Number(w) }}>{label}</span>
                )
              )}
            </div>
          </In>
        ))}
      </div>
      <Cursor dur={4400} steps={[
        { t: '[data-hw="day"]', at: 900, click: true, hold: 600 },
        { t: '[data-hw="ttchip"]', at: 2400, click: true, hold: 700 },
      ]} />
    </div>
  );
}

// ─── 12 · Live (calendar.tsx LiveBoard — reproduced exactly) ────────────
// Every element mirrors the real LiveBoard/MomentScrubber (calendar.tsx
// 1458-1742): 46px scrubber with proportional violet/amber density bands,
// hour gridlines + labels, the 3px handle line with the 15px circular knob,
// red now-tick, 30px clock header with "N min left", Live/Paused states,
// In-session cards (ring with % inside, entity, subject pill, teacher) and
// the Free-now chips with load badges + the Lightest/Heaviest sort control.
// The clock and ring percentages run off the real wall clock; dragging the
// knob swaps the whole board to the scrubbed moment's state and back.
const LIVE_CARDS = [
  ["VI-A", "Science", "M. Esther", "#6B7280", "#F3F4F6"],
  ["VI-B", "French", "R. Naomi", "#C2740E", "#FEF3C7"],
  ["VI-C", "Geography", "T. Moses", "#EA580C", "#FFEDD5"],
  ["VII-A", "Science", "N. Caleb", "#6B7280", "#F3F4F6"],
  ["VIII-B", "Mathematics", "J. Abraham", "#1D4ED8", "#DBEAFE"],
  ["VIII-C", "French", "H. Hannah", "#C2740E", "#FEF3C7"],
];
const LIVE_CARDS_ALT = [
  ["VI-A", "Mathematics", "J. Abraham", "#1D4ED8", "#DBEAFE"],
  ["VII-B", "English", "D. Samuel", "#166534", "#DCFCE7"],
  ["IX-C", "Science", "M. Esther", "#6B7280", "#F3F4F6"],
];
// Real scrubber band geometry: [width-share, teachFrac] — bands stack a
// violet teaching share over an amber break share, like the real strip.
const LIVE_SEGS: [number, number][] = [[6, 0], [20, 1], [4, 0], [22, 0.85], [22, 1], [26, 0], [24, 0.7], [22, 1], [20, 0]];
// Choreography (ms): grab 1500 → drag +fwd 2600 → hold → drag back 4400 →
// hold reading the changed board → release 6200 → Now 7600 → settle.
function SLive() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--";
  const dateStr = now ? `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}` : "";
  const frac = now ? Math.max(0.05, Math.min(0.95, ((now.getHours() + now.getMinutes() / 60) - 9) / 6.5)) : 0.45;
  const secOfPeriod = now ? ((now.getMinutes() % 40) * 60 + now.getSeconds()) : 0;
  const pct = Math.min(99, Math.max(1, Math.round((secOfPeriod / 2400) * 100)));
  const minLeft = Math.max(1, 40 - Math.floor(secOfPeriod / 60));
  const P = 1500, BACK = 7600; // pin start / back-to-live ms

  return (
    <div className="hw-scene hw-app">
      <div className="hw-live-toolbar">
        <span className="hw-nav-btn">‹</span>
        <span className="hw-date-box hw-mono">{dateStr} 📅</span>
        <span className="hw-nav-btn">›</span>
        <span className="hw-btn-ghost" style={{ padding: "4px 10px" }}>Today</span>
        <span style={{ flex: 1 }} />
        <span className="hw-tabs-pill"><i className="is-on">● Live</i><i>Day</i><i>Month</i></span>
        <span className="hw-tabs-pill"><i>👥 Teachers</i><i className="is-on" style={{ color: "#7C6FE0" }}>🎓 Classes</i><i>📖 Subjects</i><i>🏛 Venues</i></span>
      </div>
      <div className="hw-filter-row">
        <span className="hw-filter-chip is-on">✓ ⊞ All (2)</span>
        <span className="hw-filter-chip">✓ I-V TT</span>
        <span className="hw-filter-chip">✓ VI-X TT</span>
        <span className="hw-live-note">· Live follows the wall clock across every active schedule and their bells</span>
      </div>

      {/* The real LiveBoard card */}
      <div className="hw-board-card">
        <div className="hw-row-between" style={{ alignItems: "center", padding: "10px 14px 8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <b className="hw-live-clock hw-swap" style={{ display: "inline-grid" }}>
              <span className="hw-sa2" style={{ animationDelay: `${P}ms` }}>{clock}</span>
              <span style={{ opacity: 0, animation: `hw-show 1ms linear ${P}ms both, hw-hide 1ms linear 3400ms both` }}>12:40 PM</span>
              <span style={{ opacity: 0, animation: `hw-show 1ms linear 3400ms both, hw-hide 1ms linear ${BACK}ms both` }}>10:15 AM</span>
              <span style={{ opacity: 0, animation: `hw-show 1ms linear ${BACK}ms both` }}>{clock}</span>
            </b>
            <span className="hw-sub" style={{ display: "inline", fontSize: 11 }}>Period 3 · <b style={{ color: "#16A34A" }}>{minLeft} min left</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="hw-swap" style={{ display: "inline-grid", fontSize: 10.5, fontWeight: 700 }}>
              <span className="hw-live-badge hw-sa2" style={{ animationDelay: `${P}ms` }}>● Live</span>
              <span style={{ color: "#9A95BC", opacity: 0, animation: `hw-show 1ms linear ${P}ms both, hw-hide 1ms linear ${BACK}ms both` }}>● Paused</span>
              <span className="hw-live-badge" style={{ opacity: 0, animation: `hw-show 1ms linear ${BACK}ms both` }}>● Live</span>
            </span>
            <span className="hw-now-btn hw-flash" data-hw="nowbtn" style={{ animationDelay: `${BACK - 200}ms` }}>Now</span>
          </div>
        </div>

        {/* MomentScrubber — density bands, hour gridlines, handle + knob */}
        <div style={{ padding: "0 14px 8px" }}>
          <div className="hw-scrub-track">
            {LIVE_SEGS.map(([w, tf], i) => (
              <span key={i} className="hw-scrub-band" style={{ flex: w }}>
                {tf > 0 && <i style={{ flex: tf, background: "#B9AFF0" }} />}
                {tf < 1 && <i style={{ flex: 1 - tf, background: "#F7D9A0" }} />}
              </span>
            ))}
            {[1, 2, 3, 4, 5, 6].map((h) => <i key={h} className="hw-scrub-hr" style={{ left: `${(h / 6.5) * 100}%` }} />)}
            <i className="hw-scrub-nowtick" style={{ left: `${frac * 100}%` }} />
            <span className="hw-playhead" style={{ left: `${frac * 100}%` }}>
              <span className="hw-playhead-drag">
                <i className="hw-ph-line" />
                <i className="hw-ph-knob" data-hw="knob" />
                <i className="hw-drag-hint" style={{ animationDelay: "300ms" }}>⇠ drag ⇢</i>
              </span>
            </span>
          </div>
          <div className="hw-hours">{["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"].map((h) => <span key={h}>{h}</span>)}</div>
          <div className="hw-legend"><span><i style={{ background: "#B9AFF0" }} />Teaching</span><span><i style={{ background: "#F7D9A0" }} />Break / free</span></div>
        </div>

        {/* Board — swaps state while scrubbed, back on Now */}
        <div className="hw-board-body hw-swap">
          {/* State A — live now */}
          <div className="hw-sa2" style={{ animationDelay: "3600ms" }}>
            <div className="hw-live-section" style={{ color: "#16A34A" }}><i className="hw-sec-dot" style={{ background: "#16A34A" }} />In session · 11</div>
            <div className="hw-live-grid">
              {LIVE_CARDS.map(([n, s, t, fg, bg]) => <LiveMiniCard key={String(n)} n={String(n)} s={String(s)} t={String(t)} fg={String(fg)} bg={String(bg)} pct={pct} />)}
            </div>
            <div className="hw-row-between" style={{ alignItems: "center", marginTop: 8 }}>
              <div className="hw-live-section" style={{ color: "#9A95BC", margin: 0 }}><i className="hw-sec-dot" style={{ background: "#9A95BC" }} />Free now · 3</div>
              <span className="hw-sort-seg"><i className="is-on">Lightest first</i><i>Heaviest first</i></span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {[["M. Esther", 1, "#16A34A"], ["P. Daniel", 2, "#16A34A"], ["E. Ruth", 4, "#B45309"]].map(([n, l, c]) => (
                <span key={String(n)} className="hw-free-chip">{n} <b className="hw-load-badge" style={{ color: String(c) }}>{l} today</b> <i className="hw-plus">＋</i></span>
              ))}
            </div>
          </div>
          {/* State B — the scrubbed moment (10:15 AM): fewer sessions, more free */}
          <div style={{ animation: `hw-show 1ms linear 3600ms both, hw-hide 1ms linear ${BACK}ms both`, opacity: 0 }}>
            <div className="hw-live-section" style={{ color: "#16A34A" }}><i className="hw-sec-dot" style={{ background: "#16A34A" }} />In session · 3 <span className="hw-faint" style={{ textTransform: "none", letterSpacing: 0 }}>— at 10:15 AM</span></div>
            <div className="hw-live-grid">
              {LIVE_CARDS_ALT.map(([n, s, t, fg, bg]) => <LiveMiniCard key={String(n)} n={String(n)} s={String(s)} t={String(t)} fg={String(fg)} bg={String(bg)} pct={38} />)}
            </div>
            <div className="hw-row-between" style={{ alignItems: "center", marginTop: 8 }}>
              <div className="hw-live-section" style={{ color: "#9A95BC", margin: 0 }}><i className="hw-sec-dot" style={{ background: "#9A95BC" }} />Free now · 8</div>
              <span className="hw-sort-seg"><i className="is-on">Lightest first</i><i>Heaviest first</i></span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {[["H. Hannah", 1, "#16A34A"], ["M. Esther", 2, "#16A34A"], ["E. Ruth", 2, "#16A34A"], ["N. Caleb", 3, "#B45309"], ["P. Daniel", 4, "#B45309"]].map(([n, l, c]) => (
                <span key={String(n)} className="hw-free-chip">{n} <b className="hw-load-badge" style={{ color: String(c) }}>{l} today</b> <i className="hw-plus">＋</i></span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Cursor dur={9600} grab={[P, 6200]} steps={[
        { t: '[data-hw="knob"]', at: 1400, click: true, hold: 300 },
        { t: '[data-hw="knob"]', at: 2600, dx: 120, hold: 600 },
        { t: '[data-hw="knob"]', at: 4400, dx: -90, hold: 1500 },
        { t: '[data-hw="nowbtn"]', at: 7400, click: true, hold: 900 },
      ]} />
    </div>
  );
}
function LiveMiniCard({ n, s, t, fg, bg, pct }: { n: string; s: string; t: string; fg: string; bg: string; pct: number }) {
  return (
    <div className="hw-live-card">
      <span className="hw-ring-wrap">
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#F0EEFA" strokeWidth="4" />
          <circle cx="20" cy="20" r="16" fill="none" stroke={fg} strokeWidth="4" strokeLinecap="round"
            strokeDasharray="100.5" strokeDashoffset={100.5 * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <b style={{ color: fg }}>{pct}%</b>
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="hw-live-entity">{n}</div>
        <span className="hw-live-subj" style={{ background: bg, color: fg }}>{s}</span>
        <div className="hw-live-teacher">{t}</div>
      </div>
    </div>
  );
}

// ─── 13 · Assign a task (calendar.tsx AssignTaskModal) ──────────────────
function STask() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-live-section" style={{ color: "#9A95BC" }}>● FREE NOW · 3</div>
      <div style={{ display: "flex", gap: 6 }}>
        <span className="hw-free-chip">M. Esther <b style={{ color: "#16A34A" }}>2 today</b>
          <span className="hw-swap" style={{ display: "inline-grid" }}>
            <i className="hw-plus hw-sa2" data-hw="plus" style={{ animationDelay: "4400ms" }}>＋</i>
            <In d={4400} className="hw-task-tag" style={{ display: "inline" }}>Exam invig. · P4 ✓</In>
          </span>
        </span>
        <span className="hw-free-chip">P. Daniel <b style={{ color: "#B45309" }}>4 today</b> <i className="hw-plus">＋</i></span>
      </div>
      <In d={1100} className="hw-overlay hw-sa2-wrap">
        <div className="hw-sa2" style={{ animationDelay: "4400ms", width: "100%", display: "flex", justifyContent: "center" }}>
          <div className="hw-modal hw-assign-modal">
            <div className="hw-assign-head">📌 <b>Assign a task</b><br /><span>Teacher: <b>M. Esther</b> · Period 4 · 2026-07-11</span></div>
            <div className="hw-assign-body">
              <In d={1500} className="hw-fair">● This would be M. Esther&rsquo;s first extra duty this week — a fair pick. 💪</In>
              <div className="hw-field-label" style={{ marginTop: 6 }}>What should this slot be used for? <b className="hw-req">*</b></div>
              <div className="hw-input"><span className="hw-type" style={{ ["--ch" as string]: "17ch", animationDelay: "2500ms", animationDuration: "900ms" }}>Exam invigilation</span><span className="hw-caret" /></div>
              <div className="hw-chips-row" style={{ marginTop: 6 }}>
                {["Substitution cover", "Exam invigilation", "Library duty", "Admin support"].map((c, i) => (
                  <span key={c} className={`hw-task-chip ${i === 1 ? "hw-task-chip-sel" : ""}`} data-hw={i === 1 ? "taskchip" : undefined} style={i === 1 ? { animationDelay: "2400ms" } : undefined}>{c}</span>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                <span className="hw-btn-ghost">Cancel</span>
                <span className="hw-btn-violet hw-press" data-hw="assign" style={{ animationDelay: "4100ms" }}>Assign</span>
              </div>
            </div>
          </div>
        </div>
      </In>
      <Cursor dur={5600} steps={[
        { t: '[data-hw="plus"]', at: 800, click: true, hold: 500 },
        { t: '[data-hw="taskchip"]', at: 2300, click: true, hold: 700 },
        { t: '[data-hw="assign"]', at: 4000, click: true, hold: 600 },
      ]} />
    </div>
  );
}

// ─── 14 · Substitution — staged in Calendar Day, confirmed in Live ──────
// Beats: in the Calendar Day view (Faculty lens, the same real toolbar as
// the Day scene) mark R. Naomi on leave → her lessons hatch red → Sub →
// ranked candidates → assign T. Moses → her Day row shows the covered
// blue block. Then the Live tab flashes and the board shows the same
// cover as an "On assignment" card — the substitution is visible in BOTH
// calendar and live modes, as it is in the product.
const SUB_T = { leave: 900, sub: 2100, assign: 3800, live: 5300 };
function SSub() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-live-toolbar">
        <span className="hw-tabs-pill">
          <i className="hw-flash" data-hw="livetab" style={{ animationDelay: `${SUB_T.live}ms` }}>● Live</i>
          <i className="is-on">Day</i><i>Month</i>
        </span>
        <span className="hw-tabs-pill"><i className="is-on">👥 Faculty</i><i>🎓 Classes</i><i>📖 Subjects</i><i>🏛 Venues</i></span>
        <span style={{ flex: 1 }} />
        <span className="hw-faint">Wed, 11-07-2026</span>
      </div>
      <div className="hw-swap" style={{ marginTop: 8 }}>
        {/* Calendar Day (Faculty lens) — the substitution happens here */}
        <div className="hw-sa2" style={{ animationDelay: `${SUB_T.live}ms` }}>
          <div className="hw-row-between" style={{ marginBottom: 3 }}>
            <b className="hw-swap" style={{ fontSize: 10.5 }}>
              <span className="hw-sa2" style={{ animationDelay: `${SUB_T.leave + 150}ms` }}>R. Naomi</span>
              <span style={{ color: "#DC2626", opacity: 0, animation: `hw-show 1ms linear ${SUB_T.leave + 150}ms both` }}>R. Naomi · on leave</span>
            </b>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span className="hw-leave-btn hw-press" data-hw="leave" style={{ animationDelay: `${SUB_T.leave}ms` }}>⚑ Leave</span>
              <span className="hw-sub-btn hw-press" data-hw="subbtn" style={{ animationDelay: `${SUB_T.sub}ms` }}>⇄ Sub</span>
              <span className="hw-faint">6 periods</span>
            </span>
          </div>
          <div className="hw-day-track" style={{ height: 30, marginTop: 0 }}>
            <span className="hw-day-block hw-swap" style={{ flex: 3 }}>
              <span className="hw-sa2" style={{ animationDelay: `${SUB_T.assign + 300}ms` }}>
                <span className="hw-uncover" style={{ animationDelay: `${SUB_T.leave + 150}ms` }}>X-B · French</span>
              </span>
              <In d={SUB_T.assign + 300} className="hw-covered">X-B · French — T. Moses <i>(sub)</i> ✓</In>
            </span>
            <span className="hw-day-block hw-day-lunch" style={{ flex: 2 }}>Lunch</span>
            <span className="hw-day-block" style={{ flex: 3 }}><span className="hw-uncover" style={{ animationDelay: `${SUB_T.leave + 150}ms` }}>IX-A · French</span></span>
          </div>
          {/* other faculty rows for context */}
          <div className="hw-row-between" style={{ margin: "8px 0 3px" }}><b style={{ fontSize: 10.5 }}>J. Abraham</b><span className="hw-faint">7 periods</span></div>
          <div className="hw-day-track" style={{ height: 30, marginTop: 0 }}>
            <span className="hw-day-block" style={{ flex: 3 }}>X-D · Maths</span>
            <span className="hw-day-block hw-day-lunch" style={{ flex: 2 }}>Lunch</span>
            <span className="hw-day-block" style={{ flex: 3 }}>VI-A · Maths</span>
          </div>
          <In d={SUB_T.sub + 300} className="hw-sub-panel hw-sa2-wrap">
            <div className="hw-sa2" style={{ animationDelay: `${SUB_T.assign + 300}ms` }}>
              <div className="hw-h2" style={{ fontSize: 10.5 }}>Substitute — R. Naomi · Period 2 · X-B French</div>
              {[
                ["①", "T. Moses", "Tier 1 · free now · 1 today · light week ✓", true],
                ["②", "M. Esther", "Tier 2 · free · 2 today", false],
                ["③", "D. Samuel", "Tier 2 · free · 3 today", false],
              ].map(([r, n, meta, top], i) => (
                <In key={String(n)} d={SUB_T.sub + 400 + i * 220} className={`hw-cand ${top ? "hw-cand-top" : ""}`}>
                  <b>{r} {n}</b><span className="hw-faint">{meta}</span>
                </In>
              ))}
              <In d={SUB_T.sub + 1200} style={{ textAlign: "right" }}>
                <span className="hw-btn-violet hw-press" data-hw="assignsub" style={{ animationDelay: `${SUB_T.assign}ms` }}>Assign T. Moses</span>
              </In>
            </div>
          </In>
        </div>
        {/* Live board — the same cover, visible as On assignment */}
        <div style={{ animation: `hw-show 1ms linear ${SUB_T.live}ms both`, opacity: 0 }}>
          <div className="hw-board-card" style={{ marginTop: 0 }}>
            <div className="hw-row-between" style={{ alignItems: "center", padding: "9px 14px 6px" }}>
              <b className="hw-live-clock" style={{ fontSize: 16 }}>Period 2 · live</b>
              <span className="hw-live-badge">● Live</span>
            </div>
            <div className="hw-board-body">
              <div className="hw-live-section" style={{ color: "#B45309" }}><i className="hw-sec-dot" style={{ background: "#B45309" }} />On assignment · 1</div>
              <div className="hw-ontask-card">
                <div>
                  <div className="hw-live-entity">T. Moses</div>
                  <div className="hw-ontask-title">📌 Covering X-B · French <span className="hw-faint">(for R. Naomi)</span></div>
                </div>
                <b className="hw-green">✓</b>
              </div>
              <div className="hw-live-section" style={{ color: "#DC2626", marginTop: 8 }}><i className="hw-sec-dot" style={{ background: "#DC2626" }} />On leave · 1</div>
              <span className="hw-free-chip" style={{ color: "#DC2626", borderColor: "#FECACA" }}>R. Naomi <b className="hw-load-badge" style={{ color: "#DC2626" }}>full day</b></span>
            </div>
          </div>
        </div>
      </div>
      <Cursor dur={6800} steps={[
        { t: '[data-hw="leave"]', at: 800, click: true, hold: 500 },
        { t: '[data-hw="subbtn"]', at: 2000, click: true, hold: 500 },
        { t: '[data-hw="assignsub"]', at: 3700, click: true, hold: 800 },
        { t: '[data-hw="livetab"]', at: 5200, click: true, hold: 1000 },
      ]} />
    </div>
  );
}

// ─── 15 · Print modes (PublishExportPanel + buildPrintHTML) ─────────────
function SPrint() {
  return (
    <div className="hw-scene hw-app">
      <div className="hw-dim-bg" />
      {/* Export panel — centered; slides away once the print sheet opens */}
      <div className="hw-export-panel hw-sa2" style={{ animationDelay: "2300ms" }}>
        <div className="hw-h2">Export formats</div>
        {[["📊", "Excel workbook"], ["📄", "Master data (CSV)"], ["🖨", "Print / PDF"]].map(([ic, l], i) => (
          <div key={l} className={`hw-fmt-card ${i === 2 ? "hw-fmt-sel" : ""}`} data-hw={i === 2 ? "fmtprint" : undefined} style={i === 2 ? { animationDelay: "1000ms" } : undefined}>
            <span>{ic} {l}</span>{i === 2 && <b className="hw-fmt-check" style={{ animationDelay: "1000ms" }}>✓</b>}
          </div>
        ))}
        <div className="hw-row-between" style={{ marginTop: 8 }}>
          <span className="hw-faint hw-swap" style={{ fontSize: 9 }}>
            <span className="hw-sa2" style={{ animationDelay: "1000ms" }}>Choose formats, then click Export</span>
            <In d={1000}>1 format selected</In>
          </span>
          <span className="hw-cta hw-press" data-hw="export" style={{ padding: "5px 14px", fontSize: 10, animationDelay: "2000ms" }}>Export</span>
        </div>
      </div>
      <div className="hw-center-abs">
        <In d={2300} className="hw-print-sheet">
          <div className="hw-print-head">
            <svg viewBox="0 0 52 52" width="16" height="16"><path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#000" strokeWidth="9" strokeLinecap="round" /></svg>
            <b>schedU</b> · Eden&rsquo;s Academy · Class IX-A · AY 2026–27
            <span className="hw-compact-toggle hw-flash" data-hw="compact" style={{ animationDelay: "3500ms" }}>
              <span className="hw-swap" style={{ display: "inline-grid" }}>
                <span className="hw-sa2" style={{ animationDelay: "3700ms" }}>◻ Compact</span>
                <span style={{ opacity: 0, animation: "hw-show 1ms linear 3700ms both" }}>☑ Compact</span>
              </span>
            </span>
          </div>
          <div className="hw-swap">
            {/* Full print layout — real buildPrintHTML shape: periods across, days down */}
            <div className="hw-sa2" style={{ animationDelay: "3800ms" }}>
              <div className="hw-print-table">
                <div className="hw-print-row hw-print-hrow">
                  {["", "P1 · 8:10", "P2 · 8:50", "P3 · 9:30", "P4 · 11:40", "P5 · 12:20"].map((h, i) => <span key={i}>{h}</span>)}
                </div>
                {[["Mon", ["Mathematics", "Science", "English", "French", "History"]], ["Tue", ["English", "Mathematics", "History", "Science", "French"]], ["Wed", ["Mathematics", "History", "Science", "English", "Mathematics"]], ["Thu", ["Science", "English", "Mathematics", "History", "French"]], ["Fri", ["French", "Mathematics", "History", "English", "Science"]]].map(([d, cells]) => (
                  <div key={String(d)} className="hw-print-row">
                    <span className="hw-print-day">{d}</span>
                    {(cells as string[]).map((c, i) => <span key={i}>{c}<i>{FACULTY[i % 5]}</i></span>)}
                  </div>
                ))}
              </div>
              <div className="hw-print-note">1 section / page · subject names printed as text — grayscale-safe</div>
            </div>
            {/* Paper-saving compact — short names, two sections per page */}
            <div style={{ animation: "hw-show 1ms linear 3800ms both", opacity: 0 }}>
              {["IX-A", "IX-B"].map((sec) => (
                <div key={sec} className="hw-print-table hw-print-compact" style={{ marginBottom: 6 }}>
                  <div className="hw-print-row hw-print-hrow">
                    {[sec, "P1", "P2", "P3", "P4", "P5"].map((h, i) => <span key={i}>{h}</span>)}
                  </div>
                  {[["Mon", ["Mat", "Sci", "Eng", "Fre", "His"]], ["Tue", ["Eng", "Mat", "His", "Sci", "Fre"]], ["Wed", ["Mat", "His", "Sci", "Eng", "Mat"]]].map(([d, cells]) => (
                    <div key={String(d)} className="hw-print-row">
                      <span className="hw-print-day">{d}</span>
                      {(cells as string[]).map((c, i) => <span key={i}>{c}</span>)}
                    </div>
                  ))}
                </div>
              ))}
              <div className="hw-print-note hw-green">✓ short names · 2 sections / page — half the paper</div>
            </div>
          </div>
        </In>
      </div>
      <Cursor dur={5600} steps={[
        { t: '[data-hw="fmtprint"]', at: 900, click: true, hold: 500 },
        { t: '[data-hw="export"]', at: 1900, click: true, hold: 500 },
        { t: '[data-hw="compact"]', at: 3400, click: true, hold: 1200 },
      ]} />
    </div>
  );
}

// ─── 16 · Reports & Analytics (pages/insights.tsx) ──────────────────────
function SRep() {
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
          <In key={String(l)} d={200 + i * 200} className="hw-stat-tile"><b>{v}</b><span>{l}</span></In>
        ))}
      </div>
      <div className="hw-chart-card">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#E8E4FF" />
          <path d={path} fill="none" stroke="#7C6FE0" strokeWidth="2" strokeLinecap="round" className="hw-chart-line" />
          {pts.map((c, i) => (
            <circle key={i} cx={c[0]} cy={c[1]} r={i === pts.length - 1 ? 3.5 : 2.5} fill={i === pts.length - 1 ? "#D4920E" : "#7C6FE0"} className="hw-chart-pt" style={{ animationDelay: `${900 + i * 330}ms` }} />
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
    </div>
  );
}

// ─── 17 · Brand close — the Start Now button is a REAL link ─────────────
function SClose() {
  return (
    <div className="hw-scene hw-close">
      <svg viewBox="0 0 52 52" className="hw-close-mark" aria-hidden="true">
        <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" className="hw-u-path" />
        <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" className="hw-u-knob" />
      </svg>
      <In d={1800} className="hw-close-h">Add life to your schedules, <i style={{ color: "#B9AFF0" }}>smartly.</i></In>
      <In d={2400}>
        <a href={appHref("/register")} className="hw-close-cta" data-hw="cta">Start Now — free, no credit card</a>
      </In>
      <In d={3100} className="hw-close-sub">This button is real. So is the product.</In>
      <Cursor dur={7000} steps={[
        { t: '[data-hw="cta"]', at: 3200, hold: 3600 },
      ]} />
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────
const CSS = `
.hw-wrap { width: 100%; padding: 14px clamp(10px,1.6vw,28px) 0; font-family: 'Plus Jakarta Sans', sans-serif; }
.hw-frame { border-radius: 14px; overflow: hidden; box-shadow: 0 30px 90px rgba(124,111,224,0.28), 0 0 0 1px #ECE9FB; background: #fff; }
.hw-chrome { display: flex; align-items: center; gap: 5px; padding: 8px 12px; background: #F4F2FE; border-bottom: 1px solid #ECE9FB; }
.hw-dot { width: 9px; height: 9px; border-radius: 50%; }
.hw-url { flex: 1; text-align: center; font: 500 10.5px 'DM Mono', monospace; color: #6B7280; background: #fff; border-radius: 6px; padding: 3px 10px; margin: 0 12px; }
.hw-chrome-right { font-size: 9px; color: #9CA3AF; letter-spacing: 2px; }
.hw-stage { position: relative; height: clamp(430px, calc(100dvh - 235px), 640px); background: #FAFAFE; overflow: hidden; }
/* Chapter chip — tells a first-time viewer exactly which product screen
   this scene is, and where we are in the story. */
.hw-chapter {
  position: absolute; top: 10px; left: 12px; z-index: 20;
  display: inline-flex; align-items: center; gap: 7px;
  background: #13111E; color: #fff; border-radius: 999px; padding: 5px 13px 5px 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.01em;
  box-shadow: 0 6px 18px rgba(19,17,30,0.25);
  animation: hw-chapter-in 0.45s cubic-bezier(.2,.9,.3,1.1) both;
}
.hw-chapter b { display: inline-flex; align-items: baseline; background: #D4920E; color: #13111E; border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 800; }
.hw-chapter b i { font-style: normal; font-weight: 700; font-size: 8.5px; opacity: 0.65; }
@keyframes hw-chapter-in { 0%{ opacity: 0; transform: translateY(-8px); } 100%{ opacity: 1; transform: translateY(0); } }
.hw-caption { margin: 14px 0 8px; text-align: center; font: 700 clamp(15px,2.2vw,19px)/1.35 'Plus Jakarta Sans', sans-serif; color: #13111E; animation: hw-cap-in 0.4s ease both; }
@keyframes hw-cap-in { 0%{opacity:0; transform:translateY(5px)} 100%{opacity:1; transform:translateY(0)} }
.hw-dots { display: flex; justify-content: center; gap: 5px; padding-bottom: 6px; flex-wrap: wrap; }
.hw-seg { width: 24px; height: 4px; border-radius: 2px; background: #E4E0F5; border: none; padding: 0; cursor: pointer; overflow: hidden; }
.hw-seg.is-past { background: #C9C0F0; }
.hw-seg-fill { display: block; height: 100%; width: 0; background: #7C6FE0; }
.hw-seg.is-on .hw-seg-fill { animation-name: hw-fill; animation-timing-function: linear; animation-fill-mode: both; }
.hw-seg.is-past .hw-seg-fill { width: 100%; background: #C9C0F0; }
@keyframes hw-fill { 0%{width:0} 100%{width:100%} }

/* Entrance is opacity-only: a transform here would skew the cursor's
   target measurements taken during the first frames. */
/* Content width is capped and centered; the JS auto-fit then zooms the
   whole scene until it fills the stage height — big, slide-like, readable.
   Extra top padding keeps content clear of the chapter chip. */
.hw-scene { position: absolute; top: 0; bottom: 0; left: 0; right: 0; margin: 0 auto; max-width: 1020px; padding: clamp(44px,6vh,54px) clamp(14px,2vw,26px) clamp(14px,2vh,22px); animation: hw-scene-in 0.55s cubic-bezier(.22,.9,.3,1) both; overflow: hidden; }
@keyframes hw-scene-in { 0%{ opacity: 0; transform: translateY(10px) scale(0.992); filter: blur(2px); } 100%{ opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
.hw-app { background: transparent; }

/* primitives */
.hw-in { opacity: 0; animation: hw-in 0.4s cubic-bezier(.2,.9,.3,1.05) both; }
@keyframes hw-in { 0%{opacity:0; transform: translateY(7px)} 100%{opacity:1; transform: translateY(0)} }
@keyframes hw-show { to { opacity: 1; visibility: visible; } }
@keyframes hw-hide { to { opacity: 0; visibility: hidden; } }
.hw-swap { display: grid; }
.hw-swap > * { grid-area: 1 / 1; }
.hw-sa2 { animation: hw-hide 1ms linear both; }
.hw-sa2-wrap > .hw-sa2 { width: 100%; }
.hw-press { animation-name: hw-press; animation-duration: 300ms; animation-fill-mode: both; }
@keyframes hw-press { 0%,100%{ transform: scale(1);} 45%{ transform: scale(0.93);} }
.hw-flash { animation-name: hw-flash-k; animation-duration: 500ms; animation-fill-mode: both; }
@keyframes hw-flash-k { 0%,100%{ box-shadow: none; } 40%{ box-shadow: 0 0 0 3px rgba(124,111,224,0.35); } }
.hw-type { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation-name: hw-type-k; animation-timing-function: steps(12); animation-fill-mode: both; }
@keyframes hw-type-k { to { width: var(--ch); } }
.hw-caret { display: inline-block; width: 1.5px; height: 0.9em; background: #7C6FE0; vertical-align: -0.1em; animation: hw-caret-k 0.9s steps(1) infinite; }
@keyframes hw-caret-k { 0%,49%{opacity:1} 50%,100%{opacity:0} }

.hw-cursor { position: absolute; left: 0; top: 0; width: 18px; height: 18px; z-index: 9; pointer-events: none; opacity: 0; }
.hw-cur-glyphs { position: relative; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); }
.hw-cur-hand { position: absolute; left: 0; top: 0; font-size: 14px; opacity: 0; visibility: hidden; }
.hw-ring { position: absolute; left: -5px; top: -5px; width: 15px; height: 15px; border-radius: 50%; border: 2px solid #D4920E; opacity: 0; animation: hw-ring-k 500ms ease-out both; }
@keyframes hw-ring-k { 0%{opacity:0; transform:scale(.3)} 25%{opacity:.9; transform:scale(1)} 100%{opacity:0; transform:scale(2.4)} }
.hw-fly { position: absolute; left: 0; top: 0; z-index: 8; pointer-events: none; opacity: 0; }
.hw-fly-chip { font-size: 9px; font-weight: 700; color: #13111E; background: #EDE9FF; border: 1.5px solid #7C6FE0; border-radius: 6px; padding: 3px 9px; box-shadow: 0 8px 20px rgba(19,17,30,0.25); }

/* text/ui atoms */
.hw-h1 { font-size: 15px; font-weight: 700; color: #13111E; letter-spacing: -0.2px; }
.hw-h2 { font-size: 12px; font-weight: 700; color: #13111E; }
.hw-sub { font-size: 9.5px; color: #6B7280; }
.hw-faint { font-size: 9px; color: #9CA3AF; }
.hw-mono { font-family: 'DM Mono', monospace; }
.hw-green { color: #059669; }
.hw-req { color: #EF4444; }
.hw-row-between { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.hw-cta { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 9px; background: linear-gradient(135deg,#7C6FE0,#5D4FCF); color: #fff; font-size: 10.5px; font-weight: 700; box-shadow: 0 4px 12px rgba(124,111,224,0.28); border: none; }
.hw-gen-btn { cursor: pointer; font-family: inherit; padding: 10px 22px; font-size: 12px; }
.hw-try-hint { font-size: 8.5px; color: #B49BE0; font-weight: 600; }
.hw-btn-ink { padding: 6px 12px; border-radius: 7px; background: #13111E; color: #fff; font-size: 9.5px; font-weight: 700; }
.hw-btn-ghost { padding: 5px 11px; border-radius: 7px; border: 1px solid #D1D5DB; background: #fff; color: #374151; font-size: 9.5px; font-weight: 600; }
.hw-btn-violet { padding: 5px 11px; border-radius: 7px; background: #7C6FE0; color: #fff; font-size: 9px; font-weight: 700; }
.hw-btn-amber { padding: 5px 11px; border-radius: 7px; border: 1.5px solid #FDE68A; background: #FFFBEB; color: #92400E; font-size: 9.5px; font-weight: 700; }
.hw-input { border: 1px solid #D1D5DB; border-radius: 7px; padding: 6px 9px; font-size: 10px; color: #13111E; background: #fff; }
.hw-field-label { font-size: 9px; font-weight: 600; color: #374151; margin-bottom: 3px; }
.hw-hint { font-size: 7.5px; color: #9CA3AF; margin-top: 2px; }
.hw-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; padding: 16px; }
.hw-modal { background: #fff; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 20px 60px rgba(0,0,0,0.2); padding: 16px 18px; width: min(340px, 92%); }
.hw-chips-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.hw-board-chip { padding: 4px 11px; border-radius: 6px; font-size: 9.5px; font-weight: 500; border: 1.5px solid #D1D5DB; color: #374151; background: #fff; }
.hw-board-on { background: #059669; border-color: #059669; color: #fff; }
.hw-note-box { background: #F5F3FF; border: 1px solid #DDD8FF; border-radius: 7px; padding: 6px 9px; font-size: 8.5px; color: #5B52A8; margin-bottom: 8px; }
.hw-nums-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.hw-num-input { border: 1px solid #E5E7EB; border-radius: 7px; background: #fff; padding: 7px 0; font-size: 16px; font-weight: 700; color: #13111E; text-align: center; min-height: 32px; }
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
.hw-wizard { display: grid; grid-template-columns: 130px 1fr; gap: 12px; }
.hw-side { display: flex; flex-direction: column; gap: 4px; }
.hw-side-item { display: flex; justify-content: space-between; padding: 6px 9px; border-radius: 7px; font-size: 9.5px; color: #4B5275; background: #fff; border: 1px solid #EFEDF9; }
.hw-side-item.is-on { background: #F5F3FF; border-color: #DDD8FF; color: #5B52A8; font-weight: 700; }
.hw-panel { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
.hw-table-head, .hw-table-row { display: grid; grid-template-columns: 1.3fr 0.9fr 0.7fr 1fr; gap: 6px; font-size: 9px; padding: 4px 2px; }
.hw-table-head { font-weight: 700; color: #8B87AD; text-transform: uppercase; font-size: 7.5px; border-bottom: 1px solid #F3F4F6; }
.hw-table-row { color: #13111E; border-bottom: 1px solid #FAFAFA; }
.hw-ai-pill { font-size: 8.5px; font-weight: 600; color: #5B52A8; margin-top: 6px; }
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
.hw-center-col { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.hw-preflight { font-size: 10px; color: #15803D; font-weight: 600; }
.hw-solve { width: min(460px, 94%); background: #fff; border: 1px solid #E5E7EB; border-radius: 14px; padding: 14px 16px; box-shadow: 0 18px 50px rgba(124,111,224,0.12); }
.hw-ring-row { display: flex; align-items: center; gap: 12px; }
.hw-ring-arc { animation: hw-ring-fill 3200ms cubic-bezier(.4,0,.4,1) both; }
@keyframes hw-ring-fill { 0%{ stroke-dashoffset: 113; } 100%{ stroke-dashoffset: 3; } }
.hw-solve-labels { position: relative; flex: 1; height: 16px; text-align: left; }
.hw-solve-label { position: absolute; left: 0; top: 0; font-size: 10px; font-weight: 600; color: #4B5275; opacity: 0; animation: hw-label-k 720ms linear both; white-space: nowrap; }
@keyframes hw-label-k { 0%{opacity:0} 10%,88%{opacity:1} 100%{opacity:0} }
.hw-feed { margin-top: 8px; text-align: left; display: flex; flex-direction: column; gap: 3px; }
.hw-feed-line { font-size: 9px; color: #374151; font-family: 'DM Mono', monospace; }
.hw-done-row { display: flex; flex-direction: column; align-items: center; gap: 9px; }
.hw-done-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.hw-done-stat { font-size: 9.5px; font-weight: 600; color: #6B7280; background: #fff; border: 1px solid #ECE9FB; border-radius: 999px; padding: 5px 11px; }
.hw-done-stat b { color: #13111E; font-family: 'DM Mono', monospace; margin-right: 3px; }
.hw-conflict-pill { display: inline-flex; align-items: center; gap: 6px; background: #13111E; color: #fff; font-size: 11px; font-weight: 800; border-radius: 999px; padding: 7px 16px; }
.hw-conflict-pill i { width: 8px; height: 8px; border-radius: 50%; background: #D4920E; }

/* timetable + views tour */
.hw-draft-chip { font-size: 8.5px; font-weight: 600; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
.hw-vtoolbar { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 7px 12px; flex-wrap: wrap; }
.hw-vtabs { display: flex; flex: 1; }
.hw-vtab { position: relative; padding: 4px 12px 6px; font-size: 10px; font-weight: 600; color: #64748b; }
.hw-vtab-line { position: absolute; left: 8px; right: 8px; bottom: 0; height: 2.5px; background: #1e293b; border-radius: 2px; opacity: 0; }
.hw-tt-grid { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 8px 10px; }
.hw-tt-row { display: grid; grid-template-columns: 78px repeat(5, 1fr); gap: 4px; padding: 2px 0; }
.hw-tt-head { font-size: 8px; font-weight: 700; color: #8B87AD; text-transform: uppercase; text-align: center; }
.hw-tt-head span:first-child { text-align: left; }
.hw-tt-p { font-size: 8.5px; font-weight: 700; color: #374151; align-self: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hw-tt-cell { border-radius: 6px; padding: 5px 6px; text-align: center; position: relative; }
.hw-tt-cell b { display: block; font-size: 8.5px; color: #13111E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hw-tt-cell i { display: block; font-style: normal; font-size: 7px; color: #4B5275; }
.hw-tt-free { border: 1px dashed #E8E4FF; }
.hw-tt-free b { color: #C4C0DC; }
.hw-tt-lunch { text-align: center; font-size: 8px; font-weight: 700; color: #D97706; background: #FEF3C7; border-radius: 6px; padding: 3px; margin: 2px 0; }

/* dnd */
.hw-edit-chip { font-size: 8px; font-weight: 700; color: #7C6FE0; background: #EDE9FF; border-radius: 6px; padding: 2px 7px; margin-left: 6px; }
.hw-dnd-grid .hw-tt-row { grid-template-columns: 56px repeat(4, 1fr); }
.hw-dnd-grid .hw-tt-cell { min-height: 34px; display: flex; align-items: center; justify-content: center; }
.hw-dnd-grid .hw-tt-cell b { width: 100%; }
.hw-dnd-grid .hw-tt-cell b i { display: block; font-style: normal; font-size: 7px; font-weight: 500; color: #4B5275; }
.hw-dnd-src b, .hw-dnd-tgt b { border-radius: 5px; padding: 3px 0; }
.hw-dnd-empty { display: block; width: 100%; height: 26px; border: 1.5px dashed #C4B5FD; border-radius: 5px; background: #FAFAFE; }
.hw-dnd-tgt { border: 1.5px dashed #C4B5FD; }
.hw-dnd-ok { font-style: normal; font-size: 8px; font-weight: 700; color: #059669; }
.hw-dnd-landed { animation-name: hw-show, hw-land-k !important; animation-duration: 1ms, 450ms !important; animation-fill-mode: both, both !important; }
@keyframes hw-land-k { 0%{ box-shadow: 0 0 0 0 rgba(5,150,105,0.5); } 100%{ box-shadow: 0 0 0 8px rgba(5,150,105,0); } }
.hw-dnd-bad { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: repeating-linear-gradient(45deg, #FEE2E2, #FEE2E2 4px, #fff 4px, #fff 8px); border: 1.5px solid #FCA5A5; border-radius: 6px; }
.hw-dnd-bad b { color: #DC2626 !important; background: none !important; font-size: 8px; }
.hw-toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: #13111E; color: #fff; font-size: 9.5px; font-weight: 700; border-radius: 999px; padding: 6px 14px; }
.hw-more-row { font-size: 8.5px; font-weight: 600; color: #5B52A8; background: #F5F3FF; border-radius: 6px; padding: 4px 8px; margin-top: 4px; }
.hw-ontask-card { display: flex; justify-content: space-between; align-items: center; background: #FFFBF3; border: 1.5px dashed #E5C078; border-radius: 12px; padding: 9px 12px; }
.hw-ontask-title { font-size: 10.5px; font-weight: 800; color: #B45309; margin-top: 2px; }
.hw-drag-hint { position: absolute; top: -18px; left: 0; transform: translateX(-50%); font-style: normal; font-size: 8.5px; font-weight: 800; color: #7C6FE0; white-space: nowrap; opacity: 0; animation: hw-hint-k 1.4s ease 2 both; }
@keyframes hw-hint-k { 0%,100%{ opacity: 0; } 30%,70%{ opacity: 1; } }

/* workload */
.hw-load-card { background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 14px; margin-top: 8px; }
.hw-load-row { display: grid; grid-template-columns: 110px 1fr 52px; gap: 8px; align-items: center; padding: 3px 0; }
.hw-load-name { font-size: 9px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hw-load-track { height: 10px; border-radius: 5px; background: #F4F2FE; overflow: hidden; }
.hw-load-bar { display: block; height: 100%; border-radius: 5px; width: var(--w0); animation: hw-bar-k 900ms cubic-bezier(.4,0,.3,1) both; }
@keyframes hw-bar-k { from { width: var(--w0); } to { width: var(--w1); background: #7C6FE0; } }
.hw-load-std { font-size: 9px; font-weight: 700; color: #B45309; }

/* print/export */
.hw-dim-bg { display: none; }
.hw-export-panel { position: relative; width: min(300px, 60%); margin: 14px auto 0; background: #fff; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 16px 50px rgba(0,0,0,0.18); padding: 12px 14px; }
.hw-fmt-card { display: flex; justify-content: space-between; align-items: center; border: 1.5px solid #E5E7EB; border-radius: 8px; padding: 7px 10px; font-size: 9.5px; font-weight: 600; color: #374151; margin-top: 6px; }
.hw-fmt-sel { animation: hw-fmt-sel-k 300ms ease both; }
@keyframes hw-fmt-sel-k { to { border-color: #7C6FE0; background: #F5F3FF; } }
.hw-fmt-check { color: #7C6FE0; opacity: 0; animation: hw-show 1ms linear both; }
.hw-export-panel.hw-sa2 { animation-name: hw-panel-away; animation-duration: 400ms; animation-timing-function: ease; }
@keyframes hw-panel-away { to { opacity: 0; visibility: hidden; transform: translateY(-14px); } }
/* Print sheet — centered via flex wrapper (transform-free, so the hw-in
   entrance animation can't knock it off-center) and large: the payoff. */
.hw-center-abs { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; pointer-events: none; }
.hw-print-sheet { width: min(560px, 86%); background: #fff; border: 1px solid #D1D5DB; outline: 2.5px dashed #CBD5E1; outline-offset: 8px; border-radius: 5px; padding: 16px 18px; box-shadow: 0 28px 70px rgba(0,0,0,0.3); }
.hw-print-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #000; border-bottom: 1.5px solid #000; padding-bottom: 8px; margin-bottom: 9px; }
.hw-compact-toggle { margin-left: auto; font-size: 9.5px; font-weight: 700; color: #374151; border: 1px solid #D1D5DB; border-radius: 6px; padding: 3px 9px; }
.hw-print-table { border: 1px solid #6B7280; }
.hw-print-row { display: grid; grid-template-columns: 0.6fr repeat(5, 1fr); }
.hw-print-row span { border: 0.5px solid #9CA3AF; font-size: 8.5px; color: #111; text-align: center; padding: 5px 2px; overflow: hidden; }
.hw-print-row span i { display: block; font-style: normal; font-size: 7px; color: #4B5563; }
.hw-print-hrow span { font-weight: 700; background: #F3F4F6; font-family: 'DM Mono', monospace; font-size: 8px; }
.hw-print-day { font-weight: 700; background: #F9FAFB; }
.hw-print-compact .hw-print-row span { padding: 2.5px 2px; font-size: 7.5px; }
.hw-print-compact .hw-print-row span i { display: none; }
.hw-print-note { font-size: 9.5px; color: #6B7280; margin-top: 8px; text-align: center; }

/* live / calendar */
.hw-live-toolbar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.hw-nav-btn { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #E5E7EB; border-radius: 7px; background: #fff; font-size: 11px; color: #4B5275; }
.hw-date-box { font-size: 9px; font-weight: 700; color: #13111E; border: 1px solid #E5E7EB; border-radius: 7px; background: #fff; padding: 3px 8px; }
.hw-tabs-pill { display: inline-flex; gap: 2px; background: #F4F2FE; border-radius: 9px; padding: 2px; }
.hw-tabs-pill i { font-style: normal; font-size: 8px; font-weight: 700; color: #6B7280; padding: 3px 7px; border-radius: 7px; }
.hw-tabs-pill i.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 1px 3px rgba(19,17,30,0.1); }
.hw-filter-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.hw-filter-chip { font-size: 8px; font-weight: 700; color: #2563EB; background: #fff; border: 1.5px solid #BFDBFE; border-radius: 8px; padding: 3px 8px; }
.hw-filter-chip.is-on { background: #1E3A8A; color: #fff; border-color: #1E3A8A; }
.hw-live-note { font-size: 8px; color: #4F46E5; font-weight: 500; }
.hw-live-clock { font-size: 20px; color: #13111E; font-weight: 800; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.hw-live-clock > * { grid-area: 1/1; white-space: nowrap; }
.hw-live-badge { font-size: 10.5px; font-weight: 700; color: #16A34A; }
.hw-now-btn { font-size: 10.5px; font-weight: 700; color: #7C6FE0; background: #fff; border: 1px solid #E3DEF7; border-radius: 8px; padding: 4px 11px; }
/* The real LiveBoard card + MomentScrubber (calendar.tsx 1458-1742) */
.hw-board-card { background: #fff; border: 1px solid #ECE9FB; border-radius: 14px; overflow: hidden; margin-top: 6px; }
.hw-board-body { border-top: 1px solid #F2F0FB; padding: 8px 14px 10px; background: #FBFAFF; }
.hw-scrub-track { position: relative; height: 44px; border-radius: 12px; background: #F4F2FE; border: 1px solid #ECE9FB; display: flex; gap: 2px; padding: 6px 0; }
.hw-scrub-band { display: flex; flex-direction: column; border-radius: 5px; overflow: hidden; border: 1px solid rgba(19,17,30,0.07); }
.hw-scrub-band i { display: block; }
.hw-scrub-hr { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(19,17,30,0.14); pointer-events: none; }
.hw-scrub-nowtick { position: absolute; top: 0; bottom: 0; width: 2px; background: #EF4444; opacity: 0.5; pointer-events: none; }
.hw-playhead { position: absolute; top: 0; bottom: 0; width: 0; }
.hw-playhead-drag { position: absolute; inset: 0; animation: hw-scrub-k 9600ms cubic-bezier(.45,0,.25,1) both; }
@keyframes hw-scrub-k { 0%,16%{ transform: translateX(0); } 27%{ transform: translateX(120px); } 34%{ transform: translateX(120px); } 46%{ transform: translateX(-90px); } 65%,79%{ transform: translateX(-90px); } 84%,100%{ transform: translateX(0); } }
.hw-ph-line { position: absolute; top: -3px; bottom: -3px; left: -1.5px; width: 3px; background: #7C6FE0; border-radius: 3px; box-shadow: 0 0 0 3px rgba(124,111,224,0.18); }
.hw-ph-knob { position: absolute; top: 50%; left: 0; transform: translate(-50%, -50%); width: 15px; height: 15px; border-radius: 50%; background: #7C6FE0; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(124,111,224,0.4); }
.hw-hours { position: relative; display: flex; justify-content: space-between; margin-top: 4px; font-size: 9px; font-weight: 700; color: #A9A4C8; padding: 0 2px; }
.hw-legend { display: flex; gap: 14px; margin: 5px 0 2px; }
.hw-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: #8B87AD; }
.hw-legend i { width: 10px; height: 10px; border-radius: 3px; border: 1px solid rgba(19,17,30,0.08); }
.hw-live-section { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 8px; }
.hw-sec-dot { width: 7px; height: 7px; border-radius: 4px; }
.hw-live-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.hw-live-card { display: flex; align-items: center; gap: 9px; background: #fff; border: 1px solid #ECE9FB; border-radius: 13px; padding: 6px 10px; }
.hw-ring-wrap { position: relative; width: 36px; height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.hw-ring-wrap svg { width: 36px; height: 36px; }
.hw-ring-wrap b { position: absolute; font-size: 9.5px; font-weight: 800; }
.hw-live-entity { font-size: 10.5px; font-weight: 700; color: #9A95BC; margin-bottom: 1px; }
.hw-live-subj { display: inline-block; font-size: 10px; font-weight: 800; border-radius: 6px; padding: 1.5px 8px; margin: 1px 0; white-space: nowrap; }
.hw-live-teacher { font-size: 9.5px; color: #6B7280; margin-top: 2px; }
.hw-free-chip { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #ECE9FB; border-radius: 8px; padding: 5px 11px; font-size: 10.5px; font-weight: 600; color: #6B7280; }
.hw-load-badge { font-size: 9px; font-weight: 800; background: #F6F4FD; padding: 1px 6px; border-radius: 6px; }
.hw-sort-seg { display: inline-flex; gap: 2px; padding: 2px; background: #F1EEFB; border-radius: 8px; }
.hw-sort-seg i { font-style: normal; font-size: 9px; font-weight: 700; color: #8B87AD; padding: 3px 9px; border-radius: 6px; }
.hw-sort-seg i.is-on { background: #fff; color: #7C6FE0; box-shadow: 0 1px 4px rgba(124,111,224,0.18); }
.hw-plus { font-style: normal; color: #B5B0CF; font-weight: 800; }
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
.hw-chart-line { stroke-dasharray: 400; stroke-dashoffset: 400; animation: hw-chart-k 2000ms ease 900ms both; }
@keyframes hw-chart-k { to { stroke-dashoffset: 0; } }
.hw-chart-pt { opacity: 0; animation: hw-show 1ms linear both; }
.hw-chart-tip { opacity: 0; animation: hw-show 200ms ease 2950ms both; }

/* close */
.hw-close { max-width: none; background: radial-gradient(120% 140% at 50% -10%, #232048 0%, #13111E 60%, #0B0A14 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
.hw-close-mark { width: 64px; height: 64px; }
.hw-u-path { stroke-dasharray: 80; stroke-dashoffset: 80; animation: hw-u-k 1400ms ease 500ms both; }
@keyframes hw-u-k { to { stroke-dashoffset: 0; } }
.hw-u-knob { opacity: 0; animation: hw-knob-k 300ms cubic-bezier(.2,.9,.3,1.4) 1900ms both; }
@keyframes hw-knob-k { 0%{opacity:0; transform: scale(0.3); transform-origin: 36px 12.5px;} 100%{opacity:1; transform: scale(1);} }
.hw-close-h { font-size: clamp(15px, 2.4vw, 22px); font-weight: 400; color: #fff; text-align: center; max-width: 380px; }
.hw-close-cta { display: inline-block; background: #D4920E; color: #13111E; font-weight: 800; font-size: 13px; padding: 11px 26px; border-radius: 9px; box-shadow: 0 0 34px rgba(212,146,14,0.4); text-decoration: none; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
.hw-close-cta:hover { transform: translateY(-2px); box-shadow: 0 0 44px rgba(212,146,14,0.55); }
.hw-close-sub { font-size: 9.5px; color: rgba(255,255,255,0.45); font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .hw-scene, .hw-caption, .hw-chapter { animation: none !important; }
  .hw-in { animation: none !important; opacity: 1 !important; transform: none !important; }
  .hw-sa2 { animation: none !important; opacity: 0 !important; visibility: hidden !important; }
  .hw-cursor, .hw-ring, .hw-caret, .hw-fly { display: none !important; }
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
  .hw-load-bar { animation: none !important; width: var(--w1) !important; background: #7C6FE0 !important; }
  .hw-vtab-line { animation: none !important; }
  .hw-vtab:first-child .hw-vtab-line { opacity: 1 !important; }
  .hw-drag-hint { display: none !important; }
  .hw-dnd-landed { animation: none !important; opacity: 1 !important; }
  .hw-export-panel.hw-sa2 { animation: none !important; opacity: 0 !important; visibility: hidden !important; }
  .hw-stage [style*="hw-show"], .hw-stage [style*="hw-hide"] { animation: none !important; }
}
@media (max-width: 720px) {
  .hw-cursor, .hw-fly { display: none; }
  .hw-cards3, .hw-stat-tiles, .hw-live-grid { grid-template-columns: repeat(2, 1fr); }
  .hw-wizard { grid-template-columns: 1fr; }
  .hw-side { flex-direction: row; flex-wrap: wrap; }
  .hw-print-sheet { position: relative; right: auto; top: auto; width: 90%; margin: 10px auto 0; }
  .hw-export-panel { width: 90%; margin: 8px auto 0; }
}
`;
