"use client";

import { useScrollProgress, reducedMotion } from "./useScrollProgress";
import { appHref } from "@/lib/appUrl";

export function Beat11FinalCTA() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  const rm = reducedMotion();
  const p = rm ? 1 : progress;
  const markIn = Math.min(1, p / 0.3);
  const replayResolved = p > 0.55;
  const contentIn = p > 0.55;

  return (
    <section ref={ref} data-beat={10} className="beat beat11">
      <svg viewBox="0 0 52 52" className="b11-mark" style={{ opacity: markIn }}>
        <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={80} strokeDashoffset={80 - markIn * 80} />
        <circle cx={36} cy={12.5} r={4.5} fill="#D4920E" opacity={markIn} />
      </svg>

      <svg viewBox="0 0 160 60" className="b11-mini">
        {[0, 1].map((i) => (
          <rect key={i} x={20 + i * 40} y={10} width={30} height={16} rx={4}
            fill={i === 0 ? "#EDE9FF" : "#DBEAFE"}
            stroke={replayResolved ? "none" : "#EF4444"} strokeWidth={2}
            style={{ transition: "stroke 0.5s" }} />
        ))}
        {replayResolved && (
          <g transform="translate(55, 40)">
            <rect width={50} height={16} rx={8} fill="#13111E" />
            <circle cx={10} cy={8} r={3.5} fill="#D4920E" />
            <text x={18} y={12} fontSize={8} fontWeight={800} fill="#fff" fontFamily="'Plus Jakarta Sans',sans-serif">0 conflicts</text>
          </g>
        )}
      </svg>

      <div className="b11-content" style={{ opacity: contentIn ? 1 : 0, transform: contentIn ? "translateY(0)" : "translateY(10px)" }}>
        <h2 className="b11-h2">The last schedule you&rsquo;ll ever fix by hand.</h2>
        <a href={appHref("/register")} className="no-underline">
          <button className="b11-btn">Build yours now →</button>
        </a>
      </div>

      <style>{`
        .beat11 { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 60px 6vw; background: radial-gradient(120% 140% at 50% -10%, #232048 0%, #13111E 55%, #0B0A14 100%); }
        .b11-mark { width: 88px; height: 88px; }
        .b11-mini { width: 160px; height: 60px; }
        .b11-content { text-align: center; transition: opacity 0.5s, transform 0.5s; }
        .b11-h2 { font-size: clamp(22px, 3.4vw, 32px); font-weight: 400; color: #fff; margin-bottom: 22px; max-width: 460px; }
        .b11-btn {
          background: #D4920E; color: #13111E; font-weight: 800; font-size: 15px; padding: 14px 30px;
          border-radius: 9px; border: none; cursor: pointer; box-shadow: 0 0 40px rgba(212,146,14,0.35);
        }
        @media (prefers-reduced-motion: reduce) { .b11-content { transition: none; } }
      `}</style>
    </section>
  );
}
