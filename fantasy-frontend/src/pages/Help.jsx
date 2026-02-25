import { Link } from "react-router-dom";
import { useTour } from "../tour/useTour";

const pageGuides = [
  {
    title: "Home",
    path: "/",
    detail:
      "Landing page for quick navigation. Use it when you want a fast jump to rankings, optimizer, draft planning, or explainability.",
  },
  {
    title: "Dashboard",
    path: "/dashboard",
    detail:
      "Main rankings table. Shows season-based 9-category player values, availability %, and a combined score that blends roto value with durability using the Risk slider.",
  },
  {
    title: "Optimizer",
    path: "/optimizer",
    detail:
      "Build a draft plan around your strategy. Set league size, draft slot, rounds, focus categories, punt categories, and optional locked players. The generator then picks players based on category needs and positional fit.",
  },
  {
    title: "Draft Planner",
    path: "/draft",
    detail:
      "Live draft tracking board. Mark players drafted, add players to My Team, filter/search the remaining pool, and keep a local draft state while rankings update with your chosen risk weight.",
  },
  {
    title: "Explainability",
    path: "/explain",
    detail:
      "Click a player to open a SHAP explanation for the ML model score. This is useful for understanding which stats pushed a player's ML score up or down.",
  },
  {
    title: "Saved",
    path: "/saved",
    detail:
      "Stores saved lineups and other future saved objects. This page is protected and requires login.",
  },
  {
    title: "Login",
    path: "/login",
    detail:
      "Authentication page used to access protected features such as Saved items.",
  },
];

const apps = [
  {
    name: "Yahoo Fantasy",
    fit: "Best all-round choice for most casual-to-serious leagues.",
    notes: "Strong fantasy basketball community, smooth drafts, good mobile experience, and common scoring presets.",
  },
  {
    name: "Fantrax",
    fit: "Best for custom rules and serious commissioners.",
    notes: "Great if you want dynasty/keeper depth, uncommon scoring setups, or advanced league customization.",
  },
  {
    name: "Sleeper",
    fit: "Best for chat-first leagues and modern social UX.",
    notes: "Good mobile-first experience and active league communication tools. Check current fantasy basketball feature support for your preferred format before committing.",
  },
  {
    name: "ESPN Fantasy",
    fit: "Best for beginners and mixed-sport groups already using ESPN.",
    notes: "Easy onboarding and familiar interface, but power users may want deeper customization.",
  },
  {
    name: "CBS Sports Fantasy",
    fit: "Best for managers who want a premium/traditional platform.",
    notes: "Often used in more established leagues; feature depth can be strong, but some tools may be behind paid tiers.",
  },
];

