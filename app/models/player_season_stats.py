# app/models/player_season_stats.py

from sqlalchemy import Column, Integer, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class PlayerSeasonStats(Base):
    __tablename__ = "player_season_stats"

    id = Column(Integer, primary_key=True, index=True)

    # many seasons per player, so NOT unique
    player_id = Column(Integer, ForeignKey("players.id"), index=True, nullable=False)

    # e.g. "2023-24"
    season = Column(String, index=True, nullable=False)

    # games played (for your risk score)
    gp = Column(Integer, nullable=False, default=0)

    # shooting
    fga = Column(Float, nullable=True)
    fgm = Column(Float, nullable=True)
    fg_pct = Column(Float, nullable=True)

    fta = Column(Float, nullable=True)
    ftm = Column(Float, nullable=True)
    ft_pct = Column(Float, nullable=True)

    # 3PM
    three_pm = Column(Float, nullable=True)

    # counting stats
    points = Column(Float, nullable=True)
    rebounds = Column(Float, nullable=True)
    assists = Column(Float, nullable=True)
    steals = Column(Float, nullable=True)
    blocks = Column(Float, nullable=True)
    turnovers = Column(Float, nullable=True)

    # relationship back to Player
    player = relationship("Player", back_populates="season_stats")

    __table_args__ = (
        UniqueConstraint("player_id", "season", name="uq_player_id_season"),
    )
