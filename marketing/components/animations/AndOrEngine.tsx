"use client";

import { useInView } from "./useInView";

/**
 * 03 · AND/OR combination engine — corrected mechanics.
 *
 *  - AND = true parallel scheduling: multiple subjects, multiple teachers,
 *          multiple venues, multiple class-sections, ALL at the same time
 *          slot — and it can cross section, class, stream, block, even a
 *          separate timetable entirely. Depicted as several lanes lit
 *          simultaneously, tagged with which boundary they cross.
 *  - OR  = competitive single-slot allocation: of the OR-listed subjects,
 *          only ONE actually occupies the slot at a time — decided by
 *          which currently needs more period-coverage to finish its
 *          syllabus. Never both at once. Depicted as one card that swaps
 *          which subject holds the slot, with the reason shown.
 */

const AND_LANES = [
  { subject: "Physics", teacher: "Mr. Rao", venue: "Lab-1", scope: "XI-Sci-A", tag: "Cross-section", fill: "#EDE9FF" },
  { subject: "Chemistry", teacher: "Ms. Nair", venue: "Lab-2", scope: "XI-Sci-B", tag: "Cross-stream", fill: "#DBEAFE" },
  { subject: "Economics", teacher: "Mr. Khan", venue: "R-12", scope: "XI-Com-A", tag: "Cross-block", fill: "#DCFCE7" },
];

const OR_STATES = [
  { subject: "Physics", reason: "Needs 2 more periods this week", fill: "#EDE9FF", stroke: "#7C6FE0" },
  { subject: "Chemistry", reason: "Took the slot instead — Physics is caught up", fill: "#DBEAFE", stroke: "#3B82F6" },
];

export function AndOrEngine() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="ao-wrap" style={{ contentVisibility: "auto" }}>
      <div className={`ao-engine ${inView ? "is-playing" : ""}`} role="img" aria-label="Illustrative demo of schedU's AND/OR Academic Combination Matrix">
        <div className="ao-panel">
          <div className="ao-panel-head">
            <span className="ao-chip-and">Physics AND Chemistry AND Economics</span>
          </div>
          <div className="ao-lanes">
            {AND_LANES.map((l, i) => (
              <div key={l.subject} className="ao-lane" style={{ background: l.fill, animationDelay: `${i * 0.15}s` }}>
                <div className="ao-lane-main">{l.subject} · {l.teacher} · {l.venue}</div>
                <div className="ao-lane-scope">{l.scope}</div>
                <div className="ao-lane-tag">{l.tag}</div>
              </div>
            ))}
          </div>
          <p className="ao-explain">All at the same time slot — same period, different sections, streams, even blocks.</p>
        </div>

        <div className="ao-divider" />

        <div className="ao-panel">
          <div className="ao-panel-head">
            <span className="ao-chip-or">Physics OR Chemistry</span>
          </div>
          <div className="ao-or-stage">
            {OR_STATES.map((s, i) => (
              <div key={s.subject} className={`ao-or-card ao-or-card-${i}`} style={{ background: s.fill, borderColor: s.stroke }}>
                <div className="ao-or-subject">{s.subject}</div>
                <div className="ao-or-reason">{s.reason}</div>
              </div>
            ))}
          </div>
          <p className="ao-explain">One slot, one subject at a time — whichever needs it more. Never both.</p>
        </div>
      </div>
      <div className="ao-caption">Illustrative demo — parallel scheduling (AND) vs. one-at-a-time allocation (OR)</div>

      <style>{`
        .ao-wrap { width: 100%; max-width: 760px; font-family: 'Plus Jakarta Sans', sans-serif; }
        .ao-engine { display: grid; grid-template-columns: 1fr auto 1fr; gap: 24px; align-items: start; }
        .ao-divider { width: 1px; background: #E8E4FF; align-self: stretch; }
        .ao-panel-head { margin-bottom: 14px; }
        .ao-chip-and, .ao-chip-or {
          display: inline-block; font: 500 11px 'DM Mono', monospace; color: #fff;
          background: #13111E; border-radius: 999px; padding: 6px 12px;
        }
        .ao-lanes { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .ao-lane {
          border-radius: 10px; padding: 8px 12px; opacity: 0;
          animation: ao-lane-in 0.6s cubic-bezier(.2,.9,.3,1.1) both;
          animation-play-state: paused;
        }
        .is-playing .ao-lane { animation-play-state: running; }
        @keyframes ao-lane-in { 0%{opacity:0; transform: translateX(-8px);} 100%{opacity:1; transform: translateX(0);} }
        .ao-lane-main { font-size: 12px; font-weight: 700; color: #13111E; }
        .ao-lane-scope { font-size: 10.5px; color: #4B5275; margin-top: 1px; }
        .ao-lane-tag {
          display: inline-block; margin-top: 5px; font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.04em; color: #7C6FE0; background: rgba(124,111,224,0.12); border-radius: 5px; padding: 2px 6px;
        }
        .ao-or-stage { position: relative; height: 92px; margin-bottom: 12px; }
        .ao-or-card {
          position: absolute; inset: 0; border-radius: 12px; border: 1.5px solid; padding: 14px 16px;
          display: flex; flex-direction: column; justify-content: center;
          animation-duration: 7s; animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite; animation-play-state: paused;
        }
        .is-playing .ao-or-card { animation-play-state: running; }
        .ao-or-card-0 { animation-name: ao-or-toggle-0; }
        .ao-or-card-1 { animation-name: ao-or-toggle-1; }
        @keyframes ao-or-toggle-0 { 0%,42%{opacity:1} 50%,92%{opacity:0} 100%{opacity:1} }
        @keyframes ao-or-toggle-1 { 0%,42%{opacity:0} 50%,92%{opacity:1} 100%{opacity:0} }
        .ao-or-subject { font-size: 15px; font-weight: 800; color: #13111E; }
        .ao-or-reason { font-size: 11px; color: #4B5275; margin-top: 4px; }
        .ao-explain { font-size: 11.5px; color: #8B87AD; line-height: 1.5; }
        .ao-caption { margin-top: 14px; font-size: 11px; color: #8B87AD; font-weight: 500; }

        @media (max-width: 680px) {
          .ao-engine { grid-template-columns: 1fr; }
          .ao-divider { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ao-lane { animation: none !important; opacity: 1 !important; }
          .ao-or-card { animation: none !important; }
          .ao-or-card-0 { opacity: 1 !important; }
          .ao-or-card-1 { opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}
