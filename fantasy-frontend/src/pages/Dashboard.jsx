// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import RiskSlider from "../components/RiskSlider";
import SeasonDropdown from "../components/SeasonDropdown";
import { useSeason } from "../hooks/useSeason";
import { getRotoRiskRankings, getActivePlayersStats } from "../api/fantasyApi";

// ---------- helpers ----------
function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function zScore(value, mean, std) {
  if (value === null || mean === null) return 0;
  const s = std && std > 0 ? std : 1;
  return (value - mean) / s;
}

// Background color for a z-score (green = good, red = bad)
function cellStyleFromZ(z) {
  // clamp z to [-2, 2] for nicer gradients
  const clamped = Math.max(-2, Math.min(2, z));

  // map to intensity 0..1
  const intensity = Math.abs(clamped) / 2;

  // light -> stronger fill
  if (clamped >= 0.75) {
    return {
      background: `rgba(26, 127, 55, ${0.18 + intensity * 0.22})`,
      borderColor: "rgba(26,127,55,0.35)",
      color: "#0b3d1a",
      fontWeight: 700,
    };
  }
  if (clamped >= 0.3) {
    return {
      background: `rgba(76, 175, 80, ${0.12 + intensity * 0.18})`,
      borderColor: "rgba(76,175,80,0.30)",
      color: "#0b3d1a",
      fontWeight: 700,
    };
  }
  if (clamped <= -0.75) {
    return {
      background: `rgba(176, 0, 32, ${0.14 + intensity * 0.22})`,
      borderColor: "rgba(176,0,32,0.35)",
      color: "#4a0010",
      fontWeight: 700,
    };
  }
  if (clamped <= -0.3) {
    return {
      background: `rgba(229, 57, 53, ${0.10 + intensity * 0.18})`,
      borderColor: "rgba(229,57,53,0.30)",
      color: "#4a0010",
      fontWeight: 700,
    };
  }

  // neutral
  return {
    background: "transparent",
    borderColor: "transparent",
    color: "#222",
    fontWeight: 600,
  };
}

export default function Dashboard() {
  const { season, setSeason, seasons } = useSeason();

  const [riskWeight, setRiskWeight] = useState(0.25);

  const [rankings, setRankings] = useState([]);
  const [statsById, setStatsById] = useState(new Map());
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

        setRankings(ranksRes.data);

        const m = new Map();
        statsRes.data.forEach((p) => m.set(p.id, p));
        setStatsById(m);
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

  const top50 = useMemo(() => rankings.slice(0, 50), [rankings]);

  const league = useMemo(() => {
    const CATS = [
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

    const sums = Object.fromEntries(CATS.map((k) => [k, 0]));
    const counts = Object.fromEntries(CATS.map((k) => [k, 0]));

    // mean
    statsById.forEach((p) => {
      const a = p?.avg || p?.stats; // allow either shape
      if (!a) return;
      for (const k of CATS) {
        const v = safeNum(a[k]);
        if (v === null) continue;
        sums[k] += v;
        counts[k] += 1;
      }
    });

    const means = {};
    for (const k of CATS) means[k] = counts[k] ? sums[k] / counts[k] : null;

    // std
    const varSums = Object.fromEntries(CATS.map((k) => [k, 0]));
    statsById.forEach((p) => {
      const a = p?.avg || p?.stats;
      if (!a) return;
      for (const k of CATS) {
        const v = safeNum(a[k]);
        const m = means[k];
        if (v === null || m === null) continue;
        varSums[k] += (v - m) ** 2;
      }
    });

    const stds = {};
    for (const k of CATS) stds[k] = counts[k] ? Math.sqrt(varSums[k] / counts[k]) : 1;

    return { means, stds };
  }, [statsById]);

  const StatCell = ({ cat, value, decimals }) => {
    const v = safeNum(value);
    const mean = safeNum(league.means?.[cat]);
    const std = safeNum(league.stds?.[cat]);

    let z = zScore(v, mean, std);
    if (cat === "turnovers") z = -z; // lower turnovers = better

    const text = v === null ? "-" : Number(v).toFixed(decimals);
    const styles = cellStyleFromZ(z);

    return (
      <td
        style={{
          textAlign: "right",
          whiteSpace: "nowrap",
          padding: 8,
          border: "1px solid #ddd",
          ...styles,
        }}
        title={`z = ${z.toFixed(2)}`}
      >
        {text}
      </td>
    );
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
          cellPadding="8"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            border: "1px solid #ddd",
          }}
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
              const ps = statsById.get(r.player_id);
              const avg = ps?.avg || ps?.stats || {};

              return (
                <tr key={r.player_id}>
                  <td style={{ border: "1px solid #ddd" }}>{idx + 1}</td>
                  <td style={{ border: "1px solid #ddd" }}>{r.player_name}</td>
                  <td style={{ border: "1px solid #ddd" }}>{ps?.position || "-"}</td>
                  <td style={{ border: "1px solid #ddd" }}>{ps?.team || "-"}</td>

                  <StatCell cat="fg_pct" value={avg.fg_pct} decimals={3} />
                  <StatCell cat="ft_pct" value={avg.ft_pct} decimals={3} />

                  <StatCell cat="three_pm" value={avg.three_pm} decimals={2} />
                  <StatCell cat="points" value={avg.points} decimals={2} />
                  <StatCell cat="rebounds" value={avg.rebounds} decimals={2} />
                  <StatCell cat="assists" value={avg.assists} decimals={2} />
                  <StatCell cat="steals" value={avg.steals} decimals={2} />
                  <StatCell cat="blocks" value={avg.blocks} decimals={2} />
                  <StatCell cat="turnovers" value={avg.turnovers} decimals={2} />

                  <td style={{ textAlign: "right", border: "1px solid #ddd" }}>
                    {Number(r.total_score ?? 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: "right", border: "1px solid #ddd" }}>
                    {(Number(r.risk_raw ?? 0) * 100).toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right", border: "1px solid #ddd" }}>
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
