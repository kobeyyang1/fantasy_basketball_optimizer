// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import RiskSlider from "../components/RiskSlider";
import SeasonDropdown from "../components/SeasonDropdown";
import { useSeason } from "../hooks/useSeason";
import { getRotoRiskRankings, getActivePlayersStats } from "../api/fantasyApi";

// ---------- robust helpers ----------
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pick = (obj, keys, fallback = null) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
};

const getId = (row) => {
  const raw = pick(row, ["id", "player_id"]);
  const n = num(raw);
  return n === null ? null : n;
};

const getStatsObj = (row) => {
  if (!row) return null;
  // backend now returns { totals, avg }, older used {stats}
  return row.avg || row.totals || row.stats || null;
};

const getStat = (stats, key) => {
  const map = {
    fg_pct: ["fg_pct", "fg%", "fgp", "fgPct", "fgPercentage"],
    ft_pct: ["ft_pct", "ft%", "ftp", "ftPct", "ftPercentage"],
    three_pm: ["three_pm", "3pm", "threepm", "threes", "fg3m"],
    points: ["points", "pts", "PTS"],
    rebounds: ["rebounds", "reb", "REB"],
    assists: ["assists", "ast", "AST"],
    steals: ["steals", "stl", "STL"],
    blocks: ["blocks", "blk", "BLK"],
    turnovers: ["turnovers", "tov", "TOV"],
  };
  const keys = map[key] || [key];
  return num(pick(stats, keys, null));
};

const fmtPct = (v) => {
  const n = num(v);
  return n === null ? "-" : n.toFixed(3);
};
const fmt2 = (v) => {
  const n = num(v);
  return n === null ? "-" : n.toFixed(2);
};

// cell coloring
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function bgFromZ(z, invert = false) {
  if (z === null || z === undefined || Number.isNaN(z)) {
    return { backgroundColor: "rgba(255,255,255,0.02)", color: "#e6edf3" };
  }
  const val = invert ? -z : z;
  const t = clamp(Math.abs(val) / 2.25, 0, 1);
  const alpha = 0.08 + t * 0.50; // controls how strong the coloring is at different z-scores. 2.25 is ~99th percentile in a normal distribution, so that and above get the max alpha.

  const good = "34,197,94";
  const bad = "239,68,68";
  const rgb = val >= 0 ? good : bad; // positive (green) vs negative (red)

  return { backgroundColor: `rgba(${rgb}, ${alpha})`, color: "#f8fafc" };
}

