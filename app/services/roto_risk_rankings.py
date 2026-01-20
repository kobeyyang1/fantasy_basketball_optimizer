# app/services/roto_risk_rankings.py

from typing import Dict, List
from math import sqrt

from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats


CATEGORIES = [
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


def _mean_std(values: List[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 1.0
    mean = sum(values) / len(values)
    var = sum((x - mean) ** 2 for x in values) / len(values)
    std = sqrt(var) if var > 0 else 1.0
    return mean, std


def get_roto_risk_rankings_for_season(
    db: Session,
    season: str,
    risk_weight: float = 0.25,
) -> List[Dict]:
    """
    Build roto z-score rankings from PlayerSeasonStats for ONE season.

    - Only includes players who have a season row for that season.
    - Uses per-game counting stats (totals / gp) so comparisons match NBA.com style.
    - FG% and FT% are taken as-is (already rates).
    - Turnovers are inverted (lower is better).
    - Combined score = (1-risk_weight)*roto + risk_weight*risk_raw
      (risk_raw should already be 0..1)
    """

    # Join Player + PlayerSeasonStats for this season
    rows = (
        db.query(Player, PlayerSeasonStats)
        .join(PlayerSeasonStats, PlayerSeasonStats.player_id == Player.id)
        .filter(PlayerSeasonStats.season == season)
        .filter(Player.is_active == True)  # keep your active filter
        .all()
    )

    # Only players with GP > 0 (no season played -> don't rank)
    rows = [(p, s) for (p, s) in rows if int(s.gp or 0) > 0]

    if not rows:
        return []

    # Build per-game stat lines for z-score distribution
    per_game: List[Dict] = []
    for p, s in rows:
        gp = float(s.gp or 0) or 1.0

        per_game.append(
            {
                "player_id": p.id,
                "player_name": p.name,
                "team": p.team,
                "position": p.position,
                "season": season,
                "gp": int(s.gp or 0),

                "fg_pct": float(s.fg_pct) if s.fg_pct is not None else None,
                "ft_pct": float(s.ft_pct) if s.ft_pct is not None else None,

                "three_pm": (float(s.three_pm) / gp) if s.three_pm is not None else None,
                "points": (float(s.points) / gp) if s.points is not None else None,
                "rebounds": (float(s.rebounds) / gp) if s.rebounds is not None else None,
                "assists": (float(s.assists) / gp) if s.assists is not None else None,
                "steals": (float(s.steals) / gp) if s.steals is not None else None,
                "blocks": (float(s.blocks) / gp) if s.blocks is not None else None,
                "turnovers": (float(s.turnovers) / gp) if s.turnovers is not None else None,

                # this is optional – if you have it on Player model
                # otherwise just leave None and frontend can ignore
                "risk_raw": float(getattr(p, "risk_raw", 0.0) or 0.0),
            }
        )

    # League mean/std per category
    means: Dict[str, float] = {}
    stds: Dict[str, float] = {}

    for cat in CATEGORIES:
        vals = [float(x[cat]) for x in per_game if x.get(cat) is not None]
        mean, std = _mean_std(vals)
        means[cat] = mean
        stds[cat] = std

    # Compute z-scores + totals
    results: List[Dict] = []
    for row in per_game:
        z_scores: Dict[str, float] = {}
        total = 0.0

        for cat in CATEGORIES:
            v = row.get(cat)
            if v is None:
                z = 0.0
            else:
                z = (float(v) - means[cat]) / (stds[cat] or 1.0)

            if cat == "turnovers":
                z = -z

            z_scores[cat] = float(z)
            total += float(z)

        risk_raw = float(row.get("risk_raw") or 0.0)
        combined = (1.0 - risk_weight) * float(total) + risk_weight * float(risk_raw)

        results.append(
            {
                "player_id": row["player_id"],
                "player_name": row["player_name"],
                "team": row["team"],
                "position": row["position"],
                "season": season,

                "z_scores": z_scores,
                "total_score": float(total),

                "risk_raw": risk_raw,
                "combined_score": float(combined),
            }
        )

    results.sort(key=lambda r: r["combined_score"], reverse=True)
    return results
