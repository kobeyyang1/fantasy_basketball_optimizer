# app/api/routes_fantasy.py

from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from math import sqrt

from app.core.deps import get_db, get_current_user_dev as get_current_user
from app.core.deps import get_db, get_current_user_dev
from app.fantasy.projections import project_player

from app.models.user import User
from app.models.player import Player
from app.models.player_stats import PlayerStats
from app.services.roto_scoring import compute_roto_scores
from app.ml.ml_predictions import predict_roto_scores_with_rf, explain_player_with_shap



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
    current_user: User = Depends(get_current_user_dev),
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
    current_user: User = Depends(get_current_user_dev),
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
    current_user: User = Depends(get_current_user_dev),
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
    current_user: User = Depends(get_current_user_dev),
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
    current_user: User = Depends(get_current_user_dev),
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

class PlayerMLRanking(BaseModel):
    player_id: int
    name: str
    team: str | None = None
    ml_score: float

class ShapFeatureImpact(BaseModel):
    feature: str
    value: float
    shap_value: float
    abs_shap_value: float


class PlayerMLExplainOut(BaseModel):
    player_id: int
    name: str
    team: str | None = None
    ml_score: float
    base_value: float
    impacts: List[ShapFeatureImpact]

class TeamTotalsOut(BaseModel):
    fg_pct: float | None = None
    ft_pct: float | None = None
    three_pm: float = 0.0
    points: float = 0.0
    rebounds: float = 0.0
    assists: float = 0.0
    steals: float = 0.0
    blocks: float = 0.0
    turnovers: float = 0.0


class TeamPlayerOut(BaseModel):
    player_id: int
    name: str
    team: str | None = None
    position: str | None = None


class TeamRotoOut(BaseModel):
    players: List[TeamPlayerOut]
    totals: TeamTotalsOut

class TeamRotoScoresOut(BaseModel):
    used_categories: List[str]
    punted_categories: List[str]
    per_player: Dict[str, float]
    z_scores: Dict[str, float]
    total_score: float


class TeamRotoScoredOut(BaseModel):
    players: List[TeamPlayerOut]
    totals: TeamTotalsOut
    roto: TeamRotoScoresOut

@router.get("/team_roto", response_model=TeamRotoOut)
def get_team_roto(
    player_ids: str,              # comma-separated list like "1,2,3"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),  # or get_current_user
):
    """
    Compute a team's combined 9-cat totals from a list of player IDs.

    FG% and FT% are computed as weighted percentages:
      team_fg_pct = sum(FGM) / sum(FGA)
      team_ft_pct = sum(FTM) / sum(FTA)
    """

    # Parse ids
    ids = [int(x.strip()) for x in player_ids.split(",") if x.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="player_ids is empty")

    players = db.query(Player).filter(Player.id.in_(ids)).all()
    if not players:
        raise HTTPException(status_code=404, detail="No matching players found")

    chosen: List[TeamPlayerOut] = []

    # Totals
    sum_fgm = 0.0
    sum_fga = 0.0
    sum_ftm = 0.0
    sum_fta = 0.0

    totals = {
        "three_pm": 0.0,
        "points": 0.0,
        "rebounds": 0.0,
        "assists": 0.0,
        "steals": 0.0,
        "blocks": 0.0,
        "turnovers": 0.0,
    }

    for p in players:
        chosen.append(
            TeamPlayerOut(
                player_id=p.id,
                name=p.name,
                team=p.team,
                position=p.position,
            )
        )

        stats: PlayerStats | None = p.stats
        if not stats:
            continue

        # Weighted percentage pieces
        if stats.fgm is not None:
            sum_fgm += float(stats.fgm)
        if stats.fga is not None:
            sum_fga += float(stats.fga)

        if stats.ftm is not None:
            sum_ftm += float(stats.ftm)
        if stats.fta is not None:
            sum_fta += float(stats.fta)

        # Counting stats
        for k in totals.keys():
            v = getattr(stats, k, None)
            if v is not None:
                totals[k] += float(v)

    team_fg_pct = (sum_fgm / sum_fga) if sum_fga > 0 else None
    team_ft_pct = (sum_ftm / sum_fta) if sum_fta > 0 else None

    return TeamRotoOut(
        players=chosen,
        totals=TeamTotalsOut(
            fg_pct=team_fg_pct,
            ft_pct=team_ft_pct,
            three_pm=totals["three_pm"],
            points=totals["points"],
            rebounds=totals["rebounds"],
            assists=totals["assists"],
            steals=totals["steals"],
            blocks=totals["blocks"],
            turnovers=totals["turnovers"],
        ),
    )

