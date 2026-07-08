"use client";

import { useInView } from "./useInView";

/**
 * 03 · AND/OR combination engine. See design/marketing-motion/03-and-or-engine.md.
 * Budget: 18 KB raw / ≤5 KB gzip. No JS — dots travel via CSS `offset-path`,
 * shared keyframe sets (merge / split), per-dot stagger via animation-delay.
 *
 * Semantics (as actually implemented by schedU, not a generic "pick one"):
 *  - AND  = multiple subjects run in PARALLEL at the same slot — different
 *           student groups each attend their own subject, own teacher, own venue,
 *           simultaneously. Depicted as two clusters appearing together.
 *  - OR   = a CHOICE at the same slot — each student picks one of several
 *           subject options, each with its own teacher and venue (or stays in
 *           homeroom). Depicted as the same pool redistributing into two
 *           differently-taught, differently-housed groups.
 */

const AND_CLUSTERS = [
  { key: "phy", x: 330, y: 100, label: "Physics", sub: "Mr. Rao · R-12", fill: "#EDE9FF", stroke: "#7C6FE0" },
  { key: "chem", x: 330, y: 240, label: "Chemistry", sub: "Ms. Nair · Lab-2", fill: "#DBEAFE", stroke: "#3B82F6" },
];

const OR_CLUSTERS = [
  { key: "pe", x: 620, y: 100, label: "PE", sub: "Mr. Khan · Hall", fill: "#DCFCE7", stroke: "#16A34A" },
  { key: "paint", x: 620, y: 240, label: "Painting", sub: "Ms. Iyer · Room 9", fill: "#FCE7F3", stroke: "#DB2777" },
];

const ROWS = [
  { label: "XI-A", y: 60, count: 4 },
  { label: "XI-B", y: 170, count: 3 },
  { label: "XI-C", y: 280, count: 4 },
];

