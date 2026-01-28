// src/api/fantasyApi.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

const DEFAULT_SEASON = "2024-25";
const SEASON_STORAGE_KEY = "selectedSeason_v1";

function getSeasonFallback() {
  const saved = localStorage.getItem(SEASON_STORAGE_KEY);
  return saved || DEFAULT_SEASON;
}

// --- Dashboard rankings ---
export const getRotoRiskRankings = (params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get("/fantasy/roto_risk_rankings", {
    params: {
      season,
      risk_weight: params.risk_weight ?? 0.25,
      punt: params.punt,
      limit: params.limit,
    },
  });
};

// --- Team suggestions (Optimizer) ---
export const getTeamSuggestions = (params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get("/fantasy/team_suggestions", {
    params: {
      player_ids: params.player_ids,
      punt: params.punt,
      limit: params.limit ?? 20,
      season,
    },
  });
};

// --- ML rankings + explainability ---
export const getMLRankings = (params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get("/fantasy/ml_rankings", {
    params: {
      season,
      limit: params.limit ?? 50,
    },
  });
};

export const getMLExplain = (playerId, params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get(`/fantasy/ml_explain/${playerId}`, {
    params: { season },
  });
};

// --- Player list for picker ---
export const getPlayersWithStats = () =>
  api.get("/fantasy/players_active_with_stats");

// --- Active players stats (per-game display) ---
// IMPORTANT: always includes season, otherwise backend returns 422
export const getActivePlayersStats = (params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get("/fantasy/active_players_stats", {
    params: { ...params, season },
  });
};

// Explainability list uses roto rankings with risk_weight=0 on frontend
export const getExplainabilityList = (params = {}) => {
  const season = params.season ?? getSeasonFallback();

  return api.get("/fantasy/roto_risk_rankings", {
    params: { ...params, season },
  });
};

export default api;

export const createSavedItem = (payload) =>
  api.post("/fantasy/saved", payload);

export const listSavedItems = () =>
  api.get("/fantasy/saved");

export const deleteSavedItem = (id) =>
  api.delete(`/fantasy/saved/${id}`);

