"""Training metrics and aggregations."""

from pathlib import Path
from typing import Dict, Optional

import pandas as pd
import yaml


DEFAULT_CONFIG = {
    "heart_rate_zones": None,
    "long_run_min_minutes": 90,
    "medium_run_min_minutes": 60,
    "significant_ascent_m": 500,
    "rapid_volume_increase_pct": 0.35,
    "rapid_ascent_increase_pct": 0.50,
    "weekend_imbalance_share": 0.70,
    "high_intensity_share_alert": 0.20,
    "monotony_alert": 2.0,
}


def load_config(path: Optional[Path]) -> Dict:
    """Load optional YAML config and merge it with defaults."""

    config = dict(DEFAULT_CONFIG)
    if path is None:
        return config
    with Path(path).open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle) or {}
    config.update(loaded)
    return config


def _numeric(frame: pd.DataFrame, columns):
    frame = frame.copy()
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def _week_start(series: pd.Series) -> pd.Series:
    normalized = pd.to_datetime(series, errors="coerce").dt.normalize()
    return normalized - pd.to_timedelta(normalized.dt.weekday, unit="D")


def _hr_reference(activities: pd.DataFrame, config: Dict) -> Optional[float]:
    zones = config.get("heart_rate_zones")
    if zones:
        upper_bounds = []
        for bounds in zones.values():
            if isinstance(bounds, (list, tuple)) and len(bounds) == 2:
                upper_bounds.append(pd.to_numeric(pd.Series([bounds[1]]), errors="coerce").iloc[0])
        upper_bounds = [value for value in upper_bounds if pd.notna(value)]
        if upper_bounds:
            return float(max(upper_bounds))
    if "max_heart_rate_bpm" not in activities.columns:
        return None
    observed = pd.to_numeric(activities["max_heart_rate_bpm"], errors="coerce").max(skipna=True)
    if pd.notna(observed) and observed > 0:
        return float(observed)
    return None


def add_activity_metrics(activities: pd.DataFrame, config: Dict) -> pd.DataFrame:
    """Add trail, load and regularity columns to activities."""

    if activities.empty:
        return activities.copy()

    frame = activities.copy()
    frame["start_time"] = pd.to_datetime(frame["start_time"], errors="coerce")
    frame = _numeric(
        frame,
        [
            "duration_seconds",
            "duration_minutes",
            "duration_hours",
            "distance_m",
            "distance_km",
            "ascent_m",
            "descent_m",
            "avg_heart_rate_bpm",
            "max_heart_rate_bpm",
            "training_load",
        ],
    )
    frame["date"] = frame["start_time"].dt.date
    frame["day_of_week"] = frame["start_time"].dt.dayofweek
    frame["is_weekend"] = frame["day_of_week"].isin([5, 6])
    frame["dplus_per_hour"] = frame["ascent_m"] / frame["duration_hours"].where(frame["duration_hours"] > 0)
    frame["dplus_per_km"] = frame["ascent_m"] / frame["distance_km"].where(frame["distance_km"] > 0)
    frame["is_long_run"] = frame["duration_minutes"] >= float(config["long_run_min_minutes"])
    frame["is_medium_run"] = frame["duration_minutes"] >= float(config["medium_run_min_minutes"])
    frame["has_significant_ascent"] = frame["ascent_m"] >= float(config["significant_ascent_m"])

    hr_ref = _hr_reference(frame, config)
    if hr_ref:
        factor = (frame["avg_heart_rate_bpm"] / hr_ref).clip(lower=0.5, upper=1.5)
        frame["estimated_load"] = frame["duration_minutes"] * factor
        frame.loc[frame["avg_heart_rate_bpm"].isna(), "estimated_load"] = frame["duration_minutes"]
        frame["estimated_load_method"] = frame["avg_heart_rate_bpm"].apply(
            lambda value: "duration_x_avg_hr_ratio" if pd.notna(value) else "duration_proxy"
        )
    else:
        frame["estimated_load"] = frame["duration_minutes"]
        frame["estimated_load_method"] = "duration_proxy"

    return frame


