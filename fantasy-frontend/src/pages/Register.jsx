import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "../api/authApi";
import { tokenStore } from "../api/api";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await register(email.trim(), password);
      const res = await login(email.trim(), password);
      const token = res.data?.access_token || res.data?.token;

      if (!token) {
        throw new Error("No token returned from backend");
      }

      tokenStore.set(token);
      nav("/saved", { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Registration failed. Try a different email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.eyebrow}>Optional account</div>
          <div style={styles.title}>Create account</div>
          <div style={styles.sub}>
            All analysis tools remain open without login. Create an account only if you want to save your optimized
            lineups.
          </div>
        </div>

        <div style={styles.notice}>
          Optimizer, dashboard, draft planner, and explainability tools are public. Login is only required for saved
          lineups.
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
              placeholder="Enter at least 6 characters"
              type="password"
              autoComplete="new-password"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Confirm password
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              type="password"
              autoComplete="new-password"
              style={styles.input}
            />
          </label>

          {error ? <div style={styles.error}>{error}</div> : null}

          <button disabled={busy} style={{ ...styles.button, opacity: busy ? 0.75 : 1 }}>
            {busy ? "Creating account..." : "Register"}
          </button>
        </form>

        <div style={styles.switchRow}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>
            Login
          </Link>
        </div>
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
    color: "rgba(255,255,255,0.94)",
  },
  sub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.5,
  },
  notice: {
    marginTop: 16,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(158,217,255,0.22)",
    background: "rgba(158,217,255,0.08)",
    color: "rgba(232,247,255,0.92)",
    fontSize: 13,
    lineHeight: 1.45,
  },
  form: { display: "grid", gap: 12, marginTop: 16 },
  label: { display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  input: {
    padding: 11,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  },
  button: {
    padding: 11,
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
  switchRow: {
    marginTop: 16,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  link: {
    color: "#9ed9ff",
    textDecoration: "none",
    fontWeight: 700,
  },
};
