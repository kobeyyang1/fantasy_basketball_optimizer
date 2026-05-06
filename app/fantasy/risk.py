# app/fantasy/risk.py

from typing import Iterable

SEASON_POSSIBLE_GAMES = {
    "2020-21": 72,   # shortened season
    "2021-22": 82,
    "2022-23": 82,
    "2023-24": 82,
    "2024-25": 82,
    "2025-26": 82,
}

LAST_5 = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


# Interview: Compute availability % across the last 5 seasons (missing seasons don't hurt rookies).
def risk_raw_from_rows(season_rows: Iterable, seasons: list[str] = LAST_5) -> float:
    """
    Returns availability percentage (0.0 -> 1.0).

    IMPORTANT:
    - Only seasons where the player actually has a row are counted
    - Missing seasons are ignored (rookies are NOT penalized)
    """
    # keep only rows in the last-5 window
    rows = [r for r in season_rows if r.season in seasons] # this keeps only rows where the season is inside the chosen seasons list

    if not rows:
        return 0.0 # handle no data

    gp_sum = 0 # set up totals
    possible_sum = 0

    for r in rows: # adds games played and possible games
        gp_sum += int(r.gp or 0)
        possible_sum += SEASON_POSSIBLE_GAMES.get(r.season, 82)

    if possible_sum <= 0: # avoid invalid division if for some reason total possible games is 0 or -
        return 0.0

    raw = gp_sum / possible_sum # calculates raw availability percentage
    return max(0.0, min(1.0, raw)) # ensure it's between 0 and 1, just in case of bad data
