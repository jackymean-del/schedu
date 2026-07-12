import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#13111E",
          padding: "56px 64px",
          position: "relative",
        }}
      >
        {/* oversized ghost mark, right side, clipped by canvas */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <path
            d="M 936 159 L 936 379 A 110 110 0 0 0 1156 379 L 1156 291"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="88"
            strokeLinecap="round"
            opacity={0.1}
          />
          <circle cx="1156" cy="197.5" r="49.5" fill="#D4920E" />
        </svg>

        {/* wordmark lockup, top-left */}
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 64,
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <svg width="34" height="34" viewBox="0 0 52 52" style={{ marginBottom: 2 }}>
            <path
              d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="36" cy="12.5" r="4.5" fill="#D4920E" />
          </svg>
          <span
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.7px",
              color: "#FFFFFF",
              display: "flex",
            }}
          >
            sched
            <span style={{ color: "#7C6FE0", fontStyle: "italic" }}>U</span>
          </span>
        </div>

        {/* title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-1.5px",
            color: "#FFFFFF",
            lineHeight: 1.08,
          }}
        >
          <span>The first timetable</span>
          <span style={{ fontStyle: "italic", color: "#B9AFF0" }}>that stays alive.</span>
        </div>

        {/* tagline */}
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#8B87AD", marginTop: 18 }}>
          A live board that follows the clock — for any institution, any curriculum.
        </div>

        {/* bhusku attribution */}
        <div
          style={{
            display: "flex",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "2.2px",
            color: "#3B3660",
            marginTop: 40,
          }}
        >
          BY BHUSKU · HEAVY ON CRAFT. FULL OF ENERGY.
        </div>
      </div>
    ),
    { ...size }
  );
}
