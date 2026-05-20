"""PNG plot generation."""

import os
from pathlib import Path
from typing import Dict

os.environ.setdefault("MPLCONFIGDIR", "/tmp/trail_data_pipeline_matplotlib")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd


COLORS = {
    "blue": "#2563eb",
    "green": "#16a34a",
    "orange": "#f97316",
    "purple": "#7c3aed",
    "red": "#dc2626",
    "slate": "#475569",
}


def _finish(path: Path, title: str, ylabel: str = None):
    plt.title(title)
    if ylabel:
        plt.ylabel(ylabel)
    plt.grid(axis="y", alpha=0.25)
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()


def _placeholder(path: Path, title: str, message: str):
    plt.figure(figsize=(8, 4))
    plt.text(0.5, 0.5, message, ha="center", va="center", wrap=True)
    plt.axis("off")
    _finish(path, title)


def _bar(path: Path, frame: pd.DataFrame, x: str, y: str, title: str, ylabel: str, color: str):
    if frame.empty or y not in frame.columns:
        _placeholder(path, title, "Donnees insuffisantes")
        return
    plt.figure(figsize=(10, 4.8))
    plt.bar(frame[x], frame[y], color=color, width=5 if "week" in x else 0.8)
    _finish(path, title, ylabel)


def create_plots(output_dir: Path, activities: pd.DataFrame, weekly: pd.DataFrame, records: pd.DataFrame, analysis: Dict) -> Dict[str, str]:
    """Create all PNG charts and return report-relative paths."""

    figures = Path(output_dir) / "figures"
    figures.mkdir(parents=True, exist_ok=True)
    paths = {}

    weekly = weekly.copy()
    if not weekly.empty:
        weekly["week_start"] = pd.to_datetime(weekly["week_start"], errors="coerce")

    chart_specs = [
        ("weekly_hours", "weekly_hours.png", "total_duration_hours", "Volume hebdomadaire", "Heures", COLORS["blue"]),
        ("weekly_distance", "weekly_distance.png", "total_distance_km", "Distance hebdomadaire", "Km", COLORS["green"]),
        ("weekly_ascent", "weekly_ascent.png", "total_ascent_m", "D+ hebdomadaire", "Metres", COLORS["orange"]),
        ("weekly_sessions", "weekly_sessions.png", "activity_count", "Seances par semaine", "Nombre", COLORS["purple"]),
    ]
    for key, filename, column, title, ylabel, color in chart_specs:
        path = figures / filename
        _bar(path, weekly, "week_start", column, title, ylabel, color)
        paths[key] = f"figures/{filename}"

    path = figures / "time_by_sport.png"
    if activities.empty:
        _placeholder(path, "Temps par sport", "Donnees insuffisantes")
    else:
        sport = activities.groupby("sport")["duration_hours"].sum().sort_values(ascending=True).tail(12)
        plt.figure(figsize=(8, 5))
        plt.barh(sport.index, sport.values, color=COLORS["slate"])
        _finish(path, "Temps par sport", "Heures")
    paths["time_by_sport"] = "figures/time_by_sport.png"

    path = figures / "heart_rate_distribution.png"
    hr = pd.Series(dtype=float)
    if not records.empty and "heart_rate_bpm" in records:
        hr = pd.to_numeric(records["heart_rate_bpm"], errors="coerce").dropna()
    elif not activities.empty and "avg_heart_rate_bpm" in activities:
        hr = pd.to_numeric(activities["avg_heart_rate_bpm"], errors="coerce").dropna()
    if hr.empty:
        _placeholder(path, "Distribution des intensites", "Frequence cardiaque indisponible")
    else:
        plt.figure(figsize=(8, 4.8))
        plt.hist(hr, bins=30, color=COLORS["red"], alpha=0.85)
        _finish(path, "Distribution des intensites", "Points")
    paths["heart_rate_distribution"] = "figures/heart_rate_distribution.png"

    path = figures / "long_runs.png"
    long_runs = activities[activities.get("is_long_run", False) == True].copy() if not activities.empty else pd.DataFrame()
    if long_runs.empty:
        _placeholder(path, "Evolution des sorties longues", "Aucune sortie longue selon le seuil configure")
    else:
        long_runs["start_time"] = pd.to_datetime(long_runs["start_time"], errors="coerce")
        plt.figure(figsize=(9, 4.8))
        plt.plot(long_runs["start_time"], long_runs["duration_hours"], marker="o", color=COLORS["blue"])
        _finish(path, "Evolution des sorties longues", "Heures")
    paths["long_runs"] = "figures/long_runs.png"

    path = figures / "estimated_load.png"
    if weekly.empty:
        _placeholder(path, "Charge estimee", "Donnees insuffisantes")
    else:
        plt.figure(figsize=(10, 4.8))
        plt.plot(weekly["week_start"], weekly["estimated_load"], marker="o", color=COLORS["purple"], label="Hebdo")
        if "rolling_7d_load" in weekly:
            plt.plot(weekly["week_start"], weekly["rolling_7d_load"], color=COLORS["orange"], alpha=0.8, label="Rolling 7j")
        plt.legend()
        _finish(path, "Charge estimee", "Charge")
    paths["estimated_load"] = "figures/estimated_load.png"

    path = figures / "duration_histogram.png"
    durations = pd.to_numeric(activities.get("duration_minutes", pd.Series(dtype=float)), errors="coerce").dropna()
    if durations.empty:
        _placeholder(path, "Histogramme des durees", "Donnees insuffisantes")
    else:
        plt.figure(figsize=(8, 4.8))
        plt.hist(durations, bins=24, color=COLORS["green"], alpha=0.85)
        _finish(path, "Histogramme des durees de seance", "Seances")
    paths["duration_histogram"] = "figures/duration_histogram.png"

    path = figures / "trail_specificity.png"
    if weekly.empty:
        _placeholder(path, "Specificite trail", "Donnees insuffisantes")
    else:
        plt.figure(figsize=(10, 4.8))
        plt.plot(weekly["week_start"], weekly["dplus_per_hour"], marker="o", color=COLORS["orange"])
        _finish(path, "Specificite trail: D+ par heure", "m/h")
    paths["trail_specificity"] = "figures/trail_specificity.png"

    zones = analysis.get("heart_rate_zones")
    path = figures / "time_in_zones.png"
    if zones is None or zones.empty:
        _placeholder(path, "Temps en zones FC", "Zones FC non fournies ou donnees FC insuffisantes")
    else:
        plt.figure(figsize=(7, 4.5))
        plt.bar(zones["zone"], zones["minutes"], color=COLORS["red"])
        _finish(path, "Temps estime en zones FC", "Minutes")
    paths["time_in_zones"] = "figures/time_in_zones.png"

    return paths
