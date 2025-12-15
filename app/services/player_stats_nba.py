# app/services/player_stats_nba.py

from sqlalchemy.orm import Session
from nba_api.stats.endpoints import leaguedashplayerstats

from app.models.player import Player
from app.models.player_stats import PlayerStats


def fetch_all_player_stats(season: str = "2023-24"):
    """
    Fetch season stats for all players using nba_api.
    Returns a pandas DataFrame.
    """
    stats = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="Totals",  # or "PerGame" if you prefer
    )
    df = stats.get_data_frames()[0]

    # Optional: debug once
    # print("[DEBUG] leaguedashplayerstats columns:", df.columns.tolist())

    # Normalize name column
    df["PLAYER_NAME"] = df["PLAYER_NAME"].str.strip().str.lower()
    return df


def import_nba_stats(db: Session, season: str = "2023-24") -> int:
    """
    Imports NBA player stats from nba_api and stores them in the PlayerStats table.
    - Matches players by name.
    - Fills stats (PTS, REB, AST, etc.)
    - Also fills Player.position if available in the stats DF and not already set.
    """

    df = fetch_all_player_stats(season)
    imported_count = 0

    players = db.query(Player).all()

    for p in players:
        lookup_name = p.name.strip().lower()
        row = df[df["PLAYER_NAME"] == lookup_name]

        if row.empty:
            continue  # player name not found

        row = row.iloc[0]

        # ---- Fill stats ----
        stats = db.query(PlayerStats).filter(PlayerStats.player_id == p.id).first()
        if stats is None:
            stats = PlayerStats(player_id=p.id)
            db.add(stats)

        stats.points = float(row["PTS"])
        stats.rebounds = float(row["REB"])
        stats.assists = float(row["AST"])
        stats.steals = float(row["STL"])
        stats.blocks = float(row["BLK"])
        stats.turnovers = float(row["TOV"])

        stats.fg_pct = float(row["FG_PCT"]) if row["FG_PCT"] is not None else None
        stats.ft_pct = float(row["FT_PCT"]) if row["FT_PCT"] is not None else None
        stats.three_pm = float(row["FG3M"]) if row["FG3M"] is not None else None

        stats.fga = float(row["FGA"]) if row["FGA"] is not None else None
        stats.fgm = float(row["FGM"]) if row["FGM"] is not None else None
        stats.fta = float(row["FTA"]) if row["FTA"] is not None else None
        stats.ftm = float(row["FTM"]) if row["FTM"] is not None else None

        # ---- Fill Player.position (once) ----
        if not p.position:
            pos = None
            # Different nba_api versions may use different column names;
            # we check both defensively.
            if "PLAYER_POSITION" in row.index and row["PLAYER_POSITION"]:
                pos = str(row["PLAYER_POSITION"]).strip()
            elif "POSITION" in row.index and row["POSITION"]:
                pos = str(row["POSITION"]).strip()

            if pos:
                print(f"[INFO] Setting position for {p.name} -> {pos}")
                p.position = pos

        imported_count += 1

    db.commit()
    print(f"[INFO] Stats import complete, players updated: {imported_count}")
    return imported_count
