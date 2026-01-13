import { useEffect, useState } from "react";
import { getMLRankings, getMLExplain } from "../api/fantasyApi";
import Loading from "../components/Loading";

export default function Explainability() {
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingExplain, setLoadingExplain] = useState(false);

  useEffect(() => {
    getMLRankings({ limit: 50 })
      .then((res) => setPlayers(res.data))
      .catch((err) => {
        console.error(err);
        alert("Failed to load ML rankings.");
      })
      .finally(() => setLoadingList(false));
  }, []);

  const explain = async (playerId) => {
    setLoadingExplain(true);
    setSelected(null);
    try {
      const res = await getMLExplain(playerId);
      setSelected(res.data);
    } catch (err) {
      console.error(err);
      alert("Explain failed for this player.");
    } finally {
      setLoadingExplain(false);
    }
  };

  return (
    <div>
      <h2>Explainability</h2>
      <p>Click a player to see SHAP impacts on the ML score.</p>

      {loadingList ? (
        <Loading text="Loading ML rankings..." />
      ) : (
        <ul>
          {players.map((p) => (
            <li key={p.player_id} style={{ marginBottom: 6 }}>
              <button onClick={() => explain(p.player_id)}>Explain</button>{" "}
              {p.name} — ML {p.ml_score.toFixed(2)}
            </li>
          ))}
        </ul>
      )}

      {loadingExplain && <Loading text="Loading explanation..." />}

      {selected && (
        <div style={{ marginTop: 16 }}>
          <h3>{selected.name}</h3>
          <p>
            ML Score: <b>{selected.ml_score.toFixed(2)}</b>
          </p>

          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Value</th>
                <th>SHAP</th>
              </tr>
            </thead>
            <tbody>
              {selected.impacts.map((i) => (
                <tr key={i.feature}>
                  <td>{i.feature}</td>
                  <td>{Number(i.value).toFixed(3)}</td>
                  <td>{Number(i.shap_value).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
