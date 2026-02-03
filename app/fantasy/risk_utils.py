# app/fantasy/risk_utils.py

import math
from typing import List, Dict


# Interview: Convert a list of numbers into z-scores (mean 0, std 1).
def z_score(values: List[float]) -> List[float]:
    if not values:
        return []

    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(variance)

    if std == 0:
        return [0.0 for _ in values]

    return [(v - mean) / std for v in values]


# Interview: Attach risk z-scores to each player dict in-place.
def attach_risk_z(players: List[Dict]) -> None:
    risk_vals = [p["risk_raw"] for p in players]
    z_vals = z_score(risk_vals)

    for p, z in zip(players, z_vals):
        p["risk_z"] = float(z)
