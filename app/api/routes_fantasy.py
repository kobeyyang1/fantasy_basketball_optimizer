# app/api/routes_fantasy.py

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.fantasy.projections import project_player

from app.models.user import User
from app.models.player import Player
from app.models.player_stats import PlayerStats

from app.schemas.player import (
    PlayerProjection,
    PlayerWithStats,
    PlayerStatsOut,
    PlayerRoto,
    PlayerRotoCategories,
)

router = APIRouter(tags=["fantasy"])


@router.get("/projections", response_model=List[PlayerProjection])
def get_projections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    players = db.query(Player).all()
    result: List[PlayerProjection] = []

    for p in players:
        projected_points = project_player(p)

        result.append(
            PlayerProjection(
                id=p.id,
                name=p.name,
                position=p.position,
                team=getattr(p, "team", None),
                projected_points=projected_points,
            )
        )

    return result


@router.get("/players_with_stats", response_model=List[PlayerWithStats])
def get_players_with_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    players = db.query(Player).all()
    result: List[PlayerWithStats] = []

    for p in players:
        stats_obj: PlayerStats | None = p.stats

        stats_out = None
        if stats_obj is not None:
            stats_out = PlayerStatsOut.from_orm(stats_obj)

        result.append(
            PlayerWithStats(
                id=p.id,
                name=p.name,  # ✅ real column
                position=p.position,
                team_full_name=getattr(p, "team_full_name", None),
                stats=stats_out,
            )
        )

    return result


@router.get("/player_roto/{player_id}", response_model=PlayerRoto)
def get_player_roto(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found.")

    stats_obj: PlayerStats | None = player.stats
    if not stats_obj:
        raise HTTPException(status_code=404, detail="No stats for this player.")

    categories = PlayerRotoCategories(
        fg_pct=stats_obj.fg_pct,
        ft_pct=stats_obj.ft_pct,
        three_pm=stats_obj.three_pm,
        points=stats_obj.points,
        rebounds=stats_obj.rebounds,
        assists=stats_obj.assists,
        steals=stats_obj.steals,
        blocks=stats_obj.blocks,
        turnovers=stats_obj.turnovers,
    )

    return PlayerRoto(
        id=player.id,
        name=player.name,  # ✅ real column
        categories=categories,
    )