function bezier(from: { x: number; y: number }, to: { x: number; y: number }, midX: number) {
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

// Each dot: merges into one of the two AND clusters (parallel subjects),
// then redistributes into one of the two OR clusters — deliberately mixed
// so both AND groups feed both OR groups (the "same pool, different split").
const DOTS = ROWS.flatMap((row, rowIdx) =>
  Array.from({ length: row.count }, (_, i) => {
    const andTarget = AND_CLUSTERS[(rowIdx + i) % 2];
    const orTarget = OR_CLUSTERS[(rowIdx + i * 2) % 2];
    return {
      id: `${row.label}-${i}`,
      mergeD: bezier({ x: 60, y: row.y }, andTarget, 200),
      splitD: bezier(andTarget, orTarget, 480),
      delay: (rowIdx * 3 + i) * 0.08,
    };
  })
);

export function AndOrEngine() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="ao-wrap" style={{ contentVisibility: "auto", position: "relative" }}>
      <svg
        viewBox="0 0 760 340"
        className={`ao-engine ${inView ? "is-playing" : ""}`}
        role="img"
        aria-label="Illustrative animation of schedU's AND/OR Academic Combination Matrix: parallel subjects and choice-based regrouping"
      >
        {/* section row labels + dots */}
        {ROWS.map((row) => (
          <g key={row.label}>
            <text x={20} y={row.y + 4} className="ao-row-label">{row.label}</text>
            {Array.from({ length: row.count }, (_, i) => (
              <circle key={i} cx={68 + i * 16} cy={row.y} r={5} className="ao-seed-dot" />
            ))}
          </g>
        ))}

        {/* travelling dots */}
        <g>
          {DOTS.map((d) => (
            <circle
              key={`m-${d.id}`}
              r={5}
              className="ao-dot ao-dot-merge"
              style={{ offsetPath: `path("${d.mergeD}")`, animationDelay: `${d.delay}s` }}
            />
          ))}
          {DOTS.map((d) => (
            <circle
              key={`s-${d.id}`}
              r={5}
              className="ao-dot ao-dot-split"
              style={{ offsetPath: `path("${d.splitD}")`, animationDelay: `${d.delay}s` }}
            />
          ))}
        </g>

        {/* AND clusters — parallel subjects, appear together */}
        {AND_CLUSTERS.map((c) => (
          <g key={c.key} className="ao-node ao-cluster-and" transform={`translate(${c.x},${c.y})`}>
            <circle r={34} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
            <circle className="ao-knob" cx={20} cy={-20} r={4.5} fill="#D4920E" />
            <text y={-1} textAnchor="middle" className="ao-node-label">{c.label}</text>
            <text y={13} textAnchor="middle" className="ao-node-sub">{c.sub}</text>
          </g>
        ))}

        {/* OR clusters — the choice */}
        {OR_CLUSTERS.map((c) => (
          <g key={c.key} className="ao-node ao-cluster-or" transform={`translate(${c.x},${c.y})`}>
            <circle r={30} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
            <text y={-1} textAnchor="middle" className="ao-node-label">{c.label}</text>
            <text y={13} textAnchor="middle" className="ao-node-sub">{c.sub}</text>
          </g>
        ))}

        {/* expression chip */}
        <g transform="translate(270, 16)">
          <rect width={220} height={26} rx={13} fill="#13111E" />
          <text x={110} y={17} textAnchor="middle" className="ao-chip ao-chip-and">Physics AND Chemistry</text>
          <text x={110} y={17} textAnchor="middle" className="ao-chip ao-chip-or">PE OR Painting</text>
        </g>
      </svg>
      <div className="ao-caption">Illustrative demo — parallel subjects (AND), student choice (OR)</div>

      <style>{`
        .ao-wrap { width: 100%; max-width: 700px; }
        .ao-engine { width: 100%; height: auto; display: block; }
        .ao-row-label { font: 700 11px 'Plus Jakarta Sans', sans-serif; fill: #8B87AD; }
        .ao-seed-dot { fill: #13111E; opacity: 0.65; }
        .ao-node-label { font: 700 12px 'Plus Jakarta Sans', sans-serif; fill: #13111E; }
        .ao-node-sub { font: 600 9px 'Plus Jakarta Sans', sans-serif; fill: #4B5275; }
        .ao-chip { font: 500 12px 'DM Mono', monospace; fill: #fff; }
        .ao-caption {
          position: absolute; bottom: 4px; left: 8px;
          font-size: 11px; color: #8B87AD; font-weight: 500;
        }

        .ao-dot { fill: #13111E; opacity: 0; offset-rotate: 0deg; }
        .ao-knob { opacity: 0.5; }

        .ao-dot, .ao-chip-and, .ao-chip-or, .ao-cluster-and, .ao-cluster-or {
          animation-duration: 13s;
          animation-timing-function: cubic-bezier(.45,0,.25,1);
          animation-iteration-count: infinite;
          animation-play-state: paused;
        }
        .is-playing .ao-dot, .is-playing .ao-chip-and, .is-playing .ao-chip-or,
        .is-playing .ao-cluster-and, .is-playing .ao-cluster-or { animation-play-state: running; }

        @keyframes ao-merge {
          0%, 8%   { offset-distance: 0%;   opacity: 0; }
          9%       { opacity: 1; }
          27%      { offset-distance: 100%; opacity: 1; }
          38%      { offset-distance: 100%; opacity: 1; }
          40%      { opacity: 0; }
          100%     { offset-distance: 100%; opacity: 0; }
        }
        @keyframes ao-split {
          0%, 45%  { offset-distance: 0%;   opacity: 0; }
          46%      { opacity: 1; }
          65%      { offset-distance: 100%; opacity: 1; }
          88%      { offset-distance: 100%; opacity: 1; }
          94%      { opacity: 0; }
          100%     { offset-distance: 100%; opacity: 0; }
        }
        .ao-dot-merge { animation-name: ao-merge; }
        .ao-dot-split { animation-name: ao-split; }

        /* Both AND clusters share one timing — they appear together (parallel) */
        @keyframes ao-and-breathe {
          0%, 7%   { transform: scale(0); opacity: 0; }
          12%      { opacity: 1; }
          32%      { transform: scale(1.05); }
          38%, 40% { transform: scale(1); opacity: 1; }
          45%      { transform: scale(0.85); opacity: 0; }
          100%     { transform: scale(0); opacity: 0; }
        }
        .ao-cluster-and { animation-name: ao-and-breathe; transform-box: fill-box; transform-origin: center; }

        @keyframes ao-or-breathe {
          0%, 44%  { transform: scale(0); opacity: 0; }
          49%      { opacity: 1; }
          65%      { transform: scale(1.05); }
          75%, 88% { transform: scale(1); opacity: 1; }
          93%      { transform: scale(0.85); opacity: 0; }
          100%     { transform: scale(0); opacity: 0; }
        }
        .ao-cluster-or { animation-name: ao-or-breathe; transform-box: fill-box; transform-origin: center; }

        @keyframes ao-chip-and { 0%,42%{opacity:1} 45%,100%{opacity:0} }
        @keyframes ao-chip-or  { 0%,42%{opacity:0} 46%,92%{opacity:1} 96%,100%{opacity:0} }
        .ao-chip-and { animation-name: ao-chip-and; }
        .ao-chip-or  { animation-name: ao-chip-or; }

        @media (prefers-reduced-motion: reduce) {
          .ao-dot, .ao-chip-and, .ao-chip-or, .ao-cluster-and, .ao-cluster-or { animation: none !important; }
          /* Pin to the OR (choice) state: both groups populated, both chips' meaning visible via the OR chip */
          .ao-dot-merge { opacity: 0 !important; }
          .ao-dot-split { opacity: 1 !important; offset-distance: 100% !important; }
          .ao-cluster-and { transform: scale(0.6) !important; opacity: 0.35 !important; }
          .ao-cluster-or { transform: scale(1) !important; opacity: 1 !important; }
          .ao-chip-and { opacity: 0 !important; }
          .ao-chip-or { opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}
