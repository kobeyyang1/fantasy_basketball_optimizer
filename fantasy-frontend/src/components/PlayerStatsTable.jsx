import { STAT_KEYS } from "../hooks/useLeagueStats";

function cellStyle(z) {
  if (z >= 1.0) return { backgroundColor: "#b7f7c1" };
  if (z >= 0.4) return { backgroundColor: "#ddfbe2" };
  if (z <= -1.0) return { backgroundColor: "#ffb7b7" };
  if (z <= -0.4) return { backgroundColor: "#ffe0e0" };
  return { backgroundColor: "#f5f5f5" };
}

function formatStat(key, v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  const n = Number(v);

  if (key === "fg_pct" || key === "ft_pct") return n.toFixed(3);
  return n.toFixed(1);
}

const LABELS = {
  fg_pct: "FG%",
  ft_pct: "FT%",
  three_pm: "3PM",
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TOV",
};

export default function PlayerStatsTable({
  rows,
  statsById,
  league,
  extraHeaders = [],
  renderExtraCells = () => null,
  actionHeader = null,
  renderActions = () => null,
  limit = 80,
}) {
  const shown = rows.slice(0, limit);

  return (
    <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Pos</th>
          <th>Team</th>

          {STAT_KEYS.map((k) => (
            <th key={k}>{LABELS[k]}</th>
          ))}

          {extraHeaders.map((h) => (
            <th key={h}>{h}</th>
          ))}

          {actionHeader ? <th>{actionHeader}</th> : null}
        </tr>
      </thead>

      <tbody>
        {shown.map((p, idx) => {
          const s = statsById.get(p.player_id);

          return (
            <tr key={p.player_id}>
              <td>{idx + 1}</td>
              <td>{p.player_name}</td>
              <td>{p.position || "-"}</td>
              <td>{p.team || "-"}</td>

              {STAT_KEYS.map((key) => {
                const v = s?.[key];
                const num = Number(v);
                const { mean, std } = league[key] || { mean: 0, std: 0 };
                const z = std ? (num - mean) / std : 0;

                // turnovers are bad -> invert for color
                const zForColor = key === "turnovers" ? -z : z;

                return (
                  <td key={key} style={{ textAlign: "right", ...cellStyle(zForColor) }}>
                    {formatStat(key, v)}
                  </td>
                );
              })}

              {renderExtraCells(p)}

              {actionHeader ? <td>{renderActions(p)}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
