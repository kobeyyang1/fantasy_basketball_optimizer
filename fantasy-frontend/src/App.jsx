// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import RequireAuth from "./components/RequireAuth";

import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Optimizer from "./pages/Optimizer";
import DraftPlanner from "./pages/DraftPlanner";
import Explainability from "./pages/Explainability";
import Saved from "./pages/Saved";

export default function App() {
  return (
    <div style={styles.app}>
      <NavBar />

      <main style={styles.main}>
        <div style={styles.shell}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/optimizer" element={<Optimizer />} />
            <Route path="/draft" element={<DraftPlanner />} />
            <Route path="/explain" element={<Explainability />} />
            <Route path="/explainability" element={<Explainability />} />

            {/* Protected: only saved items */}
            <Route
              path="/saved"
              element={
                <RequireAuth>
                  <Saved />
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        <footer style={styles.footer}>
          <span style={{ opacity: 0.7 }}>
            Built for season-aware roto analysis - local-only draft state
          </span>
        </footer>
      </main>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(89, 99, 255, 0.25), transparent 60%)," +
      "radial-gradient(900px 500px at 90% 0%, rgba(255, 89, 188, 0.18), transparent 55%)," +
      "linear-gradient(180deg, #0b0b10 0%, #07070b 100%)",
    color: "rgba(255,255,255,0.92)",
  },
  main: { padding: "26px 18px 42px 18px" },
  shell: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
  },
  footer: {
    maxWidth: 1200,
    margin: "16px auto 0 auto",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    padding: "0 6px",
  },
};
