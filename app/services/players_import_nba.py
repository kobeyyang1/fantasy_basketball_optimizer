# app/services/players_import_nba.py

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import commonallplayers

from app.models.player import Player


def fetch_all_players(season: str = "2023-24"):
    endpoint = commonallplayers.CommonAllPlayers(
        season=season,
        is_only_current_season=0   # <-- include full player pool
    )
    df = endpoint.get_data_frames()[0]

    # Keep only players actually on an NBA roster
    df = df[df["ROSTERSTATUS"] == 1]

    return df


def import_players_from_nba_api(db: Session, season: str = "2023-24") -> int:
    df = fetch_all_players(season)

    print(f"[DEBUG] NBA API returned {len(df)} ACTIVE players for season {season}")
    print("[DEBUG] Sample rows:")
    print(df[["PERSON_ID", "DISPLAY_FIRST_LAST", "TEAM_NAME"]].head())

    created_count = 0

    for _, row in df.iterrows():
        name = str(row["DISPLAY_FIRST_LAST"]).strip()
        external_id = int(row["PERSON_ID"])
        team_name = row["TEAM_NAME"] if row["TEAM_NAME"] else None

        existing = (
            db.query(Player)
            .filter(Player.name.ilike(name))
            .first()
        )

        if existing:
            existing.external_id = external_id
            existing.team = team_name
            continue

        db.add(Player(
            name=name,
            external_id=external_id,
            team=team_name,
            position=None,
            projected_points=None,
        ))
        created_count += 1

    db.commit()
    print(f"[INFO] Player import complete: {created_count} new players")
    print("[DEBUG] Total players in DB:", db.query(Player).count())

    return created_count
