# app/services/players_import.py

import os
import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.models.player import Player

load_dotenv()

API_KEY = os.getenv("BALLDONTLIE_API_KEY")
BASE_URL = "https://api.balldontlie.io/v1/players"


def import_players_from_api(db: Session, per_page: int = 100) -> int:
    """
    Fetch players from Balldontlie and save them in DB,
    including the *real balldontlie player ID* (external_id)
    """
    if not API_KEY:
        raise RuntimeError("BALLDONTLIE_API_KEY is missing")

    params = {"per_page": per_page, "page": 1}
    headers = {"Authorization": API_KEY}

    response = requests.get(BASE_URL, params=params, headers=headers)
    response.raise_for_status()

    data = response.json().get("data", [])

    created = 0

    for p in data:
        external_id = p["id"]
        name = f"{p['first_name']} {p['last_name']}"
        team_name = p["team"]["full_name"] if p.get("team") else None
        position = p.get("position") or None

        # avoid duplicates
        existing = (
            db.query(Player)
            .filter(Player.external_id == external_id)
            .first()
        )
        if existing:
            continue

        player = Player(
            external_id=external_id,     # <---- IMPORTANT!!!
            name=name,
            team=team_name,
            position=position,
            projected_points=None,
        )

        db.add(player)
        created += 1

    db.commit()
    return created
