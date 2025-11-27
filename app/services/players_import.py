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
    Fetch ALL players from Balldontlie (handles pagination) and save them in DB,
    including the real balldontlie player ID (external_id).

    - If a player with the same external_id already exists, we skip creating a duplicate.
      (You could update team/position here if you want.)
    """
    if not API_KEY:
        raise RuntimeError("BALLDONTLIE_API_KEY is missing")

    headers = {"Authorization": API_KEY}

    page = 1
    created = 0

    while True:
        params = {"per_page": per_page, "page": page}
        print(f"[INFO] Fetching players page {page} ...")

        response = requests.get(BASE_URL, params=params, headers=headers, timeout=10)
        response.raise_for_status()

        payload = response.json()
        data = payload.get("data", [])
        meta = payload.get("meta", {}) or {}

        if not data:
            # No more players returned, stop.
            print("[INFO] No more players returned from API.")
            break

        for p in data:
            external_id = p["id"]
            name = f"{p['first_name']} {p['last_name']}"
            team_name = p["team"]["full_name"] if p.get("team") else None
            position = p.get("position") or None

            # Avoid duplicates based on external_id
            existing = (
                db.query(Player)
                .filter(Player.external_id == external_id)
                .first()
            )
            if existing:
                # Optional: you could update existing.name / team / position here.
                continue

            player = Player(
                external_id=external_id,     # Balldontlie player id
                name=name,
                team=team_name,
                position=position,
                projected_points=None,
            )

            db.add(player)
            created += 1

        db.commit()
        print(f"[INFO] Imported {created} players so far...")

        # Pagination: stop when we've hit the last page
        total_pages = meta.get("total_pages")
        if total_pages is not None:
            if page >= total_pages:
                print(f"[INFO] Reached last page ({total_pages}). Done.")
                break
        else:
            # If the API didn't give meta/total_pages, stop when data is shorter than per_page
            if len(data) < per_page:
                print("[INFO] Last page detected by short page size. Done.")
                break

        page += 1

    print(f"[INFO] Finished importing players. Total newly created: {created}")
    return created
