# app/scripts/run_imports.py

from app.db.session import SQLALCHEMY_DATABASE_URL
print("🚨 IMPORT SCRIPT USING DB:", SQLALCHEMY_DATABASE_URL)
from app.services.players_import_nba import import_players_from_nba_api
from app.services.player_stats_nba import import_nba_stats

# ⚠️ Use the SAME SessionLocal import you already use elsewhere in your app.
# If in your project it's from app.db.session import SessionLocal, keep that.
from app.db.session import SessionLocal  # <-- CHANGE IF YOUR PROJECT USES A DIFFERENT PATH


def main():
    db = SessionLocal()

    try:
        # 1) Import all players from NBA API (no Balldontlie anymore)
        print("=== Importing players from NBA API ===")
        created = import_players_from_nba_api(db, season="2023-24")
        print(f"Players newly created: {created}")

        # 2) Import stats for those players (nba_api)
        print("=== Importing player stats via nba_api ===")
        updated = import_nba_stats(db, season="2023-24")
        print(f"Players with stats updated: {updated}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
