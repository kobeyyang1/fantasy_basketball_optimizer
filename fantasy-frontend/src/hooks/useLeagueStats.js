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
  return Number(pick(stats, keys, null));
};

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

export function useLeagueStats({ season } = {}) {
  const [statsById, setStatsById] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getActivePlayersStats({ season })
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
  }, [season]);

  const league = useMemo(() => {
    const rows = Array.from(statsById.values());
    const out = {};
    STAT_KEYS.forEach((k) => {
      out[k] = meanStd(
        rows.map((r) => {
          const stats = getStatsObj(r);
          if (!stats) return null;
          return getStat(stats, k);
        })
      );
    });
    return out;
  }, [statsById]);

  return { statsById, league, loading };
}
