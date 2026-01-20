import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

export const getRotoRiskRankings = (params = {}) =>
  api.get("/fantasy/roto_risk_rankings", { params });

export const getTeamSuggestions = (params = {}) =>
  api.get("/fantasy/team_suggestions", { params });

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

export const getActivePlayersStats = () =>
  api.get("/fantasy/players_active_with_stats");



