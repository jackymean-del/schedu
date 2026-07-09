"use client";

import { useEffect, useState } from "react";
import { useInView } from "./useInView";

/**
 * The hero movie — full-width, responsive, autoplaying scene-by-scene cut
 * through the whole product story, sitting directly below the nav. Replaces
 * the 11-giant-scroll-section approach: the "movie" now lives compactly in
 * one prominent hero, and normal-density sections follow below it.
 *
 * Corrected mechanics (previously wrong in this file):
 *  - AND = true parallel: multiple subjects/teachers/venues/sections at the
 *    SAME slot, crossing section/stream/block/timetable boundaries.
 *  - OR  = competitive single-slot allocation: only ONE of the OR subjects
 *    occupies the slot at a time, decided by which needs more period
 *    coverage — never a simultaneous split.
 *  - "Pulse" (the live indicator) now includes a genuinely real, ticking
 *    wall-clock, clearly labeled as real time — separate from the
 *    illustrative schedule data around it, so nothing here implies fake
 *    live customer data while still proving the indicator is truly live.
 */

const TEACHERS = ["Mr. Rao", "Ms. Iyer", "Mr. Das", "Mrs. Paul"];
const VENUES = ["R-12", "Lab-1", "R-04", "R-08"];
const SUBJECTS = ["Maths", "Science", "English", "Social Sci."];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PERIODS = ["P1", "P2", "P3", "P4"];
const HOURS = ["9 AM", "10 AM", "11 AM", "12 PM"];
const CLASS_ROWS = ["I-A", "I-B", "I-C", "I-D", "I-E"];
const TINTS: Record<string, string> = { Maths: "#EDE9FF", Science: "#DBEAFE", English: "#DCFCE7", "Social Sci.": "#FCE7F3" };

