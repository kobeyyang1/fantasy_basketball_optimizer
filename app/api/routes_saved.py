import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.saved_items import SavedItem
from app.models.user import User
from app.schemas.saved_items import SavedItemCreate, SavedItemOut

router = APIRouter()

@router.get("/saved", response_model=List[SavedItemOut])
def list_saved(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(SavedItem)
        .filter(SavedItem.user_id == current_user.id)
        .order_by(SavedItem.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "kind": r.kind,
            "title": r.title,
            "season": r.season,
            "payload": json.loads(r.payload_json),
        })
    return out

@router.post("/saved", response_model=SavedItemOut)
def create_saved(item: SavedItemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if item.kind not in ["lineup", "draft_plan"]:
        raise HTTPException(status_code=400, detail="Invalid kind")

    row = SavedItem(
        user_id=current_user.id,
        kind=item.kind,
        title=item.title,
        season=item.season,
        payload_json=json.dumps(item.payload),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "kind": row.kind,
        "title": row.title,
        "season": row.season,
        "payload": item.payload,
    }

@router.delete("/saved/{saved_id}")
def delete_saved(saved_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(SavedItem).filter(SavedItem.id == saved_id, SavedItem.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
