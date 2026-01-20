// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import RiskSlider from "../components/RiskSlider";
import SeasonDropdown from "../components/SeasonDropdown";
import { useSeason } from "../hooks/useSeason";
import { getRotoRiskRankings, getActivePlayersStats } from "../api/fantasyApi";

// ---------- helpers ----------
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtPct = (v) => {
  const n = num(v);
  return n === null ? "-" : n.toFixed(3);
};

const fmt2 = (v) => {
  const n = num(v);
  return n === null ? "-" : n.toFixed(2);
};

// clamp 0..1
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Linear interpolation between two numbers
const lerp = (a, b, t) => a + (b - a) * t;

// Color mix between red -> gray -> green
// t=0 => redish, t=0.5 => neutral, t=1 => greenish
const heatColor = (t) => {
  const red = { r: 244, g: 67, b: 54 };     // #f44336
  const mid = { r: 245, g: 245, b: 245 };   // #f5f5f5
  const grn = { r: 76, g: 175, b: 80 };     // #4caf50

  let c1, c2, tt;
  if (t <= 0.5) {
    c1 = red;
    c2 = mid;
    tt = t / 0.5;
  } else {
    c1 = mid;
    c2 = grn;
    tt = (t - 0.5) / 0.5;
  }

  const r = Math.round(lerp(c1.r, c2.r, tt));
  const g = Math.round(lerp(c1.g, c2.g, tt));
  const b = Math.round(lerp(c1.b, c2.b, tt));
  return `rgb(${r}, ${g}, ${b})`;
};

// Choose black/white text depending on background brightness
const readableTextColor = (bgRgb) => {
  // bgRgb like "rgb(r,g,b)"
  const m = bgRgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return "#111";
  const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
  // perceived luminance
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 160 ? "#fff" : "#111";
};

// -----------------------------------

export default function Dashboard() {
  const { season, setSeason, seasons } = useSeason();

  const [riskWeight, setRiskWeight] = useState(0.25);

  const [rankings, setRankings] = useState([]);
  const [statsList, setStatsList] = useState([]); // raw stats objects from /active_players_stats

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [ranksRes, statsRes] = await Promise.all([
          getRotoRiskRankings({ season, risk_weight: riskWeight }),
          getActivePlayersStats({ season }),
        ]);

        if (cancelled) return;

        setRankings(ranksRes.data || []);
        setStatsList(statsRes.data || []);
      } catch (err) {
        console.error(err);
        alert("Failed to load dashboard. Check backend + CORS.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [season, riskWeight]);

  // Map stats by id for quick lookup
  const statsById = useMemo(() => {
    const m = new Map();
    (statsList || []).forEach((row) => {
      const id = num(row?.id ?? row?.player_id);
      if (id !== null) m.set(id, row);
    });
    return m;
  }, [statsList]);

  // Compute league min/max for each stat (using avg)
  const leagueMinMax = useMemo(() => {
    const keys = [
      "fg_pct",
      "ft_pct",
      "three_pm",
      "points",
      "rebounds",
      "assists",
      "steals",
      "blocks",
      "turnovers",
    ];

    const mm = {};
    keys.forEach((k) => (mm[k] = { min: Infinity, max: -Infinity }));

    (statsList || []).forEach((row) => {
      const a = row?.avg || {};
      keys.forEach((k) => {
        const v = num(a[k]);
        if (v === null) return;
        if (v < mm[k].min) mm[k].min = v;
        if (v > mm[k].max) mm[k].max = v;
      });
    });

    // handle empty/Infinity cases
    keys.forEach((k) => {
      if (!Number.isFinite(mm[k].min) || !Number.isFinite(mm[k].max)) {
        mm[k] = { min: 0, max: 1 };
      }
      if (mm[k].min === mm[k].max) {
        // avoid divide-by-zero later
        mm[k].max = mm[k].min + 1;
      }
    });

    return mm;
  }, [statsList]);

  const top50 = useMemo(() => (rankings || []).slice(0, 50), [rankings]);

  // stat cell style helper (background colored)
  const statCellStyle = (key, value) => {
    const v = num(value);
    if (v === null) return { textAlign: "right" };

    // turnovers are "bad" when higher => invert heat
    const invert = key === "turnovers";

    const { min, max } = leagueMinMax[key] || { min: 0, max: 1 };
    let t = (v - min) / (max - min);
    t = clamp01(t);
    if (invert) t = 1 - t;

    const bg = heatColor(t);
    const color = readableTextColor(bg);

    return {
      textAlign: "right",
      background: bg,
      color,
      fontWeight: 700,
    };
  };

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Top 50 players by roto + durability. Showing {season} averages.</p>

      <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />
      <RiskSlider value={riskWeight} onChange={setRiskWeight} />

      {loading ? (
        <Loading text="Loading dashboard..." />
      ) : (
        <table
          border="1"
          cellPadding="8"
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Pos</th>
              <th>Team</th>

              <th>FG%</th>
              <th>FT%</th>
              <th>3PM</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TOV</th>

              <th>Roto</th>
              <th>Risk%</th>
              <th>Combined</th>
            </tr>
          </thead>

          <tbody>
            {top50.map((r, idx) => {
              const pid = Number(r.player_id);
              const row = statsById.get(pid);

              const a = row?.avg || {};
              const pos = row?.position || "-";
              const team = row?.team || "-";

              return (
                <tr key={pid}>
                  <td>{idx + 1}</td>
                  <td>{r.player_name}</td>
                  <td>{pos}</td>
                  <td>{team}</td>

                  <td style={statCellStyle("fg_pct", a.fg_pct)}>{fmtPct(a.fg_pct)}</td>
                  <td style={statCellStyle("ft_pct", a.ft_pct)}>{fmtPct(a.ft_pct)}</td>

                  <td style={statCellStyle("three_pm", a.three_pm)}>{fmt2(a.three_pm)}</td>
                  <td style={statCellStyle("points", a.points)}>{fmt2(a.points)}</td>
                  <td style={statCellStyle("rebounds", a.rebounds)}>{fmt2(a.rebounds)}</td>
                  <td style={statCellStyle("assists", a.assists)}>{fmt2(a.assists)}</td>
                  <td style={statCellStyle("steals", a.steals)}>{fmt2(a.steals)}</td>
                  <td style={statCellStyle("blocks", a.blocks)}>{fmt2(a.blocks)}</td>
                  <td style={statCellStyle("turnovers", a.turnovers)}>{fmt2(a.turnovers)}</td>

                  <td style={{ textAlign: "right" }}>
                    {Number(r.total_score ?? 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {(Number(r.risk_raw ?? 0) * 100).toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {Number(r.combined_score ?? 0).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
