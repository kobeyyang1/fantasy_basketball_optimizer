// src/pages/Explainability.jsx

import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import Modal from "../components/Modal";
import { getMLRankings, getMLExplain } from "../api/fantasyApi";
import { useSeason } from "../hooks/useSeason";
import SeasonDropdown from "../components/SeasonDropdown";

const PER_GAME_STATS = new Set([
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "three_pm",
  "turnovers",
]);

const PERCENT_STATS = new Set(["fg_pct", "ft_pct"]);

export default function Explainability() {
  const { season, setSeason, seasons } = useSeason();

  const [players, setPlayers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  const [selected, setSelected] = useState(null);
  const [explain, setExplain] = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);

  // Fetch rankings when season changes
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);

    getMLRankings({ limit: 300, season })
      .then((res) => {
        if (cancelled) return;
        setPlayers(res.data);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load ML rankings.");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [season]);

  // Reset visible list when search OR season changes
  useEffect(() => {
    setVisibleCount(50);
  }, [query, season]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [players, query]);

  const shown = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const openExplain = async (p) => {
    setSelected(p);
    setExplain(null);
    setLoadingExplain(true);

    try {
      const res = await getMLExplain(p.player_id, { season });
      setExplain(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load SHAP explainability.");
    } finally {
      setLoadingExplain(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setExplain(null);
    setLoadingExplain(false);
  };

  const canShowMore = visibleCount < filtered.length;

  const formatTotal = (feature, value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";
    return PERCENT_STATS.has(feature) ? n.toFixed(3) : n.toFixed(0);
  };

  const formatAvg = (feature, value, gp) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";

    if (PERCENT_STATS.has(feature)) return n.toFixed(3);

    if (PER_GAME_STATS.has(feature)) {
      const denom = gp && gp > 0 ? gp : 1;
      return (n / denom).toFixed(2);
    }

    return n.toFixed(3);
  };

  return (
    <div>
      <h2>Explainability</h2>
      <p>Click a player name to see SHAP impacts on the ML score.</p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0 16px 0" }}>
        {/* Season dropdown */}
        <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />

        {/* Search */}
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Search</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player..."
            style={{ width: 320, padding: 8 }}
          />
          <div style={{ marginTop: 6, color: "#666" }}>
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
          </div>
        </div>
      </div>

      {loadingList ? (
        <Loading text="Loading ML rankings..." />
      ) : (
        <>
          <ol style={{ lineHeight: 1.9, paddingLeft: 22 }}>
            {shown.map((p) => (
              <li key={p.player_id}>
                <span
                  onClick={() => openExplain(p)}
                  style={{
                    cursor: "pointer",
                    textDecoration: "underline",
                    color: "#1a5fd0",
                    fontWeight: 600,
                  }}
                  title="Click to explain"
                >
                  {p.name}
                </span>{" "}
                — ML {Number(p.ml_score).toFixed(2)}
              </li>
            ))}
          </ol>

          {canShowMore && (
            <button onClick={() => setVisibleCount((n) => n + 50)} style={{ padding: "8px 12px" }}>
              Show more
            </button>
          )}

          {filtered.length === 0 && <div style={{ color: "#666" }}>No players found.</div>}
        </>
      )}

      <Modal
        open={!!selected}
        title={selected ? `${selected.name} — SHAP Explanation (${season})` : "Explanation"}
        onClose={closeModal}
        width={920}
      >
        {loadingExplain ? (
          <Loading text="Computing SHAP explanation..." />
        ) : !explain ? (
          <div style={{ color: "#666" }}>No explanation loaded.</div>
        ) : (
          <div>
            <div style={{ marginBottom: 10 }}>
              <div>
                <b>Season:</b> {explain.season || season}
              </div>
              <div>
                <b>ML score:</b> {Number(explain.ml_score).toFixed(2)}
              </div>
              <div>
                <b>Base value:</b> {Number(explain.base_value).toFixed(2)}
              </div>
              <div>
                <b>Games played (GP):</b> {explain.gp !== undefined ? Number(explain.gp) : "N/A"}
              </div>
              <div style={{ color: "#666", marginTop: 6 }}>
                Positive SHAP values push the score up, negative values push it down.
              </div>
            </div>

            <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Avg</th>
                  <th>Total</th>
                  <th>SHAP</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {explain.impacts.map((r) => {
                  const shap = Number(r.shap_value);
                  const good = shap >= 0;
                  const gp = Number(explain.gp || 1);

                  return (
                    <tr key={r.feature}>
                      <td>{r.feature}</td>

                      <td style={{ textAlign: "right" }}>{formatAvg(r.feature, r.value, gp)}</td>

                      <td style={{ textAlign: "right" }}>{formatTotal(r.feature, r.value)}</td>

                      <td style={{ textAlign: "right" }}>{shap.toFixed(3)}</td>

                      <td style={{ fontWeight: 700, color: good ? "#0a7a2f" : "#b00020" }}>
                        {good ? "↑ helps" : "↓ hurts"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 8, color: "#666" }}>
              Note: For counting stats, Avg = Total / GP. For FG% and FT%, Avg is the same as Total.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
