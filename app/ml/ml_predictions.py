# app/ml/ml_predictions.py

import os
from typing import List, Dict

import pandas as pd
import joblib
import shap
from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats

# Must match train_models.py feature columns
FEATURE_COLS = [
    "fg_pct",
    "ft_pct",
    "three_pm",
    "points",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
]

SUPPORTED_SEASONS = ["2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
DEFAULT_SEASON = "2025-26"

_rf_model = None  # cached RandomForest model instance


def _get_model_path() -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "model_random_forest.pkl")


def load_rf_model():
    global _rf_model

    if _rf_model is None:
        model_path = _get_model_path()
        if not os.path.exists(model_path):
            raise RuntimeError(
                f"RandomForest model file not found at {model_path}. "
                "Run `python -m app.ml.train_models` first."
            )
        print(f"[INFO] Loading RandomForest model from {model_path}")
        _rf_model = joblib.load(model_path)
        if hasattr(_rf_model, "n_jobs"):
            _rf_model.n_jobs = 1

    return _rf_model


def build_feature_dataframe_for_season(db: Session, season: str) -> pd.DataFrame:
    """
    Builds features from player_season_stats for ONE season.
    IMPORTANT: values here are season totals (except fg_pct/ft_pct which are rates),
    and gp is included so the frontend can show per-game averages.
    """
    if season not in SUPPORTED_SEASONS:
        raise ValueError(f"Unsupported season: {season}. Supported: {SUPPORTED_SEASONS}")

    # Join so we get player name/team/position without extra queries
    rows = (
        db.query(PlayerSeasonStats, Player)
        .join(Player, Player.id == PlayerSeasonStats.player_id)
        .filter(PlayerSeasonStats.season == season)
        .all()
    )

    out: List[Dict] = []

    for stats_row, player in rows:
        # Skip players with no games (optional, but usually correct)
        gp = int(stats_row.gp or 0)
        if gp <= 0:
            continue

        rec = {
            "player_id": int(player.id),
            "name": player.name,
            "team": player.team,
            "position": player.position,
            "season": season,
            "gp": gp,
            "fg_pct": stats_row.fg_pct,
            "ft_pct": stats_row.ft_pct,
            "three_pm": stats_row.three_pm,
            "points": stats_row.points,
            "rebounds": stats_row.rebounds,
            "assists": stats_row.assists,
            "steals": stats_row.steals,
            "blocks": stats_row.blocks,
            "turnovers": stats_row.turnovers,
        }
        out.append(rec)

    df = pd.DataFrame(out)

    if df.empty:
        raise RuntimeError(f"No usable players for season {season} (empty df).")

    # Drop players with missing key stats
    df = df.dropna(subset=FEATURE_COLS)

    if df.empty:
        raise RuntimeError(f"No players with complete stats for season {season}.")

    return df


def predict_roto_scores_with_rf(db: Session, season: str = DEFAULT_SEASON) -> List[Dict]:
    df = build_feature_dataframe_for_season(db, season)
    model = load_rf_model()

    X = df[FEATURE_COLS]
    preds = model.predict(X)

    df["ml_score"] = preds
    df_sorted = df.sort_values("ml_score", ascending=False)

    results: List[Dict] = []
    for _, row in df_sorted.iterrows():
        results.append(
            {
                "player_id": int(row["player_id"]),
                "name": str(row["name"]),
                "team": None if pd.isna(row["team"]) else str(row["team"]),
                "position": None if pd.isna(row["position"]) else str(row["position"]),
                "season": str(row["season"]),
                "ml_score": float(row["ml_score"]),
            }
        )

    return results


def explain_player_with_shap(db: Session, player_id: int, season: str = DEFAULT_SEASON) -> Dict:
    df = build_feature_dataframe_for_season(db, season)

    row = df[df["player_id"] == player_id]
    if row.empty:
        raise ValueError("Player not found in ML feature set for this season.")

    model = load_rf_model()

    X_sample = row[FEATURE_COLS]
    ml_score = float(model.predict(X_sample)[0])

    explainer = shap.TreeExplainer(model)
    shap_values = explainer(X_sample)

    base_raw = getattr(shap_values, "base_values", explainer.expected_value)
    try:
        base_value = float(base_raw[0])
    except (TypeError, IndexError):
        base_value = float(base_raw)

    values = shap_values.values[0]

    impacts: List[Dict] = []
    for feat, shap_val in zip(FEATURE_COLS, values):
        impacts.append(
            {
                "feature": feat,
                "value": float(X_sample.iloc[0][feat]),
                "shap_value": float(shap_val),
                "abs_shap_value": float(abs(shap_val)),
            }
        )

    impacts.sort(key=lambda d: d["abs_shap_value"], reverse=True)

    return {
        "player_id": int(row["player_id"].iloc[0]),
        "name": str(row["name"].iloc[0]),
        "team": None if pd.isna(row["team"].iloc[0]) else str(row["team"].iloc[0]),
        "position": None if pd.isna(row["position"].iloc[0]) else str(row["position"].iloc[0]),
        "season": str(row["season"].iloc[0]),
        "gp": int(row["gp"].iloc[0]),
        "ml_score": ml_score,
        "base_value": base_value,
        "impacts": impacts,
    }
