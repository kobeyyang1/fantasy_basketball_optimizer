# app/scripts/run_imports.py

from app.db.session import SQLALCHEMY_DATABASE_URL
print("🚨 IMPORT SCRIPT USING DB:", SQLALCHEMY_DATABASE_URL)
from app.services.players_import_nba import import_players_from_nba_api
from app.services.player_stats_nba import import_nba_stats
from app.services.player_positions_nba import import_nba_positions
from app.services.player_season_stats_nba import import_nba_season_stats

# ⚠️ Use the SAME SessionLocal import you already use elsewhere in your app.
# If in your project it's from app.db.session import SessionLocal, keep that.
from app.db.session import SessionLocal  # <-- CHANGE IF YOUR PROJECT USES A DIFFERENT PATH


def main():
    db = SessionLocal()

    try:
        # 1) Import all players from NBA API
        print("=== Importing players from NBA API ===")
        created = import_players_from_nba_api(db, season="2023-24")
        print(f"Players newly created: {created}")

        # 2) Import stats for those players
        print("=== Importing player stats via nba_api ===")
        updated = import_nba_stats(db, season="2023-24")
        print(f"Players with stats updated: {updated}")

        # 3) Fill missing positions (slow but only runs on players with position == None)
        print("=== Importing player positions via NBA API (for missing ones only) ===")
        pos_updated = import_nba_positions(db, delay_seconds=0.6)
        print(f"Players with position updated: {pos_updated}")

        # 4) Import the last 5 seasons into player_season_stats
        print("=== Importing LAST 5 SEASONS into player_season_stats ===")
        seasons = ["2024-25"]

        for season in seasons:
            print(f"\n--- Importing season totals: {season} ---")
            result = import_nba_season_stats(db, season=season)
            print(
                f"{season}: inserted={result['inserted']} updated={result['updated']} "
                f"skipped={result['skipped']} api_rows={result['rows_from_api']}"
            )


    finally:
        db.close()


if __name__ == "__main__":
    main()
