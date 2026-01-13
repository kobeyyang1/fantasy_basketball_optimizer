# app/main.py

import app.db.base  # IMPORTANT: registers models

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_users import router as users_router
from app.api.routes_auth import router as auth_router
from app.api.routes_players import router as players_router
from app.api.routes_fantasy import router as fantasy_router

from app.db.session import engine
from app.db.base_class import Base


# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Fantasy Basketball API")

# (optional) allow your frontend later
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(players_router, prefix="/players", tags=["players"])
app.include_router(fantasy_router, prefix="/fantasy", tags=["fantasy"])


@app.get("/")
def home():
    return {"message": "Fantasy Basketball API running"}
