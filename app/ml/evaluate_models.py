import argparse
import json
import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import shap
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.core.deps import get_current_user, get_current_user_dev
from app.db.session import SessionLocal
from app.models.player import Player
from app.models.player_season_stats import PlayerSeasonStats
from app.services.roto_scoring import compute_roto_scores

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


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

DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"


def build_historical_training_dataframe(db: Session) -> pd.DataFrame:
    rows = (
        db.query(PlayerSeasonStats, Player)
        .join(Player, Player.id == PlayerSeasonStats.player_id)
        .order_by(PlayerSeasonStats.season.asc(), Player.name.asc())
        .all()
    )

    records = []
    for season_stats, player in rows:
        gp = int(season_stats.gp or 0)
        record = {
            "player_id": int(player.id),
            "name": player.name,
            "season": season_stats.season,
            "gp": gp,
            "fg_pct": season_stats.fg_pct,
            "ft_pct": season_stats.ft_pct,
            "three_pm": season_stats.three_pm,
            "points": season_stats.points,
            "rebounds": season_stats.rebounds,
            "assists": season_stats.assists,
            "steals": season_stats.steals,
            "blocks": season_stats.blocks,
            "turnovers": season_stats.turnovers,
        }
        records.append(record)

    df = pd.DataFrame(records)
    if df.empty:
        raise RuntimeError("No player season data found. Run the season import scripts first.")

    df = df[df["gp"] > 0].dropna(subset=FEATURE_COLS)
    if df.empty:
        raise RuntimeError("No complete historical rows found after filtering by games played and features.")

    scored_frames = []
    for season, season_df in df.groupby("season", sort=True):
        players_for_roto = []
        for _, row in season_df.iterrows():
            players_for_roto.append(
                {
                    "player_id": int(row["player_id"]),
                    "player_name": row["name"],
                    "fg_pct": float(row["fg_pct"]),
                    "ft_pct": float(row["ft_pct"]),
                    "three_pm": float(row["three_pm"]),
                    "points": float(row["points"]),
                    "rebounds": float(row["rebounds"]),
                    "assists": float(row["assists"]),
                    "steals": float(row["steals"]),
                    "blocks": float(row["blocks"]),
                    "turnovers": float(row["turnovers"]),
                }
            )

        season_scores = compute_roto_scores(
            players=players_for_roto,
            categories=FEATURE_COLS,
            inverted_categories=["turnovers"],
        )
        score_lookup = {result.player_id: result.total_score for result in season_scores}
        scored = season_df.copy()
        scored["roto_total"] = scored["player_id"].map(score_lookup)
        scored = scored.dropna(subset=["roto_total"])
        if not scored.empty:
            scored_frames.append(scored)

    if not scored_frames:
        raise RuntimeError("Unable to compute any roto labels from historical season data.")

    full_df = pd.concat(scored_frames, ignore_index=True)
    return full_df.sort_values(["season", "name"]).reset_index(drop=True)


def split_dataset(
    df: pd.DataFrame,
    split_mode: str,
    test_size: float,
    random_state: int,
    test_season: str | None,
):
    if split_mode == "season":
        if not test_season:
            test_season = str(df["season"].max())

        train_df = df[df["season"] != test_season].copy()
        test_df = df[df["season"] == test_season].copy()
        if train_df.empty or test_df.empty:
            raise RuntimeError(
                f"Season split failed for test season {test_season}. "
                "Make sure the database contains both training and test seasons."
            )
        return train_df, test_df

    train_df, test_df = train_test_split(
        df,
        test_size=test_size,
        random_state=random_state,
        shuffle=True,
    )
    return train_df.copy(), test_df.copy()


def _compute_metrics(y_true: pd.Series, y_pred) -> dict:
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(mean_squared_error(y_true, y_pred) ** 0.5),
    }


def train_and_evaluate_models(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    random_state: int,
):
    X_train = train_df[FEATURE_COLS]
    y_train = train_df["roto_total"]
    X_test = test_df[FEATURE_COLS]
    y_test = test_df["roto_total"]

    baseline = LinearRegression()
    baseline.fit(X_train, y_train)
    y_pred_linear = baseline.predict(X_test)

    random_forest = RandomForestRegressor(
        n_estimators=400,
        random_state=random_state,
        n_jobs=1,
    )
    random_forest.fit(X_train, y_train)
    y_pred_rf = random_forest.predict(X_test)

    results = {
        "Linear Regression": {
            "metrics": _compute_metrics(y_test, y_pred_linear),
            "predictions": y_pred_linear,
        },
        "Random Forest": {
            "metrics": _compute_metrics(y_test, y_pred_rf),
            "predictions": y_pred_rf,
        },
    }

    return baseline, random_forest, y_test.reset_index(drop=True), results


