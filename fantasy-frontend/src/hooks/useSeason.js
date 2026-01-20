// src/hooks/useSeason.js
import { useEffect, useState } from "react";

const KEY = "selectedSeason_v1";

export const SUPPORTED_SEASONS = [
  "2024-25",
  "2023-24",
  "2022-23",
  "2021-22",
  "2020-21",
  "2019-20",
];

export const DEFAULT_SEASON = "2024-25";

export function useSeason() {
  const [season, setSeason] = useState(() => {
    const saved = localStorage.getItem(KEY);
    return saved && SUPPORTED_SEASONS.includes(saved) ? saved : DEFAULT_SEASON;
  });

  useEffect(() => {
    localStorage.setItem(KEY, season);
  }, [season]);

  return { season, setSeason, seasons: SUPPORTED_SEASONS };
}
