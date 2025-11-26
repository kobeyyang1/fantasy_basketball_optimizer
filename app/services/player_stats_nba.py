# app/services/player_stats_nba.py

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import leaguedashplayerstats

from app.models.player import Player
from app.models.player_stats import PlayerStats


def fetch_all_player_stats(season: str = "2023-24"):
    """
    Fetch season averages for all players using nba_api.
    Returns a pandas DataFrame.
    """
    stats = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season"
    )
    return stats.get_data_frames()[0]


def import_nba_stats(db: Session, season: str = "2023-24") -> int:
    """
    Imports NBA player stats from nba_api and stores them in the PlayerStats table.
    Matches players by name.
    Returns the number of players successfully updated.
    """

    df = fetch_all_player_stats(season)

    imported_count = 0

    # Convert to easier lookup
    df["PLAYER_NAME"] = df["PLAYER_NAME"].str.strip().str.lower()

    players = db.query(Player).all()

    for p in players:
        # match by name
        lookup_name = p.name.strip().lower()
        row = df[df["PLAYER_NAME"] == lookup_name]

        if row.empty:
            continue  # player name not found

        row = row.iloc[0]

        stats = db.query(PlayerStats).filter(PlayerStats.player_id == p.id).first()
        if stats is None:
            stats = PlayerStats(player_id=p.id)
            db.add(stats)

        # Assign stats
        stats.points = float(row["PTS"])
        stats.rebounds = float(row["REB"])
        stats.assists = float(row["AST"])
        stats.steals = float(row["STL"])
        stats.blocks = float(row["BLK"])
        stats.turnovers = float(row["TOV"])

        stats.fg_pct = float(row["FG_PCT"]) if row["FG_PCT"] is not None else None
        stats.ft_pct = float(row["FT_PCT"]) if row["FT_PCT"] is not None else None
        stats.three_pm = float(row["FG3M"]) if row["FG3M"] is not None else None

        imported_count += 1

    db.commit()
    return imported_count
