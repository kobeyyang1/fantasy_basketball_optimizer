// src/pages/Login.jsx
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/authApi";
import { tokenStore } from "../api/api";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => {
    // If user got forced here by RequireAuth, go back there after login
    return location.state?.from || "/dashboard";
  }, [location.state]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await login(email, password);

      // backend usually returns: { access_token: "...", token_type: "bearer" }
      const token = res.data?.access_token || res.data?.token;
      if (!token) throw new Error("No token returned from backend");

      tokenStore.set(token);

      // replace prevents going "back" to login after success
      nav(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError("Login failed. Check your email/password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ marginBottom: 10 }}>
          <div style={styles.title}>Sign in</div>
          <div style={styles.sub}>Use your account to access the dashboard and tools.</div>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              style={styles.input}
            />
          </label>

          {error ? <div style={styles.error}>{error}</div> : null}

          <button disabled={busy} style={{ ...styles.button, opacity: busy ? 0.75 : 1 }}>
            {busy ? "Logging in..." : "Login"}
          </button>

          <div style={styles.hint}>
            Tip: If login fails, check FastAPI logs and confirm CORS + token response shape.
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "70vh",
    display: "grid",
    placeItems: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
  },
  title: {
    fontSize: 20,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.4,
  },
  form: { display: "grid", gap: 12, marginTop: 12 },
  label: { display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  input: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  },
  button: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.92)",
    color: "rgba(0,0,0,0.9)",
    fontWeight: 800,
    cursor: "pointer",
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)",
    color: "rgba(255,210,210,0.95)",
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    marginTop: 6,
  },
};
