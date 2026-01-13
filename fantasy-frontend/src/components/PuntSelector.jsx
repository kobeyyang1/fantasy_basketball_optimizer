const CATEGORIES = [
  { key: "fg_pct", label: "FG%" },
  { key: "ft_pct", label: "FT%" },
  { key: "three_pm", label: "3PM" },
  { key: "points", label: "PTS" },
  { key: "rebounds", label: "REB" },
  { key: "assists", label: "AST" },
  { key: "steals", label: "STL" },
  { key: "blocks", label: "BLK" },
  { key: "turnovers", label: "TOV" },
];

export default function PuntSelector({ value, onChange }) {
  // value is an array like ["ft_pct", "turnovers"]

  const toggle = (key) => {
    if (value.includes(key)) {
      onChange(value.filter((x) => x !== key));
    } else {
      onChange([...value, key]);
    }
  };

  return (
    <div style={{ margin: "16px 0" }}>
      <h3>Punt Categories (optional)</h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {CATEGORIES.map((c) => (
          <label
            key={c.key}
            style={{
              border: "1px solid #ccc",
              padding: "8px 10px",
              borderRadius: 8,
              cursor: "pointer",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              type="checkbox"
              checked={value.includes(c.key)}
              onChange={() => toggle(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 8, color: "#666" }}>
        Selected: {value.length ? value.join(", ") : "None"}
      </div>
    </div>
  );
}
