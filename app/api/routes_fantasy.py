# app/api/routes_fantasy.py

from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from math import sqrt

from app.core.deps import get_db, get_current_user
from app.fantasy.projections import project_player

from app.models.user import User
from app.models.player import Player
from app.models.player_stats import PlayerStats
from app.services.roto_scoring import compute_roto_scores

from app.schemas.player import (
    PlayerProjection,
    PlayerWithStats,
    PlayerStatsOut,
    PlayerRoto,
    PlayerRotoCategories,
)

from app.db.session import SQLALCHEMY_DATABASE_URL
print("🚨 FASTAPI USING DB:", SQLALCHEMY_DATABASE_URL)


router = APIRouter(tags=["fantasy"])

@router.get("/debug_db")
def debug_db():
    return {"db_url": SQLALCHEMY_DATABASE_URL}


# ---------- Existing endpoints ----------

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


@router.get("/top_players", response_model=List[PlayerProjection])
def get_top_players(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the top N players by projected fantasy points.
    Uses the same project_player() function.
    """

    players = db.query(Player).all()
    projections: List[PlayerProjection] = []

    # Build projections for all players
    for p in players:
        projected_points = project_player(p)

        projections.append(
            PlayerProjection(
                id=p.id,
                name=p.name,
                position=p.position,
                team=getattr(p, "team", None),
                projected_points=projected_points,
            )
        )

    # Sort by projected_points descending
    projections.sort(key=lambda x: x.projected_points or 0, reverse=True)

    # Return only the top `limit`
    return projections[:limit]


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
            try:
                stats_out = PlayerStatsOut.from_orm(stats_obj)
            except Exception as e:
                print("WARN: couldn't serialize stats for player", p.id, e)
                stats_out = None

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


@router.get("/roto_overview", response_model=List[PlayerRoto])
def get_roto_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return roto category averages for all players that have stats.
    This is roto-focused: it exposes all category averages instead of a single projected points value.
    """

    players = db.query(Player).all()
    result: List[PlayerRoto] = []

    for p in players:
        stats_obj: PlayerStats | None = p.stats
        if not stats_obj:
            # skip players with no stats imported
            continue

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

        result.append(
            PlayerRoto(
                id=p.id,
                name=p.name,
                categories=categories,
            )
        )

    # Optional: sort by points descending so strongest scorers appear first
    result.sort(key=lambda r: (r.categories.points or 0.0), reverse=True)

    return result


# ---------- Roto z-score models & endpoints ----------

class RotoZScoresOut(BaseModel):
    player_id: int
    player_name: str
    z_scores: Dict[str, float]
    total_score: float
    vor_score: float | None = None  # value over replacement


@router.get("/roto_test", response_model=List[RotoZScoresOut])
def get_roto_test(
    current_user: User = Depends(get_current_user),
):
    """
    Test endpoint to verify that the roto scoring engine works.
    Uses a few hard-coded players with fake averages.
    """

    # 🔹 Dummy player data (just to test the roto engine)
    players = [
        {
            "player_id": 1,
            "player_name": "Player A",
            "fg_pct": 0.50,
            "ft_pct": 0.80,
            "three_pm": 2.5,
            "points": 24.0,
            "rebounds": 8.0,
            "assists": 5.0,
            "steals": 1.2,
            "blocks": 0.7,
            "turnovers": 2.8,
        },
        {
            "player_id": 2,
            "player_name": "Player B",
            "fg_pct": 0.46,
            "ft_pct": 0.88,
            "three_pm": 3.2,
            "points": 21.0,
            "rebounds": 4.0,
            "assists": 7.0,
            "steals": 0.9,
            "blocks": 0.4,
            "turnovers": 3.5,
        },
        {
            "player_id": 3,
            "player_name": "Player C",
            "fg_pct": 0.52,
            "ft_pct": 0.75,
            "three_pm": 1.1,
            "points": 18.0,
            "rebounds": 10.0,
            "assists": 3.0,
            "steals": 0.8,
            "blocks": 1.1,
            "turnovers": 1.8,
        },
    ]

    categories = [
        "fg_pct",
        "ft_pct",
        "three_pm",
        "points",
        "rebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
    ]

    results = compute_roto_scores(
        players=players,
        categories=categories,
        inverted_categories=["turnovers"],
    )

    return [
        {
            "player_id": r.player_id,
            "player_name": r.player_name,
            "z_scores": r.z_scores,
            "total_score": r.total_score,
            "vor_score": None,  # not meaningful in test
        }
        for r in results
    ]


@router.get("/roto_rankings", response_model=List[RotoZScoresOut])
def get_roto_rankings(
    league_size: int | None = None,        # league size preset
    replacement_rank: int | None = None,   # optional manual override
    punt: str | None = None,               # comma-separated list of punted categories
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Standard 9-cat roto rankings based on actual PlayerStats from the database.

    - Each (non-punted) category is equally weighted in the total z-score.
    - Scarcity is handled naturally via z-scores.
    - Also computes a simple Value Over Replacement (vor_score).

    Replacement level is chosen as:
      1) If replacement_rank is provided -> use that directly.
      2) Else if league_size is provided -> league_size * 11 (approx roster slots).
      3) Else -> default to 130.

    You can punt categories using the 'punt' query parameter, e.g.:
      ?punt=ft_pct,turnovers
    """

    players = db.query(Player).all()

    player_dicts = []

    for p in players:
        stats: PlayerStats | None = p.stats
        if not stats:
            # Skip players with no stats imported
            continue

        player_dicts.append(
            {
                "player_id": p.id,
                "player_name": p.name,
                "fg_pct": stats.fg_pct,
                "ft_pct": stats.ft_pct,
                "three_pm": stats.three_pm,
                "points": stats.points,
                "rebounds": stats.rebounds,
                "assists": stats.assists,
                "steals": stats.steals,
                "blocks": stats.blocks,
                "turnovers": stats.turnovers,
            }
        )

    if not player_dicts:
        return []

    # All possible roto categories
    all_categories = [
        "fg_pct",
        "ft_pct",
        "three_pm",
        "points",
        "rebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
    ]

    # Parse punt list (categories to ignore in scoring)
    punted: list[str] = []
    if punt:
        punted = [c.strip() for c in punt.split(",") if c.strip()]

    # Categories that will actually be used in scoring
    categories = [c for c in all_categories if c not in punted]

    if not categories:
        # Safety: can't compute scores if you punt everything
        raise HTTPException(status_code=400, detail="All categories are punted; nothing left to score.")

    # 1) Get normal roto z-scores and total_score *for the chosen categories*
    results = compute_roto_scores(
        players=player_dicts,
        categories=categories,
        inverted_categories=["turnovers"],  # turnovers hurt you (if not punted)
    )

    if len(results) == 0:
        return []

    # 2) Decide effective replacement_rank based on inputs
    if replacement_rank is not None and replacement_rank > 0:
        effective_replacement_rank = replacement_rank
    elif league_size is not None and league_size > 0:
        ROSTER_SLOTS_PER_TEAM = 11  # tweak this later if you want
        effective_replacement_rank = league_size * ROSTER_SLOTS_PER_TEAM
    else:
        effective_replacement_rank = 130  # default if nothing provided

    # Clamp to valid range
    replacement_index = max(0, min(effective_replacement_rank - 1, len(results) - 1))
    replacement_player = results[replacement_index]
    replacement_z = replacement_player.z_scores  # dict: category -> z-score (for used categories)

    # 3) Build response including VOR score per player
    response: List[Dict[str, float]] = []

    for r in results:
        vor_total = 0.0

        # Only non-punted categories contribute to vor_score
        for cat in categories:
            player_z = r.z_scores.get(cat, 0.0)
            repl_z = replacement_z.get(cat, 0.0)
            vor_total += (player_z - repl_z)

        response.append(
            {
                "player_id": r.player_id,
                "player_name": r.player_name,
                "z_scores": r.z_scores,        # only used categories
                "total_score": r.total_score,   # sum over non-punted cats
                "vor_score": vor_total,
            }
        )

    return response


# ---------- Roto summary (league means/stds) ----------

class RotoSummaryCategory(BaseModel):
    mean: float
    std: float
    count: int


class RotoSummaryOut(BaseModel):
    categories: Dict[str, RotoSummaryCategory]


@router.get("/roto_summary", response_model=RotoSummaryOut)
def get_roto_summary(
    punt: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return league-wide mean, standard deviation, and sample size for each roto category.
    Respects 'punt' so you can match this to your punted build.
    """

    players = db.query(Player).all()

    if not players:
        return RotoSummaryOut(categories={})

    # All possible roto categories
    all_categories = [
        "fg_pct",
        "ft_pct",
        "three_pm",
        "points",
        "rebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
    ]

    # Parse punt list
    punted: list[str] = []
    if punt:
        punted = [c.strip() for c in punt.split(",") if c.strip()]

    categories = [c for c in all_categories if c not in punted]

    if not categories:
        raise HTTPException(status_code=400, detail="All categories are punted; nothing left to summarize.")

    # Collect values per category
    values_by_cat: Dict[str, List[float]] = {c: [] for c in categories}

    for p in players:
        stats: PlayerStats | None = p.stats
        if not stats:
            continue

        for cat in categories:
            v = getattr(stats, cat, None)
            if v is not None:
                values_by_cat[cat].append(float(v))

    summary: Dict[str, RotoSummaryCategory] = {}

    for cat in categories:
        values = values_by_cat[cat]
        n = len(values)
        if n == 0:
            mean = 0.0
            std = 0.0
        else:
            mean = sum(values) / n
            # population std-dev
            variance = sum((v - mean) ** 2 for v in values) / n
            std = sqrt(variance)

        summary[cat] = RotoSummaryCategory(
            mean=mean,
            std=std,
            count=n,
        )

    return RotoSummaryOut(categories=summary)

@router.get("/debug_players", response_model=List[PlayerWithStats])
def debug_players(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Debug helper: return players (optionally filtered by name) with their stats.
    If q is given, we filter in Python to avoid any SQL ilike weirdness.
    """

    # Get ALL players the API can see
    players = db.query(Player).all()
    print(f"[DEBUG] debug_players: total players in DB = {len(players)}")

    result: List[PlayerWithStats] = []

    for p in players:
        # Optional substring filter in Python (case-insensitive)
        if q:
            if q.lower() not in (p.name or "").lower():
                continue

        stats_obj: PlayerStats | None = p.stats

        stats_out = None
        if stats_obj is not None:
            try:
                stats_out = PlayerStatsOut.from_orm(stats_obj)
            except Exception as e:
                print("WARN: couldn't serialize stats for player", p.id, e)
                stats_out = None

        result.append(
            PlayerWithStats(
                id=p.id,
                name=p.name,
                position=p.position,
                team_full_name=getattr(p, "team", None),  # use 'team' from your model
                stats=stats_out,
            )
        )

    print(f"[DEBUG] debug_players: returning {len(result)} players (after filter q={q!r})")
    return result