def add_stream_metrics(activities: pd.DataFrame, records: pd.DataFrame) -> pd.DataFrame:
    """Estimate uphill/downhill time from timestamped altitude streams."""

    frame = activities.copy()
    new_columns = [
        "estimated_uphill_seconds",
        "estimated_downhill_seconds",
        "estimated_uphill_minutes",
        "estimated_uphill_hours",
        "estimated_uphill_share",
    ]
    for column in new_columns:
        frame[column] = pd.NA

    required = {"activity_id", "timestamp", "altitude_m"}
    if records.empty or not required.issubset(records.columns):
        return frame

    stream = records.dropna(subset=["activity_id", "timestamp", "altitude_m"]).copy()
    if stream.empty:
        return frame
    stream["timestamp"] = pd.to_datetime(stream["timestamp"], errors="coerce")
    stream["altitude_m"] = pd.to_numeric(stream["altitude_m"], errors="coerce")
    stream = stream.dropna(subset=["timestamp", "altitude_m"]).sort_values(["activity_id", "timestamp"])
    stream["next_timestamp"] = stream.groupby("activity_id")["timestamp"].shift(-1)
    stream["next_altitude_m"] = stream.groupby("activity_id")["altitude_m"].shift(-1)
    stream["seconds"] = (stream["next_timestamp"] - stream["timestamp"]).dt.total_seconds().clip(lower=0, upper=120)
    stream["altitude_delta_m"] = stream["next_altitude_m"] - stream["altitude_m"]
    stream = stream.dropna(subset=["seconds", "altitude_delta_m"])
    if stream.empty:
        return frame

    stream["uphill_seconds"] = stream["seconds"].where(stream["altitude_delta_m"] > 0.5, 0)
    stream["downhill_seconds"] = stream["seconds"].where(stream["altitude_delta_m"] < -0.5, 0)
    summary = (
        stream.groupby("activity_id", as_index=False)
        .agg(
            estimated_uphill_seconds=("uphill_seconds", "sum"),
            estimated_downhill_seconds=("downhill_seconds", "sum"),
        )
    )
    frame = frame.drop(columns=new_columns).merge(summary, on="activity_id", how="left")
    frame["estimated_uphill_minutes"] = frame["estimated_uphill_seconds"] / 60
    frame["estimated_uphill_hours"] = frame["estimated_uphill_seconds"] / 3600
    frame["estimated_uphill_share"] = frame["estimated_uphill_seconds"] / frame["duration_seconds"].where(
        frame["duration_seconds"] > 0
    )
    return frame


def build_daily_summary(activities: pd.DataFrame) -> pd.DataFrame:
    """Build daily load summary with rolling load values."""

    columns = [
        "date",
        "activity_count",
        "duration_hours",
        "distance_km",
        "ascent_m",
        "descent_m",
        "estimated_load",
        "rolling_7d_load",
        "rolling_28d_load",
        "acute_chronic_ratio",
    ]
    if activities.empty:
        return pd.DataFrame(columns=columns)

    frame = activities.dropna(subset=["start_time"]).copy()
    if frame.empty:
        return pd.DataFrame(columns=columns)

    frame["date"] = pd.to_datetime(frame["start_time"]).dt.normalize()
    daily = (
        frame.groupby("date", as_index=False)
        .agg(
            activity_count=("activity_id", "count"),
            duration_hours=("duration_hours", "sum"),
            distance_km=("distance_km", "sum"),
            ascent_m=("ascent_m", "sum"),
            descent_m=("descent_m", "sum"),
            estimated_load=("estimated_load", "sum"),
        )
        .sort_values("date")
    )

    all_days = pd.date_range(daily["date"].min(), daily["date"].max(), freq="D")
    daily = daily.set_index("date").reindex(all_days, fill_value=0).rename_axis("date").reset_index()
    daily["rolling_7d_load"] = daily["estimated_load"].rolling(7, min_periods=1).sum()
    daily["rolling_28d_load"] = daily["estimated_load"].rolling(28, min_periods=1).sum()
    chronic_weekly = daily["rolling_28d_load"] / 4
    daily["acute_chronic_ratio"] = daily["rolling_7d_load"] / chronic_weekly.where(chronic_weekly > 0)
    return daily[columns]


