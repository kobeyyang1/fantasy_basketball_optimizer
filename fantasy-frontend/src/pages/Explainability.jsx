// src/pages/Explainability.jsx

import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import Modal from "../components/Modal";
import { getExplainabilityList, getMLExplain } from "../api/fantasyApi";
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

// Use SHAP magnitudes for this player to set thresholds dynamically
function makeImpactClassifier(rows) {
  const mags = (rows || [])
    .map((r) => Math.abs(Number(r.shap ?? r.SHAP ?? r.shap_value ?? 0)))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  // fallback thresholds if something goes weird
  if (!mags.length) {
    return () => ({
      label: "neutral",
      dir: "neutral",
      color: "#9ca3af",
    });
  }

  // Use quantiles so labels are meaningful for each player.
  const q = (p) => mags[Math.floor((mags.length - 1) * p)];
  const tSlight = q(0.35); // bottom ~35% = slight
  const tStrong = q(0.75); // top ~25% = strong

  return (shapVal) => {
    const s = Number(shapVal ?? 0);
    if (!Number.isFinite(s) || s === 0) {
      return { label: "neutral", dir: "neutral", color: "#9ca3af" };
    }

    const mag = Math.abs(s);
    const helps = s > 0;

    // 4 buckets
    let label = "";
    if (mag < tSlight) label = helps ? "slightly helps" : "slightly hurts";
    else if (mag < tStrong) label = helps ? "helps" : "hurts";
    else label = helps ? "strongly helps" : "strongly hurts";

    // theme-friendly colors (dark UI)
    const color =
      label.includes("helps")
        ? label.includes("slightly")
          ? "rgba(34,197,94,0.70)" // green-500 softer
          : label.includes("strongly")
            ? "rgba(34,197,94,1.0)" // full green
            : "rgba(34,197,94,0.88)"
        : label.includes("hurts")
          ? label.includes("slightly")
            ? "rgba(239,68,68,0.70)" // red-500 softer
            : label.includes("strongly")
              ? "rgba(239,68,68,1.0)"
              : "rgba(239,68,68,0.88)"
          : "rgba(156,163,175,0.8)";

    return {
      label,
      dir: helps ? "up" : "down",
      color,
    };
  };
}

export default function Explainability() {
  const { season, setSeason, seasons } = useSeason();

  const [players, setPlayers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  const [selected, setSelected] = useState(null);
  const [explain, setExplain] = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);

  // Fetch rankings when season changes (CONSISTENT with Dashboard: risk_weight = 0)
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);

    getExplainabilityList({ season, risk_weight: 0 })
      .then((res) => {
        if (cancelled) return;
        setPlayers(res.data);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load rankings list.");
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
    return players.filter((p) =>
      (p.player_name || "").toLowerCase().includes(q)
    );
  }, [players, query]);

  const shown = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const openExplain = async (p) => {
    setSelected(p);
    setExplain(null);
    setLoadingExplain(true);

    try {
      // IMPORTANT: pass season into explain endpoint
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

  const classifyImpact = useMemo(
    () => makeImpactClassifier(explain?.impacts),
    [explain?.impacts]
  );

  return (
    <div>
      <h2>Explainability</h2>
      <p>
        This list matches Dashboard rankings when Risk Weight = 0. Click a player
        name to see SHAP impacts on the ML score.
      </p>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          margin: "12px 0 16px 0",
        }}
      >
        {/* Season dropdown */}
        <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />

        {/* Search */}
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            Search
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player..."
            style={{ width: 320, padding: 8 }}
          />
          <div style={{ marginTop: 6, color: "#666" }}>
            Showing {Math.min(visibleCount, filtered.length)} of{" "}
            {filtered.length}
          </div>
        </div>
      </div>

      {loadingList ? (
        <Loading text="Loading rankings..." />
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
                  {p.player_name}
                </span>{" "}
                — Roto {Number(p.total_score ?? 0).toFixed(2)}
              </li>
            ))}
          </ol>

          {canShowMore && (
            <button
              onClick={() => setVisibleCount((n) => n + 50)}
              style={{ padding: "8px 12px" }}
            >
              Show more
            </button>
          )}

          {filtered.length === 0 && (
            <div style={{ color: "#666" }}>No players found.</div>
          )}
        </>
      )}

      <Modal
        open={!!selected}
        title={
          selected
            ? `${selected.player_name} — SHAP Explanation (${season})`
            : "Explanation"
        }
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
                <b>Games played (GP):</b>{" "}
                {explain.gp !== undefined ? Number(explain.gp) : "N/A"}
              </div>
              <div style={{ color: "#666", marginTop: 6 }}>
                Positive SHAP values push the score up, negative values push it
                down.
              </div>
            </div>

            <table
              border="1"
              cellPadding="8"
              style={{ borderCollapse: "collapse", width: "100%" }}
            >
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
                  const gp = Number(explain.gp || 1);
                  const impact = classifyImpact(r.shap ?? r.SHAP ?? r.shap_value);

                  return (
                    <tr key={r.feature}>
                      <td>{r.feature}</td>

                      <td style={{ textAlign: "right" }}>
                        {formatAvg(r.feature, r.value, gp)}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        {formatTotal(r.feature, r.value)}
                      </td>

                      <td style={{ textAlign: "right" }}>{shap.toFixed(3)}</td>

                      <td
                        style={{
                          fontWeight: 800,
                          color: impact.color,
                        }}
                      >
                        {impact.dir === "up"
                          ? "↑"
                          : impact.dir === "down"
                            ? "↓"
                            : "•"}{" "}
                        {impact.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ marginTop: 8, color: "#666" }}>
              Note: For counting stats, Avg = Total / GP. For FG% and FT%, Avg is
              the same as Total.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
