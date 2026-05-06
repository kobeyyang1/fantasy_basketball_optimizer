# app/core/security.py

import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from jose import jwt, JWTError

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool: # checks if the provided plain password matches the hashed password stored in the database
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), # encodes the plain password to bytes and compares it to the hashed password (also encoded to bytes) using bcrypt's checkpw function, which returns True if they match and False otherwise
            hashed_password.encode("utf-8"), # encodes the hashed password to bytes for comparison
        )
    except ValueError:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str: # if login successful, this function creates a JWT access token that includes the user's ID (in the "sub" claim) and an expiration time. The token is signed using the SECRET_KEY and ALGORITHM defined above. The frontend will use this token for authenticated API requests.
    """
    data should include {"sub": user_id}
    """
    to_encode = data.copy()

    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

