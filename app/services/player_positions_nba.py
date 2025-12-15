# app/services/player_positions_nba.py

from typing import Optional
from time import sleep

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import commonplayerinfo

from app.models.player import Player


def fetch_player_position(person_id: int) -> Optional[str]:
    """
    Fetch a single player's position from NBA API using their PERSON_ID.
    Returns something like 'G', 'F', 'C', 'G-F', etc., or None if not found.
    """
    try:
        info = commonplayerinfo.CommonPlayerInfo(player_id=person_id)
        df = info.get_data_frames()[0]

        # Different nba_api versions sometimes use different columns
        if "POSITION" in df.columns:
            pos = df["POSITION"].iloc[0]
        elif "PLAYER_POSITION" in df.columns:
            pos = df["PLAYER_POSITION"].iloc[0]
        else:
            pos = None

        if isinstance(pos, str) and pos.strip():
            return pos.strip()

    except Exception as e:
        print(f"[WARN] Failed to fetch position for PERSON_ID={person_id}: {e}")

    return None


def import_nba_positions(db: Session, delay_seconds: float = 0.6) -> int:
    """
    Fills Player.position using NBA API for players that:
      - have an external_id (NBA PERSON_ID)
      - currently have position = None

    Uses a small delay between API calls to avoid rate limiting.
    Returns the number of players whose position was updated.
    """

    players = (
        db.query(Player)
        .filter(Player.external_id.isnot(None))
        .filter((Player.position.is_(None)) | (Player.position == ""))  # only missing positions
        .all()
    )

    print(f"[INFO] Need to fetch positions for {len(players)} players")

    updated = 0

    for idx, p in enumerate(players, start=1):
        if p.external_id is None:
            continue

        print(f"[INFO] ({idx}/{len(players)}) Fetching position for {p.name} (PERSON_ID={p.external_id})")
        pos = fetch_player_position(p.external_id)
        if pos:
            print(f"[INFO] Setting position for {p.name} -> {pos}")
            p.position = pos
            updated += 1

        # Be nice to the API
        sleep(delay_seconds)

    db.commit()
    print(f"[INFO] Positions updated for {updated} players (out of {len(players)} missing)")
    return updated
