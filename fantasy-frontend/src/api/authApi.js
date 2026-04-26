// src/api/authApi.js
import api from "./api";

export const login = (email, password) => {
  return api.post("/auth/login", { email, password });
};

export const register = (email, password) => {
  return api.post("/users/register", { email, password });
};
