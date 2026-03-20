// Reusable steps that appear on multiple pages so the tour stays consistent.
const commonNavSteps = [
  {
    selector: '[data-tour="nav-tabs"]',
    title: "Navigation tabs",
    body: "Use these tabs to move between rankings, optimizer, draft tools, and explainability.",
  },
  {
    selector: '[data-tour="help-button"]',
    title: "Help",
    body: "Open the Help page for written guides and quick links. You can also restart tours from there.",
  },
];

// Each route maps to an ordered list of tour steps.
// The selector must match a real element in the page markup via a data-tour attribute.
export const tourByPath = {
  "/": [
    {
      selector: '[data-tour="landing-hero"]',
      title: "Home overview",
      body: "This landing page gives a quick overview of the app and the main tools.",
    },
    {
      selector: '[data-tour="landing-cta"]',
      title: "Quick start buttons",
      body: "Jump straight into the Dashboard or Optimizer from here.",
    },
    {
      selector: '[data-tour="landing-links"]',
      title: "Feature cards",
      body: "These cards are shortcuts to each page, with a short explanation of what each page is for.",
    },
    ...commonNavSteps,
  ],
  "/dashboard": [
    {
      selector: '[data-tour="dashboard-header"]',
      title: "Dashboard",
      body: "This page ranks players using roto value plus availability (durability) weighting.",
    },
    {
      selector: '[data-tour="dashboard-controls"]',
      title: "Season and risk controls",
      body: "Pick a season and adjust the risk slider to change how much durability affects the ranking.",
    },
    {
      selector: '[data-tour="dashboard-search"]',
      title: "Search and filter",
      body: "Search by player name, team, or position to narrow the rankings table.",
    },
    {
      selector: '[data-tour="dashboard-table"]',
      title: "Rankings table",
      body: "Compare category stats, roto score, availability %, and the final combined score.",
    },
    ...commonNavSteps,
  ],
  "/optimizer": [
    {
      selector: '[data-tour="optimizer-header"]',
      title: "Optimizer",
      body: "Build a draft plan around category strategy, roster fit, and optional player locks.",
    },
    {
      selector: '[data-tour="optimizer-controls"]',
      title: "Draft setup",
      body: "Set season, league size, draft slot, and rounds before generating a lineup.",
    },
    {
      selector: '[data-tour="optimizer-locks"]',
      title: "Build around players",
      body: "Search and lock up to 3 players to force the optimizer to build around them.",
    },
    {
      selector: '[data-tour="optimizer-focus"]',
      title: "Focus categories",
      body: "Choose categories you want the optimizer to prioritize more aggressively.",
    },
    {
      selector: '[data-tour="optimizer-punt"]',
      title: "Punt categories",
      body: "Punted categories are ignored in the lineup scoring logic.",
    },
    {
      selector: '[data-tour="optimizer-results"]',
      title: "Generated lineup",
      body: "After clicking Generate lineup, your draft plan appears here with rounds and availability estimates.",
    },
    ...commonNavSteps,
  ],
  "/draft": [
    {
      selector: '[data-tour="draft-header"]',
      title: "Draft Planner",
      body: "Track a live draft board or run a mock draft using the current rankings.",
    },
    {
      selector: '[data-tour="draft-controls"]',
      title: "Ranking controls",
      body: "Season and risk weight update the player pool and ordering used in the planner.",
    },
    {
      selector: '[data-tour="draft-board"]',
      title: "Available players board",
      body: "Search and filter the available players. Mark players as drafted or add them to My Team.",
    },
    {
      selector: '[data-tour="draft-workspace"]',
      title: "Workspace",
      body: "Use the workspace tabs to manage My Team, track others, and run the mock draft room.",
    },
    ...commonNavSteps,
  ],
  "/explain": [
    {
      selector: '[data-tour="explain-header"]',
      title: "Explainability",
      body: "This page lets you inspect model explanations for individual players.",
    },
    {
      selector: '[data-tour="explain-controls"]',
      title: "Season and search",
      body: "Choose the season and search for a player in the ranking list.",
    },
    {
      selector: '[data-tour="explain-list"]',
      title: "Player list",
      body: "Click a player name to open a SHAP explanation modal for that player.",
    },
    ...commonNavSteps,
  ],
  "/help": [
    {
      selector: '[data-tour="help-hero"]',
      title: "Help page",
      body: "This page is the written reference for what each tab does and how the metrics are calculated.",
    },
    {
      selector: '[data-tour="help-page-guides"]',
      title: "Page guides",
      body: "Use these cards to open a page or start its guided tour directly.",
    },
    ...commonNavSteps,
  ],
};

export function normalizeTourPath(pathname) {
  // Keep older/alternate routes pointing at the same step definition.
  if (pathname === "/explainability") return "/explain";
  return pathname;
}
