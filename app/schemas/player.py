from pydantic import BaseModel
from typing import Optional


class PlayerBase(BaseModel):
    name: str
    team: Optional[str] = None
    position: Optional[str] = None
    projected_points: Optional[float] = None


class PlayerCreate(PlayerBase):
    pass


class PlayerOut(PlayerBase):
    id: int

    class Config:
        orm_mode = True

class PlayerProjection(BaseModel):
    id: int
    name: str
    position: Optional[str] = None
    team: Optional[str] = None  # you can drop this if you don't store it

    projected_points: float

    class Config:
        orm_mode = True


class PlayerStatsBase(BaseModel):
    fga: Optional[float] = None
    fgm: Optional[float] = None
    fg_pct: Optional[float] = None

    fta: Optional[float] = None
    ftm: Optional[float] = None
    ft_pct: Optional[float] = None

    three_pm: Optional[float] = None

    points: Optional[float] = None
    rebounds: Optional[float] = None
    assists: Optional[float] = None
    steals: Optional[float] = None
    blocks: Optional[float] = None
    turnovers: Optional[float] = None


class PlayerStatsOut(PlayerStatsBase):
    id: int
    player_id: int

    class Config:
        orm_mode = True

class PlayerWithStats(BaseModel):
    id: int
    name: str
    position: Optional[str] = None
    team_full_name: Optional[str] = None

    stats: Optional[PlayerStatsOut] = None

    class Config:
        orm_mode = True


class PlayerRotoCategories(BaseModel):
    fg_pct: float | None = None
    ft_pct: float | None = None
    three_pm: float | None = None
    points: float | None = None
    rebounds: float | None = None
    assists: float | None = None
    steals: float | None = None
    blocks: float | None = None
    turnovers: float | None = None


class PlayerRoto(BaseModel):
    id: int
    name: str
    categories: PlayerRotoCategories

    class Config:
        orm_mode = True
