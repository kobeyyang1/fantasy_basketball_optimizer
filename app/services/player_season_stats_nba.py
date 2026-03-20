# app/services/player_season_stats_nba.py

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import leaguedashplayerstats

from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.services.nba_retry import run_with_nba_retries


def import_nba_season_stats(db: Session, season: str) -> dict:
    """
    Imports season totals for ALL players for a given season into player_season_stats.
    Returns counts: inserted, updated, skipped (no mapping).
    """

    # map external_id -> internal id
    players = db.query(Player).all()
    ext_to_internal = {int(p.external_id): p.id for p in players if p.external_id is not None}

    # 1 request per season
    def _request():
        endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            per_mode_detailed="Totals",
            timeout=120,
        )
        return endpoint.get_data_frames()[0]

    df = run_with_nba_retries(
        _request,
        label=f"LeagueDashPlayerStats (season totals) season={season}",
    )

    inserted = 0
    updated = 0
    skipped = 0

    for _, r in df.iterrows():
        ext_id = int(r["PLAYER_ID"])
        internal_id = ext_to_internal.get(ext_id)
        if internal_id is None:
            skipped += 1
            continue

        data = r.to_dict()

        row = (
            db.query(PlayerSeasonStats)
            .filter(PlayerSeasonStats.player_id == internal_id, PlayerSeasonStats.season == season)
            .first()
        )

        is_update = row is not None
        if row is None:
            row = PlayerSeasonStats(player_id=internal_id, season=season)
            db.add(row)

        # required for risk
        row.gp = int(data.get("GP", 0) or 0)

        # shooting totals + %s
        row.fga = float(data.get("FGA", 0) or 0)
        row.fgm = float(data.get("FGM", 0) or 0)
        row.fg_pct = float(data.get("FG_PCT", 0) or 0)
        row.fta = float(data.get("FTA", 0) or 0)
        row.ftm = float(data.get("FTM", 0) or 0)
        row.ft_pct = float(data.get("FT_PCT", 0) or 0)

        # 3PM
        row.three_pm = float(data.get("FG3M", 0) or 0)

        # counting stats
        row.points = float(data.get("PTS", 0) or 0)
        row.rebounds = float(data.get("REB", 0) or 0)
        row.assists = float(data.get("AST", 0) or 0)
        row.steals = float(data.get("STL", 0) or 0)
        row.blocks = float(data.get("BLK", 0) or 0)
        row.turnovers = float(data.get("TOV", 0) or 0)

        if is_update:
            updated += 1
        else:
            inserted += 1

    db.commit()
    return {"inserted": inserted, "updated": updated, "skipped": skipped, "rows_from_api": len(df)}
