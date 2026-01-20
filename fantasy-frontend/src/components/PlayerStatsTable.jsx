// src/components/PlayerStatsTable.jsx
import React, { useMemo } from "react";

/**
 * z is expected to be roughly in [-3, 3]. We clamp it.
 * - positive => greener
 * - negative => redder
 * alpha controls intensity
 */
function heatBgFromZ(z) {
  const v = Number(z);
  if (Number.isNaN(v)) return "transparent";

  const clamped = Math.max(-3, Math.min(3, v));
  const t = Math.abs(clamped) / 3; // 0..1
  const alpha = 0.12 + 0.40 * t; // 0.12..0.52 (tweak if you want stronger)

  // Green for positive, Red for negative
  return clamped >= 0
    ? `rgba(0, 190, 90, ${alpha})`
    : `rgba(220, 40, 60, ${alpha})`;
}

/**
 * Decide text color based on background alpha/intensity.
 * Since we use rgba, easiest is: when |z| is big, use white, else use near-white.
 * For a dark UI, we keep text light overall.
 */
function textColorFromZ(z) {
  const v = Number(z);
  if (Number.isNaN(v)) return "rgba(255,255,255,0.9)";

  const clamped = Math.max(-3, Math.min(3, v));
  const t = Math.abs(clamped) / 3; // 0..1

  // Strong heat => pure white. Weak heat => slightly dimmer white.
  return t > 0.35 ? "#ffffff" : "rgba(255,255,255,0.88)";
}

function cellStyle(z) {
  return {
    background: heatBgFromZ(z),
    color: textColorFromZ(z),
    fontWeight: 700,
    textAlign: "right",
    padding: "10px 10px",
    // helps readability on colored backgrounds
    textShadow: "0 1px 0 rgba(0,0,0,0.35)",
  };
}

// Use this for non-heat cells (like name/team)
const plainCell = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

export default function PlayerStatsTable({
  rows,
  // rows should already contain: name/team/pos plus the stat values AND (optionally) z-scores per stat
  // Example expected structure per row:
  // {
  //   player_id, player_name, position, team,
  //   stats: { fg_pct, ft_pct, three_pm, points, ... },
  //   z: { fg_pct, ft_pct, three_pm, points, ... },
  //   total_score, risk_raw, combined_score
  // }
}) {
  const cols = useMemo(
    () => [
      { key: "fg_pct", label: "FG%" },
      { key: "ft_pct", label: "FT%" },
      { key: "three_pm", label: "3PM" },
      { key: "points", label: "PTS" },
      { key: "rebounds", label: "REB" },
      { key: "assists", label: "AST" },
      { key: "steals", label: "STL" },
      { key: "blocks", label: "BLK" },
      { key: "turnovers", label: "TOV" },
    ],
    []
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...plainCell, textAlign: "left" }}>#</th>
            <th style={{ ...plainCell, textAlign: "left" }}>Name</th>
            <th style={{ ...plainCell, textAlign: "left" }}>Pos</th>
            <th style={{ ...plainCell, textAlign: "left" }}>Team</th>

            {cols.map((c) => (
              <th key={c.key} style={{ ...plainCell, textAlign: "right" }}>
                {c.label}
              </th>
            ))}

            <th style={{ ...plainCell, textAlign: "right" }}>Roto</th>
            <th style={{ ...plainCell, textAlign: "right" }}>Risk%</th>
            <th style={{ ...plainCell, textAlign: "right" }}>Combined</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.player_id}>
              <td style={{ ...plainCell, textAlign: "left", color: "rgba(255,255,255,0.9)" }}>
                {idx + 1}
              </td>

              <td style={{ ...plainCell, textAlign: "left", fontWeight: 800 }}>
                {r.player_name}
              </td>

              <td style={{ ...plainCell, textAlign: "left", color: "rgba(255,255,255,0.85)" }}>
                {r.position || "-"}
              </td>

              <td style={{ ...plainCell, textAlign: "left", color: "rgba(255,255,255,0.85)" }}>
                {r.team || "-"}
              </td>

              {cols.map((c) => {
                const val = r.stats?.[c.key];
                const z = r.z?.[c.key]; // <-- IMPORTANT: color uses z-score
                const isPct = c.key === "fg_pct" || c.key === "ft_pct";

                const formatted =
                  val === null || val === undefined
                    ? "-"
                    : isPct
                    ? Number(val).toFixed(3)
                    : Number(val).toFixed(2);

                return (
                  <td key={c.key} style={cellStyle(z)}>
                    {formatted}
                  </td>
                );
              })}

              <td style={{ ...plainCell, textAlign: "right" }}>
                {Number(r.total_score ?? 0).toFixed(2)}
              </td>

              <td style={{ ...plainCell, textAlign: "right" }}>
                {(Number(r.risk_raw ?? 0) * 100).toFixed(1)}%
              </td>

              <td style={{ ...plainCell, textAlign: "right", fontWeight: 900 }}>
                {Number(r.combined_score ?? 0).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