def build_weekly_summary(activities: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """Aggregate activities by Monday-start weeks."""

    columns = [
        "week_start",
        "activity_count",
        "active_days",
        "total_duration_hours",
        "total_distance_km",
        "total_ascent_m",
        "total_descent_m",
        "avg_duration_hours",
        "longest_duration_hours",
        "longest_distance_km",
        "long_run_count",
        "significant_ascent_count",
        "outdoor_duration_hours",
        "indoor_duration_hours",
        "weekend_duration_hours",
        "weekday_duration_hours",
        "weekend_share",
        "dplus_per_hour",
        "dplus_per_km",
        "estimated_load",
        "rolling_7d_load",
        "rolling_28d_load",
        "acute_chronic_ratio",
        "monotony",
        "strain",
    ]
    if activities.empty:
        return pd.DataFrame(columns=columns)

    frame = activities.dropna(subset=["start_time"]).copy()
    if frame.empty:
        return pd.DataFrame(columns=columns)

    frame["week_start"] = _week_start(frame["start_time"])
    frame["date"] = pd.to_datetime(frame["start_time"]).dt.normalize()
    frame["outdoor_duration_hours"] = frame["duration_hours"].where(frame["is_outdoor"], 0)
    frame["indoor_duration_hours"] = frame["duration_hours"].where(~frame["is_outdoor"], 0)
    frame["weekend_duration_hours"] = frame["duration_hours"].where(frame["is_weekend"], 0)
    frame["weekday_duration_hours"] = frame["duration_hours"].where(~frame["is_weekend"], 0)

    weekly = (
        frame.groupby("week_start", as_index=False)
        .agg(
            activity_count=("activity_id", "count"),
            active_days=("date", "nunique"),
            total_duration_hours=("duration_hours", "sum"),
            total_distance_km=("distance_km", "sum"),
            total_ascent_m=("ascent_m", "sum"),
            total_descent_m=("descent_m", "sum"),
            avg_duration_hours=("duration_hours", "mean"),
            longest_duration_hours=("duration_hours", "max"),
            longest_distance_km=("distance_km", "max"),
            long_run_count=("is_long_run", "sum"),
            significant_ascent_count=("has_significant_ascent", "sum"),
            outdoor_duration_hours=("outdoor_duration_hours", "sum"),
            indoor_duration_hours=("indoor_duration_hours", "sum"),
            weekend_duration_hours=("weekend_duration_hours", "sum"),
            weekday_duration_hours=("weekday_duration_hours", "sum"),
            estimated_load=("estimated_load", "sum"),
        )
        .sort_values("week_start")
    )

    all_weeks = pd.date_range(weekly["week_start"].min(), weekly["week_start"].max(), freq="W-MON")
    if len(all_weeks) and all_weeks[0] != weekly["week_start"].min():
        all_weeks = all_weeks.insert(0, weekly["week_start"].min())
    weekly = weekly.set_index("week_start").reindex(all_weeks, fill_value=0).rename_axis("week_start").reset_index()
    weekly["weekend_share"] = weekly["weekend_duration_hours"] / weekly["total_duration_hours"].where(
        weekly["total_duration_hours"] > 0
    )
    weekly["dplus_per_hour"] = weekly["total_ascent_m"] / weekly["total_duration_hours"].where(
        weekly["total_duration_hours"] > 0
    )
    weekly["dplus_per_km"] = weekly["total_ascent_m"] / weekly["total_distance_km"].where(
        weekly["total_distance_km"] > 0
    )

    if not daily.empty:
        daily_for_week = daily.copy()
        daily_for_week["week_start"] = _week_start(daily_for_week["date"])
        monotony = (
            daily_for_week.groupby("week_start")["estimated_load"]
            .agg(["mean", "std", "sum"])
            .rename(columns={"sum": "week_load"})
        )
        monotony["monotony"] = monotony["mean"] / monotony["std"].where(monotony["std"] > 0)
        monotony["strain"] = monotony["week_load"] * monotony["monotony"]
        weekly = weekly.merge(monotony[["monotony", "strain"]], left_on="week_start", right_index=True, how="left")

        rolling = (
            daily_for_week.sort_values("date")
            .groupby("week_start")
            .tail(1)[["week_start", "rolling_7d_load", "rolling_28d_load", "acute_chronic_ratio"]]
        )
        weekly = weekly.merge(rolling, on="week_start", how="left")
    else:
        weekly["monotony"] = pd.NA
        weekly["strain"] = pd.NA
        weekly["rolling_7d_load"] = pd.NA
        weekly["rolling_28d_load"] = pd.NA
        weekly["acute_chronic_ratio"] = pd.NA

    for column in columns:
        if column not in weekly.columns:
            weekly[column] = pd.NA
    return weekly[columns]


def build_monthly_summary(activities: pd.DataFrame) -> pd.DataFrame:
    """Aggregate activities by month."""

    columns = [
        "month",
        "activity_count",
        "active_days",
        "total_duration_hours",
        "total_distance_km",
        "total_ascent_m",
        "total_descent_m",
        "long_run_count",
        "significant_ascent_count",
        "estimated_load",
    ]
    if activities.empty:
        return pd.DataFrame(columns=columns)
    frame = activities.dropna(subset=["start_time"]).copy()
    if frame.empty:
        return pd.DataFrame(columns=columns)
    frame["month"] = pd.to_datetime(frame["start_time"]).dt.to_period("M").dt.to_timestamp()
    frame["date"] = pd.to_datetime(frame["start_time"]).dt.normalize()
    monthly = (
        frame.groupby("month", as_index=False)
        .agg(
            activity_count=("activity_id", "count"),
            active_days=("date", "nunique"),
            total_duration_hours=("duration_hours", "sum"),
            total_distance_km=("distance_km", "sum"),
            total_ascent_m=("ascent_m", "sum"),
            total_descent_m=("descent_m", "sum"),
            long_run_count=("is_long_run", "sum"),
            significant_ascent_count=("has_significant_ascent", "sum"),
            estimated_load=("estimated_load", "sum"),
        )
        .sort_values("month")
    )
    return monthly[columns]


def heart_rate_zone_distribution(records: pd.DataFrame, config: Dict) -> pd.DataFrame:
    """Estimate time in configured heart-rate zones from record streams."""

    zones = config.get("heart_rate_zones")
    columns = ["zone", "seconds", "minutes", "share"]
    if not zones or records.empty or "heart_rate_bpm" not in records.columns:
        return pd.DataFrame(columns=columns)

    frame = records.dropna(subset=["timestamp", "heart_rate_bpm"]).copy()
    if frame.empty:
        return pd.DataFrame(columns=columns)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
    frame["heart_rate_bpm"] = pd.to_numeric(frame["heart_rate_bpm"], errors="coerce")
    frame = frame.dropna(subset=["timestamp", "heart_rate_bpm"]).sort_values(["activity_id", "timestamp"])
    frame["next_timestamp"] = frame.groupby("activity_id")["timestamp"].shift(-1)
    frame["seconds"] = (frame["next_timestamp"] - frame["timestamp"]).dt.total_seconds()
    frame["seconds"] = frame["seconds"].clip(lower=0, upper=120).fillna(0)

    def assign_zone(value):
        for zone, bounds in zones.items():
            if not isinstance(bounds, (list, tuple)) or len(bounds) != 2:
                continue
            lower, upper = bounds
            if lower <= value <= upper:
                return zone
        return "unclassified"

    frame["zone"] = frame["heart_rate_bpm"].apply(assign_zone)
    summary = frame.groupby("zone", as_index=False)["seconds"].sum()
    total = summary["seconds"].sum()
    summary["minutes"] = summary["seconds"] / 60
    summary["share"] = summary["seconds"] / total if total > 0 else 0
    return summary[columns].sort_values("zone")


def detect_back_to_back(activities: pd.DataFrame, config: Dict) -> pd.DataFrame:
    """Detect consecutive-day medium or long efforts."""

    columns = [
        "start_date",
        "end_date",
        "activity_count",
        "total_duration_hours",
        "total_ascent_m",
        "contains_long_run",
    ]
    if activities.empty:
        return pd.DataFrame(columns=columns)

    threshold = float(config["medium_run_min_minutes"])
    frame = activities.dropna(subset=["start_time"]).copy()
    frame["date"] = pd.to_datetime(frame["start_time"]).dt.normalize()
    daily = (
        frame.groupby("date", as_index=False)
        .agg(
            activity_count=("activity_id", "count"),
            total_duration_minutes=("duration_minutes", "sum"),
            longest_duration_minutes=("duration_minutes", "max"),
            total_duration_hours=("duration_hours", "sum"),
            total_ascent_m=("ascent_m", "sum"),
            contains_long_run=("is_long_run", "max"),
        )
        .sort_values("date")
    )
    daily = daily[daily["longest_duration_minutes"] >= threshold]
    rows = []
    previous = None
    for _, row in daily.iterrows():
        if previous is not None and (row["date"] - previous["date"]).days == 1:
            rows.append(
                {
                    "start_date": previous["date"],
                    "end_date": row["date"],
                    "activity_count": int(previous["activity_count"] + row["activity_count"]),
                    "total_duration_hours": float(previous["total_duration_hours"] + row["total_duration_hours"]),
                    "total_ascent_m": float(previous["total_ascent_m"] + row["total_ascent_m"]),
                    "contains_long_run": bool(previous["contains_long_run"] or row["contains_long_run"]),
                }
            )
        previous = row
    return pd.DataFrame(rows, columns=columns)


def _trend_text(weekly: pd.DataFrame, column: str, label: str) -> str:
    values = pd.to_numeric(weekly[column], errors="coerce").dropna()
    values = values[values > 0]
    if len(values) < 6:
        return f"{label}: tendance insuffisante."
    split = max(1, len(values) // 2)
    first = values.iloc[:split].mean()
    second = values.iloc[split:].mean()
    if first <= 0:
        return f"{label}: tendance insuffisante."
    change = (second - first) / first
    direction = "hausse" if change > 0.05 else "baisse" if change < -0.05 else "stable"
    return f"{label}: {direction} ({change:+.0%} entre premiere et seconde moitie)."


def build_alerts(activities: pd.DataFrame, weekly: pd.DataFrame, zones: pd.DataFrame, config: Dict) -> Dict[str, list]:
    """Build training attention points without medical conclusions."""

    alerts = []
    notes = []
    if weekly.empty:
        return {"alerts": ["Aucune semaine exploitable dans les donnees."], "notes": notes}

    active_weeks = weekly[weekly["activity_count"] > 0].copy()
    if active_weeks.empty:
        return {"alerts": ["Aucune activite exploitable dans la periode."], "notes": notes}

    volume_change = active_weeks["total_duration_hours"].pct_change()
    rapid_volume = active_weeks[volume_change > float(config["rapid_volume_increase_pct"])]
    if not rapid_volume.empty:
        alerts.append(f"{len(rapid_volume)} semaine(s) avec hausse rapide du volume hebdomadaire.")

    ascent_change = active_weeks["total_ascent_m"].replace(0, pd.NA).pct_change()
    rapid_ascent = active_weeks[ascent_change > float(config["rapid_ascent_increase_pct"])]
    if not rapid_ascent.empty:
        alerts.append(f"{len(rapid_ascent)} semaine(s) avec hausse rapide du D+.")

    zero_weeks = weekly[weekly["activity_count"] == 0]
    if not zero_weeks.empty:
        notes.append(f"{len(zero_weeks)} semaine(s) sans activite detectee.")

    if active_weeks["long_run_count"].sum() < max(1, len(active_weeks) / 4):
        alerts.append("Frequence de sorties longues faible pour preparer un trail long.")

    if active_weeks["significant_ascent_count"].sum() < max(1, len(active_weeks) / 4):
        alerts.append("Peu de sorties avec D+ significatif selon le seuil configure.")

    weekend_share = pd.to_numeric(active_weeks["weekend_share"], errors="coerce").mean(skipna=True)
    if pd.notna(weekend_share) and weekend_share > float(config["weekend_imbalance_share"]):
        alerts.append("Volume tres concentre le week-end par rapport aux jours de semaine.")

    high_monotony = active_weeks[pd.to_numeric(active_weeks["monotony"], errors="coerce") > float(config["monotony_alert"])]
    if not high_monotony.empty:
        alerts.append(f"{len(high_monotony)} semaine(s) avec monotonie de charge elevee.")

    rolling_median = active_weeks["estimated_load"].rolling(4, min_periods=2).median()
    isolated_peaks = active_weeks[active_weeks["estimated_load"] > rolling_median * 1.8]
    if not isolated_peaks.empty:
        alerts.append(f"{len(isolated_peaks)} pic(s) isole(s) de charge potentiellement a discuter.")

    if not zones.empty:
        high = zones[zones["zone"].isin(["z4", "z5"])]["share"].sum()
        if high > float(config["high_intensity_share_alert"]):
            alerts.append("Part elevee du temps estime en zones FC hautes.")

    if not alerts:
        alerts.append("Aucun signal majeur detecte par les seuils simples du pipeline.")
    return {"alerts": alerts, "notes": notes}


def compute_analysis(activities: pd.DataFrame, records: pd.DataFrame, config: Dict) -> Dict[str, pd.DataFrame]:
    """Compute all analysis tables."""

    enriched = add_activity_metrics(activities, config)
    enriched = add_stream_metrics(enriched, records)
    daily = build_daily_summary(enriched)
    weekly = build_weekly_summary(enriched, daily)
    monthly = build_monthly_summary(enriched)
    zones = heart_rate_zone_distribution(records, config)
    back_to_back = detect_back_to_back(enriched, config)
    alerts = build_alerts(enriched, weekly, zones, config)

    top_long = enriched.sort_values("duration_minutes", ascending=False).head(10) if not enriched.empty else pd.DataFrame()
    top_ascent = enriched.sort_values("ascent_m", ascending=False).head(10) if not enriched.empty else pd.DataFrame()
    trends = pd.DataFrame(
        [
            {"metric": "volume", "summary": _trend_text(weekly, "total_duration_hours", "Volume")},
            {"metric": "distance", "summary": _trend_text(weekly, "total_distance_km", "Distance")},
            {"metric": "ascent", "summary": _trend_text(weekly, "total_ascent_m", "D+")},
        ]
    )

    return {
        "activities": enriched,
        "daily": daily,
        "weekly": weekly,
        "monthly": monthly,
        "heart_rate_zones": zones,
        "back_to_back": back_to_back,
        "top_long": top_long,
        "top_ascent": top_ascent,
        "trends": trends,
        "alerts": alerts,
    }
