from pydantic import BaseModel
from typing import Any, Optional

class SavedItemCreate(BaseModel):
    kind: str  # "lineup" | "draft_plan"
    title: str
    season: Optional[str] = None
    payload: Any

class SavedItemOut(BaseModel):
    id: int
    kind: str
    title: str
    season: Optional[str] = None
    payload: Any

    class Config:
        from_attributes = True
