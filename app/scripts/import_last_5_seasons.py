# app/scripts/import_last_5_seasons.py

from sqlalchemy.orm import Session

import time
from requests.exceptions import ReadTimeout, ConnectionError

import app.db.base  # registers all SQLAlchemy models so relationships work
from app.db.session import SessionLocal
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats

# nba_api
from nba_api.stats.endpoints import playerdashboardbygeneralsplits


SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


def upsert_player_season_stats(db: Session, player_id: int, season: str, data: dict) -> None:
    row = (
        db.query(PlayerSeasonStats)
        .filter(PlayerSeasonStats.player_id == player_id, PlayerSeasonStats.season == season)
        .first()
    )

    if row is None:
        row = PlayerSeasonStats(player_id=player_id, season=season)
        db.add(row)

    # required for risk
    row.gp = int(data.get("GP", 0) or 0)

    # shooting totals + %s
    row.fga = float(data.get("FGA", 0) or 0)
    row.fgm = float(data.get("FGM", 0) or 0)
    row.fg_pct = float(data.get("FG_PCT", 0) or 0)

    row.fta = float(data.get("FTA", 0) or 0)
    row.ftm = float(data.get("FTM", 0) or 0)
    row.ft_pct = float(data.get("FT_PCT", 0) or 0)

    # 3PM
    row.three_pm = float(data.get("FG3M", 0) or 0)

    # counting stats
    row.points = float(data.get("PTS", 0) or 0)
    row.rebounds = float(data.get("REB", 0) or 0)
    row.assists = float(data.get("AST", 0) or 0)
    row.steals = float(data.get("STL", 0) or 0)
    row.blocks = float(data.get("BLK", 0) or 0)
    row.turnovers = float(data.get("TOV", 0) or 0)


def fetch_season_totals_for_player(external_player_id: int, season: str) -> dict | None:
    """
    Fetch per-player season totals with retries.
    Returns a dict with keys like: GP, FGA, FGM, FG_PCT, FTA, FTM, FT_PCT, FG3M, PTS, REB, AST, STL, BLK, TOV
    """
    max_retries = 5
    backoff_seconds = 2

    for attempt in range(1, max_retries + 1):
        try:
            endpoint = playerdashboardbygeneralsplits.PlayerDashboardByGeneralSplits(
                player_id=external_player_id,
                season=season,
                season_type_playoffs="Regular Season",
                per_mode_detailed="Totals",
                timeout=120,  # increase request timeout
            )

            dfs = endpoint.get_data_frames()
            if not dfs:
                return None

            df = dfs[0]
            if df is None or df.empty:
                return None

            return df.iloc[0].to_dict()

        except (ReadTimeout, ConnectionError, TimeoutError) as e:
            print(f"    timeout for player_id={external_player_id} season={season} (attempt {attempt}/{max_retries})")
            if attempt == max_retries:
                return None

            time.sleep(backoff_seconds)
            backoff_seconds *= 2  # exponential backoff

        except Exception as e:
            # Don't kill the whole import for one weird player response
            print(f"    error for player_id={external_player_id} season={season}: {type(e).__name__}")
            return None

def run():
    db: Session = SessionLocal()

    try:
        players = db.query(Player).all()
        print(f"Found {len(players)} players in DB")

        inserted = 0
        updated = 0
        skipped = 0
        failed = 0

        for season in SEASONS:
            print(f"\n=== Importing season {season} ===")

            for idx, p in enumerate(players, start=1):
                # progress every 25 players
                if idx % 25 == 0:
                    print(
                        f"  {season}: processed {idx}/{len(players)} | "
                        f"inserted={inserted} updated={updated} skipped={skipped} failed={failed}"
                    )

                if p.external_id is None:
                    skipped += 1
                    continue

                # SKIP if this player-season already exists (makes restarts fast)
                existing_row = (
                    db.query(PlayerSeasonStats)
                    .filter(
                        PlayerSeasonStats.player_id == p.id,
                        PlayerSeasonStats.season == season
                    )
                    .first()
                )
                if existing_row is not None:
                    skipped += 1
                    continue

                data = fetch_season_totals_for_player(int(p.external_id), season)

                # slow down to reduce timeouts/rate limits
                time.sleep(0.7)

                if data is None:
                    failed += 1
                    continue

                # upsert (will insert because we skipped existing rows)
                upsert_player_season_stats(db, p.id, season, data)
                inserted += 1

                # commit every 50 inserts so progress is saved
                if inserted % 50 == 0:
                    db.commit()

            # commit at end of each season
            db.commit()
            print(f"Committed season {season}")

        print(
            f"\nDONE. Inserted: {inserted}, Updated: {updated}, "
            f"Skipped: {skipped}, Failed: {failed}"
        )

    finally:
        db.close()



if __name__ == "__main__":
    run()
