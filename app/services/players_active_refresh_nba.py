from sqlalchemy.orm import Session
from nba_api.stats.endpoints import commonallplayers

from app.models.player import Player
from app.services.nba_retry import run_with_nba_retries


def refresh_active_players(db: Session, season: str = "2025-26") -> dict:
    """
    Refresh Player.is_active from NBA API current-season roster status.
    """
    def _request():
        endpoint = commonallplayers.CommonAllPlayers(
            season=season,
            is_only_current_season=1,
            timeout=120,
        )
        return endpoint.get_data_frames()[0]

    df = run_with_nba_retries(
        _request,
        label=f"CommonAllPlayers (active refresh) season={season}",
    )

    active_ids = set(df["PERSON_ID"].astype(int).tolist())

    db.query(Player).update({Player.is_active: False})
    updated = (
        db.query(Player)
        .filter(Player.external_id.in_(active_ids))
        .update({Player.is_active: True}, synchronize_session=False)
    )
    db.commit()

    return {
        "season": season,
        "active_ids_from_api": len(active_ids),
        "players_marked_active": int(updated),
    }
