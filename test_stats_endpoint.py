import os, requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("BALLDONTLIE_API_KEY")

url = "https://api.balldontlie.io/v1/stats"
params = {
    "seasons[]": 2023,
    "player_ids[]": 237,  # LeBron
    "per_page": 5
}
headers = {"Authorization": API_KEY}

r = requests.get(url, params=params, headers=headers)
print("Status:", r.status_code)
print("Body:", r.text[:500])
