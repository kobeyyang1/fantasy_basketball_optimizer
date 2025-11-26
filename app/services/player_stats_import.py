# app/services/player_stats_import.py

import os
import requests
from requests import HTTPError
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.player_stats import PlayerStats

# Load .env so we can read BALLDONTLIE_API_KEY
load_dotenv()

API_KEY = os.getenv("BALLDONTLIE_API_KEY")
BASE_URL = "https://api.balldontlie.io/nba/v1/season_averages/general"


def fetch_season_averages_from_api(
    player_external_id: int,
    season: int = 2023,
) -> dict | None:
    """
    Call balldontlie season_averages endpoint for a single player
    using the EXTERNAL balldontlie player id.
    Returns the stats dict (first item in 'data') or None if no data
    or if the API call fails (401, 404, etc.).
    """
    if not API_KEY:
        raise RuntimeError(
            "BALLDONTLIE_API_KEY is not set. Add it to your .env file."
        )

    params = {
    "season": season,
    "season_type": "regular",
    "type": "base",
    "player_ids[]": player_external_id,
    }

    headers = {
        # Same style as in players_import.py
        "Authorization": API_KEY,
    }

    try:
        response = requests.get(
            BASE_URL,
            params=params,
            headers=headers,
            timeout=10,
        )

        # If unauthorized (401), don't crash the whole import,
        # just log and return None so we skip stats for this player.
        if response.status_code == 401:
            print(
                f"[WARN] 401 Unauthorized when calling season_averages "
                f"for player_external_id={player_external_id}. "
                "Check your BALDONTLIE_API_KEY or API plan."
            )
            return None

        response.raise_for_status()

    except HTTPError as exc:
        # Any other HTTP error: warn and skip this player
        print(
            f"[WARN] HTTP error calling season_averages for "
            f"player_external_id={player_external_id}: {exc}"
        )
        return None
    except Exception as exc:
        # Network or other unexpected error
        print(
            f"[WARN] Unexpected error calling season_averages for "
            f"player_external_id={player_external_id}: {exc}"
        )
        return None

    data = response.json().get("data", [])
    if not data:
        # No season averages for this player
        return None

    # data is a list of season averages; we take the first one
    return data[0]


def import_stats_for_all_players(db: Session, season: int = 2023) -> int:
    """
    For every player in the DB that has an external_id:
      - fetch season averages from balldontlie using external_id
      - upsert into PlayerStats table using internal Player.id

    Returns the number of players for which we stored stats.
    """

    # Only players that actually have an external_id (Balldontlie id)
    players = db.query(Player).filter(Player.external_id.isnot(None)).all()
    imported_count = 0

    for player in players:
        stats_data = fetch_season_averages_from_api(
            player_external_id=player.external_id,
            season=season,
        )

        if not stats_data:
            # player has no stats or API call failed; skip
            continue

        # Try to find existing stats row for this player (linked by internal id)
        stats = (
            db.query(PlayerStats)
            .filter(PlayerStats.player_id == player.id)
            .first()
        )

        if stats is None:
            stats = PlayerStats(player_id=player.id)
            db.add(stats)

        # Map fields from API -> our columns (using .get with default None)
        stats.fga = stats_data.get("fga")
        stats.fgm = stats_data.get("fgm")
        stats.fg_pct = stats_data.get("fg_pct")

        stats.fta = stats_data.get("fta")
        stats.ftm = stats_data.get("ftm")
        stats.ft_pct = stats_data.get("ft_pct")

        stats.three_pm = stats_data.get("fg3m")

        stats.points = stats_data.get("pts")
        stats.rebounds = stats_data.get("reb")
        stats.assists = stats_data.get("ast")
        stats.steals = stats_data.get("stl")
        stats.blocks = stats_data.get("blk")
        stats.turnovers = stats_data.get("turnover")

        imported_count += 1

    db.commit()
    return imported_count
