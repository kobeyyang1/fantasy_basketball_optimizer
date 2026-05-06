// src/pages/Login.jsx
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/authApi";
import { tokenStore } from "../api/api";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => {
    return location.state?.from || "/dashboard";
  }, [location.state]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => { // handles the login form submission
    e.preventDefault();
    setError("");
    setBusy(true); // sets the busy state to true to disable the form and show a loading state on the button

    try {
      const res = await login(email.trim(), password); // calls the login API with the email and password, which returns a token if successful
      const token = res.data?.access_token || res.data?.token;

      if (!token) {
        throw new Error("No token returned from backend"); // if the response doesn't contain a token, throw an error
      }

      tokenStore.set(token); // saves the token in local storage for future authenticated API calls
      nav(redirectTo, { replace: true });
    } catch (err) { // if there's an error during login (network error, invalid credentials, etc), log the error and show a generic error message to the user
      console.error(err);
      setError("Login failed. Check your email/password.");
    } finally {
      setBusy(false); // sets the busy state back to false to re-enable the form and hide the loading state on the button
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.eyebrow}>Optional account</div>
          <div style={styles.title}>Sign in</div>
          <div style={styles.sub}>
            All analysis tools remain open without login. Sign in only if you want to save and revisit optimized
            lineups.
          </div>
        </div>

        <div style={styles.notice}>
          Optimizer, dashboard, draft planner, and explainability pages are available to everyone. Login is only
          needed for saved lineups.
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
              placeholder="Enter your password"
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
            Need an account for saved lineups?{" "}
            <Link to="/register" style={styles.link}>
              Register here
            </Link>
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
    maxWidth: 500,
    padding: 22,
    borderRadius: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
  },
  header: {
    display: "grid",
    gap: 6,
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#9ed9ff",
  },
  title: {
    fontSize: 24,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
  },
  notice: {
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(158,217,255,0.22)",
    background: "rgba(158,217,255,0.08)",
    color: "rgba(232,247,255,0.92)",
    fontSize: 13,
    lineHeight: 1.45,
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
  link: {
    color: "#9ed9ff",
    textDecoration: "none",
    fontWeight: 700,
  },
};
