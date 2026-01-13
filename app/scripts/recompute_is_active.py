from sqlalchemy.orm import Session
from nba_api.stats.endpoints import commonallplayers
import app.db.base  # noqa: F401  (ensures all models are registered)
from app.db.session import SessionLocal
from app.models.player import Player




def get_active_nba_player_ids() -> set[int]:
    """
    Returns PERSON_IDs for active NBA players.
    """
    df = commonallplayers.CommonAllPlayers(
        is_only_current_season=1
    ).get_data_frames()[0]

    # PERSON_ID column contains the NBA player id
    ids = set(df["PERSON_ID"].astype(int).tolist())
    return ids


def run():
    db: Session = SessionLocal()

    try:
        active_ids = get_active_nba_player_ids()
        print(f"NBA API active player ids: {len(active_ids)}")

        # 1) set everyone inactive first
        db.query(Player).update({Player.is_active: False})
        db.commit()
        print("Set ALL players to is_active = False")

        # 2) set active = True for players whose external_id is active
        updated = (
            db.query(Player)
            .filter(Player.external_id.in_(active_ids))
            .update({Player.is_active: True}, synchronize_session=False)
        )
        db.commit()
        print(f"Set is_active = True for {updated} players")

    finally:
        db.close()


if __name__ == "__main__":
    run()
