# app/services/teams_refresh_nba.py

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import leaguedashplayerstats

from app.models.player import Player


def refresh_teams_from_season_stats(db: Session, season: str, timeout: int = 120) -> dict:
    """
    Fast team refresh using ONE nba_api call:
    LeagueDashPlayerStats (Totals) for a season includes TEAM_ABBREVIATION.

    This sets Player.team based on that season's team.
    """

    endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        per_mode_detailed="Totals",
        timeout=timeout,
    )
    df = endpoint.get_data_frames()[0]

    # Map external_id -> team_abbrev (or team name if you want)
    # df has PLAYER_ID and TEAM_ABBREVIATION
    ext_to_team = {}
    for _, r in df.iterrows():
        pid = int(r["PLAYER_ID"])
        team = r.get("TEAM_ABBREVIATION")
        ext_to_team[pid] = str(team).strip() if team else None

    players = db.query(Player).all()

    updated = 0
    skipped = 0

    for p in players:
        if p.external_id is None:
            skipped += 1
            continue

        team = ext_to_team.get(int(p.external_id))
        if team:
            p.team = team
            updated += 1
        else:
            # player not in that season stats (didn't play) -> leave as-is
            skipped += 1

    db.commit()
    return {"season": season, "updated": updated, "skipped": skipped, "rows_from_api": len(df)}
