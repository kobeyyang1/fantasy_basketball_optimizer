import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

export const getRotoRiskRankings = (params = {}) =>
  api.get("/fantasy/roto_risk_rankings", { params });

export const getTeamSuggestions = (params = {}) =>
  api.get("/fantasy/team_suggestions", { params });

export const getMLRankings = (params = {}) =>
  api.get("/fantasy/ml_rankings", { params });

export const getMLExplain = (playerId) =>
  api.get(`/fantasy/ml_explain/${playerId}`);

export const getPlayersWithStats = () =>
  api.get("/fantasy/players_active_with_stats");

export const getActivePlayersStats = () =>
  api.get("/fantasy/players_active_with_stats");



