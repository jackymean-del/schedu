"use client";

import { useEffect, useState } from "react";

const CHAPTERS = [
  "Tune", "Feed", "Combine", "Rooms", "Allocate",
  "Optimize", "Views", "Live", "Assign", "Track", "Build",
];

/**
 * Fixed vertical rail proving the 11 beats are one authored sequence, not
 * 11 separate widgets — highlights whichever beat section is currently
 * most in view. See design/scrollytelling/00-system.md §2.3.
 */
export function ChapterRail() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-beat]"));
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.beat);
          if (entry.intersectionRatio > (best?.ratio ?? 0)) best = { idx, ratio: entry.intersectionRatio };
        }
        if (best) setActive(best.idx);
      },
      { threshold: [0.2, 0.4, 0.6, 0.8] }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="chapter-rail" aria-hidden="true">
      {CHAPTERS.map((label, i) => (
        <div key={label} className={`rail-tick ${i === active ? "is-active" : ""} ${i < active ? "is-done" : ""}`}>
          <span className="rail-dot" />
          <span className="rail-label">{label}</span>
        </div>
      ))}
      <style>{`
        .chapter-rail {
          position: fixed; right: 18px; top: 50%; transform: translateY(-50%);
          z-index: 40; display: flex; flex-direction: column; gap: 10px;
        }
        .rail-tick { display: flex; align-items: center; gap: 8px; }
        .rail-dot { width: 6px; height: 6px; border-radius: 50%; background: #E8E4FF; transition: background 0.25s, transform 0.25s; flex-shrink: 0; }
        .rail-tick.is-done .rail-dot { background: #C4B5FD; }
        .rail-tick.is-active .rail-dot { background: #D4920E; transform: scale(1.6); }
        .rail-label {
          font: 700 10px 'Plus Jakarta Sans', sans-serif; color: #B8B4D4;
          opacity: 0; transform: translateX(4px); transition: opacity 0.2s, transform 0.2s, color 0.2s;
          white-space: nowrap;
        }
        .rail-tick.is-active .rail-label { opacity: 1; transform: translateX(0); color: #7C6FE0; }
        @media (max-width: 900px) { .chapter-rail { display: none; } }
        @media (prefers-reduced-motion: reduce) {
          .rail-dot, .rail-label { transition: none; }
        }
      `}</style>
    </div>
  );
}
