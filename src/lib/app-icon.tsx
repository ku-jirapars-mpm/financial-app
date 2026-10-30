import { ImageResponse } from "next/og";

/** App icon drawn at build/request time so no binary assets are needed. */
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
          color: "white",
          fontSize: size * 0.5,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        ฿
      </div>
    ),
    { width: size, height: size },
  );
}
