import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

export const getRotoRiskRankings = (params = {}) =>
  api.get("/fantasy/roto_risk_rankings", {
    params: {
      season: params.season,
      risk_weight: params.risk_weight ?? 0.25,
      punt: params.punt,
      limit: params.limit,
    },
  });

// --- Team suggestions (Optimizer) ---
export const getTeamSuggestions = (params = {}) =>
  api.get("/fantasy/team_suggestions", {
    params: {
      player_ids: params.player_ids,
      punt: params.punt,
      limit: params.limit ?? 20,
      season: params.season,
    },
  });

export const getMLRankings = (params = {}) =>
  api.get("/fantasy/ml_rankings", {
    params: {
      season: params.season ?? "2024-25",
      limit: params.limit ?? 50,
    },
  });

export const getMLExplain = (playerId, params = {}) =>
  api.get(`/fantasy/ml_explain/${playerId}`, {
    params: {
      season: params.season ?? "2024-25",
    },
  });

export const getPlayersWithStats = () =>
  api.get("/fantasy/players_active_with_stats");

// --- Active players stats (for per-game display) ---
export const getActivePlayersStats = (params = {}) =>
  api.get("/fantasy/active_players_stats", { params });



