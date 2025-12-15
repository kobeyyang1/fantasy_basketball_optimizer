# app/ml/ml_predictions.py

import os
from typing import List, Dict

import pandas as pd
import joblib
import shap
from sqlalchemy.orm import Session

from app.models.player import Player
from app.models.player_stats import PlayerStats

# Must match FEATURE_COLS from train_models.py
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

_rf_model = None  # cached RandomForest model instance


def _get_model_path() -> str:
    """
    Returns the absolute path to the saved RandomForest model.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "model_random_forest.pkl")


def load_rf_model():
    """
    Load the RandomForest model from disk (only once, then cache it).
    """
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

    return _rf_model


def build_feature_dataframe(db: Session) -> pd.DataFrame:
    """
    Build a DataFrame of features for all players that have stats.
    This uses the same features as the training script.
    """
    rows: List[Dict] = []

    players = db.query(Player).all()
    for p in players:
        stats: PlayerStats | None = p.stats
        if not stats:
            continue

        row = {
            "player_id": p.id,
            "name": p.name,
            "team": p.team,
            "fg_pct": stats.fg_pct,
            "ft_pct": stats.ft_pct,
            "three_pm": stats.three_pm,
            "points": stats.points,
            "rebounds": stats.rebounds,
            "assists": stats.assists,
            "steals": stats.steals,
            "blocks": stats.blocks,
            "turnovers": stats.turnovers,
        }
        rows.append(row)

    df = pd.DataFrame(rows)

    # Drop any players with missing key stats
    df = df.dropna(subset=FEATURE_COLS)

    if df.empty:
        raise RuntimeError("No players with complete stats to score with the ML model.")

    return df


def predict_roto_scores_with_rf(db: Session) -> List[Dict]:
    """
    Use the trained RandomForest model to predict roto scores
    for all players with complete stat lines.

    Returns a list of dicts:
      {
        "player_id": int,
        "name": str,
        "team": str | None,
        "ml_score": float
      }
    sorted by ml_score descending.
    """
    df = build_feature_dataframe(db)
    model = load_rf_model()

    X = df[FEATURE_COLS]
    preds = model.predict(X)

    df["ml_score"] = preds

    # Sort highest score first
    df_sorted = df.sort_values("ml_score", ascending=False)

    results: List[Dict] = []
    for _, row in df_sorted.iterrows():
        results.append(
            {
                "player_id": int(row["player_id"]),
                "name": str(row["name"]),
                "team": (None if pd.isna(row["team"]) else row["team"]),
                "ml_score": float(row["ml_score"]),
            }
        )

    return results


def explain_player_with_shap(db: Session, player_id: int) -> Dict:
    """
    Compute a SHAP explanation for a single player using the RF model.

    Returns a dict:
      {
        "player_id": ...,
        "name": ...,
        "team": ...,
        "ml_score": ...,
        "base_value": ...,
        "impacts": [
            {
              "feature": "points",
              "value": 1966.0,
              "shap_value": 0.85,
              "abs_shap_value": 0.85
            },
            ...
        ]
      }
    """
    df = build_feature_dataframe(db)

    row = df[df["player_id"] == player_id]
    if row.empty:
        raise ValueError("Player not found in ML feature set (no stats or missing data).")

    model = load_rf_model()

    # Feature row as DataFrame (1 row)
    X_sample = row[FEATURE_COLS]

    # Predict the ML score for reference
    ml_score = float(model.predict(X_sample)[0])

    # Build SHAP explainer and values
    explainer = shap.TreeExplainer(model)
    shap_values = explainer(X_sample)

    # base_value = expected model output (average prediction)
    # depending on shap version, base_values might be scalar or array
    base_raw = getattr(shap_values, "base_values", explainer.expected_value)
    try:
        base_value = float(base_raw[0])
    except (TypeError, IndexError):
        base_value = float(base_raw)

    values = shap_values.values[0]

    impacts: List[Dict] = []
    for feat, shap_val in zip(FEATURE_COLS, values):
        val = float(X_sample.iloc[0][feat])
        impacts.append(
            {
                "feature": feat,
                "value": val,
                "shap_value": float(shap_val),
                "abs_shap_value": float(abs(shap_val)),
            }
        )

    # Sort by absolute impact descending
    impacts.sort(key=lambda d: d["abs_shap_value"], reverse=True)

    team_val = row["team"].iloc[0]
    team = None if pd.isna(team_val) else str(team_val)

    return {
        "player_id": int(row["player_id"].iloc[0]),
        "name": str(row["name"].iloc[0]),
        "team": team,
        "ml_score": ml_score,
        "base_value": base_value,
        "impacts": impacts,
    }
