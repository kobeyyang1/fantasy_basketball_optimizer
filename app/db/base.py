from app.db.base_class import Base  # noqa

# Import all models here so SQLAlchemy registers them before use
from app.models.user import User  # noqa: F401
from app.models.player import Player  # noqa: F401
from app.models.player_stats import PlayerStats  # noqa: F401
from app.models.player_season_stats import PlayerSeasonStats  # noqa: F401


