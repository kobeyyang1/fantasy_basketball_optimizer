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
    const mean = league?.mean?.[statKey];
    const std = league?.std?.[statKey];
    const val = num(v);
    if (val === null || mean === undefined || std === undefined || !std) return null;
    return (val - mean) / std;
  };

  const getAvg = (pid, key) => statsById?.get(pid)?.avg?.[key];
  const getPct = (pid, key) => statsById?.get(pid)?.avg?.[key]; // fg/ft already avg
  const getTeam = (pid) => statsById?.get(pid)?.team;
  const getPos = (pid) => statsById?.get(pid)?.position;

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

  return (
    <div>
      <h2>Draft Planner</h2>
      <p style={{ color: "rgba(255,255,255,0.75)" }}>
        Track who’s drafted and who’s still available using your roto + durability ranking.
        Stats are color-coded vs league average (green = good, red = bad).
      </p>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Season</div>
          <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
            Risk Weight: <b style={{ color: "#fff" }}>{riskWeight.toFixed(2)}</b>
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

                  const fg = getPct(pid, "fg_pct");
                  const ft = getPct(pid, "ft_pct");

                  const three = getAvg(pid, "three_pm");
                  const pts = getAvg(pid, "points");
                  const reb = getAvg(pid, "rebounds");
                  const ast = getAvg(pid, "assists");
                  const stl = getAvg(pid, "steals");
                  const blk = getAvg(pid, "blocks");
                  const tov = getAvg(pid, "turnovers");

                  return (
                    <tr key={pid}>
                      <td style={tdBase}>{idx + 1}</td>
                      <td style={{ ...tdBase, fontWeight: 700 }}>{p.player_name}</td>
                      <td style={tdBase}>{getPos(pid) || p.position || "-"}</td>
                      <td style={tdBase}>{getTeam(pid) || p.team || "-"}</td>

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
                        </button>
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

          {/* My Team */}
          <div>
            <h3>My Team ({myTeamPlayers.length})</h3>

            {myTeamPlayers.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.75)" }}>
                No picks yet. Use “Draft (My Team)” on the left.
              </p>
            ) : (
              <ul>
                {myTeamPlayers.map((p) => (
                  <li key={p.player_id} style={{ marginBottom: 6 }}>
                    <button onClick={() => undoDrafted(p.player_id)}>Undo</button>{" "}
                    <b>{p.player_name}</b> — {p.position || "-"} {p.team ? `(${p.team})` : ""}
                  </li>
                ))}
              </ul>
            )}

            <h3 style={{ marginTop: 20 }}>Drafted (Others) ({draftedIds.length - myTeamIds.length})</h3>
            <p style={{ color: "rgba(255,255,255,0.65)" }}>
              Players you marked “Drafted” but not in your team.
            </p>

            <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid rgba(255,255,255,0.12)", padding: 10, borderRadius: 12 }}>
              {draftedIds
                .filter((id) => !myTeamSet.has(id))
                .map((id) => players.find((p) => p.player_id === id))
                .filter(Boolean)
                .map((p) => (
                  <div key={p.player_id} style={{ marginBottom: 8 }}>
                    <button onClick={() => undoDrafted(p.player_id)}>Undo</button>{" "}
                    <b>{p.player_name}</b> — {p.position || "-"} {p.team ? `(${p.team})` : ""}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