export default function Help() {
  const { hasTourForPath, startForPath } = useTour();

  return (
    <section style={styles.page}>
      <div style={styles.hero} data-tour="help-hero">
        <div style={styles.badge}>Help & Guide</div>
        <h1 style={styles.title}>How to Use This Fantasy Basketball Assistant</h1>
        <p style={styles.subtitle}>
          This page explains what each tab does, how the app computes roto rankings,
          how SHAP explanations are shown, and quick strategy guidance for fantasy
          basketball formats.
        </p>
      </div>

      <Section title="What Each Page Does">
        <div style={styles.grid} data-tour="help-page-guides">
          {pageGuides.map((item) => (
            <div key={item.path} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={styles.cardTitle}>{item.title}</div>
                <div style={styles.cardActions}>
                  {hasTourForPath(item.path) && (
                    <button
                      type="button"
                      onClick={() => startForPath(item.path)}
                      style={styles.tourLinkBtn}
                    >
                      Tour
                    </button>
                  )}
                  <Link to={item.path} style={styles.jumpLink}>
                    Open
                  </Link>
                </div>
              </div>
              <div style={styles.cardText}>{item.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How This System Calculates Roto Rankings">
        <div style={styles.stack}>
          <InfoBlock>
            Rankings are calculated from the selected season only. The backend uses
            players with a season row and `GP &gt; 0`, then builds a 9-category stat line.
          </InfoBlock>
          <InfoBlock>
            Counting stats (`3PM`, `PTS`, `REB`, `AST`, `STL`, `BLK`, `TOV`) are converted
            to per-game values using `total / GP`. `FG%` and `FT%` are used as rates (not
            divided again).
          </InfoBlock>
          <InfoBlock>
            For each category, the app computes the league mean and population standard
            deviation across the current player pool, then computes:
            <div style={styles.formula}>z = (player_value - league_mean) / league_std</div>
          </InfoBlock>
          <InfoBlock>
            Turnovers are inverted because lower turnovers are better. Missing stats (or
            zero variance in a category) are treated as neutral (`z = 0`).
          </InfoBlock>
          <InfoBlock>
            The base roto score (`total_score`) is the sum of category z-scores. If punt
            categories are used, punted categories are excluded from the sum.
          </InfoBlock>
          <InfoBlock>
            The dashboard then adds durability using a risk z-score:
            <div style={styles.formula}>combined_score = total_score + (risk_weight * risk_z)</div>
            `risk_raw` is an availability-style durability metric, `risk_z` standardizes it
            across the returned players, and the Risk slider controls `risk_weight`.
          </InfoBlock>
          <InfoBlock>
            Final ranking order is highest `combined_score` first. In Explainability, the
            list uses the same ranking endpoint with `risk_weight = 0`, so it matches pure
            roto ordering.
          </InfoBlock>
        </div>
      </Section>

      <Section title="What SHAP Is (and How the Scale Is Defined Here)">
        <div style={styles.stack}>
          <InfoBlock>
            SHAP (SHapley Additive exPlanations) is a method that explains a model prediction
            by assigning each input feature a contribution value.
          </InfoBlock>
          <InfoBlock>
            In this app, SHAP explains the Random Forest ML score shown in the Explainability
            modal. Each category feature (FG%, FT%, points, rebounds, etc.) gets a SHAP value.
          </InfoBlock>
          <InfoBlock>
            Positive SHAP values push the player&apos;s ML score up. Negative SHAP values push it
            down. The values are in model-score units, not directly NBA points or z-scores.
          </InfoBlock>
          <InfoBlock>
            The modal also shows a `base_value` (the model baseline). Conceptually:
            <div style={styles.formula}>base_value + sum(feature SHAP values) ~= ml_score</div>
          </InfoBlock>
          <InfoBlock>
            The UI labels (`slightly helps`, `helps`, `strongly helps`, and the hurt versions)
            are dynamic and relative to the selected player. The app sorts absolute SHAP
            magnitudes for that player and uses quantile thresholds (about 35th and 75th
            percentiles) to define the label buckets.
          </InfoBlock>
          <InfoBlock>
            Because those thresholds are player-specific, a `strongly helps` label for one
            player is not guaranteed to have the same numeric SHAP magnitude as another player.
          </InfoBlock>
        </div>
      </Section>

      <Section title="Fantasy Basketball Basics">
        <div style={styles.twoCol}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>What Fantasy Basketball Is</div>
            <div style={styles.cardText}>
              You draft NBA players into a fantasy roster and score based on their real-life
              performance. You compete against other managers over a season (or weekly matchups),
              depending on league settings.
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Common Ways to Win</div>
            <div style={styles.cardText}>
              Your strategy changes by format. Roto rewards balanced season-long category value.
              Points leagues reward players who produce the most fantasy points under your
              platform&apos;s scoring rules.
            </div>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Roto (Rotisserie)</div>
            <ul style={styles.list}>
              <li>Compete across categories over the full season.</li>
              <li>Every category matters unless your league intentionally punts.</li>
              <li>Balance and durability are usually more important than streaky upside.</li>
              <li>Track category standings regularly so you know where gains are still possible.</li>
            </ul>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Points Leagues</div>
            <ul style={styles.list}>
              <li>Players score fantasy points based on a platform scoring formula.</li>
              <li>Volume, role, and minutes often matter more than category efficiency.</li>
              <li>Always rank players using your exact league scoring settings.</li>
              <li>Streaming and schedule density can swing weekly results.</li>
            </ul>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Best Practices (Any Format)</div>
            <ul style={styles.list}>
              <li>Know your league rules first (format, waivers, playoffs, IR slots).</li>
              <li>Prioritize availability and role security, not just peak upside.</li>
              <li>Use tiers instead of strict rank numbers during drafts.</li>
              <li>Make your roster construction fit your format (balance vs raw points).</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Recommended Fantasy Basketball Apps">
        <div style={styles.stack}>
          <InfoBlock>
            There is no single best app for every league. The right choice depends on whether
            your group values ease of use, commissioner customization, or social/mobile features.
          </InfoBlock>
        </div>

        <div style={styles.grid}>
          {apps.map((app) => (
            <div key={app.name} style={styles.card}>
              <div style={styles.cardTitle}>{app.name}</div>
              <div style={styles.cardFit}>{app.fit}</div>
              <div style={styles.cardText}>{app.notes}</div>
            </div>
          ))}
        </div>
      </Section>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function InfoBlock({ children }) {
  return <div style={styles.infoBlock}>{children}</div>;
}

const styles = {
  page: {
    display: "grid",
    gap: 18,
    padding: "4px 2px 8px",
  },
  hero: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(140deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03) 55%)," +
      "radial-gradient(850px 280px at 100% 0, rgba(255, 215, 112, 0.18), transparent 55%)," +
      "radial-gradient(700px 240px at 0 100%, rgba(127, 223, 255, 0.16), transparent 58%)",
    padding: "22px clamp(14px, 4vw, 26px)",
  },
  badge: {
    display: "inline-block",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.04)",
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 800,
    color: "rgba(255,255,255,0.88)",
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: "clamp(26px, 4vw, 38px)",
    lineHeight: 1.08,
    letterSpacing: -0.4,
    color: "#fbfdff",
  },
  subtitle: {
    margin: "12px 0 0 0",
    maxWidth: 860,
    color: "rgba(235,242,249,0.82)",
    lineHeight: 1.5,
  },
  section: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.025)",
    padding: 14,
    display: "grid",
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#f5f8fb",
    letterSpacing: -0.2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  stack: {
    display: "grid",
    gap: 10,
  },
  card: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.03)",
    padding: 12,
    display: "grid",
    gap: 8,
    alignContent: "start",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "rgba(247,250,255,0.95)",
  },
  cardFit: {
    fontSize: 13,
    color: "#a6e6ff",
    fontWeight: 700,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 1.45,
    color: "rgba(228,236,245,0.82)",
  },
  jumpLink: {
    textDecoration: "none",
    color: "#7fdfff",
    fontWeight: 700,
    fontSize: 13,
    border: "1px solid rgba(127,223,255,0.22)",
    borderRadius: 999,
    padding: "5px 10px",
    background: "rgba(127,223,255,0.07)",
    whiteSpace: "nowrap",
  },
  tourLinkBtn: {
    borderRadius: 999,
    border: "1px solid rgba(127,223,255,0.22)",
    background: "rgba(127,223,255,0.10)",
    color: "#d9f6ff",
    padding: "5px 10px",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  infoBlock: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.02)",
    padding: "10px 12px",
    color: "rgba(231,239,247,0.86)",
    lineHeight: 1.5,
    fontSize: 14,
  },
  formula: {
    marginTop: 8,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(0,0,0,0.20)",
    color: "#e9fbff",
    fontFamily: "Consolas, Menlo, monospace",
    fontSize: 13,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: "rgba(228,236,245,0.82)",
    lineHeight: 1.55,
    fontSize: 14,
  },
};
