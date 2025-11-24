# app/api/deps.py
# This file is kept only so old imports still work.
# It forwards everything to the real deps in app/core/deps.py

from app.core.deps import get_db, get_current_user  # noqa: F401