@router.get("/team_roto_scored", response_model=TeamRotoScoredOut)
def get_team_roto_scored(
    player_ids: str,
    punt: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),  # or get_current_user
):
    """
    Returns:
      - team totals (sum of counting stats + weighted FG/FT)
      - per-player averages (team totals / N players)
      - z-scores vs league player distribution
      - total roto score (sum of z-scores; turnovers inverted if not punted)

    Punt example:
      ?punt=ft_pct,turnovers
    """

    # --- Parse IDs ---
    ids = [int(x.strip()) for x in player_ids.split(",") if x.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="player_ids is empty")

    players = db.query(Player).filter(Player.id.in_(ids)).all()
    if not players:
        raise HTTPException(status_code=404, detail="No matching players found")

    chosen: List[TeamPlayerOut] = []

    # --- Team totals ---
    sum_fgm = 0.0
    sum_fga = 0.0
    sum_ftm = 0.0
    sum_fta = 0.0

    totals_counting = {
        "three_pm": 0.0,
        "points": 0.0,
        "rebounds": 0.0,
        "assists": 0.0,
        "steals": 0.0,
        "blocks": 0.0,
        "turnovers": 0.0,
    }

    players_with_stats = 0

    for p in players:
        chosen.append(
            TeamPlayerOut(
                player_id=p.id,
                name=p.name,
                team=p.team,
                position=p.position,
            )
        )

        stats: PlayerStats | None = p.stats
        if not stats:
            continue

        players_with_stats += 1

        # Weighted % pieces
        if stats.fgm is not None:
            sum_fgm += float(stats.fgm)
        if stats.fga is not None:
            sum_fga += float(stats.fga)
        if stats.ftm is not None:
            sum_ftm += float(stats.ftm)
        if stats.fta is not None:
            sum_fta += float(stats.fta)

        # Counting stats
        for k in totals_counting.keys():
            v = getattr(stats, k, None)
            if v is not None:
                totals_counting[k] += float(v)

    team_fg_pct = (sum_fgm / sum_fga) if sum_fga > 0 else None
    team_ft_pct = (sum_ftm / sum_fta) if sum_fta > 0 else None

    totals_out = TeamTotalsOut(
        fg_pct=team_fg_pct,
        ft_pct=team_ft_pct,
        three_pm=totals_counting["three_pm"],
        points=totals_counting["points"],
        rebounds=totals_counting["rebounds"],
        assists=totals_counting["assists"],
        steals=totals_counting["steals"],
        blocks=totals_counting["blocks"],
        turnovers=totals_counting["turnovers"],
    )

    if players_with_stats == 0:
        raise HTTPException(status_code=400, detail="None of the selected players have stats.")

    # --- Punt parsing ---
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

    punted: list[str] = []
    if punt:
        punted = [c.strip() for c in punt.split(",") if c.strip()]

    used_categories = [c for c in all_categories if c not in punted]
    if not used_categories:
        raise HTTPException(status_code=400, detail="All categories are punted; nothing left to score.")

    # --- Compute team per-player averages for z-score comparison ---
    per_player: Dict[str, float] = {}

    # percentages are already "per-shot" rates, keep as-is
    if team_fg_pct is not None:
        per_player["fg_pct"] = float(team_fg_pct)
    if team_ft_pct is not None:
        per_player["ft_pct"] = float(team_ft_pct)

    # counting stats -> per-player averages for fair comparison to player distribution
    per_player["three_pm"] = totals_counting["three_pm"] / players_with_stats
    per_player["points"] = totals_counting["points"] / players_with_stats
    per_player["rebounds"] = totals_counting["rebounds"] / players_with_stats
    per_player["assists"] = totals_counting["assists"] / players_with_stats
    per_player["steals"] = totals_counting["steals"] / players_with_stats
    per_player["blocks"] = totals_counting["blocks"] / players_with_stats
    per_player["turnovers"] = totals_counting["turnovers"] / players_with_stats

    # --- League mean/std from players (same idea as roto_summary) ---
    values_by_cat: Dict[str, List[float]] = {c: [] for c in used_categories}

    all_players = db.query(Player).all()
    for p in all_players:
        s: PlayerStats | None = p.stats
        if not s:
            continue

        for cat in used_categories:
            if cat in ("fg_pct", "ft_pct"):
                v = getattr(s, cat, None)
            else:
                v = getattr(s, cat, None)

            if v is not None:
                values_by_cat[cat].append(float(v))

    # mean/std
    means: Dict[str, float] = {}
    stds: Dict[str, float] = {}
    for cat in used_categories:
        vals = values_by_cat[cat]
        if not vals:
            means[cat] = 0.0
            stds[cat] = 0.0
            continue
        mean = sum(vals) / len(vals)
        variance = sum((x - mean) ** 2 for x in vals) / len(vals)
        std = sqrt(variance)
        means[cat] = mean
        stds[cat] = std

    # --- Team z-scores ---
    z_scores: Dict[str, float] = {}
    for cat in used_categories:
        team_val = per_player.get(cat, None)
        if team_val is None:
            z_scores[cat] = 0.0
            continue

        std = stds.get(cat, 0.0)
        if std == 0.0:
            z = 0.0
        else:
            z = (team_val - means[cat]) / std

        # turnovers are "bad" unless punted
        if cat == "turnovers":
            z = -z

        z_scores[cat] = float(z)

    total_score = float(sum(z_scores.values()))

    return TeamRotoScoredOut(
        players=chosen,
        totals=totals_out,
        roto=TeamRotoScoresOut(
            used_categories=used_categories,
            punted_categories=punted,
            per_player=per_player,
            z_scores=z_scores,
            total_score=total_score,
        ),
    )

