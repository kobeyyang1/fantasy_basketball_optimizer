# app/services/roto_scoring.py

from typing import List, Dict, Any, Optional
from math import sqrt


class RotoCategoryResult:
    """
    Holds z-scores for one player in all categories, plus a total roto score.
    """
    def __init__(
        self,
        player_id: int,
        player_name: str,
        z_scores: Dict[str, float],
        total_score: float,
    ):
        self.player_id = player_id
        self.player_name = player_name
        self.z_scores = z_scores
        self.total_score = total_score

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to a plain dict (useful for JSON responses or Pydantic models).
        """
        return {
            "player_id": self.player_id,
            "player_name": self.player_name,
            "z_scores": self.z_scores,
            "total_score": self.total_score,
        }


def _compute_mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _compute_std(values: List[float], mean: float) -> float:
    """
    Population standard deviation.
    If all values are the same, std will be 0 – we handle that later by
    returning a z-score of 0 in that case.
    """
    if not values:
        return 0.0

    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return sqrt(variance)


def compute_roto_scores(
    players: List[Dict[str, Any]],
    categories: Optional[List[str]] = None,
    *,
    # Weight of each category in the final total.
    # If None, all categories are weight 1.0.
    category_weights: Optional[Dict[str, float]] = None,
    # Categories where *lower* is better (e.g. turnovers).
    # For those, we invert the z-score.
    inverted_categories: Optional[List[str]] = None,
) -> List[RotoCategoryResult]:
    """
    Compute roto z-scores and total roto value for a list of players.

    Parameters
    ----------
    players:
        List of dicts, each with keys like "player_id", "player_name",
        and stat fields (fg_pct, ft_pct, fg3m, pts, reb, ast, stl, blk, tov).
    categories:
        List of stat field names to use. If None, use the default 9-cat list.
    category_weights:
        Optional dict mapping category -> weight. Higher weight = more important.
        Any category not in this dict gets weight 1.0.
    inverted_categories:
        Categories where lower is better, e.g. ["tov"].

    Returns
    -------
    List[RotoCategoryResult], sorted by total_score descending.
    """
    if categories is None:
        categories = ["fg_pct", "ft_pct", "fg3m", "pts", "reb", "ast", "stl", "blk", "tov"]

    if category_weights is None:
        category_weights = {}

    if inverted_categories is None:
        inverted_categories = ["tov"]  # turnovers are bad by default

    # 1. Collect all values per category across all players
    values_by_category: Dict[str, List[float]] = {cat: [] for cat in categories}

    for player in players:
        for cat in categories:
            value = player.get(cat)
            # Ignore None / missing values
            if value is not None:
                values_by_category[cat].append(float(value))

    # 2. Compute mean and std dev per category
    means: Dict[str, float] = {}
    stds: Dict[str, float] = {}

    for cat in categories:
        cat_values = values_by_category[cat]
        mean = _compute_mean(cat_values)
        std = _compute_std(cat_values, mean)
        means[cat] = mean
        stds[cat] = std

    # 3. Compute z-scores and total roto value per player
    results: List[RotoCategoryResult] = []

    for player in players:
        player_id = int(player.get("player_id"))
        player_name = str(player.get("player_name", ""))

        player_z_scores: Dict[str, float] = {}
        total_score = 0.0

        for cat in categories:
            raw_value = player.get(cat)

            if raw_value is None:
                # Missing stat: treat z-score as 0 (neutral)
                z = 0.0
            else:
                mean = means[cat]
                std = stds[cat]
                if std == 0:
                    # Everyone has the same value -> no advantage/disadvantage
                    z = 0.0
                else:
                    z = (float(raw_value) - mean) / std

            # Invert categories where lower is better (e.g. turnovers)
            if cat in inverted_categories:
                z = -z

            player_z_scores[cat] = z

            weight = category_weights.get(cat, 1.0)
            total_score += z * weight

        results.append(RotoCategoryResult(
            player_id=player_id,
            player_name=player_name,
            z_scores=player_z_scores,
            total_score=total_score,
        ))

    # 4. Sort by total roto score (highest first)
    results.sort(key=lambda r: r.total_score, reverse=True)

    return results
