// src/components/NavBar.jsx
import { NavLink, useLocation } from "react-router-dom";

const tabs = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/optimizer", label: "Optimizer" },
  { to: "/draft", label: "Draft Planner" },
  { to: "/explain", label: "Explainability" },
];

export default function NavBar() {
  const location = useLocation();

  // Hide navbar on login page
  if (location.pathname === "/login") {
    return null;
  }

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.brand}>Fantasy Basketball</div>

        <nav style={styles.nav}>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              style={({ isActive }) => ({
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
              })}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div style={styles.rightSlot}>
          <NavLink
            to="/help"
            style={({ isActive }) => ({
              ...styles.helpBtn,
              ...(isActive ? styles.helpBtnActive : {}),
            })}
            aria-label="Help"
            title="Help"
          >
            ?
          </NavLink>
        </div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "rgba(10, 10, 14, 0.85)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "14px 18px",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
  },
  brand: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  rightSlot: {
    justifySelf: "end",
  },
  nav: {
    justifySelf: "center",
    display: "flex",
    gap: 10,
    padding: 6,
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    flexWrap: "wrap",
  },
  tab: {
    padding: "10px 14px",
    borderRadius: 999,
    textDecoration: "none",
    color: "rgba(255,255,255,0.75)",
    fontWeight: 600,
    fontSize: 14,
    transition: "all 120ms ease",
  },
  tabActive: {
    color: "rgba(0,0,0,0.9)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
  },
  helpBtn: {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    textDecoration: "none",
    color: "rgba(255,255,255,0.9)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    fontWeight: 900,
    fontSize: 18,
    lineHeight: 1,
  },
  helpBtnActive: {
    background: "rgba(127,223,255,0.18)",
    border: "1px solid rgba(127,223,255,0.35)",
    color: "#bdefff",
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  },
};
