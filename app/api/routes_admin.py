from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user_dev
from app.models.user import User
from app.services.player_stats_nba import import_nba_stats
from app.services.player_season_stats_nba import import_nba_season_stats
from app.services.players_active_refresh_nba import refresh_active_players
from app.services.players_import_nba import import_players_from_nba_api
from app.services.teams_refresh_nba import refresh_teams_from_season_stats

router = APIRouter()


@router.post("/refresh_teams")
def refresh_teams(
    season: str = Query("2025-26"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
):
    return refresh_teams_from_season_stats(db, season=season)


@router.post("/daily_refresh")
def daily_refresh(
    season: str = Query("2025-26"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
):
    response = {"season": season}

    try:
        response["players_created"] = import_players_from_nba_api(db, season=season)
    except Exception as e:
        response["players_error"] = f"{type(e).__name__}: {e}"

    try:
        response["player_stats_updated"] = import_nba_stats(db, season=season)
    except Exception as e:
        response["player_stats_error"] = f"{type(e).__name__}: {e}"

    try:
        response["active_refresh"] = refresh_active_players(db, season=season)
    except Exception as e:
        response["active_refresh_error"] = f"{type(e).__name__}: {e}"

    try:
        response["season_stats_refresh"] = import_nba_season_stats(db, season=season)
    except Exception as e:
        response["season_stats_error"] = f"{type(e).__name__}: {e}"

    try:
        response["teams_refresh"] = refresh_teams_from_season_stats(db, season=season)
    except Exception as e:
        response["teams_refresh_error"] = f"{type(e).__name__}: {e}"

    return response
