import os
import requests
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

API_KEY = os.getenv("BALLDONTLIE_API_KEY")

if not API_KEY:
    print("No API key found. Did you set BALLDONTLIE_API_KEY in your .env file?")
    exit(1)

url = "https://api.balldontlie.io/v1/players"
params = {
    "per_page": 5,  # just 5 players so output isn't crazy
    "page": 1,
}

headers = {
    "Authorization": API_KEY
}

response = requests.get(url, params=params, headers=headers)

print("Status code:", response.status_code)

print("First few players:")
if response.status_code == 200:
    data = response.json()
    for player in data.get("data", []):
        full_name = f"{player['first_name']} {player['last_name']}"
        team_name = player["team"]["full_name"] if player.get("team") else "No team"
        position = player.get("position") or "N/A"
        print(f"- {full_name} | {team_name} | Pos: {position}")
else:
    print("Something went wrong. Body:", response.text)
