# app/models/player_stats.py

from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base


class PlayerStats(Base):
    __tablename__ = "player_stats"

    id = Column(Integer, primary_key=True, index=True)

    player_id = Column(Integer, ForeignKey("players.id"), unique=True, index=True)

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

    # back relationship to Player (string name again)
    player = relationship("Player", back_populates="stats")