export default function Dashboard() {
  const { season, setSeason, seasons } = useSeason();

  const [riskWeight, setRiskWeight] = useState(0.25);

  const [rankings, setRankings] = useState([]);
  const [statsById, setStatsById] = useState(new Map());

  const [loading, setLoading] = useState(true);

  // Search + pagination
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

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

        const m = new Map();
        (statsRes.data || []).forEach((row) => {
          const id = getId(row);
          if (id !== null) m.set(id, row);
        });
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

  // Reset pagination when search/season/risk changes
  useEffect(() => {
    setVisibleCount(50);
  }, [search, season, riskWeight]);

  // Build rank lookup so # column is always the true rank
  const rankByPlayerId = useMemo(() => {
    const m = new Map();
    (rankings || []).forEach((r, idx) => {
      m.set(Number(r.player_id), idx + 1); // 1-based rank
    });
    return m;
  }, [rankings]);

  // Search function
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rankings || [];

    return (rankings || []).filter((r) => {
      const pid = Number(r.player_id);
      const row = statsById.get(pid);

      const name = String(r.player_name || "").toLowerCase();
      const team = String(pick(row, ["team"], "") || "").toLowerCase();
      const pos = String(pick(row, ["position"], "") || "").toLowerCase();

      return name.includes(q) || team.includes(q) || pos.includes(q);
    });
  }, [rankings, search, statsById]);

  const shown = useMemo(
    () => (filtered || []).slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const canShowMore = visibleCount < (filtered?.length || 0);

  // league z-score: estimate from the FULL list you're working with
  const league = useMemo(() => {
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
    const vals = {};
    keys.forEach((k) => (vals[k] = []));

    (rankings || []).forEach((r) => {
      const row = statsById.get(Number(r.player_id));
      const stats = getStatsObj(row);
      if (!stats) return;

      keys.forEach((k) => {
        const v = getStat(stats, k);
        if (v !== null) vals[k].push(v);
      });
    });

    const mean = {};
    const std = {};
    keys.forEach((k) => {
      const arr = vals[k];
      if (!arr.length) {
        mean[k] = 0;
        std[k] = 1;
        return;
      }
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const s =
        Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length) ||
        1;
      mean[k] = m;
      std[k] = s;
    });

    return { mean, std };
  }, [rankings, statsById]);

  const zOf = (key, v) => {
    const n = num(v);
    if (n === null) return null;
    const m = league.mean[key];
    const s = league.std[key];
    if (!s) return null;
    return (n - m) / s;
  };

  const tdBase = {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "#e6edf3",
    background: "transparent",
    whiteSpace: "nowrap",
    fontSize: 13,
  };

  const thStyle = {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.75)",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    overflow: "hidden",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  };

  const buttonStyle = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  };

  return (
    <div>
      <div data-tour="dashboard-header">
        <h2>Dashboard</h2>
        <p style={{ color: "rgba(255,255,255,0.75)" }}>
          Players by roto + availability. Showing {season} averages.
        </p>
      </div>

      <div
        data-tour="dashboard-controls"
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "end",
          marginBottom: 14,
        }}
      >
        <div data-tour="dashboard-search">
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 6,
            }}
          >
          </div>
          <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />
        </div>

        <div style={{ minWidth: 340 }}>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 6,
            }}
          >
          </div>
          <RiskSlider value={riskWeight} onChange={setRiskWeight} />
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 6,
            }}
          >
            Search
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, team, or position..."
            style={{
              width: 320,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#fff",
              outline: "none",
            }}
          />
          <div style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
          </div>
        </div>
      </div>

      {loading ? (
        <Loading text="Loading dashboard..." />
      ) : (
        <>
          <table style={tableStyle} data-tour="dashboard-table">
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Pos</th>
                <th style={thStyle}>Team</th>

                <th style={thStyle}>FG%</th>
                <th style={thStyle}>FT%</th>
                <th style={thStyle}>3PM</th>
                <th style={thStyle}>PTS</th>
                <th style={thStyle}>REB</th>
                <th style={thStyle}>AST</th>
                <th style={thStyle}>STL</th>
                <th style={thStyle}>BLK</th>
                <th style={thStyle}>TOV</th>

                <th
                  style={thStyle}
                  title="Roto score from the 9-category z-score profile. Higher is better."
                >
                  Roto
                </th>
                <th
                  style={thStyle}
                  title="Estimated availability (durability) percentage. Higher means more expected games played."
                >
                  Availability %
                </th>
                <th
                  style={thStyle}
                  title="Final ranking score that blends Roto value and Availability based on the risk slider."
                >
                  Combined
                </th>
              </tr>
            </thead>

            <tbody>
              {shown.map((r) => {
                const pid = Number(r.player_id);
                const row = statsById.get(pid);
                const stats = getStatsObj(row) || {};
                const team = pick(row, ["team"], "-");
                const pos = pick(row, ["position"], "-");

                const fg = getStat(stats, "fg_pct");
                const ft = getStat(stats, "ft_pct");
                const three = getStat(stats, "three_pm");
                const pts = getStat(stats, "points");
                const reb = getStat(stats, "rebounds");
                const ast = getStat(stats, "assists");
                const stl = getStat(stats, "steals");
                const blk = getStat(stats, "blocks");
                const tov = getStat(stats, "turnovers");

                const trueRank = rankByPlayerId.get(pid) ?? "-";

                return (
                  <tr key={pid}>
                    <td style={tdBase}>{trueRank}</td>
                    <td style={{ ...tdBase, fontWeight: 800 }}>{r.player_name}</td>
                    <td style={tdBase}>{pos}</td>
                    <td style={tdBase}>{team}</td>

                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("fg_pct", fg)) }}>
                      {fmtPct(fg)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("ft_pct", ft)) }}>
                      {fmtPct(ft)}
                    </td>

                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("three_pm", three)) }}>
                      {fmt2(three)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("points", pts)) }}>
                      {fmt2(pts)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("rebounds", reb)) }}>
                      {fmt2(reb)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("assists", ast)) }}>
                      {fmt2(ast)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("steals", stl)) }}>
                      {fmt2(stl)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("blocks", blk)) }}>
                      {fmt2(blk)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", ...bgFromZ(zOf("turnovers", tov), true) }}>
                      {fmt2(tov)}
                    </td>

                    <td style={{ ...tdBase, textAlign: "right" }}>
                      {Number(r.total_score ?? 0).toFixed(2)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right" }}>
                      {(Number(r.risk_raw ?? 0) * 100).toFixed(1)}%
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", fontWeight: 900, borderRight: "none" }}>
                      {Number(r.combined_score ?? 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {canShowMore && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setVisibleCount((n) => n + 50)} style={buttonStyle}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
