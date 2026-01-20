// src/components/SeasonDropdown.jsx
export default function SeasonDropdown({ value, onChange, seasons }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Season</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, minWidth: 140 }}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
