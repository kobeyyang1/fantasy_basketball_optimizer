from app.db.session import SessionLocal
from app.services.player_stats_nba import import_nba_stats
from app.services.player_season_stats_nba import import_nba_season_stats
from app.services.players_active_refresh_nba import refresh_active_players
from app.services.players_import_nba import import_players_from_nba_api
from app.services.teams_refresh_nba import refresh_teams_from_season_stats


DEFAULT_SEASON = "2025-26"


def run(season: str = DEFAULT_SEASON) -> None:
    db = SessionLocal()
    try:
        print(f"=== Daily refresh for {season} ===")
        results: dict = {"season": season}

        try:
            players_created = import_players_from_nba_api(db, season=season)
            results["players_created"] = players_created
            print(f"players_created={players_created}")
        except Exception as e:
            results["players_error"] = f"{type(e).__name__}: {e}"
            print(f"[ERROR] players import failed: {type(e).__name__}: {e}")

        try:
            player_stats_updated = import_nba_stats(db, season=season)
            results["player_stats_updated"] = player_stats_updated
            print(f"player_stats_updated={player_stats_updated}")
        except Exception as e:
            results["player_stats_error"] = f"{type(e).__name__}: {e}"
            print(f"[ERROR] player stats refresh failed: {type(e).__name__}: {e}")

        try:
            active_result = refresh_active_players(db, season=season)
            results["active_refresh"] = active_result
            print(f"active_refresh={active_result}")
        except Exception as e:
            results["active_refresh_error"] = f"{type(e).__name__}: {e}"
            print(f"[ERROR] active refresh failed: {type(e).__name__}: {e}")

        try:
            season_stats_result = import_nba_season_stats(db, season=season)
            results["season_stats_refresh"] = season_stats_result
            print(f"season_stats_refresh={season_stats_result}")
        except Exception as e:
            results["season_stats_error"] = f"{type(e).__name__}: {e}"
            print(f"[ERROR] season stats refresh failed: {type(e).__name__}: {e}")

        try:
            teams_result = refresh_teams_from_season_stats(db, season=season)
            results["teams_refresh"] = teams_result
            print(f"teams_refresh={teams_result}")
        except Exception as e:
            results["teams_refresh_error"] = f"{type(e).__name__}: {e}"
            print(f"[ERROR] teams refresh failed: {type(e).__name__}: {e}")

        print(f"summary={results}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
