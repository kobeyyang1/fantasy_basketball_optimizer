# app/ml/train_models.py

import os
from typing import List, Dict

import pandas as pd
from sqlalchemy.orm import Session

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error
import joblib
import shap

from app.db.session import SessionLocal
from app.models.player import Player
from app.models.player_stats import PlayerStats
from app.services.roto_scoring import compute_roto_scores


# -----------------------------
# 1. Build training dataset
# -----------------------------

FEATURE_COLS = [ # Random Forest set up
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


def build_training_dataframe(db: Session) -> pd.DataFrame:
    """
    Pull players + stats from the DB and build a DataFrame for ML.

    - Features: raw per-season stats (9-cat)
    - Target: roto total_score computed by your existing roto engine
    """

    rows: List[Dict] = []

    players = db.query(Player).all() # pulls players and stats from database
    for p in players:
        stats: PlayerStats | None = p.stats # gets the stats for each player, if they exist. If not, skip this player since we can't train on them without features.
        if not stats:
            continue

        row = { # creates a row for each player
            "player_id": p.id,
            "name": p.name,
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

    df = pd.DataFrame(rows) # creates a dataframe from the list of player rows

    # Drop any rows with missing feature values
    df = df.dropna(subset=FEATURE_COLS)

    if df.empty:
        raise RuntimeError("No data available to build training dataset.")

    # Use your roto engine to compute a total_score label for each player
    players_for_roto = []
    for _, r in df.iterrows():
        players_for_roto.append(
            {
                "player_id": int(r["player_id"]),
                "player_name": r["name"],
                "fg_pct": float(r["fg_pct"]),
                "ft_pct": float(r["ft_pct"]),
                "three_pm": float(r["three_pm"]),
                "points": float(r["points"]),
                "rebounds": float(r["rebounds"]),
                "assists": float(r["assists"]),
                "steals": float(r["steals"]),
                "blocks": float(r["blocks"]),
                "turnovers": float(r["turnovers"]),
            }
        )

    results = compute_roto_scores( # computes roto scores for each player using the existing roto engine, which will be used as the target variable for training
        players=players_for_roto, # the input to the roto engine is a list of player dicts with their stats
        categories=FEATURE_COLS, 
        inverted_categories=["turnovers"],
    )

    # Map player_id -> roto total_score
    id_to_total = {r.player_id: r.total_score for r in results}
    df["roto_total"] = df["player_id"].map(id_to_total)

    # Some players might not get a score (if something weird happens), drop them
    df = df.dropna(subset=["roto_total"])

    print(f"[INFO] Training dataset built with {len(df)} players.")
    return df


# -----------------------------
# 2. Train baseline + ML models
# -----------------------------


def train_models(df: pd.DataFrame):
    """
    Train:
      - Baseline: Linear Regression
      - ML model: RandomForestRegressor
    Return both models and the X_train/X_test split for SHAP.
    """

    X = df[FEATURE_COLS]
    y = df["roto_total"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # ----- Baseline: Linear Regression -----
    baseline = LinearRegression()
    baseline.fit(X_train, y_train)

    y_pred_base = baseline.predict(X_test)
    r2_base = r2_score(y_test, y_pred_base)
    mae_base = mean_absolute_error(y_test, y_pred_base)

    print("\n=== Baseline Model: Linear Regression ===")
    print(f"R^2:  {r2_base:.3f}")
    print(f"MAE:  {mae_base:.3f}")

    # ----- ML model: Random Forest Regressor -----
    rf = RandomForestRegressor(
        n_estimators=400,
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    y_pred_rf = rf.predict(X_test)
    r2_rf = r2_score(y_test, y_pred_rf)
    mae_rf = mean_absolute_error(y_test, y_pred_rf)

    print("\n=== ML Model: RandomForestRegressor ===")
    print(f"R^2:  {r2_rf:.3f}")
    print(f"MAE:  {mae_rf:.3f}")

    return baseline, rf, X_train, X_test, y_train, y_test


# -----------------------------
# 3. SHAP explainability
# -----------------------------


def explain_with_shap(rf_model: RandomForestRegressor, X_train: pd.DataFrame, X_sample: pd.DataFrame):
    """
    Use SHAP to explain the RandomForest model for a single sample.
    We'll just print the top contributing features.
    """

    print("\n=== SHAP explanation for one sample player ===")

    # Create SHAP explainer for tree-based model
    explainer = shap.TreeExplainer(rf_model)
    shap_values = explainer(X_sample)

    # shap_values is a matrix, we take the first (and only) row
    values = shap_values.values[0]
    feature_names = X_sample.columns

    # Pair (feature, |shap_value|) and sort by absolute impact
    impact = sorted(
        zip(feature_names, values),
        key=lambda x: abs(x[1]),
        reverse=True,
    )

    for feat, val in impact:
        print(f"{feat:10s} -> SHAP value {val:+.3f}")

    # Note: If you want pretty plots later, you can do:
    # shap.plots.waterfall(shap_values[0])
    # but that requires a Jupyter environment / frontend.


# -----------------------------
# 4. Save models to disk
# -----------------------------


def save_models(baseline, rf):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    baseline_path = os.path.join(base_dir, "model_baseline_linear.pkl")
    rf_path = os.path.join(base_dir, "model_random_forest.pkl")

    joblib.dump(baseline, baseline_path)
    joblib.dump(rf, rf_path)

    print(f"\n[INFO] Saved baseline model to: {baseline_path}")
    print(f"[INFO] Saved RF model to:       {rf_path}")


# -----------------------------
# 5. Main entry point
# -----------------------------


def main():
    db = SessionLocal()
    try:
        df = build_training_dataframe(db)
    finally:
        db.close()

    baseline, rf, X_train, X_test, y_train, y_test = train_models(df)

    # Take a single sample from the test set for SHAP explanation
    if len(X_test) > 0:
        sample = X_test.iloc[[0]]  # DataFrame with one row
        explain_with_shap(rf, X_train, sample)
    else:
        print("[WARN] No test data available for SHAP example.")

    save_models(baseline, rf)


if __name__ == "__main__":
    main()
