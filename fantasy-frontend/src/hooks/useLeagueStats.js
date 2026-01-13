import { useEffect, useMemo, useState } from "react";
import { getActivePlayersStats } from "../api/fantasyApi";

export const STAT_KEYS = [
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

export function useLeagueStats() {
  const [statsById, setStatsById] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getActivePlayersStats()
      .then((res) => {
        const m = new Map();
        res.data.forEach((p) => m.set(p.id, p));
        setStatsById(m);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load player stats list.");
      })
      .finally(() => setLoading(false));
  }, []);

  const league = useMemo(() => {
    const rows = Array.from(statsById.values());
    const out = {};
    STAT_KEYS.forEach((k) => {
      out[k] = meanStd(rows.map((r) => r[k]));
    });
    return out;
  }, [statsById]);

  return { statsById, league, loading };
}
