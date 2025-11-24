# app/models/player.py

from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.orm import relationship

from app.db.base import Base


class Player(Base):
    __tablename__ = "players"

    # Internal DB id
    id = Column(Integer, primary_key=True, index=True)

    # Balldontlie player id
    external_id = Column(Integer, index=True, unique=True)

    name = Column(String, index=True, nullable=False)
    team = Column(String, nullable=True)
    position = Column(String, nullable=True)
    team_full_name = Column(String, nullable=True)

    # This will hold your fantasy projection later
    projected_points = Column(Float, nullable=True)

    # one-to-one relationship to stats (string name, no import here)
    stats = relationship("PlayerStats", back_populates="player", uselist=False)



    

