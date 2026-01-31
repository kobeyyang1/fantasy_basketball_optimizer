// src/pages/DraftPlanner.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import SeasonDropdown from "../components/SeasonDropdown";
import RiskSlider from "../components/RiskSlider";
import StatCell from "../components/StatCell";
import { useSeason } from "../hooks/useSeason";
import { useLeagueStats } from "../hooks/useLeagueStats";
import { getRotoRiskRankings } from "../api/fantasyApi";
import { loadJSON, saveJSON } from "../utils/storage";

const STORAGE_KEY = "draftPlannerState_v1";
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];

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

const getStatsObj = (row) => {
  if (!row) return null;
  return row.avg || row.totals || row.stats || row;
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
  const val = pick(stats, keys, null);
  return num(val);
};

const fmtPct = (v) => (num(v) === null ? "-" : Number(v).toFixed(3));
const fmt2 = (v) => (num(v) === null ? "-" : Number(v).toFixed(2));

export default function DraftPlanner() {
  const { season, setSeason, seasons } = useSeason();

  const [riskWeight, setRiskWeight] = useState(() => {
    const saved = loadJSON(STORAGE_KEY, null);
    return saved?.riskWeight ?? 0.25;
  });

  // rankings from backend
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI filters
  const [query, setQuery] = useState("");
  const [posFilter, setPosFilter] = useState("All");

  // draft state
  const [draftedIds, setDraftedIds] = useState(() =>
    loadJSON(STORAGE_KEY, { draftedIds: [], myTeamIds: [], riskWeight: 0.25 }).draftedIds
  );
  const [myTeamIds, setMyTeamIds] = useState(() =>
    loadJSON(STORAGE_KEY, { draftedIds: [], myTeamIds: [], riskWeight: 0.25 }).myTeamIds
  );

  // league stats + per player totals/avg map
  const { statsById, league, loading: loadingLeague } = useLeagueStats({ season });

  useEffect(() => {
    saveJSON(STORAGE_KEY, { draftedIds, myTeamIds, riskWeight });
  }, [draftedIds, myTeamIds, riskWeight]);

  // fetch rankings whenever season or riskWeight changes
  useEffect(() => {
    setLoading(true);
    getRotoRiskRankings({ season, risk_weight: riskWeight })
      .then((res) => setPlayers(res.data))
      .catch((err) => {
        console.error(err);
        alert("Failed to load draft rankings (backend/CORS).");
      })
      .finally(() => setLoading(false));
  }, [season, riskWeight]);

  const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds]);
  const myTeamSet = useMemo(() => new Set(myTeamIds), [myTeamIds]);

  const availablePlayers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return players
      .filter((p) => !draftedSet.has(p.player_id))
      .filter((p) => (!q ? true : (p.player_name || "").toLowerCase().includes(q)))
      .filter((p) => {
        if (posFilter === "All") return true;
        const pos = (p.position || "").toUpperCase();
        return pos.includes(posFilter);
      });
  }, [players, draftedSet, query, posFilter]);

  const myTeamPlayers = useMemo(() => {
    const byId = new Map(players.map((p) => [p.player_id, p]));
    return myTeamIds.map((id) => byId.get(id)).filter(Boolean);
  }, [players, myTeamIds]);

  const markDrafted = (playerId) => {
    setDraftedIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
  };

  const undoDrafted = (playerId) => {
    setDraftedIds((prev) => prev.filter((x) => x !== playerId));
    setMyTeamIds((prev) => prev.filter((x) => x !== playerId));
  };

  const draftToMyTeam = (playerId) => {
    markDrafted(playerId);
    setMyTeamIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
  };

  const clearDraft = () => {
    if (!confirm("Clear draft state?")) return;
    setDraftedIds([]);
    setMyTeamIds([]);
  };

  // --- helpers for z-scoring + values ---
  const zOf = (statKey, v) => {
    const mean = league?.[statKey]?.mean;
    const std = league?.[statKey]?.std;
    const val = num(v);
    if (val === null || mean === undefined || std === undefined || !std) return null;
    return (val - mean) / std;
  };

  // table styles (forces DARK table, prevents white blocks)
  const tableStyle = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    overflow: "hidden",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
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

  const tdBase = {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "#e6edf3",
    background: "transparent",
    whiteSpace: "nowrap",
    fontSize: 13,
  };

  const styles = {
    sidebar: {
      display: "flex",
      flexDirection: "column",
      gap: 16,
    },
    sideCard: {
      background: "rgba(15, 23, 42, 0.95)",
      border: "none",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
    },
    sideCardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.04)",
      gap: 10,
    },
    sideCardTitle: {
      fontSize: 15,
      fontWeight: 800,
      color: "#fff",
    },
    sideCardSub: {
      fontSize: 12,
      color: "rgba(255,255,255,0.65)",
    },
    miniBtn: {
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    },
    miniBtnDanger: {
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid rgba(239,68,68,0.45)",
      background: "rgba(239,68,68,0.14)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    },
    sideList: {
      maxHeight: 420,
      overflow: "auto",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    emptyState: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 13,
    },
    emptyHint: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 12,
      marginTop: 4,
    },
    playerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 10,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
    },
    playerName: {
      fontWeight: 700,
      color: "#fff",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    playerMeta: {
      fontSize: 12,
      color: "rgba(255,255,255,0.6)",
    },
    pillBtn: {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(0,0,0,0.2)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
  };

  const myTeam = myTeamPlayers;

  const draftedOthers = useMemo(() => {
    return draftedIds
      .filter((id) => !myTeamSet.has(id))
      .map((id) => players.find((p) => p.player_id === id))
      .filter(Boolean);
  }, [draftedIds, myTeamSet, players]);

  const onUndoLastPick = () => {
    setMyTeamIds((prev) => {
      if (!prev.length) return prev;
      const removed = prev[prev.length - 1];
      setDraftedIds((dprev) => dprev.filter((id) => id !== removed));
      return prev.slice(0, -1);
    });
  };

  const undoPick = (playerId) => undoDrafted(playerId);
  const undraftOther = (playerId) => undoDrafted(playerId);

  const clearDraftedOthers = () => {
    setDraftedIds((prev) => prev.filter((id) => myTeamSet.has(id)));
  };

  return (
    <div>
      <h2>Draft Planner</h2>
      <p style={{ color: "rgba(255,255,255,0.75)" }}>
        Track who’s drafted and who’s still available using your roto + durability ranking.
        Stats are color-coded vs league average (green = good, red = bad).
      </p>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}></div>
          <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
          </div>
          <RiskSlider value={riskWeight} onChange={setRiskWeight} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Search</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a player name..."
            style={{
              width: 300,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#fff",
              outline: "none",
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Position</div>
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#fff",
            }}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={clearDraft}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Clear Draft
        </button>
      </div>

      {loading || loadingLeague ? (
        <Loading text="Loading draft planner..." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22 }}>
          {/* Available board */}
          <div>
            <h3>Available Players ({availablePlayers.length})</h3>

            <table style={tableStyle}>
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

                  <th style={thStyle}>Combined</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {availablePlayers.slice(0, 120).map((p, idx) => {
                  const pid = p.player_id;

                  const row =
                    statsById?.get(pid) ??
                    statsById?.get(Number(pid)) ??
                    statsById?.get(String(pid));
                  const stats = getStatsObj(row) || {};
                  const team = pick(row, ["team"], p.team || "-");
                  const pos = pick(row, ["position"], p.position || "-");

                  const fg = getStat(stats, "fg_pct");
                  const ft = getStat(stats, "ft_pct");

                  const three = getStat(stats, "three_pm");
                  const pts = getStat(stats, "points");
                  const reb = getStat(stats, "rebounds");
                  const ast = getStat(stats, "assists");
                  const stl = getStat(stats, "steals");
                  const blk = getStat(stats, "blocks");
                  const tov = getStat(stats, "turnovers");

                  return (
                    <tr key={pid}>
                      <td style={tdBase}>{idx + 1}</td>
                      <td style={{ ...tdBase, fontWeight: 700 }}>{p.player_name}</td>
                      <td style={tdBase}>{pos}</td>
                      <td style={tdBase}>{team}</td>

                      <StatCell value={fmtPct(fg)} z={zOf("fg_pct", fg)} />
                      <StatCell value={fmtPct(ft)} z={zOf("ft_pct", ft)} />

                      <StatCell value={fmt2(three)} z={zOf("three_pm", three)} />
                      <StatCell value={fmt2(pts)} z={zOf("points", pts)} />
                      <StatCell value={fmt2(reb)} z={zOf("rebounds", reb)} />
                      <StatCell value={fmt2(ast)} z={zOf("assists", ast)} />
                      <StatCell value={fmt2(stl)} z={zOf("steals", stl)} />
                      <StatCell value={fmt2(blk)} z={zOf("blocks", blk)} />
                      <StatCell value={fmt2(tov)} z={zOf("turnovers", tov)} invert />

                      <td style={{ ...tdBase, textAlign: "right", fontWeight: 800 }}>
                        {Number(p.combined_score || 0).toFixed(2)}
                      </td>

                      <td style={{ ...tdBase, borderRight: "none" }}>
                        <button
                          onClick={() => draftToMyTeam(pid)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.06)",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 700,
                            marginRight: 8,
                          }}
                        >
                          Draft (My Team)
                        </button>a
                        <button
                          onClick={() => markDrafted(pid)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.04)",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Drafted
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 10, color: "rgba(255,255,255,0.65)" }}>
              Showing first 120 available players (search/filters to narrow down).
            </div>
          </div>

          {/* Right Sidebar */}
          <aside style={styles.sidebar}>
            {/* My Team */}
            <div style={styles.sideCard}>
              <div style={styles.sideCardHeader}>
                <div>
                  <div style={styles.sideCardTitle}>My Team</div>
                  <div style={styles.sideCardSub}>
                    {myTeam.length} player{myTeam.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={styles.miniBtn}
                    onClick={() => onUndoLastPick?.()}
                    disabled={!myTeam.length}
                    title="Undo last pick"
                  >
                    Undo
                  </button>

                  <button style={styles.miniBtnDanger} onClick={clearDraft}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={styles.sideList}>
                {myTeam.length === 0 ? (
                  <div style={styles.emptyState}>
                    No picks yet.
                    <div style={styles.emptyHint}>
                      Use “Draft (My Team)” in the table.
                    </div>
                  </div>
                ) : (
                  myTeam.map((p) => (
                    <div key={p.player_id} style={styles.playerRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.playerName} title={p.player_name}>
                          {p.player_name}
                        </div>
                        <div style={styles.playerMeta}>
                          {p.position || "-"} • {p.team || "-"}
                        </div>
                      </div>

                      <button
                        style={styles.pillBtn}
                        onClick={() => undoPick?.(p.player_id)}
                        title="Remove from My Team"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Drafted (Others) */}
            <div style={styles.sideCard}>
              <div style={styles.sideCardHeader}>
                <div>
                  <div style={styles.sideCardTitle}>Drafted (Others)</div>
                  <div style={styles.sideCardSub}>
                    {draftedOthers.length} marked
                  </div>
                </div>

                <button style={styles.miniBtn} onClick={clearDraftedOthers}>
                  Clear
                </button>
              </div>

              <div style={styles.sideList}>
                {draftedOthers.length === 0 ? (
                  <div style={styles.emptyState}>
                    None yet.
                    <div style={styles.emptyHint}>
                      Use “Drafted” to track other managers.
                    </div>
                  </div>
                ) : (
                  draftedOthers.map((p) => (
                    <div key={p.player_id} style={styles.playerRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.playerName} title={p.player_name}>
                          {p.player_name}
                        </div>
                        <div style={styles.playerMeta}>
                          {p.position || "-"} • {p.team || "-"}
                        </div>
                      </div>

                      <button
                        style={styles.pillBtn}
                        onClick={() => undraftOther?.(p.player_id)}
                        title="Unmark drafted"
                      >
                        Undo
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
