import { useEffect, useState } from "react";
import { getRotoRiskRankings } from "../api/fantasyApi";
import Loading from "../components/Loading";
import RiskSlider from "../components/RiskSlider";
import PlayerTable from "../components/PlayerTable";
import { useLeagueStats } from "../hooks/useLeagueStats";
import PlayerStatsTable from "../components/PlayerStatsTable";

export default function Dashboard() {
  const [riskWeight, setRiskWeight] = useState(0.25);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // search query
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);

    getRotoRiskRankings({ risk_weight: riskWeight })
      .then((res) => setPlayers(res.data.slice(0, 50)))
      .catch((err) => {
        console.error(err);
        alert("Failed to load rankings. Check backend + CORS.");
      })
      .finally(() => setLoading(false));
  }, [riskWeight]);

  const filteredPlayers = players.filter((p) =>
    (p.player_name || "").toLowerCase().includes(query.toLowerCase())
  );
  const { statsById, league, loading: loadingLeague } = useLeagueStats();

  return (
    <div>
      <h2>Dashboard</h2>

      <p style={{ maxWidth: 750 }}>
        Rankings combine standard 9-category roto z-scores with a durability score
        based on games played across the last 5 completed NBA seasons. Increasing
        the risk weight favors players with higher long-term availability.
      </p>

      <RiskSlider value={riskWeight} onChange={setRiskWeight} />

      <input
        type="text"
        placeholder="Search player..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12, width: 300, padding: 6 }}
      />

      {loading || loadingLeague ? (
        <Loading />
      ) : (
        <PlayerStatsTable
          rows={players}
          statsById={statsById}
          league={league}
          extraHeaders={["Roto", "Availability", "Combined"]}
          renderExtraCells={(p) => (
            <>
              <td>{Number(p.total_score).toFixed(2)}</td>
              <td>{(Number(p.risk_raw) * 100).toFixed(1)}%</td>
              <td>{Number(p.combined_score).toFixed(2)}</td>
            </>
        )}
        limit={50}
    />
  )}
    </div>
  );
}
