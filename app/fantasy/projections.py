# app/fantasy/projections.py

from typing import Optional


def project_player(player) -> float:
    """
    Very simple, fake projection model.

    For now:
    - Use the player's position to choose a base score
    - Add some "variance" based on the player id
    - Return a fantasy points number (float)
    """

    # 1) Work out a simple base score by position
    base_by_pos = {
        "G": 30.0,  # Guards
        "F": 28.0,  # Forwards
        "C": 32.0,  # Centers
    }

    # player.position from balldontlie can be like "G", "F", "C", "G-F", "F-C", or ""
    raw_pos: Optional[str] = getattr(player, "position", None)
    pos_key = (raw_pos or "G")[0]  # take first letter, default to "G" if None/empty

    base = base_by_pos.get(pos_key, 25.0)  # fallback base if weird position

    # 2) Add some simple, deterministic variation using the player's id
    variation = (player.id % 10) * 0.8  # each step adds 0.8 points

    projected_points = base + variation

    # 3) Round to 1 decimal place to look nicer
    return round(projected_points, 1)
