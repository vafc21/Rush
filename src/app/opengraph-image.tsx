import { ImageResponse } from "next/og";

// Branded 1200x630 card shown when a Rush link (e.g. an invite
// /join/CODE) is shared on iMessage, Discord, Slack, etc.
export const alt = "Rush — beat your friends at fake-money casino games";
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
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 35%, #15303f 0%, #0F212E 60%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 20,
              background: "linear-gradient(135deg, #00E701, #FFB800)",
              transform: "rotate(45deg)",
            }}
          />
          <div
            style={{
              fontSize: 132,
              fontWeight: 900,
              letterSpacing: 16,
            }}
          >
            RUSH
          </div>
        </div>
        <div
          style={{
            marginTop: 44,
            fontSize: 42,
            color: "#B1BAD3",
            maxWidth: 860,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          Beat your friends at fake-money casino games
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 28,
            color: "#7B8BA8",
          }}
        >
          1,000 points each · highest balance wins
        </div>
      </div>
    ),
    { ...size }
  );
}
