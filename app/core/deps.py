# app/core/deps.py

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import SessionLocal  # 👈 use the canonical SessionLocal
from app.core.security import decode_access_token
from app.models.user import User

from app.core import security
print("DEBUG DEPS SECRET_KEY:", security.SECRET_KEY)

bearer_scheme = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Reads Bearer token, decodes JWT, loads user.
    """
    token = creds.credentials
    payload = decode_access_token(token)

    print("DEBUG TOKEN:", token)
    print("DEBUG PAYLOAD:", payload)

    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user_id = int(payload["sub"])

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    return user

def get_current_user_dev(
    db: Session = Depends(get_db),
) -> User:
    """
    DEV ONLY: always return the first user in the database.
    If no user exists, you could optionally create one here.
    """
    user = db.query(User).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No users in DB. Create one via /users/register first.",
        )
    return user

