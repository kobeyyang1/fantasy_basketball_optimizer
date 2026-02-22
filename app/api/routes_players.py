# app/api/routes_players.py

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.services.player_stats_nba import import_nba_stats
from app.core.deps import get_db, get_current_user
from app.models.player import Player
from app.schemas.player import PlayerCreate, PlayerOut
from app.services.players_import import import_players_from_api
from app.services.player_stats_import import import_stats_for_all_players
from app.models.user import User

router = APIRouter(tags=["players"])


@router.post("/", response_model=PlayerOut)
def create_player(
    player_in: PlayerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    player = Player(
        name=player_in.name,
        team=player_in.team,
        position=player_in.position,
        projected_points=player_in.projected_points,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.get("/", response_model=List[PlayerOut])
def list_players(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Player).all()


@router.post("/import")
def import_players(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created_count = import_players_from_api(db)
    return {"message": "Players imported", "created": created_count}


@router.post("/import_stats")
def import_player_stats(
    season: str = "2025-26",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import season stats for all players using nba_api instead of balldontlie.
    """
    imported_count = import_nba_stats(db, season)
    return {
        "season": season,
        "players_with_stats": imported_count,
    }

