// src/api/authApi.js
import api from "./api";

// FastAPI OAuth2PasswordRequestForm expects FORM DATA, not JSON
export const login = (email, password) => {
  const form = new URLSearchParams();
  form.append("username", email); // IMPORTANT: OAuth2 uses "username"
  form.append("password", password);

  return api.post("/auth/login", form, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
};
