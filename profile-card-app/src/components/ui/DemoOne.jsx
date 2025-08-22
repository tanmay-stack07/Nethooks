import React from "react";
import { ChromeGrid } from "./ChromeGrid";

const DemoOne = () => {
  return (
    <div style={{ height: "100svh", width: "100vw", position: "relative" }}>
      <ChromeGrid />
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2.5rem, 6vw, 5rem)",
            fontWeight: 300,
            marginBottom: "0.75rem",
            letterSpacing: "0.3em",
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          Surface Tension
        </h1>
        <p
          style={{
            fontSize: "clamp(0.85rem, 1.2vw, 1rem)",
            color: "rgba(255,255,255,0.7)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
            letterSpacing: "0.08em",
          }}
        >
          Metal that responds to touch.
        </p>
      </div>
    </div>
  );
};

export { DemoOne };
export default DemoOne;
