// src/components/RiskSlider.jsx
import React from "react";

export default function RiskSlider({
  value,
  onChange,
  label = "Availability Weight",
  showLabel = true,
  min = 0,
  max = 2,
  step = 0.05,
  width = 520,
}) {
  return (
    <div style={{ width }}>
      {showLabel && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            {label}:{" "}
            <span style={{ color: "#fff", fontWeight: 800 }}>
              {Number(value).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}
