import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import PlayerPicker from "../components/PlayerPicker";
import { getPlayersWithStats, getTeamSuggestions } from "../api/fantasyApi";
import PuntSelector from "../components/PuntSelector";
import { useLeagueStats } from "../hooks/useLeagueStats";
import PlayerStatsTable from "../components/PlayerStatsTable";

export default function Optimizer() {
  const [allPlayers, setAllPlayers] = useState([]);
  const [teamIds, setTeamIds] = useState([]); // array of player_id numbers
  const [punted, setPunted] = useState([]);
  const [data, setData] = useState(null);

  const { statsById, league, loading: loadingLeague } = useLeagueStats();

  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // load player list once
  useEffect(() => {
    setLoadingPlayers(true);
    getPlayersWithStats()
      .then((res) => setAllPlayers(res.data))
      .catch((err) => {
        console.error(err);
        alert("Failed to load players list.");
      })
      .finally(() => setLoadingPlayers(false));
  }, []);

  const disabledIds = useMemo(() => new Set(teamIds), [teamIds]);

  const addPlayer = (player) => {
    setTeamIds((prev) => {
      const id = player.id ?? player.player_id;
      if (!id) return prev;
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const removePlayer = (id) => {
    setTeamIds((prev) => prev.filter((x) => x !== id));
  };

  const teamRows = useMemo(() => {
    // Convert teamIds into the row shape used by PlayerStatsTable
    const byId = new Map(allPlayers.map((p) => [p.id, p]));

    return teamIds
      .map((id) => {
        const raw = byId.get(id);
        if (!raw) return null;

        return {
          player_id: raw.id,
          player_name: raw.name,
          position: raw.position,
          team: raw.team || raw.team_full_name,
        };
      })
      .filter(Boolean);
  }, [teamIds, allPlayers]);

  const runSuggestions = async () => {
    if (teamIds.length === 0) {
      alert("Add at least 1 player to your team first.");
      return;
    }

    setLoadingSuggestions(true);
    setData(null);

    try {
      const ids = teamIds.join(",");
      const res = await getTeamSuggestions({
        player_ids: ids,
        punt: punted.length ? punted.join(",") : undefined,
        limit: 20,
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      alert("Suggestions failed. Check backend logs.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  return (
    <div>
      <h2>Optimizer</h2>
      <p>
        Build your team by searching players, then request suggested additions
        based on marginal roto gain.
      </p>

      {loadingPlayers ? (
        <Loading text="Loading players..." />
      ) : (
        <PlayerPicker allPlayers={allPlayers} onAdd={addPlayer} disabledIds={disabledIds} />
      )}

      {/* 1) Available players table */}
      <h3 style={{ marginTop: 16 }}>Available Players (quick add)</h3>

      {loadingPlayers || loadingLeague ? (
        <Loading text="Loading stats..." />
      ) : (
        <PlayerStatsTable
          rows={allPlayers
            .filter((p) => !disabledIds.has(p.id))
            .slice(0, 60)
            .map((p) => ({
              player_id: p.id,
              player_name: p.name,
              position: p.position,
              team: p.team || p.team_full_name,
            }))}
          statsById={statsById}
          league={league}
          extraHeaders={[]}
          renderExtraCells={() => null}
          actionHeader="Add"
          renderActions={(row) => (
            <button onClick={() => addPlayer({ id: row.player_id })}>Add</button>
          )}
          limit={60}
        />
      )}

      {/* 2) Current Team table */}
      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <h3>Current Team ({teamIds.length})</h3>

        {teamIds.length === 0 ? (
          <p>No players added yet.</p>
        ) : loadingPlayers || loadingLeague ? (
          <Loading text="Loading team stats..." />
        ) : (
          <PlayerStatsTable
            rows={teamRows}
            statsById={statsById}
            league={league}
            actionHeader="Remove"
            renderActions={(row) => (
              <button onClick={() => removePlayer(row.player_id)}>Remove</button>
            )}
            limit={50}
          />
        )}
      </div>

      <PuntSelector value={punted} onChange={setPunted} />

      <button onClick={runSuggestions} disabled={loadingSuggestions}>
        {loadingSuggestions ? "Calculating..." : "Get Suggestions"}
      </button>

      {/* 3) Suggestions table */}
      {data && (
        <div style={{ marginTop: 16 }}>
          <h3>Base Team Score: {data.base_team_score.toFixed(2)}</h3>

          <h3>Top Suggestions</h3>

          {loadingLeague ? (
            <Loading text="Loading league stats..." />
          ) : (
            <PlayerStatsTable
              rows={data.suggestions.map((s) => ({
                player_id: s.player_id,
                player_name: s.name,
                position: s.position,
                team: s.team,
                delta: s.delta,
              }))}
              statsById={statsById}
              league={league}
              extraHeaders={["Δ Score"]}
              renderExtraCells={(row) => (
                <td style={{ textAlign: "right" }}>{Number(row.delta).toFixed(2)}</td>
              )}
              actionHeader={null}
              renderActions={() => null}
              limit={20}
            />
          )}
        </div>
      )}
    </div>
  );
}
