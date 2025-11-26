from nba_api.stats.endpoints import leaguedashplayerstats

# Get season-average stats for all players in 2023-24 regular season
stats = leaguedashplayerstats.LeagueDashPlayerStats(
    season="2023-24",
    season_type_all_star="Regular Season"
)

df = stats.get_data_frames()[0]

print("Number of players:", len(df))
print(df[["PLAYER_ID", "PLAYER_NAME", "PTS", "REB", "AST", "STL", "BLK", "TOV"]].head(5))
