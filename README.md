# Fantasy Basketball Lineup Optimiser & Performance Predictor

## Information about this repository


Ctrl + C # stop server if running
venv\Scripts\activate
.\venv\Scripts\activate
uvicorn app.main:app

python -m uvicorn app.main:app --reload

REFRESH 2025-26 DATA (MANUAL)
python -m app.scripts.daily_refresh

ADMIN ENDPOINT (ONE-CALL DAILY REFRESH)
POST /admin/daily_refresh?season=2025-26

TO RUN FRONTEND
Open cmd
cd OneDrive\Desktop\FINAL YEAR PROJECT\fantasy-basketball\fantasy-frontend
npm run dev

PUSHING TO GIT
git status
git branch

git add .
git commit -m "Update project"

GITLAB: git push origin main
GITHUB: git push github main
