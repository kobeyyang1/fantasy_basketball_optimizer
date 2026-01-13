export default function RiskSlider({ value, onChange }) {
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ marginBottom: "6px" }}>
        Risk Weight: <b>{value}</b>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 320 }}
      />
    </div>
  );
}
