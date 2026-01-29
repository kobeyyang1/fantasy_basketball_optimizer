from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user_dev
from app.models.user import User
from app.services.teams_refresh_nba import refresh_teams_from_season_stats

router = APIRouter()


@router.post("/refresh_teams")
def refresh_teams(
    season: str = Query("2024-25"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
):
    return refresh_teams_from_season_stats(db, season=season)
