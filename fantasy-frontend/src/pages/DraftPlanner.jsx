import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import { getRotoRiskRankings, getActivePlayersStats } from "../api/fantasyApi";
import { loadJSON, saveJSON } from "../utils/storage";

const STORAGE_KEY = "draftPlannerState_v1";
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];

const STAT_KEYS = [
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

function meanStd(values) {
  const vals = values
    .map((v) => Number(v))
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));

  if (vals.length === 0) return { mean: 0, std: 0 };

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);

  return { mean, std };
}

function cellStyle(z) {
  // z-score -> background color
  if (z >= 1.0) return { backgroundColor: "#b7f7c1" }; // strong green
  if (z >= 0.4) return { backgroundColor: "#ddfbe2" }; // light green
  if (z <= -1.0) return { backgroundColor: "#ffb7b7" }; // strong red
  if (z <= -0.4) return { backgroundColor: "#ffe0e0" }; // light red
  return { backgroundColor: "#f5f5f5" }; // neutral
}

export default function DraftPlanner() {
  const [riskWeight, setRiskWeight] = useState(0.25);

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

  // stats map: player_id -> stats object
  const [statsById, setStatsById] = useState(new Map());

  // load saved riskWeight too
  useEffect(() => {
    const saved = loadJSON(STORAGE_KEY, null);
    if (saved?.riskWeight !== undefined) setRiskWeight(saved.riskWeight);
  }, []);

  // persist state whenever it changes
  useEffect(() => {
    saveJSON(STORAGE_KEY, { draftedIds, myTeamIds, riskWeight });
  }, [draftedIds, myTeamIds, riskWeight]);

  // fetch rankings whenever riskWeight changes
  useEffect(() => {
    setLoading(true);
    getRotoRiskRankings({ risk_weight: riskWeight })
      .then((res) => setPlayers(res.data))
      .catch((err) => {
        console.error(err);
        alert("Failed to load draft rankings (backend/CORS).");
      })
      .finally(() => setLoading(false));
  }, [riskWeight]);

  // fetch stats once (active players + 9-cat stats)
  useEffect(() => {
    getActivePlayersStats()
      .then((res) => {
        const m = new Map();
        res.data.forEach((p) => m.set(p.id, p));
        setStatsById(m);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load player stats list.");
      });
  }, []);

  const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds]);
  const myTeamSet = useMemo(() => new Set(myTeamIds), [myTeamIds]);

  // league baselines (mean/std) for each stat key
  const league = useMemo(() => {
    const rows = Array.from(statsById.values());
    const out = {};
    STAT_KEYS.forEach((k) => {
      out[k] = meanStd(rows.map((r) => r[k]));
    });
    return out;
  }, [statsById]);

  const availablePlayers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return players
      .filter((p) => !draftedSet.has(p.player_id))
      .filter((p) => {
        if (!q) return true;
        return (p.player_name || "").toLowerCase().includes(q);
      })
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
    // eslint-disable-next-line no-restricted-globals
    if (!confirm("Clear draft state?")) return;
    setDraftedIds([]);
    setMyTeamIds([]);
  };

  return (
    <div>
      <h2>Draft Planner</h2>
      <p>
        Track who’s drafted and who’s still available using your roto + durability ranking.
        Stats are color-coded vs league average (green = good, red = bad).
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 6 }}>
            Risk Weight: <b>{riskWeight.toFixed(2)}</b>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={riskWeight}
            onChange={(e) => setRiskWeight(Number(e.target.value))}
            style={{ width: 280 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6 }}>Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a player name..."
            style={{ width: 280, padding: 6 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6 }}>Position</label>
          <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} style={{ padding: 6 }}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div style={{ alignSelf: "end" }}>
          <button onClick={clearDraft}>Clear Draft</button>
        </div>
      </div>

      {loading ? (
        <Loading text="Loading rankings..." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
          {/* Available board */}
          <div>
            <h3>Available Players ({availablePlayers.length})</h3>

            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
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

                  <th>Combined</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {availablePlayers.slice(0, 80).map((p, idx) => (
                  <tr key={p.player_id}>
                    <td>{idx + 1}</td>
                    <td>{p.player_name}</td>
                    <td>{p.position || "-"}</td>
                    <td>{p.team || "-"}</td>

                    {(() => {
                      const s = statsById.get(p.player_id);

                      const render = (key, fmt) => {
                        const v = s?.[key];
                        const num = Number(v);
                        const { mean, std } = league[key] || { mean: 0, std: 0 };
                        const z = std ? (num - mean) / std : 0;

                        // Turnovers are "bad", so invert for coloring
                        const zForColor = key === "turnovers" ? -z : z;

                        return (
                          <td key={key} style={{ textAlign: "right", ...cellStyle(zForColor) }}>
                            {v === null || v === undefined || Number.isNaN(num) ? "-" : fmt(num)}
                          </td>
                        );
                      };

                      return (
                        <>
                          {render("fg_pct", (v) => v.toFixed(3))}
                          {render("ft_pct", (v) => v.toFixed(3))}
                          {render("three_pm", (v) => v.toFixed(1))}
                          {render("points", (v) => v.toFixed(1))}
                          {render("rebounds", (v) => v.toFixed(1))}
                          {render("assists", (v) => v.toFixed(1))}
                          {render("steals", (v) => v.toFixed(1))}
                          {render("blocks", (v) => v.toFixed(1))}
                          {render("turnovers", (v) => v.toFixed(1))}
                        </>
                      );
                    })()}

                    <td>{Number(p.combined_score || 0).toFixed(2)}</td>

                    <td>
                      <button onClick={() => draftToMyTeam(p.player_id)}>Draft (My Team)</button>{" "}
                      <button onClick={() => markDrafted(p.player_id)}>Drafted</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 8, color: "#666" }}>
              Showing first 80 available players (use search/filters to find others).
            </div>
          </div>

          {/* My Team */}
          <div>
            <h3>My Team ({myTeamPlayers.length})</h3>

            {myTeamPlayers.length === 0 ? (
              <p>No picks yet. Use “Draft (My Team)” on the left.</p>
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

            <h3 style={{ marginTop: 20 }}>
              Drafted (Others) ({draftedIds.length - myTeamIds.length})
            </h3>
            <p style={{ color: "#666" }}>
              Players you marked “Drafted” but not in your team.
            </p>

            <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #ccc", padding: 10 }}>
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
