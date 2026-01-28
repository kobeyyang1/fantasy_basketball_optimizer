# app/models/saved_item.py
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base  # if your project uses a different Base import, change this line

class SavedItem(Base):
    __tablename__ = "saved_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    kind = Column(String(50), nullable=False)   # "lineup" | "draft_plan"
    title = Column(String(120), nullable=False)
    season = Column(String(20), nullable=True)

    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="saved_items")
