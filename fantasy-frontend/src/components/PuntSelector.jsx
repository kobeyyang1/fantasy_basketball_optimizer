// src/components/PuntSelector.jsx
import React from "react";

const LABELS = [
  ["fg_pct", "FG%"],
  ["ft_pct", "FT%"],
  ["three_pm", "3PM"],
  ["points", "PTS"],
  ["rebounds", "REB"],
  ["assists", "AST"],
  ["steals", "STL"],
  ["blocks", "BLK"],
  ["turnovers", "TOV"],
];

export default function PuntSelector({ value = [], onChange }) {
  const selected = new Set(value);

  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange?.(Array.from(next));
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {LABELS.map(([key, label]) => (
        <label
          key={key}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={selected.has(key)}
            onChange={() => toggle(key)}
          />
          <span style={{ fontWeight: 700 }}>{label}</span>
        </label>
      ))}
    </div>
  );
}
