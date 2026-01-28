// src/api/api.js
import axios from "axios";

const TOKEN_KEY = "access_token";

export const tokenStore = {
  get() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

const api = axios.create({
  baseURL: "http://localhost:8000",
});

// Attach Authorization header to every request if token exists
api.interceptors.request.use(
  (config) => {
    const token = tokenStore.get();
    // axios headers can be undefined; keep any existing headers
    config.headers = config.headers || {};

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // avoid stale header
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-logout on 401 and send user to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;

    if (status === 401) {
      tokenStore.clear();

      // Avoid redirect loops if already on login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  }
);

export default api;
