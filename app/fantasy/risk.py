# app/fantasy/risk.py

from typing import Iterable

SEASON_POSSIBLE_GAMES = {
    "2020-21": 72,   # shortened season
    "2021-22": 82,
    "2022-23": 82,
    "2023-24": 82,
    "2024-25": 82,
}

LAST_5 = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"]


def risk_raw_from_rows(season_rows: Iterable, seasons: list[str] = LAST_5) -> float:
    """
    Returns durability percentage (0.0 -> 1.0).
    Missing season rows are treated as GP = 0 (e.g., missed entire season).
    """
    by_season = {r.season: r for r in season_rows}

    gp_sum = 0
    possible_sum = 0

    for s in seasons:
        possible_sum += SEASON_POSSIBLE_GAMES.get(s, 82)
        row = by_season.get(s)
        if row is None:
            gp = 0
        else:
            gp = int(row.gp or 0)
        gp_sum += gp


    raw = gp_sum / possible_sum if possible_sum > 0 else 0.0
    return max(0.0, min(1.0, raw))

