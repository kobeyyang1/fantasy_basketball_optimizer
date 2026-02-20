import { Link } from "react-router-dom";

const quickLinks = [
  {
    to: "/dashboard",
    title: "Dashboard",
    description: "View season-aware roto rankings with risk-adjusted scores.",
  },
  {
    to: "/optimizer",
    title: "Optimizer",
    description: "Generate draft builds based on focus and punt categories.",
  },
  {
    to: "/draft",
    title: "Draft Planner",
    description: "Plan rounds by slot and track your projected lineup path.",
  },
  {
    to: "/explain",
    title: "Explainability",
    description: "Understand model decisions and category-level player impact.",
  },
];

export default function Landing() {
  return (
    <section style={styles.page}>
      <div style={styles.heroWrap}>
        <div style={styles.badge}>Fantasy Basketball Assistant</div>
        <h1 style={styles.title}>Fantasy Basketball Lineup Optimizer & Performance Predictor</h1>
        <p style={styles.subtitle}>
          This app combines roto category scoring, availability risk, and explainability
          into one workflow so you can compare players, build stronger lineups, and make
          clearer draft decisions.
        </p>

        <div style={styles.ctaRow}>
          <Link to="/dashboard" style={styles.primaryCta}>
            Open Dashboard
          </Link>
          <Link to="/optimizer" style={styles.secondaryCta}>
            Start Optimizer
          </Link>
        </div>
      </div>

      <div style={styles.cardsGrid}>
        {quickLinks.map((item) => (
          <Link key={item.to} to={item.to} style={styles.card}>
            <div style={styles.cardTitle}>{item.title}</div>
            <div style={styles.cardBody}>{item.description}</div>
            <div style={styles.cardAction}>Go to tab</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const styles = {
  page: {
    display: "grid",
    gap: 22,
    padding: "6px 2px 2px",
  },
  heroWrap: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(140deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 52%)," +
      "radial-gradient(900px 380px at 100% 0, rgba(120, 207, 255, 0.22), transparent 55%)," +
      "radial-gradient(700px 280px at 0 100%, rgba(81, 255, 176, 0.16), transparent 52%)",
    padding: "28px clamp(16px, 4vw, 34px)",
    boxShadow: "0 20px 48px rgba(0,0,0,0.34)",
  },
  badge: {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: 999,
    padding: "6px 10px",
    marginBottom: 12,
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
  },
  title: {
    margin: 0,
    fontSize: "clamp(28px, 5vw, 44px)",
    lineHeight: 1.08,
    letterSpacing: -0.4,
    color: "#f7fbff",
    maxWidth: 760,
    fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 0,
    color: "rgba(239, 247, 255, 0.82)",
    maxWidth: 760,
    fontSize: 16,
    lineHeight: 1.5,
  },
  ctaRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 20,
  },
  primaryCta: {
    textDecoration: "none",
    fontWeight: 800,
    color: "#02131f",
    background: "linear-gradient(130deg, #d3f4ff 0%, #84deff 100%)",
    borderRadius: 12,
    padding: "11px 16px",
    border: "1px solid rgba(255,255,255,0.45)",
    boxShadow: "0 10px 24px rgba(38, 158, 214, 0.35)",
  },
  secondaryCta: {
    textDecoration: "none",
    fontWeight: 700,
    color: "rgba(255,255,255,0.93)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "11px 16px",
    border: "1px solid rgba(255,255,255,0.2)",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    textDecoration: "none",
    color: "inherit",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    padding: 14,
    minHeight: 146,
    display: "grid",
    alignContent: "space-between",
    gap: 8,
    transition: "transform 120ms ease, border-color 120ms ease, background 120ms ease",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: "rgba(250, 252, 255, 0.95)",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 1.45,
    color: "rgba(233,240,249,0.79)",
  },
  cardAction: {
    fontSize: 13,
    fontWeight: 700,
    color: "#7fdfff",
  },
};
