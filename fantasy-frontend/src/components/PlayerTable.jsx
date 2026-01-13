export default function PlayerTable({ players }) {
  const riskColor = (r) => {
    if (r >= 0.85) return "#2ecc71"; // green
    if (r >= 0.70) return "#f1c40f"; // yellow
    return "#e74c3c";               // red
  };

  return (
    <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Roto Score</th>
          <th>Durability</th>
          <th>Combined Score</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, idx) => {
          const risk = Number(p.risk_raw) || 0;
          const riskPct = (risk * 100).toFixed(1);

          return (
            <tr key={p.player_id}>
              <td>{idx + 1}</td>
              <td>{p.player_name}</td>
              <td>{Number(p.total_score || 0).toFixed(2)}</td>

              <td style={{ color: riskColor(risk), fontWeight: "bold" }}>
                {riskPct}%
              </td>

              <td>{Number(p.combined_score || 0).toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