@router.get("/roto_rankings", response_model=List[RotoZScoresOut])
def get_roto_rankings(
    league_size: int | None = None,        # league size preset
    replacement_rank: int | None = None,   # optional manual override
    punt: str | None = None,               # comma-separated list of punted categories
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
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
    current_user: User = Depends(get_current_user_dev),
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

class PlayerProfileOut(BaseModel):
    id: int
    name: str
    team: str | None = None
    position: str | None = None
    stats: PlayerStatsOut | None = None

class TeamSuggestionOut(BaseModel):
    player_id: int
    name: str
    team: str | None = None
    position: str | None = None
    added_roto_score: float
    delta: float


class TeamSuggestionsResponse(BaseModel):
    base_team_score: float
    suggestions: List[TeamSuggestionOut]


@router.get("/player_profile/{player_id}", response_model=PlayerProfileOut)
def get_player_profile(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
):
    """
    Return a detailed profile for a single player:
    - basic info (name, team, position)
    - full season stats (if available)
    """

    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    stats_obj: PlayerStats | None = player.stats

    stats_out = None
    if stats_obj is not None:
        try:
            stats_out = PlayerStatsOut.from_orm(stats_obj)
        except Exception as e:
            print("WARN: couldn't serialize stats for player", player.id, e)
            stats_out = None

    return PlayerProfileOut(
        id=player.id,
        name=player.name,
        team=player.team,
        position=player.position,
        stats=stats_out,
    )

@router.get("/debug_players", response_model=List[PlayerWithStats])
def debug_players(
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
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

@router.get("/ml_rankings", response_model=List[PlayerMLRanking])
def get_ml_rankings(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),  # or get_current_user if you swapped back
):
    """
    ML-based roto rankings using the trained RandomForest model.

    - Uses the same 9-cat stats as features.
    - Model was trained to predict the roto total_score.
    - Returns players sorted by predicted ML score descending.
    """

    results = predict_roto_scores_with_rf(db)

    # Apply simple limit
    return results[:limit]

@router.get("/ml_explain/{player_id}", response_model=PlayerMLExplainOut)
def get_ml_explain(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),  # or get_current_user_dev if you're using the dev shortcut
):
    """
    Return a SHAP explanation for the ML (RandomForest) roto score
    for a single player.

    - ml_score: the RF-predicted roto score
    - base_value: the model's expected prediction (average player)
    - impacts: per-stat SHAP values showing how each feature moved
               this player above/below the base_value.
    """
    try:
        data = explain_player_with_shap(db, player_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Player not found in ML feature set (no stats or missing data).",
        )

    return data