def save_metrics_json(
    output_dir: Path,
    split_mode: str,
    test_size: float,
    random_state: int,
    test_season: str | None,
    dataset: pd.DataFrame,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    results: dict,
) -> Path:
    payload = {
        "dataset_rows": int(len(dataset)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "seasons": sorted(dataset["season"].unique().tolist()),
        "split_mode": split_mode,
        "test_size": test_size if split_mode == "random" else None,
        "random_state": random_state,
        "test_season": test_season if split_mode == "season" else None,
        "models": {name: details["metrics"] for name, details in results.items()},
    }

    metrics_path = output_dir / "model_metrics.json"
    metrics_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return metrics_path


def save_predictions_csv(
    output_dir: Path,
    test_df: pd.DataFrame,
    y_test: pd.Series,
    results: dict,
) -> Path:
    predictions_df = test_df[["player_id", "name", "season"]].reset_index(drop=True).copy()
    predictions_df["actual_roto_total"] = y_test
    predictions_df["linear_prediction"] = results["Linear Regression"]["predictions"]
    predictions_df["random_forest_prediction"] = results["Random Forest"]["predictions"]
    predictions_df["linear_residual"] = (
        predictions_df["actual_roto_total"] - predictions_df["linear_prediction"]
    )
    predictions_df["random_forest_residual"] = (
        predictions_df["actual_roto_total"] - predictions_df["random_forest_prediction"]
    )

    predictions_path = output_dir / "test_predictions.csv"
    predictions_df.to_csv(predictions_path, index=False)
    return predictions_path


def plot_metric_comparison(output_dir: Path, results: dict) -> Path:
    model_names = list(results.keys())
    metric_keys = ["r2", "mae", "rmse"]
    metric_labels = ["R2", "MAE", "RMSE"]
    colors = ["#0b6e4f", "#b22222"]

    fig, axes = plt.subplots(1, 3, figsize=(12, 4))

    for index, (metric_key, metric_label) in enumerate(zip(metric_keys, metric_labels)):
        values = [results[name]["metrics"][metric_key] for name in model_names]
        ax = axes[index]
        bars = ax.bar(model_names, values, color=colors)
        ax.set_title(metric_label)
        ax.tick_params(axis="x", rotation=12)
        for bar, value in zip(bars, values):
            ax.text(
                bar.get_x() + (bar.get_width() / 2),
                bar.get_height(),
                f"{value:.3f}",
                ha="center",
                va="bottom",
                fontsize=9,
            )

    fig.suptitle("Model Performance Comparison")
    fig.tight_layout()

    chart_path = output_dir / "model_metric_comparison.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def plot_prediction_scatter(output_dir: Path, y_test: pd.Series, results: dict) -> Path:
    min_value = min(float(y_test.min()), *(float(details["predictions"].min()) for details in results.values()))
    max_value = max(float(y_test.max()), *(float(details["predictions"].max()) for details in results.values()))

    fig, axes = plt.subplots(1, 2, figsize=(12, 5), sharex=True, sharey=True)
    colors = ["#0b6e4f", "#b22222"]

    for ax, (model_name, details), color in zip(axes, results.items(), colors):
        predictions = details["predictions"]
        metrics = details["metrics"]
        ax.scatter(y_test, predictions, alpha=0.75, color=color, edgecolors="white", linewidths=0.4)
        ax.plot([min_value, max_value], [min_value, max_value], linestyle="--", color="#1f2933")
        ax.set_title(f"{model_name}\nR2={metrics['r2']:.3f}, MAE={metrics['mae']:.3f}")
        ax.set_xlabel("Actual roto total")
        ax.set_ylabel("Predicted roto total")

    fig.suptitle("Actual vs Predicted on Test Data")
    fig.tight_layout()

    chart_path = output_dir / "actual_vs_predicted.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def plot_residual_comparison(output_dir: Path, y_test: pd.Series, results: dict) -> Path:
    residuals = [
        y_test - results["Linear Regression"]["predictions"],
        y_test - results["Random Forest"]["predictions"],
    ]

    fig, ax = plt.subplots(figsize=(8, 5))
    box = ax.boxplot(
        residuals,
        labels=["Linear Regression", "Random Forest"],
        patch_artist=True,
    )

    for patch, color in zip(box["boxes"], ["#0b6e4f", "#b22222"]):
        patch.set_facecolor(color)
        patch.set_alpha(0.65)

    ax.axhline(0, linestyle="--", color="#1f2933")
    ax.set_title("Residual Distribution on Test Data")
    ax.set_ylabel("Actual - Predicted")

    chart_path = output_dir / "residual_comparison.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def plot_random_forest_feature_importance(output_dir: Path, random_forest: RandomForestRegressor) -> Path:
    importance_df = (
        pd.DataFrame(
            {
                "feature": FEATURE_COLS,
                "importance": random_forest.feature_importances_,
            }
        )
        .sort_values("importance", ascending=True)
        .reset_index(drop=True)
    )

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(importance_df["feature"], importance_df["importance"], color="#3454d1")
    ax.set_title("Random Forest Feature Importance")
    ax.set_xlabel("Importance")

    chart_path = output_dir / "random_forest_feature_importance.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def save_shap_consistency_csv(output_dir: Path, shap_df: pd.DataFrame) -> Path:
    csv_path = output_dir / "shap_consistency.csv"
    shap_df.to_csv(csv_path, index=False)
    return csv_path


def plot_shap_reconstruction_error(output_dir: Path, shap_df: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(shap_df["abs_reconstruction_error"], bins=20, color="#3454d1", edgecolor="white")
    ax.set_title("SHAP Reconstruction Error")
    ax.set_xlabel("|prediction - (base value + sum SHAP)|")
    ax.set_ylabel("Sample count")

    chart_path = output_dir / "shap_reconstruction_error.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def plot_shap_mean_abs_importance(output_dir: Path, mean_abs_shap: pd.Series) -> Path:
    ordered = mean_abs_shap.sort_values(ascending=True)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(ordered.index, ordered.values, color="#7c3aed")
    ax.set_title("Mean Absolute SHAP Importance")
    ax.set_xlabel("Mean |SHAP value|")

    chart_path = output_dir / "shap_mean_abs_importance.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def run_shap_tests(
    output_dir: Path,
    random_forest: RandomForestRegressor,
    test_df: pd.DataFrame,
    sample_size: int,
    random_state: int,
) -> dict:
    shap_sample = test_df.sample(
        n=min(sample_size, len(test_df)),
        random_state=random_state,
    ).reset_index(drop=True)
    X_sample = shap_sample[FEATURE_COLS]

    explainer = shap.TreeExplainer(random_forest)
    shap_values = explainer(X_sample)
    predictions = random_forest.predict(X_sample)

    base_raw = getattr(shap_values, "base_values", explainer.expected_value)
    if hasattr(base_raw, "__len__") and not isinstance(base_raw, (str, bytes)):
        base_values = [float(v) for v in base_raw]
    else:
        base_values = [float(base_raw)] * len(shap_sample)

    shap_matrix = pd.DataFrame(shap_values.values, columns=FEATURE_COLS)
    reconstructed = shap_matrix.sum(axis=1) + pd.Series(base_values)
    abs_errors = (pd.Series(predictions) - reconstructed).abs()

    shap_consistency_df = shap_sample[["player_id", "name", "season"]].copy()
    shap_consistency_df["prediction"] = predictions
    shap_consistency_df["base_value"] = base_values
    shap_consistency_df["shap_sum"] = shap_matrix.sum(axis=1)
    shap_consistency_df["reconstructed_prediction"] = reconstructed
    shap_consistency_df["abs_reconstruction_error"] = abs_errors

    shap_csv_path = save_shap_consistency_csv(output_dir, shap_consistency_df)
    reconstruction_chart = plot_shap_reconstruction_error(output_dir, shap_consistency_df)
    mean_abs_shap = shap_matrix.abs().mean(axis=0)
    importance_chart = plot_shap_mean_abs_importance(output_dir, mean_abs_shap)

    return {
        "sample_rows": int(len(shap_consistency_df)),
        "mean_abs_reconstruction_error": float(abs_errors.mean()),
        "max_abs_reconstruction_error": float(abs_errors.max()),
        "csv_path": str(shap_csv_path),
        "reconstruction_chart": str(reconstruction_chart),
        "importance_chart": str(importance_chart),
    }


def _dummy_user():
    return {"id": 0, "email": "benchmark@example.com"}


def _benchmark_endpoint(client: TestClient, path: str, repeats: int) -> list[float]:
    durations_ms = []
    for _ in range(repeats):
        start = time.perf_counter()
        response = client.get(path)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if response.status_code != 200:
            raise RuntimeError(f"Benchmark failed for {path}: {response.status_code} {response.text}")
        durations_ms.append(elapsed_ms)
    return durations_ms


def save_response_time_json(output_dir: Path, benchmarks: dict) -> Path:
    json_path = output_dir / "response_time_metrics.json"
    json_path.write_text(json.dumps(benchmarks, indent=2), encoding="utf-8")
    return json_path


def plot_response_time_chart(output_dir: Path, benchmarks: dict) -> Path:
    endpoint_names = list(benchmarks.keys())
    avg_values = [benchmarks[name]["avg_ms"] for name in endpoint_names]
    p95_values = [benchmarks[name]["p95_ms"] for name in endpoint_names]

    x_positions = range(len(endpoint_names))
    width = 0.36

    fig, ax = plt.subplots(figsize=(10, 5))
    avg_bars = ax.bar(
        [x - (width / 2) for x in x_positions],
        avg_values,
        width=width,
        label="Average (ms)",
        color="#0b6e4f",
    )
    p95_bars = ax.bar(
        [x + (width / 2) for x in x_positions],
        p95_values,
        width=width,
        label="P95 (ms)",
        color="#b22222",
    )

    ax.set_xticks(list(x_positions))
    ax.set_xticklabels(endpoint_names, rotation=12)
    ax.set_ylabel("Milliseconds")
    ax.set_title("System Response Time by Endpoint")
    ax.legend()

    for bars in (avg_bars, p95_bars):
        for bar in bars:
            ax.text(
                bar.get_x() + (bar.get_width() / 2),
                bar.get_height(),
                f"{bar.get_height():.1f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )

    chart_path = output_dir / "system_response_time.png"
    fig.savefig(chart_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return chart_path


def run_response_time_tests(
    output_dir: Path,
    benchmark_season: str,
    benchmark_player_id: int,
    repeats: int,
) -> dict:
    from app.main import app as fastapi_app

    fastapi_app.dependency_overrides[get_current_user_dev] = _dummy_user
    fastapi_app.dependency_overrides[get_current_user] = _dummy_user

    try:
        with TestClient(fastapi_app) as client:
            benchmarks = {
                "ml_rankings": _benchmark_endpoint(
                    client,
                    f"/fantasy/ml_rankings?limit=50&season={benchmark_season}",
                    repeats,
                ),
                "ml_explain": _benchmark_endpoint(
                    client,
                    f"/fantasy/ml_explain/{benchmark_player_id}?season={benchmark_season}",
                    repeats,
                ),
                "roto_risk_rankings": _benchmark_endpoint(
                    client,
                    f"/fantasy/roto_risk_rankings?season={benchmark_season}&risk_weight=0.25",
                    repeats,
                ),
            }
    finally:
        fastapi_app.dependency_overrides.pop(get_current_user_dev, None)
        fastapi_app.dependency_overrides.pop(get_current_user, None)

    summary = {}
    for endpoint_name, durations_ms in benchmarks.items():
        timings = pd.Series(durations_ms)
        summary[endpoint_name] = {
            "runs": int(len(durations_ms)),
            "avg_ms": float(timings.mean()),
            "min_ms": float(timings.min()),
            "max_ms": float(timings.max()),
            "p95_ms": float(timings.quantile(0.95)),
            "all_runs_ms": [float(value) for value in durations_ms],
        }

    json_path = save_response_time_json(output_dir, summary)
    chart_path = plot_response_time_chart(output_dir, summary)

    return {
        "benchmark_season": benchmark_season,
        "benchmark_player_id": int(benchmark_player_id),
        "repeats": repeats,
        "json_path": str(json_path),
        "chart_path": str(chart_path),
        "benchmarks": summary,
    }


def generate_model_performance_artifacts(
    split_mode: str = "random",
    test_size: float = 0.2,
    random_state: int = 42,
    test_season: str | None = None,
    shap_sample_size: int = 50,
    response_time_repeats: int = 5,
    output_dir: Path | None = None,
) -> dict:
    output_dir = output_dir or DEFAULT_ARTIFACT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    db = SessionLocal()
    try:
        dataset = build_historical_training_dataframe(db)
    finally:
        db.close()

    train_df, test_df = split_dataset(
        df=dataset,
        split_mode=split_mode,
        test_size=test_size,
        random_state=random_state,
        test_season=test_season,
    )

    _, random_forest, y_test, results = train_and_evaluate_models(
        train_df=train_df,
        test_df=test_df,
        random_state=random_state,
    )

    metrics_path = save_metrics_json(
        output_dir=output_dir,
        split_mode=split_mode,
        test_size=test_size,
        random_state=random_state,
        test_season=test_season,
        dataset=dataset,
        train_df=train_df,
        test_df=test_df,
        results=results,
    )
    predictions_path = save_predictions_csv(output_dir, test_df, y_test, results)
    charts = {
        "metrics_chart": plot_metric_comparison(output_dir, results),
        "prediction_scatter_chart": plot_prediction_scatter(output_dir, y_test, results),
        "residual_chart": plot_residual_comparison(output_dir, y_test, results),
        "feature_importance_chart": plot_random_forest_feature_importance(output_dir, random_forest),
    }
    shap_tests = run_shap_tests(
        output_dir=output_dir,
        random_forest=random_forest,
        test_df=test_df,
        sample_size=shap_sample_size,
        random_state=random_state,
    )
    response_time_tests = run_response_time_tests(
        output_dir=output_dir,
        benchmark_season=str(test_df["season"].mode().iloc[0]),
        benchmark_player_id=int(test_df.iloc[0]["player_id"]),
        repeats=response_time_repeats,
    )

    return {
        "output_dir": str(output_dir),
        "metrics_path": str(metrics_path),
        "predictions_path": str(predictions_path),
        "charts": {name: str(path) for name, path in charts.items()},
        "shap_tests": shap_tests,
        "response_time_tests": response_time_tests,
        "models": {name: details["metrics"] for name, details in results.items()},
        "dataset_rows": int(len(dataset)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train baseline and Random Forest models, then save test-performance charts."
    )
    parser.add_argument(
        "--split-mode",
        choices=["random", "season"],
        default="random",
        help="Use a random train/test split or hold out one season for testing.",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Test split ratio for random split mode.",
    )
    parser.add_argument(
        "--test-season",
        type=str,
        default=None,
        help="Season to hold out when using --split-mode season. Defaults to latest season in the data.",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed used for dataset splitting and Random Forest training.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_ARTIFACT_DIR,
        help="Directory where charts and metric files will be written.",
    )
    parser.add_argument(
        "--shap-sample-size",
        type=int,
        default=50,
        help="Number of test rows to use for SHAP validation charts.",
    )
    parser.add_argument(
        "--response-time-repeats",
        type=int,
        default=5,
        help="How many times to call each benchmarked endpoint.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    artifacts = generate_model_performance_artifacts(
        split_mode=args.split_mode,
        test_size=args.test_size,
        random_state=args.random_state,
        test_season=args.test_season,
        shap_sample_size=args.shap_sample_size,
        response_time_repeats=args.response_time_repeats,
        output_dir=args.output_dir,
    )

    print("[INFO] Model evaluation complete.")
    print(f"[INFO] Output directory: {artifacts['output_dir']}")
    for model_name, metrics in artifacts["models"].items():
        print(
            f"[INFO] {model_name}: "
            f"R2={metrics['r2']:.3f}, MAE={metrics['mae']:.3f}, RMSE={metrics['rmse']:.3f}"
        )
    print(f"[INFO] Metrics JSON: {artifacts['metrics_path']}")
    print(f"[INFO] Predictions CSV: {artifacts['predictions_path']}")
    for chart_name, chart_path in artifacts["charts"].items():
        print(f"[INFO] {chart_name}: {chart_path}")
    print(
        "[INFO] SHAP tests: "
        f"mean_error={artifacts['shap_tests']['mean_abs_reconstruction_error']:.6f}, "
        f"max_error={artifacts['shap_tests']['max_abs_reconstruction_error']:.6f}"
    )
    print(f"[INFO] SHAP CSV: {artifacts['shap_tests']['csv_path']}")
    print(f"[INFO] SHAP reconstruction chart: {artifacts['shap_tests']['reconstruction_chart']}")
    print(f"[INFO] SHAP importance chart: {artifacts['shap_tests']['importance_chart']}")
    print(f"[INFO] Response-time JSON: {artifacts['response_time_tests']['json_path']}")
    print(f"[INFO] Response-time chart: {artifacts['response_time_tests']['chart_path']}")
    for endpoint_name, metrics in artifacts["response_time_tests"]["benchmarks"].items():
        print(
            f"[INFO] {endpoint_name}: "
            f"avg={metrics['avg_ms']:.1f} ms, p95={metrics['p95_ms']:.1f} ms"
        )


if __name__ == "__main__":
    main()