const CLASS_GRID = PERIODS.map((_, r) =>
  DAYS.map((_, c) => ({
    subject: SUBJECTS[(r + c) % 4],
    teacher: TEACHERS[(r + c * 2) % 4],
    venue: VENUES[(r * 2 + c) % 4],
  }))
);
const WED_CLASSES: Record<string, { subject: string; teacher: string; venue: string }[]> = {
  "IX-A": [
    { subject: "Maths", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Science", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "English", teacher: "Mr. Das", venue: "R-04" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
  ],
  "IX-B": [
    { subject: "Science", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "Maths", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "English", teacher: "Mr. Das", venue: "R-04" },
  ],
  "X-A": [
    { subject: "English", teacher: "Mrs. Paul", venue: "R-08" },
    { subject: "Social Sci.", teacher: "Mr. Rao", venue: "R-12" },
    { subject: "Maths", teacher: "Ms. Iyer", venue: "Lab-1" },
    { subject: "Social Sci.", teacher: "Mrs. Paul", venue: "R-08" },
  ],
};
const CLASS_NAMES = Object.keys(WED_CLASSES);
function teacherRow(t: string) { return PERIODS.map((_, p) => { for (const c of CLASS_NAMES) { const e = WED_CLASSES[c][p]; if (e.teacher === t) return { cls: c, ...e }; } return null; }); }
function venueRow(v: string) { return PERIODS.map((_, p) => { for (const c of CLASS_NAMES) { const e = WED_CLASSES[c][p]; if (e.venue === v) return { cls: c, ...e }; } return null; }); }
function subjectRow(s: string) { return PERIODS.map((_, p) => CLASS_NAMES.filter((c) => WED_CLASSES[c][p].subject === s).map((c) => ({ cls: c, ...WED_CLASSES[c][p] }))); }

const AND_LANES = [
  { subject: "Physics", teacher: "Mr. Rao", venue: "Lab-1", scope: "XI-Sci-A", tag: "Cross-section" },
  { subject: "Chemistry", teacher: "Ms. Nair", venue: "Lab-2", scope: "XI-Sci-B", tag: "Cross-stream" },
  { subject: "Economics", teacher: "Mr. Khan", venue: "R-12", scope: "XI-Com-A", tag: "Cross-block" },
];
const OR_STATES = [
  { subject: "Physics", reason: "Needs 2 more periods this week" },
  { subject: "Chemistry", reason: "Took the slot — Physics is caught up" },
];

const UNIQUE_BADGES = [
  "Cross-timetable clash detection",
  "Directory auto-links repeated names",
  "Staggered breaks, per grade",
  "Transpose any view, instantly",
];

type SceneKey = "input" | "combine" | "calendar" | "class" | "teacher" | "room" | "subject" | "assign" | "views" | "live" | "done";
const SCENES: { key: SceneKey; label: string; dur: number }[] = [
  { key: "input", label: "You type a name once — it links itself everywhere", dur: 3400 },
  { key: "combine", label: "Type the rule. Watch it resolve.", dur: 4400 },
  { key: "calendar", label: "Click Day. Filter schedules. Swap a teacher.", dur: 4600 },
  { key: "class", label: "See it by class", dur: 2200 },
  { key: "teacher", label: "See it by teacher", dur: 2200 },
  { key: "room", label: "See it by room", dur: 2200 },
  { key: "subject", label: "See it by subject — parallel, automatically", dur: 2400 },
  { key: "assign", label: "Pick a duty. Type a note. Assign — fairly.", dur: 4400 },
  { key: "views", label: "Same schedule. Screen or paper.", dur: 2800 },
  { key: "live", label: "Drag the clock. Cover the gap.", dur: 4400 },
  { key: "done", label: "Zero conflicts. Click publish.", dur: 3400 },
];

export function HeroMovie() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSceneIdx(SCENES.length - 1); return; }
    let cancelled = false;
    let i = 0;
    function tick() {
      if (cancelled) return;
      const t = setTimeout(() => {
        if (cancelled) return;
        i = (i + 1) % SCENES.length;
        setSceneIdx(i);
        tick();
      }, SCENES[i].dur);
      return t;
    }
    const first = tick();
    return () => { cancelled = true; if (first) clearTimeout(first); };
  }, [inView]);

  const scene = SCENES[sceneIdx];
  const clockStr = now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";

  return (
    <div ref={ref} className="hm-wrap">
      <div className="hm-stage">
        <div className="hm-vignette" />
        <svg key={`u-${sceneIdx}`} className="hm-u-watermark" viewBox="0 0 52 52" aria-hidden="true">
          <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
          <circle cx={36} cy={12.5} r={4.5} fill="#D4920E" />
        </svg>
        <div className="hm-rec"><span className="hm-rec-dot" />Product demo — user POV</div>
        <div className="hm-realclock" title="This clock is genuinely live — the schedule data around it is illustrative">
          <span className="hm-realclock-dot" />{clockStr}
        </div>

        <div key={sceneIdx} className="hm-scene">
          {scene.key === "input" && <SceneInput />}
          {scene.key === "combine" && <SceneCombine inView={inView} />}
          {scene.key === "calendar" && <SceneCalendarDay />}
          {(scene.key === "class" || scene.key === "teacher" || scene.key === "room" || scene.key === "subject") && (
            <SceneGrid kind={scene.key} inView={inView} />
          )}
          {scene.key === "assign" && <SceneTaskAssign />}
          {scene.key === "views" && <SceneViews />}
          {scene.key === "live" && <SceneLive />}
          {scene.key === "done" && <SceneDone />}
        </div>

        <div className="hm-badges">
          {UNIQUE_BADGES.map((b, i) => (
            <span key={b} className={`hm-badge ${i === sceneIdx % UNIQUE_BADGES.length ? "is-lit" : ""}`}>{b}</span>
          ))}
        </div>

        <div className="hm-chrome">
          <div key={`t-${sceneIdx}`} className="hm-subtitle">{scene.label}</div>
          <div className="hm-scrub">
            {SCENES.map((s, i) => (
              <span key={s.key} className="hm-seg">
                <span className={`hm-seg-fill ${i === sceneIdx && inView ? "is-playing" : ""} ${i < sceneIdx ? "is-done" : ""}`} style={{ animationDuration: `${s.dur}ms` }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .hm-wrap { width: 100%; }
        .hm-stage {
          position: relative; width: 100%; overflow: hidden;
          /* Full-bleed cinematic cover. Height is capped to the viewport
             (minus the ~58px nav) so the bottom subtitle + scrubber are
             never pushed under the fold. */
          height: clamp(480px, calc(100dvh - 60px), 660px);
          background: radial-gradient(120% 140% at 50% -10%, #232048 0%, #13111E 55%, #0B0A14 100%);
          border-radius: 0;
        }
        .hm-u-watermark {
          position: absolute; right: 20px; bottom: 58px; z-index: 2;
          width: clamp(46px, 6vw, 64px); height: clamp(46px, 6vw, 64px);
          opacity: 0.1; pointer-events: none;
          animation: hm-u-draw 1.1s ease both;
        }
        @keyframes hm-u-draw { 0%{ stroke-dasharray: 80; stroke-dashoffset: 80; opacity: 0; } 12%{ opacity: 0.1; } 60%{ stroke-dashoffset: 0; } 100%{ stroke-dashoffset: 0; opacity: 0.1; } }

        .hm-cursor {
          position: absolute; left: 0; top: 0; width: 20px; height: 20px; z-index: 8; pointer-events: none;
          animation-timing-function: cubic-bezier(.5,0,.2,1); animation-fill-mode: both;
        }
        .hm-cursor-svg { display: block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.55)); }
        .hm-click-ring {
          position: absolute; left: 1px; top: 1px; width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid #D4920E; opacity: 0; animation: hm-click-pulse 520ms ease-out both;
        }
        @keyframes hm-click-pulse { 0%{opacity:0; transform:scale(.3)} 25%{opacity:.9; transform:scale(1)} 100%{opacity:0; transform:scale(2.5)} }
        .hm-caret { display: inline-block; width: 2px; height: 0.9em; background: #D4920E; margin-left: 1px; vertical-align: -0.1em; animation: hm-caret-blink 0.9s steps(1) infinite; }
        @keyframes hm-caret-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        .hm-vignette {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(80% 60% at 50% 40%, transparent 40%, rgba(0,0,0,0.35) 100%),
            radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 100% 100%, 22px 22px;
        }
        .hm-rec {
          position: absolute; top: 18px; left: 22px; z-index: 3;
          display: inline-flex; align-items: center; gap: 6px;
          font: 700 10.5px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.55);
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .hm-rec-dot { width: 7px; height: 7px; border-radius: 50%; background: #EF4444; animation: hm-pulse-dot 1.6s ease-in-out infinite; }
        .hm-realclock {
          position: absolute; top: 18px; right: 22px; z-index: 3;
          display: inline-flex; align-items: center; gap: 6px;
          font: 700 11px 'DM Mono', monospace; color: rgba(255,255,255,0.75);
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px; padding: 4px 10px;
        }
        .hm-realclock-dot { width: 6px; height: 6px; border-radius: 50%; background: #22C55E; animation: hm-pulse-dot 1.6s ease-in-out infinite; }
        @keyframes hm-pulse-dot { 0%,100%{opacity:1} 50%{opacity:.35} }

        .hm-scene {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: clamp(36px, 4vw, 44px) clamp(14px, 3vw, 28px) 74px;
          animation: hm-scene-in 0.55s cubic-bezier(.2,.9,.3,1.05) both;
        }
        @keyframes hm-scene-in { 0%{ opacity:0; transform: scale(0.97) translateY(8px);} 100%{ opacity:1; transform: scale(1) translateY(0);} }

        .hm-badges { position: absolute; left: 22px; bottom: 62px; z-index: 3; display: flex; flex-wrap: wrap; gap: 6px; max-width: 60%; }
        .hm-badge {
          font: 700 9px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.05); border-radius: 999px; padding: 4px 9px;
          transition: color 0.4s, background 0.4s;
        }
        .hm-badge.is-lit { color: #13111E; background: #D4920E; }

        .hm-chrome { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; padding: 0 22px 18px; }
        .hm-subtitle { font: 600 clamp(13px, 2vw, 15px)/1.4 'Plus Jakarta Sans', sans-serif; color: #fff; text-align: center; margin-bottom: 10px; animation: hm-sub-in 0.5s ease both; }
        @keyframes hm-sub-in { 0%{opacity:0; transform:translateY(6px)} 100%{opacity:1; transform:translateY(0)} }
        .hm-scrub { display: flex; gap: 4px; max-width: 520px; margin: 0 auto; }
        .hm-seg { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.16); overflow: hidden; }
        .hm-seg-fill { display: block; height: 100%; width: 0%; background: #D4920E; }
        .hm-seg-fill.is-done { width: 100%; }
        .hm-seg-fill.is-playing { animation-name: hm-fill; animation-timing-function: linear; }
        @keyframes hm-fill { 0%{width:0%} 100%{width:100%} }

        .hm-input-outer { position: relative; display: flex; flex-direction: column; align-items: center; gap: clamp(18px,3vw,26px); width: 100%; max-width: 680px; }
        .hm-input-field { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .hm-input-field-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.06em; }
        .hm-input-field-box { display: inline-flex; align-items: center; min-width: 190px; background: rgba(255,255,255,0.07); border: 1.5px solid #7C6FE0; border-radius: 10px; padding: 10px 14px; font: 700 14px 'Plus Jakarta Sans', sans-serif; color: #fff; }
        .hm-type-reveal { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation: hm-type-name 900ms steps(7) 550ms both; }
        @keyframes hm-type-name { to { width: 6.4ch; } }
        .hm-input-linked { font-size: 10.5px; color: #86EFAC; font-weight: 600; opacity: 0; animation: hm-lane-in 0.5s ease 1.55s both; }
        @keyframes hm-cur-input { 0%{left:14%; top:-30%; opacity:0;} 10%{opacity:1;} 24%{left:24%; top:-6%;} 55%{left:24%; top:-6%;} 100%{left:24%; top:-6%; opacity:1;} }
        .hm-input-chips { display: flex; flex-wrap: wrap; gap: clamp(10px,2vw,18px); justify-content: center; max-width: 640px; }
        .hm-chip { display: flex; flex-direction: column; align-items: center; gap: 5px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 20px 30px; min-width: 122px; animation: hm-chip-in 0.5s cubic-bezier(.2,.9,.3,1.1) both; }
        .hm-chip-num { font: 800 clamp(26px,3.4vw,34px) 'Plus Jakarta Sans', sans-serif; color: #fff; }
        .hm-chip-label { font: 600 11px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.06em; }
        @keyframes hm-chip-in { 0%{opacity:0; transform: translateY(16px) scale(.9)} 100%{opacity:1; transform: translateY(0) scale(1)} }

        .hm-combine-outer { position: relative; display: flex; flex-direction: column; align-items: center; gap: clamp(14px,2.4vw,20px); width: 100%; max-width: 700px; }
        .hm-expr-bar { display: flex; align-items: center; gap: 8px; }
        .hm-expr-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.06em; }
        .hm-expr-box { display: inline-flex; align-items: center; background: rgba(255,255,255,0.07); border: 1.5px solid #7C6FE0; border-radius: 999px; padding: 7px 14px; font: 700 11.5px 'DM Mono', monospace; color: #fff; }
        .hm-expr-text { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation: hm-expr-type 1.35s steps(36) 0.45s both; }
        @keyframes hm-expr-type { to { width: 34ch; } }
        @keyframes hm-cur-combine { 0%{left:2%; top:-38%; opacity:0;} 8%{opacity:1;} 20%{left:20%; top:-20%;} 40%,55%{left:20%; top:-20%;} 100%{left:10%; top:64%; opacity:1;} }
        .hm-lane-typed { animation-name: hm-lane-in; }
        .hm-combine { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(16px,3vw,32px); width: 100%; max-width: 640px; }
        .hm-combine-panel { display: flex; flex-direction: column; gap: 8px; }
        .hm-combine-head { font: 500 10px 'DM Mono', monospace; color: #fff; background: rgba(255,255,255,0.1); border-radius: 999px; padding: 5px 10px; align-self: flex-start; }
        .hm-lane { border-radius: 8px; padding: 7px 10px; opacity: 0; animation: hm-lane-in 0.5s cubic-bezier(.2,.9,.3,1.1) both; }
        @keyframes hm-lane-in { 0%{opacity:0; transform:translateX(-6px)} 100%{opacity:1; transform:translateX(0)} }
        .hm-lane-main { font-size: 10.5px; font-weight: 700; color: #13111E; }
        .hm-lane-tag { display: inline-block; margin-top: 3px; font-size: 8px; font-weight: 700; text-transform: uppercase; color: #7C6FE0; background: rgba(124,111,224,0.18); border-radius: 4px; padding: 1px 5px; }
        .hm-or-stage { position: relative; height: 78px; }
        .hm-or-card { position: absolute; inset: 0; border-radius: 10px; border: 1.5px solid; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; animation-duration: 6s; animation-timing-function: cubic-bezier(.45,0,.25,1); animation-iteration-count: infinite; }
        .hm-or-card-0 { animation-name: hm-or-toggle-0; }
        .hm-or-card-1 { animation-name: hm-or-toggle-1; }
        @keyframes hm-or-toggle-0 { 0%,40%{opacity:1} 50%,92%{opacity:0} 100%{opacity:1} }
        @keyframes hm-or-toggle-1 { 0%,40%{opacity:0} 50%,92%{opacity:1} 100%{opacity:0} }
        .hm-or-subject { font-size: 13px; font-weight: 800; color: #13111E; }
        .hm-or-reason { font-size: 9.5px; color: #4B5275; margin-top: 3px; }
        .hm-combine-note { font-size: 9.5px; color: rgba(255,255,255,0.45); line-height: 1.4; }

        .hm-card { background: #fff; border-radius: 16px; padding: clamp(14px,2.5vw,22px); box-shadow: 0 30px 80px rgba(124,111,224,0.35), 0 0 0 1px rgba(255,255,255,0.06); max-width: 620px; width: 100%; }
        .hm-card-title { font: 800 13px 'Plus Jakarta Sans', sans-serif; color: #13111E; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
        .hm-card-live { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #16A34A; display: inline-flex; align-items: center; gap: 4px; }
        .hm-card-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22C55E; animation: hm-pulse-dot 1.6s ease-in-out infinite; }
        .hm-grid-wrap { position: relative; }
        .hm-grid { display: grid; gap: 3px; grid-template-columns: 44px repeat(4, 1fr); }
        .hm-g-head { font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #8B87AD; text-align: center; text-transform: uppercase; padding: 3px 0; }
        .hm-g-row-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #13111E; display: flex; align-items: center; padding-left: 3px; }
        .hm-g-cell { border-radius: 6px; padding: 6px 7px; display: flex; flex-direction: column; justify-content: center; min-height: 44px; }
        .hm-g-cell.free { background: #FAFAFE; border: 1px dashed #E8E4FF; align-items: center; justify-content: center; }
        .hm-g-title { font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #13111E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hm-g-meta { font: 500 7px 'Plus Jakarta Sans', sans-serif; color: #4B5275; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hm-g-free-label { font-size: 7.5px; color: #B8B4D4; font-weight: 600; }
        .hm-g-multi { font: 600 7.5px 'Plus Jakarta Sans', sans-serif; color: #4B5275; line-height: 1.3; }
        /* The real Play-Head: full-height red line, red dot + live time badge above it */
        .hm-playhead { position: absolute; top: 0; bottom: 0; pointer-events: none; }
        .hm-playhead-line { position: absolute; top: 20px; bottom: 0; left: 50%; width: 2px; background: #EF4444; transform: translateX(-50%); }
        .hm-playhead-badge {
          position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
          display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
          font: 800 9.5px 'Plus Jakarta Sans', sans-serif; color: #EF4444;
        }
        .hm-playhead-dot { width: 6px; height: 6px; border-radius: 50%; background: #EF4444; }

        .hm-views { display: flex; flex-direction: column; align-items: center; gap: 14px; }
        .hm-toggle-visual { display: flex; align-items: center; gap: 8px; }
        .hm-toggle-track { width: 40px; height: 22px; border-radius: 999px; background: #13111E; position: relative; }
        .hm-toggle-knob { position: absolute; top: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; animation: hm-toggle-slide 2.6s ease-in-out infinite; }
        @keyframes hm-toggle-slide { 0%,20%{left:2px} 50%,80%{left:20px} 100%{left:2px} }
        .hm-toggle-label { font: 700 11px 'Plus Jakarta Sans', sans-serif; color: rgba(255,255,255,0.7); }
        @keyframes hm-cur-views { 0%{left:38%; top:-30%; opacity:0;} 12%{opacity:1;} 26%{left:50%; top:6%;} 100%{left:50%; top:6%; opacity:1;} }

        .hm-live-card { max-width: 460px; }
        .hm-live-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .hm-live-clock { font: 800 20px 'Plus Jakarta Sans', sans-serif; color: #13111E; font-variant-numeric: tabular-nums; letter-spacing: -0.3px; }
        .hm-live-status { font-size: 12px; color: #6B7280; }
        .hm-live-status-min { color: #16A34A; font-weight: 700; }
        .hm-live-badge { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font: 700 11px 'Plus Jakarta Sans', sans-serif; color: #16A34A; }
        .hm-live-badge-dot { width: 8px; height: 8px; border-radius: 4px; background: #16A34A; animation: hm-pulse-dot 1.6s ease-in-out infinite; }
        .hm-live-track { position: relative; display: flex; height: 34px; border-radius: 10px; background: #F4F2FE; border: 1px solid #ECE9FB; overflow: hidden; margin-bottom: 6px; }
        .hm-live-band { height: 100%; border-right: 1px solid rgba(19,17,30,0.07); }
        .hm-live-now { position: absolute; top: 0; bottom: 0; left: 46%; width: 2px; background: #EF4444; opacity: 0.5; }
        .hm-live-legend { display: flex; gap: 14px; margin-bottom: 14px; }
        .hm-live-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: #8B87AD; }
        .hm-live-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; }
        .hm-live-section { margin-bottom: 12px; }
        .hm-live-section-label { font: 700 10px 'Plus Jakarta Sans', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px; }
        .hm-live-cards { display: flex; gap: 10px; flex-wrap: wrap; }
        .hm-live-livecard { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #ECE9FB; border-radius: 13px; padding: 8px 12px; }
        .hm-live-entity { font-size: 9px; color: #9A95BC; font-weight: 600; }
        .hm-live-subject { display: inline-block; color: #fff; font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 1px 8px; margin: 2px 0; }
        .hm-live-teacher { font-size: 10px; color: #6B7280; }
        .hm-live-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .hm-live-chip { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #ECE9FB; border-radius: 8px; padding: 5px 10px; font-size: 11px; color: #13111E; font-weight: 600; }
        .hm-live-load { font-size: 9px; font-weight: 700; }
        .hm-live-plus { color: #7C6FE0; font-weight: 800; }
        .hm-live-now-btn { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #7C6FE0; background: #fff; border: 1px solid #E3DEF7; border-radius: 8px; padding: 3px 9px; }
        .hm-live-section-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
        .hm-live-section-row .hm-live-section-label { margin-bottom: 0; }
        .hm-live-sort { display: flex; gap: 4px; }
        .hm-live-sort-btn { font: 700 8.5px 'Plus Jakarta Sans', sans-serif; color: #9A95BC; background: #FAFAFE; border: 1px solid #ECE9FB; border-radius: 6px; padding: 3px 7px; }
        .hm-live-sort-btn.is-active { color: #7C6FE0; background: #EDE9FF; border-color: #DDD6FE; }
        .hm-live-chip-click { animation: hm-live-chip-assign 450ms ease 3200ms both; }
        @keyframes hm-live-chip-assign { 0%{ transform: scale(1); } 40%{ transform: scale(1.06); background: #EDE9FF; border-color: #7C6FE0; } 100%{ transform: scale(1); background: #EDE9FF; border-color: #7C6FE0; } }
        @keyframes hm-cur-live {
          0% { left: 2%; top: 2%; opacity: 0; }
          8% { opacity: 1; }
          18% { left: 20%; top: 22%; }
          21% { left: 20%; top: 22%; }
          32% { left: 65%; top: 22%; }
          40%,55% { left: 65%; top: 22%; }
          74% { left: 8%; top: 90%; }
          100% { left: 8%; top: 90%; opacity: 1; }
        }

        /* Calendar Day view (real toolbar/tabs/rows) */
        .hm-cal-card { max-width: 680px; width: 100%; }
        .hm-cal-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .hm-cal-title { display: flex; align-items: center; gap: 8px; }
        .hm-cal-icon { font-size: 20px; }
        .hm-cal-title-text { font: 800 15px 'Plus Jakarta Sans', sans-serif; color: #13111E; }
        .hm-cal-date { font-size: 10px; color: #8B87AD; }
        .hm-cal-toolbar-actions { display: flex; align-items: center; gap: 6px; }
        .hm-cal-add { font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #fff; background: #7C6FE0; border-radius: 8px; padding: 6px 10px; }
        .hm-cal-icon-btn { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #E8E4FF; border-radius: 8px; font-size: 11px; color: #4B5275; }
        .hm-cal-tabs-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .hm-cal-tabs { display: flex; gap: 3px; background: #F4F2FE; border-radius: 9px; padding: 3px; }
        .hm-cal-tab { font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #6B7280; padding: 5px 8px; border-radius: 6px; }
        .hm-cal-tab.is-active { background: #fff; color: #7C6FE0; box-shadow: 0 1px 3px rgba(19,17,30,0.1); }
        .hm-cal-multi-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .hm-cal-chip { font: 700 9px 'Plus Jakarta Sans', sans-serif; color: #4B5275; background: #fff; border: 1.5px solid #E8E4FF; border-radius: 999px; padding: 4px 9px; }
        .hm-cal-chip.is-active { background: #13111E; color: #fff; border-color: #13111E; }
        .hm-cal-multi-note { font-size: 9px; color: #8B87AD; font-style: italic; }
        .hm-cal-rows { display: flex; flex-direction: column; gap: 8px; }
        .hm-cal-row-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .hm-cal-row-name { font: 700 10.5px 'Plus Jakarta Sans', sans-serif; color: #13111E; flex-shrink: 0; }
        .hm-cal-row-actions { display: flex; gap: 4px; }
        .hm-cal-leave { font: 700 8px 'Plus Jakarta Sans', sans-serif; color: #B45309; background: #FFFBF3; border: 1px solid #E5C078; border-radius: 6px; padding: 2px 6px; }
        .hm-cal-sub { font: 700 8px 'Plus Jakarta Sans', sans-serif; color: #2563EB; background: #E8F0FF; border-radius: 6px; padding: 2px 6px; }
        .hm-cal-row-count { font-size: 8.5px; color: #9A95BC; margin-left: auto; }
        .hm-cal-track { display: flex; gap: 2px; height: 40px; }
        .hm-cal-block { border-radius: 6px; background: #F4F2FE; padding: 4px 6px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
        .hm-cal-block-label { font-size: 9px; font-weight: 700; color: #13111E; white-space: nowrap; }
        .hm-cal-block-sub { display: inline-block; margin-top: 2px; color: #fff; font-size: 7.5px; font-weight: 700; border-radius: 4px; padding: 1px 5px; white-space: nowrap; }
        .hm-cal-lunch { background: #FDECC8; color: #92702A; font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-align: center; }
        .hm-cal-day-tab { animation: hm-tab-flash 500ms ease 380ms both; }
        @keyframes hm-tab-flash { 0%{ box-shadow: none; } 30%{ box-shadow: 0 0 0 3px rgba(124,111,224,0.35); } 100%{ box-shadow: none; } }
        .hm-cal-chip-click { animation: hm-chip-activate 400ms ease 1900ms both; }
        @keyframes hm-chip-activate { to { background: #13111E; color: #fff; border-color: #13111E; } }
        .hm-cal-sub-click { animation: hm-sub-flash 500ms ease 3350ms both; }
        @keyframes hm-sub-flash { 0%{ transform: scale(1); } 40%{ transform: scale(1.12); background: #2563EB; color: #fff; } 100%{ transform: scale(1); } }
        @keyframes hm-cur-calendar {
          0% { left: 6%; top: -22%; opacity: 0; }
          6% { opacity: 1; }
          8% { left: 20%; top: -8%; }
          20%,42% { left: 20%; top: -8%; }
          46% { left: 30%; top: 30%; }
          60%,74% { left: 30%; top: 30%; }
          78% { left: 78%; top: 84%; }
          100% { left: 78%; top: 84%; opacity: 1; }
        }

        /* Assign-a-task modal */
        .hm-assign-card { max-width: 460px; width: 100%; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px rgba(124,111,224,0.35); }
        .hm-assign-head { display: flex; align-items: center; gap: 10px; background: linear-gradient(135deg,#C2740E,#D4920E); padding: 16px 18px; }
        .hm-assign-pin { font-size: 20px; }
        .hm-assign-title { font: 800 15px 'Plus Jakarta Sans', sans-serif; color: #fff; }
        .hm-assign-sub { font-size: 9.5px; color: rgba(255,255,255,0.85); margin-top: 2px; }
        .hm-assign-body { padding: 16px 18px; }
        .hm-assign-fair { display: flex; align-items: flex-start; gap: 6px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 9px; padding: 9px 11px; font-size: 10.5px; color: #166534; line-height: 1.45; margin-bottom: 12px; }
        .hm-assign-fair-dot { width: 6px; height: 6px; border-radius: 50%; background: #16A34A; margin-top: 4px; flex-shrink: 0; }
        .hm-assign-label { font-size: 10.5px; font-weight: 700; color: #13111E; margin-bottom: 6px; }
        .hm-assign-req { color: #DC2626; }
        .hm-assign-input { font-size: 10.5px; color: #B8B4D4; border: 1.5px solid #7C6FE0; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
        .hm-assign-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .hm-assign-chip { font-size: 9.5px; font-weight: 700; color: #B45309; border: 1px solid #F3D9A8; border-radius: 8px; padding: 5px 9px; }
        .hm-assign-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .hm-assign-cancel { font: 700 10.5px 'Plus Jakarta Sans', sans-serif; color: #4B5275; border: 1px solid #E8E4FF; border-radius: 8px; padding: 7px 16px; }
        .hm-assign-submit { font: 700 10.5px 'Plus Jakarta Sans', sans-serif; color: #B8B4D4; background: #F4F2FE; border-radius: 8px; padding: 7px 16px; }
        .hm-assign-input-typed { display: flex; align-items: center; }
        .hm-type-reveal-2 { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; color: #13111E; animation: hm-type-assign 1.1s steps(19) 400ms both; }
        @keyframes hm-type-assign { to { width: 12ch; } }
        .hm-assign-chip-click { animation: hm-assign-chip-select 400ms ease 2650ms both; }
        @keyframes hm-assign-chip-select { to { background: #FEF3C7; border-color: #D4920E; color: #92400E; } }
        .hm-assign-submit-click { animation: hm-assign-submit-flash 500ms ease 3900ms both; }
        @keyframes hm-assign-submit-flash { 0%{ transform: scale(1); } 40%{ transform: scale(1.08); background: #16A34A; color: #fff; } 100%{ transform: scale(1); background: #16A34A; color: #fff; } }
        @keyframes hm-cur-assign {
          0% { left: 8%; top: -25%; opacity: 0; }
          6% { opacity: 1; }
          8% { left: 22%; top: 38%; }
          20%,55% { left: 22%; top: 38%; }
          62% { left: 16%; top: 63%; }
          75%,88% { left: 16%; top: 63%; }
          91% { left: 70%; top: 92%; }
          100% { left: 70%; top: 92%; opacity: 1; }
        }

        .hm-done { display: flex; flex-direction: column; align-items: center; gap: 18px; }
        .hm-done-stamp { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 18px 34px; box-shadow: 0 0 70px rgba(212,146,14,0.3); }
        .hm-done-dot { width: 13px; height: 13px; border-radius: 50%; background: #D4920E; }
        .hm-done-text { font: 800 clamp(18px,2.8vw,24px) 'Plus Jakarta Sans', sans-serif; color: #fff; }
        .hm-done-btn { font: 800 12.5px 'Plus Jakarta Sans', sans-serif; color: #13111E; background: #D4920E; border-radius: 9px; padding: 11px 24px; box-shadow: 0 0 30px rgba(212,146,14,0.3); opacity: 0; animation: hm-lane-in 0.5s ease 0.7s both; }
        .hm-done-btn-click { animation: hm-lane-in 0.5s ease 0.7s both, hm-done-btn-press 400ms ease 2400ms both; }
        @keyframes hm-done-btn-press { 0%{ transform: scale(1); } 40%{ transform: scale(0.94); } 100%{ transform: scale(1); } }
        @keyframes hm-cur-done { 0%{left:70%; top:-30%; opacity:0;} 12%{opacity:1;} 55%{left:50%; top:78%;} 72%,88%{left:50%; top:78%;} 100%{left:50%; top:78%; opacity:1;} }

        @media (prefers-reduced-motion: reduce) {
          .hm-scene, .hm-subtitle, .hm-chip, .hm-lane { animation: none !important; opacity: 1 !important; transform: none !important; }
          .hm-or-card { animation: none !important; }
          .hm-or-card-0 { opacity: 1 !important; }
          .hm-or-card-1 { opacity: 0 !important; }
          .hm-toggle-knob { animation: none !important; left: 2px !important; }
          .hm-seg-fill.is-playing { animation: none !important; width: 100% !important; }
          .hm-rec-dot, .hm-card-live-dot, .hm-realclock-dot, .hm-live-badge-dot { animation: none !important; }
          .hm-cursor, .hm-click-ring { display: none !important; }
          .hm-caret { animation: none !important; opacity: 0 !important; }
          .hm-type-reveal, .hm-expr-text, .hm-type-reveal-2 { animation: none !important; width: auto !important; }
          .hm-u-watermark { animation: none !important; opacity: 0.1 !important; stroke-dashoffset: 0 !important; }
          .hm-input-linked, .hm-done-btn { animation: none !important; opacity: 1 !important; }
          .hm-cal-day-tab, .hm-cal-chip-click, .hm-cal-sub-click, .hm-assign-chip-click, .hm-assign-submit-click, .hm-live-chip-click, .hm-done-btn-click { animation: none !important; }
        }
        @media (max-width: 640px) {
          .hm-combine { grid-template-columns: 1fr; }
          .hm-badges { display: none; }
          .hm-realclock { font-size: 9.5px; padding: 3px 7px; }
          .hm-cursor { display: none; }
        }
      `}</style>
    </div>
  );
}

// A simulated pointer that moves across a scene and "clicks" — this is
// what makes the movie read as user POV rather than a passive slideshow.
// `move` names a CSS keyframe (left/top in %, relative to the nearest
// position:relative ancestor) and `clicks` are ms offsets, from scene
// start, at which a click-ring flashes at the cursor's current position.
function Cursor({ move, clicks, duration }: { move: string; clicks: number[]; duration: number }) {
  return (
    <div className="hm-cursor" style={{ animationName: move, animationDuration: `${duration}ms` }}>
      <svg viewBox="0 0 24 24" width="20" height="20" className="hm-cursor-svg">
        <path d="M4 2 L4 20 L9 15.5 L12.5 22 L15 20.5 L11.5 14 L18 14 Z" fill="#fff" stroke="#13111E" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      {clicks.map((t, i) => <span key={i} className="hm-click-ring" style={{ animationDelay: `${t}ms` }} />)}
    </div>
  );
}

function SceneInput() {
  const items = [{ n: "42", l: "Teachers" }, { n: "24", l: "Sections" }, { n: "9", l: "Venues" }, { n: "18", l: "Subjects" }];
  const name = "Mr. Rao";
  return (
    <div className="hm-input-outer">
      <div className="hm-input-field">
        <span className="hm-input-field-label">Add a teacher</span>
        <span className="hm-input-field-box">
          <span className="hm-type-reveal">{name}</span><span className="hm-caret" />
        </span>
        <span className="hm-input-linked">↳ already teaching Science, Maths — 3 more slots auto-linked ✓</span>
      </div>
      <div className="hm-input-chips">
        {items.map((it, i) => (
          <div key={it.l} className="hm-chip" style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
            <div className="hm-chip-num">{it.n}</div>
            <div className="hm-chip-label">{it.l}</div>
          </div>
        ))}
      </div>
      <Cursor move="hm-cur-input" clicks={[550]} duration={3300} />
    </div>
  );
}

function SceneCombine({ inView }: { inView: boolean }) {
  const lanesFill = ["#EDE9FF", "#DBEAFE", "#DCFCE7"];
  return (
    <div className="hm-combine-outer">
      <div className="hm-expr-bar">
        <span className="hm-expr-label">Type a rule:</span>
        <span className="hm-expr-box"><span className="hm-expr-text">Physics AND Chemistry AND Economics</span><span className="hm-caret" /></span>
      </div>
      <div className="hm-combine">
        <div className="hm-combine-panel">
          <span className="hm-combine-head">AND → parallel</span>
          {AND_LANES.map((l, i) => (
            <div key={l.subject} className="hm-lane hm-lane-typed" style={{ background: lanesFill[i], animationDelay: inView ? `${1.5 + i * 0.15}s` : "0s" }}>
              <div className="hm-lane-main">{l.subject} · {l.teacher} · {l.venue}</div>
              <div className="hm-lane-tag">{l.tag}</div>
            </div>
          ))}
          <p className="hm-combine-note">Same slot, different sections &amp; streams — all at once.</p>
        </div>
        <div className="hm-combine-panel">
          <span className="hm-combine-head">Physics OR Chemistry</span>
          <div className="hm-or-stage">
            {OR_STATES.map((s, i) => (
              <div key={s.subject} className={`hm-or-card hm-or-card-${i}`} style={{ background: i === 0 ? "#EDE9FF" : "#DBEAFE", borderColor: i === 0 ? "#7C6FE0" : "#3B82F6" }}>
                <div className="hm-or-subject">{s.subject}</div>
                <div className="hm-or-reason">{s.reason}</div>
              </div>
            ))}
          </div>
          <p className="hm-combine-note">One at a time — whichever needs the slot more. Never both.</p>
        </div>
      </div>
      <Cursor move="hm-cur-combine" clicks={[420]} duration={4300} />
    </div>
  );
}

function SceneGrid({ kind, inView }: { kind: "class" | "teacher" | "room" | "subject"; inView: boolean }) {
  const isClass = kind === "class";
  const otherAxis = isClass ? CLASS_ROWS : kind === "teacher" ? TEACHERS : kind === "room" ? VENUES : SUBJECTS;
  const rowData = (label: string) => (kind === "teacher" ? teacherRow(label) : kind === "room" ? venueRow(label) : subjectRow(label));
  const title = isClass ? "Class view — Day" : `${kind[0].toUpperCase()}${kind.slice(1)} view`;

  return (
    <div className="hm-card">
      <div className="hm-card-title">
        <span>{title}</span>
        <span className="hm-card-live"><span className="hm-card-live-dot" />Live</span>
      </div>
      <div className="hm-grid-wrap">
        <div className="hm-grid">
          <div />
          {HOURS.map((h) => <div key={h} className="hm-g-head">{h}</div>)}
          {otherAxis.map((rowKey, rIdx) => (
            <div key={rowKey} style={{ display: "contents" }}>
              <div className="hm-g-row-label">{rowKey}</div>
              {HOURS.map((_, cIdx) => {
                if (isClass) {
                  const cell = CLASS_GRID[cIdx][rIdx];
                  return (
                    <div key={cIdx} className="hm-g-cell" style={{ background: TINTS[cell.subject] }}>
                      <div className="hm-g-title">{cell.subject}</div>
                      <div className="hm-g-meta">{cell.teacher} · {cell.venue}</div>
                    </div>
                  );
                }
                const occ = rowData(rowKey)[cIdx];
                if (Array.isArray(occ)) {
                  return (
                    <div key={cIdx} className="hm-g-cell" style={{ background: occ.length ? TINTS[rowKey] : undefined }}>
                      <div className="hm-g-multi">{occ.length === 0 ? <span className="hm-g-free-label">—</span> : occ.map((o) => <div key={o.cls}>{o.cls}</div>)}</div>
                    </div>
                  );
                }
                return (
                  <div key={cIdx} className={`hm-g-cell ${!occ ? "free" : ""}`} style={occ ? { background: TINTS[occ.subject] } : undefined}>
                    {occ ? (<><div className="hm-g-title">{occ.cls}</div><div className="hm-g-meta">{occ.subject}</div></>) : <span className="hm-g-free-label">Free</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <PlayHead inView={inView} />
      </div>
    </div>
  );
}

// The real Play-Head, exactly as it appears in the actual Calendar Day view
// (frontend/src/pages/calendar.tsx MomentScrubber "now" line): a full-height
// red line with a red dot + the real, live clock time above it — not a
// discrete period indicator. Sweeps across the grid to demonstrate it's
// live across every column; the time label itself is genuinely real time.
function PlayHead({ inView }: { inView: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--";

  return (
    <div
      className="hm-playhead"
      style={{ left: 44, width: "calc((100% - 44px) / 4)", animation: inView ? "hm-sweep-x 7s cubic-bezier(.45,0,.25,1) infinite" : "none" }}
    >
      <span className="hm-playhead-badge"><span className="hm-playhead-dot" />{timeStr}</span>
      <span className="hm-playhead-line" />
      <style>{`@keyframes hm-sweep-x { 0%,4%{transform:translateX(0)} 24%{transform:translateX(100%)} 45%{transform:translateX(200%)} 66%,97%{transform:translateX(300%)} 100%{transform:translateX(0)} }`}</style>
    </div>
  );
}

// Reproduces the real Calendar → Day view (frontend/src/pages/calendar.tsx):
// toolbar, Live/Day/Month + Teachers/Classes/Subjects/Venues lens tabs, the
// multi-schedule filter chips (several timetables active at once, combined
// into one Day view), and real teacher-row blocks with Leave/Sub actions.
const CAL_ROWS = [
  {
    name: "Art & Craft Teacher 1",
    periods: 9,
    blocks: [
      { label: "X-D", sub: "Mathematics", color: "#1E3A8A", w: 2 },
      { label: "X-C", sub: "Mathematics", color: "#1E3A8A", w: 3 },
      { label: "VII-C", sub: "G.K.", color: "#1E3A8A", w: 3 },
      { label: "Lunch Break", type: "lunch" as const, w: 2 },
      { label: "VI-A", sub: "G.K.", color: "#1E3A8A", w: 3 },
      { label: "VII-B", sub: "Physical Education", color: "#7C2D3F", w: 3 },
    ],
  },
  {
    name: "Art & Craft Teacher 2",
    periods: 6,
    blocks: [
      { label: "", type: "empty" as const, w: 2 },
      { label: "V-D", sub: "G.K.", color: "#1E3A8A", w: 2 },
      { label: "Lunch Break", type: "lunch" as const, w: 2 },
      { label: "IV-C", sub: "G.K.", color: "#1E3A8A", w: 3 },
      { label: "V-B", sub: "Science", color: "#374151", w: 3 },
    ],
  },
  {
    name: "Computer Teacher 1",
    periods: 7,
    blocks: [
      { label: "II-A", sub: "English", color: "#166534", w: 2 },
      { label: "I-B", sub: "Dance", color: "#166534", w: 2 },
      { label: "Lunch Break", type: "lunch" as const, w: 2 },
      { label: "III-D", sub: "Mathematics", color: "#1E3A8A", w: 3 },
      { label: "II-D", sub: "Mathematics", color: "#1E3A8A", w: 3 },
    ],
  },
];

function SceneCalendarDay() {
  return (
    <div className="hm-card hm-cal-card" style={{ position: "relative" }}>
      <div className="hm-cal-toolbar">
        <div className="hm-cal-title">
          <span className="hm-cal-icon">📅</span>
          <div>
            <div className="hm-cal-title-text">Calendar</div>
            <div className="hm-cal-date">Wed, Jul 8, 2026</div>
          </div>
        </div>
        <div className="hm-cal-toolbar-actions">
          <span className="hm-cal-add">+ Add Event</span>
          <span className="hm-cal-icon-btn">⚙</span>
          <span className="hm-cal-icon-btn">⇧</span>
        </div>
      </div>

      <div className="hm-cal-tabs-row">
        <div className="hm-cal-tabs">
          <span className="hm-cal-tab">● Live</span>
          <span className="hm-cal-tab hm-cal-day-tab is-active">Day</span>
          <span className="hm-cal-tab">Month</span>
        </div>
        <div className="hm-cal-tabs hm-cal-lens">
          <span className="hm-cal-tab is-active">👤 Teachers</span>
          <span className="hm-cal-tab">🎓 Classes</span>
          <span className="hm-cal-tab">📖 Subjects</span>
          <span className="hm-cal-tab">🏛 Venues</span>
        </div>
      </div>

      <div className="hm-cal-multi-row">
        <span className="hm-cal-chip is-active">✓ All (2)</span>
        <span className="hm-cal-chip hm-cal-chip-click">✓ I-V TT</span>
        <span className="hm-cal-chip">✓ VI-X TT</span>
        <span className="hm-cal-multi-note">Day shows the combined view across all of them</span>
      </div>

      <div className="hm-cal-rows">
        {CAL_ROWS.map((row, ri) => (
          <div key={row.name} className="hm-cal-row">
            <div className="hm-cal-row-head">
              <div className="hm-cal-row-name">{row.name}</div>
              <div className="hm-cal-row-actions">
                <span className="hm-cal-leave">⚑ Leave</span>
                <span className={`hm-cal-sub ${ri === 0 ? "hm-cal-sub-click" : ""}`}>⇄ Sub</span>
              </div>
              <div className="hm-cal-row-count">{row.periods} periods</div>
            </div>
            <div className="hm-cal-track">
              {row.blocks.map((b, i) =>
                b.type === "lunch" ? (
                  <div key={i} className="hm-cal-block hm-cal-lunch" style={{ flex: b.w }}>Lunch Break</div>
                ) : b.type === "empty" ? (
                  <div key={i} style={{ flex: b.w }} />
                ) : (
                  <div key={i} className="hm-cal-block" style={{ flex: b.w }}>
                    <div className="hm-cal-block-label">{b.label}</div>
                    <div className="hm-cal-block-sub" style={{ background: b.color }}>{b.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <Cursor move="hm-cur-calendar" clicks={[380, 1900, 3350]} duration={4500} />
    </div>
  );
}

// Reproduces the real "Assign a task" modal — orange header, the fairness
// advisory banner, and the real quick-select task-type chips.
const TASK_CHIPS = ["Substitution cover", "Exam invigilation", "Library duty", "Admin support", "Lesson planning", "Student counselling"];

function SceneTaskAssign() {
  return (
    <div className="hm-assign-card" style={{ position: "relative" }}>
      <div className="hm-assign-head">
        <span className="hm-assign-pin">📌</span>
        <div>
          <div className="hm-assign-title">Assign a task</div>
          <div className="hm-assign-sub">Teacher: <b>Art &amp; Craft Teacher 2</b> · Period 3 · 2026-07-08</div>
        </div>
      </div>
      <div className="hm-assign-body">
        <div className="hm-assign-fair">
          <span className="hm-assign-fair-dot" />
          This would be Art &amp; Craft Teacher 2&rsquo;s first extra duty this week — a fair pick. 💪
        </div>
        <div className="hm-assign-label">What should this slot be used for? <span className="hm-assign-req">*</span></div>
        <div className="hm-assign-input hm-assign-input-typed">
          <span className="hm-type-reveal-2">Substitution cover</span><span className="hm-caret" />
        </div>
        <div className="hm-assign-chips">
          {TASK_CHIPS.map((c, i) => <span key={c} className={`hm-assign-chip ${i === 0 ? "hm-assign-chip-click" : ""}`}>{c}</span>)}
        </div>
        <div className="hm-assign-actions">
          <span className="hm-assign-cancel">Cancel</span>
          <span className="hm-assign-submit hm-assign-submit-click">Assign</span>
        </div>
      </div>
      <Cursor move="hm-cur-assign" clicks={[350, 2650, 3900]} duration={4300} />
    </div>
  );
}

function SceneViews() {
  return (
    <div className="hm-views" style={{ position: "relative" }}>
      <div className="hm-toggle-visual">
        <span className="hm-toggle-label">Digital</span>
        <div className="hm-toggle-track"><div className="hm-toggle-knob" /></div>
        <span className="hm-toggle-label">Print</span>
      </div>
      <Cursor move="hm-cur-views" clicks={[700]} duration={2700} />
      <div className="hm-card" style={{ maxWidth: 380 }}>
        <div className="hm-card-title"><span>IX-A · Weekly Timetable</span></div>
        <div className="hm-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {CLASS_GRID[0].map((c, i) => (
            <div key={i} className="hm-g-cell" style={{ background: TINTS[c.subject] }}>
              <div className="hm-g-title">{c.subject}</div>
              <div className="hm-g-meta">{c.teacher}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Reproduces the real Live board (frontend/src/pages/calendar.tsx,
// LiveBoard/MomentScrubber/LiveCard, ~lines 1200-1650) — same colors,
// same "In session · N" / "Free now" labels, same progress-ring cards,
// same teach/break scrubber bands. Not an invented mockup.
const LIVE_SESSIONS = [
  { name: "VIII-A", subject: "Maths", teacher: "Mr. Rao", pct: 62, accent: "#7C6FE0" },
  { name: "IX-C", subject: "Science", teacher: "Ms. Iyer", pct: 38, accent: "#0EA5E9" },
];
const LIVE_FREE = [
  { name: "Mr. Das", load: 2 },
  { name: "Mrs. Paul", load: 4 },
  { name: "Mr. Sharma", load: 1 },
];

function SceneLive() {
  return (
    <div className="hm-card hm-live-card" style={{ position: "relative" }}>
      <div className="hm-live-head">
        <span className="hm-live-clock">10:25:0 AM</span>
        <span className="hm-live-status">Period 3 · <span className="hm-live-status-min">18 min left</span></span>
        <span className="hm-live-badge"><span className="hm-live-badge-dot" />Live</span>
        <span className="hm-live-now-btn">Now</span>
      </div>

      <div className="hm-live-track">
        {[14, 4, 18, 3, 20, 5, 16].map((w, i) => (
          <div key={i} className="hm-live-band" style={{ flex: w, background: i % 2 === 0 ? "#B9AFF0" : "#F7D9A0" }} />
        ))}
        <div className="hm-live-now" />
      </div>
      <div className="hm-live-legend">
        <span><i style={{ background: "#B9AFF0" }} />Teaching</span>
        <span><i style={{ background: "#F7D9A0" }} />Break / free</span>
      </div>

      <div className="hm-live-section">
        <div className="hm-live-section-label" style={{ color: "#16A34A" }}>● In session · {LIVE_SESSIONS.length}</div>
        <div className="hm-live-cards">
          {LIVE_SESSIONS.map((s) => (
            <div key={s.name} className="hm-live-livecard">
              <svg width="34" height="34" viewBox="0 0 40 40" className="hm-live-ring">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#F0EEFA" strokeWidth="4" />
                <circle cx="20" cy="20" r="16" fill="none" stroke={s.accent} strokeWidth="4"
                  strokeDasharray={100.5} strokeDashoffset={100.5 - (s.pct / 100) * 100.5}
                  strokeLinecap="round" transform="rotate(-90 20 20)" />
                <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="#13111E">{s.pct}%</text>
              </svg>
              <div>
                <div className="hm-live-entity">{s.name}</div>
                <div className="hm-live-subject" style={{ background: s.accent }}>{s.subject}</div>
                <div className="hm-live-teacher">{s.teacher}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hm-live-section">
        <div className="hm-live-section-row">
          <div className="hm-live-section-label" style={{ color: "#9A95BC" }}>● Free now · {LIVE_FREE.length}</div>
          <div className="hm-live-sort">
            <span className="hm-live-sort-btn is-active">Lightest first</span>
            <span className="hm-live-sort-btn">Heaviest first</span>
          </div>
        </div>
        <div className="hm-live-chips">
          {LIVE_FREE.map((f, i) => (
            <span key={f.name} className={`hm-live-chip ${i === 0 ? "hm-live-chip-click" : ""}`}>
              {f.name}
              <span className="hm-live-load" style={{ color: f.load <= 2 ? "#16A34A" : f.load <= 4 ? "#B45309" : "#DC2626" }}>{f.load} today</span>
              <span className="hm-live-plus">+</span>
            </span>
          ))}
        </div>
      </div>
      <Cursor move="hm-cur-live" clicks={[900, 3200]} duration={4300} />
    </div>
  );
}

function SceneDone() {
  return (
    <div className="hm-done" style={{ position: "relative" }}>
      <div className="hm-done-stamp">
        <span className="hm-done-dot" />
        <span className="hm-done-text">0 conflicts. Ready to publish.</span>
      </div>
      <span className="hm-done-btn hm-done-btn-click">Publish timetable →</span>
      <Cursor move="hm-cur-done" clicks={[2400]} duration={3300} />
    </div>
  );
}