def compute_team_score_for_ids(
    db: Session,
    player_ids: list[int],
    punted: list[str],
) -> float:
    """
    Lightweight version of team_roto_scored that
    returns ONLY the total roto score.
    """

    # --- reuse logic ---
    from math import sqrt

    all_categories = [
        "fg_pct", "ft_pct", "three_pm", "points",
        "rebounds", "assists", "steals", "blocks", "turnovers"
    ]

    used_categories = [c for c in all_categories if c not in punted]

    players = db.query(Player).filter(Player.id.in_(player_ids)).all()

    sum_fgm = sum_fga = sum_ftm = sum_fta = 0.0
    totals = {c: 0.0 for c in all_categories if c not in ("fg_pct", "ft_pct")}

    count = 0

    for p in players:
        s: PlayerStats | None = p.stats
        if not s:
            continue

        count += 1

        sum_fgm += s.fgm or 0
        sum_fga += s.fga or 0
        sum_ftm += s.ftm or 0
        sum_fta += s.fta or 0

        for c in totals:
            v = getattr(s, c, None)
            if v is not None:
                totals[c] += float(v)

    if count == 0:
        return 0.0

    per_player = {
        "fg_pct": (sum_fgm / sum_fga) if sum_fga > 0 else None,
        "ft_pct": (sum_ftm / sum_fta) if sum_fta > 0 else None,
    }

    for c in totals:
        per_player[c] = totals[c] / count

    # league stats
    values_by_cat = {c: [] for c in used_categories}
    for p in db.query(Player).all():
        s = p.stats
        if not s:
            continue
        for c in used_categories:
            v = getattr(s, c, None)
            if v is not None:
                values_by_cat[c].append(float(v))

    total_score = 0.0
    for c in used_categories:
        vals = values_by_cat[c]
        if not vals or per_player.get(c) is None:
            continue

        mean = sum(vals) / len(vals)
        std = sqrt(sum((x - mean) ** 2 for x in vals) / len(vals))
        if std == 0:
            continue

        z = (per_player[c] - mean) / std
        if c == "turnovers":
            z = -z

        total_score += z

    return float(total_score)

@router.get("/team_suggestions", response_model=TeamSuggestionsResponse)
def get_team_suggestions(
    player_ids: str,
    punt: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dev),
):
    """
    Suggest players to add that improve your team's roto score the most.
    """

    base_ids = [int(x.strip()) for x in player_ids.split(",") if x.strip()]
    if not base_ids:
        raise HTTPException(status_code=400, detail="player_ids is empty")

    punted = [c.strip() for c in punt.split(",")] if punt else []

    base_score = compute_team_score_for_ids(db, base_ids, punted)

    suggestions: List[TeamSuggestionOut] = []

    # candidates = players not already on team
    candidates = (
        db.query(Player)
        .filter(~Player.id.in_(base_ids))
        .all()
    )

    for p in candidates:
        if not p.stats:
            continue

        new_ids = base_ids + [p.id]
        new_score = compute_team_score_for_ids(db, new_ids, punted)
        delta = new_score - base_score

        if delta <= 0:
            continue

        suggestions.append(
            TeamSuggestionOut(
                player_id=p.id,
                name=p.name,
                team=p.team,
                position=p.position,
                added_roto_score=new_score,
                delta=delta,
            )
        )

    suggestions.sort(key=lambda s: s.delta, reverse=True)

    return TeamSuggestionsResponse(
        base_team_score=base_score,
        suggestions=suggestions[:limit],
    )

