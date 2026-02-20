# Interview Cheat Sheet

## Backend (FastAPI)

### Entry Point
- `app/main.py`
  - Creates the FastAPI app, configures CORS, registers routers, and creates DB tables on startup.
  - `home()` returns a basic health message.

### Core/Auth
- `app/core/deps.py`
  - `get_db()` creates and yields a DB session per request.
  - `get_current_user()` reads the JWT, loads the user, and enforces auth.
  - `get_current_user_dev()` dev shortcut that returns the first user in the DB.
- `app/core/security.py`
  - `hash_password()` hashes plaintext passwords.
  - `verify_password()` checks a password against its hash.
  - `create_access_token()` issues JWTs.
  - `decode_access_token()` verifies a JWT and returns payload.

### Database
- `app/db/session.py`
  - Configures SQLite connection and `SessionLocal`.
- `app/db/base.py`
  - Imports models to register them with SQLAlchemy.

### Models
- `app/models/user.py` — `User` model for accounts.
- `app/models/player.py` — `Player` model with relationships to stats.
- `app/models/player_stats.py` — `PlayerStats` (one season aggregate per player).
- `app/models/player_season_stats.py` — `PlayerSeasonStats` (one row per player per season).
- `app/models/saved_items.py` — `SavedItem` for storing user-saved payloads.

### Schemas (Pydantic)
- `app/schemas/user.py` — request/response shapes for users and auth.
- `app/schemas/player.py` — player + stats output shapes.
- `app/schemas/saved_items.py` — saved item input/output shapes.

### API Routes
- `app/api/routes_auth.py`
  - `login()` authenticates user and returns a JWT.
- `app/api/routes_users.py`
  - `register_user()` registers a user.
  - `read_me()` returns the current authenticated user.
- `app/api/routes_players.py`
  - `create_player()` inserts a new player.
  - `list_players()` returns all players.
  - `import_players()` pulls player list from API.
  - `import_player_stats()` imports season stats using nba_api.
- `app/api/routes_saved.py`
  - `list_saved()` returns saved items for a user.
  - `create_saved()` saves a lineup or draft plan.
  - `delete_saved()` deletes one saved item.
- `app/api/routes_admin.py`
  - `refresh_teams()` updates player team abbreviations from nba_api.
- `app/api/routes_fantasy.py` (main feature API)
  - `active_players_stats()` returns active players with totals + per-game averages for a season.
  - `debug_db()` returns DB URL being used.
  - `get_projections()` returns simple position-based projections.
  - `get_top_players()` top N players by projection.
  - `get_players_with_stats()` players + their stored `PlayerStats`.
  - `get_players_active_with_stats()` active players with 9-cat stats for UI pickers.
  - `get_player_roto()` single player 9-cat line.
  - `get_roto_overview()` list of players with 9-cat stats.
  - `get_team_roto()` totals for a team (weighted FG/FT%).
  - `get_team_roto_scored()` team roto z-scores with optional punts.
  - `get_roto_rankings()` z-score rankings + value over replacement.
  - `get_roto_risk_rankings()` roto rankings blended with durability risk.
  - `get_roto_summary()` league averages and std dev for categories.
  - `get_player_profile()` full stats for a player.
  - `debug_players()` debug list of players (optional filter).
  - `get_ml_rankings()` ML-based ranking for a season.
  - `get_ml_explain()` SHAP explainability for one player.
  - `compute_team_score_for_ids()` helper: team total roto score only.
  - `get_team_suggestions()` adds that improve team roto score.

### Services / Business Logic
- `app/services/roto_scoring.py`
  - `RotoCategoryResult` data holder.
  - `_compute_mean()` / `_compute_std()` stats helpers.
  - `compute_roto_scores()` computes category z-scores + total.
- `app/fantasy/projections.py`
  - `project_player()` simple position-based projection.
- `app/fantasy/risk.py`
  - `risk_raw_from_rows()` availability % over last 5 seasons.
- `app/fantasy/risk_utils.py`
  - `z_score()` converts list to z-scores.
  - `attach_risk_z()` mutates list with risk z-score.
- `app/ml/ml_predictions.py`
  - `build_feature_dataframe_for_season()` builds ML feature set.
  - `predict_roto_scores_with_rf()` returns ML rankings.
  - `explain_player_with_shap()` returns SHAP feature impacts.
- `app/services/players_import.py`
  - `import_players_from_api()` pulls all players from balldontlie.
- `app/services/player_stats_import.py`
  - `fetch_season_averages_from_api()` gets season averages for a player.
  - `import_stats_for_all_players()` saves stats into DB.
- `app/services/player_stats_nba.py`
  - `fetch_all_player_stats()` nba_api stats for all players.
  - `import_nba_stats()` stores stats into `PlayerStats`.
- `app/services/player_season_stats_nba.py`
  - `import_nba_season_stats()` stores season totals into `PlayerSeasonStats`.
- `app/services/teams_refresh_nba.py`
  - `refresh_teams_from_season_stats()` updates team abbreviations.

## Frontend (React)

### Entry + Routing
- `fantasy-frontend/src/main.jsx` — React entry point.
- `fantasy-frontend/src/App.jsx` — routes + layout + navbar.

### API Clients
- `fantasy-frontend/src/api/api.js`
  - Axios instance, token storage, auth header injection, and 401 auto-logout.
- `fantasy-frontend/src/api/authApi.js`
  - `login()` POSTs form data to `/auth/login`.
- `fantasy-frontend/src/api/fantasyApi.js`
  - Wrapper functions for all fantasy endpoints (rankings, stats, ML explain, save/load).

### Hooks
- `fantasy-frontend/src/hooks/useSeason.js`
  - Manages season selection + localStorage persistence.
- `fantasy-frontend/src/hooks/useLeagueStats.js`
  - Fetches active player stats and computes league mean/std for z-scores.

### Pages
- `fantasy-frontend/src/pages/Dashboard.jsx`
  - Main rankings view (roto + risk). Computes z-scores client-side for color coding.
- `fantasy-frontend/src/pages/Optimizer.jsx`
  - Draft lineup builder using category targets, diminishing returns, and availability probability.
- `fantasy-frontend/src/pages/DraftPlanner.jsx`
  - Draft board with drafted tracking + z-score colors.
- `fantasy-frontend/src/pages/Explainability.jsx`
  - Lists players and shows SHAP feature impacts.
- `fantasy-frontend/src/pages/Login.jsx`
  - Login form and token storage.
- `fantasy-frontend/src/pages/Saved.jsx`
  - Saved lineups/draft plans list and delete.

### Shared Components
- `fantasy-frontend/src/components/NavBar.jsx` — top navigation.
- `fantasy-frontend/src/components/RequireAuth.jsx` — protects routes using token.
- `fantasy-frontend/src/components/SeasonDropdown.jsx` — season selector.
- `fantasy-frontend/src/components/RiskSlider.jsx` — risk weight UI.
- `fantasy-frontend/src/components/PlayerPicker.jsx` — player search selection.
- `fantasy-frontend/src/components/PlayerStatsTable.jsx` / `PlayerTable.jsx` / `StatCell.jsx` — stats tables + styling.
- `fantasy-frontend/src/components/Modal.jsx` — explainability popup.
- `fantasy-frontend/src/components/Loading.jsx` — loading state.

### Utils
- `fantasy-frontend/src/utils/storage.js`
  - `loadJSON()` / `saveJSON()` helpers for localStorage.
