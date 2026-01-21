// src/components/StatCell.jsx
import React from "react";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function bgFromZ(z, invert = false) {
  if (z === null || z === undefined || Number.isNaN(z)) {
    return { backgroundColor: "rgba(255,255,255,0.02)", color: "#e6edf3" };
  }

  // invert means "lower is better" (turnovers)
  const val = invert ? -z : z;

  // intensity based on |z|
  const t = clamp(Math.abs(val) / 2.25, 0, 1);
  const alpha = 0.08 + t * 0.50; // 0.08 .. 0.58

  // dark-theme friendly greens/reds
  const good = "34,197,94";   // green
  const bad = "239,68,68";    // red
  const rgb = val >= 0 ? good : bad;

  // always readable text
  const color = "#f8fafc";

  return {
    backgroundColor: `rgba(${rgb}, ${alpha})`,
    color,
  };
}

export default function StatCell({
  value,
  z,
  invert = false,
  align = "right",
  style = {},
}) {
  const s = bgFromZ(z, invert);

  return (
    <td
      style={{
        padding: "10px 10px",
        textAlign: align,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        whiteSpace: "nowrap",
        ...s,
        ...style,
      }}
    >
      {value}
    </td>
  );
}
