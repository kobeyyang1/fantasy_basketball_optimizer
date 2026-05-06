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

export default function PuntSelector({ value = [], onChange }) { // ui component for selecting which categories to punt
  const selected = new Set(value);

  const toggle = (key) => { // toggle a category on or off
    const next = new Set(selected); // create a new set to trigger re-render
    if (next.has(key)) next.delete(key); // if already selected, unselect it; otherwise, select it
    else next.add(key); // toggle selection
    onChange?.(Array.from(next)); // call onChange with the new selection as an array
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
