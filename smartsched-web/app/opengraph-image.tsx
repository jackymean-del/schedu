import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = "schedU — AI timetable scheduling for any institution";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(180deg, #f8f7ff 0%, #ffffff 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              position: "relative",
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#7c6fe0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 40,
                fontWeight: 800,
                fontStyle: "italic",
                color: "white",
              }}
            >
              U
            </div>
            <div
              style={{
                position: "absolute",
                top: 13,
                right: 13,
                width: 11,
                height: 11,
                borderRadius: 11,
                background: "#d4920e",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#13111e" }}>
            sched
            <span style={{ color: "#7c6fe0", fontStyle: "italic" }}>U</span>
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#13111e",
            maxWidth: 900,
          }}
        >
          Build Perfect Timetables in Minutes
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#4b5275",
            maxWidth: 880,
          }}
        >
          {siteConfig.description}
        </div>
      </div>
    ),
    { ...size },
  );
}
