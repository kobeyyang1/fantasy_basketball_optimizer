import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("BALLDONTLIE_API_KEY")

url = "https://api.balldontlie.io/nba/v1/season_averages/general"
params = {
    "season": 2023,
    "season_type": "regular",
    "type": "base",
    "player_ids[]": 237,  # LeBron balldontlie id
}
headers = {"Authorization": API_KEY}

r = requests.get(url, params=params, headers=headers)
print("Status:", r.status_code)
print("Body:", r.text[:500])
