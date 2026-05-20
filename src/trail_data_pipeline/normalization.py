"""Normalize loaded activities into stable tables."""

from typing import Iterable, List, Tuple

import pandas as pd

from .loaders.base import LoadedActivity


ACTIVITY_COLUMNS = [
    "activity_id",
    "external_activity_id",
    "start_time",
    "date",
    "sport",
    "duration_seconds",
    "duration_minutes",
    "duration_hours",
    "moving_time_seconds",
    "distance_m",
    "distance_km",
    "ascent_m",
    "descent_m",
    "min_altitude_m",
    "max_altitude_m",
    "avg_pace_min_per_km",
    "avg_speed_m_s",
    "avg_speed_kmh",
    "max_speed_m_s",
    "avg_heart_rate_bpm",
    "max_heart_rate_bpm",
    "avg_cadence",
    "avg_power_w",
    "normalized_power_w",
    "calories",
    "avg_temperature_c",
    "training_load",
    "gps_available",
    "is_outdoor",
    "source_file",
    "source_format",
    "data_quality",
    "completeness_score",
]

RECORD_COLUMNS = [
    "activity_id",
    "timestamp",
    "distance_m",
    "altitude_m",
    "heart_rate_bpm",
    "speed_m_s",
    "cadence",
    "power_w",
    "temperature_c",
    "latitude",
    "longitude",
    "source_file",
]

LAP_COLUMNS = [
    "activity_id",
    "lap_index",
    "start_time",
    "duration_seconds",
    "distance_m",
    "ascent_m",
    "descent_m",
    "avg_speed_m_s",
    "max_speed_m_s",
    "avg_heart_rate_bpm",
    "max_heart_rate_bpm",
    "avg_cadence",
    "avg_power_w",
    "calories",
    "source_file",
]


def _ensure_columns(frame: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
    frame = frame.copy()
    for column in columns:
        if column not in frame.columns:
            frame[column] = pd.NA
    return frame[columns]


def _to_datetime(value):
    if value is None or value is pd.NA or value == "":
        return pd.NaT
    parsed = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(parsed):
        return pd.NaT
    return parsed.tz_convert(None)


def _to_datetime_series(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", utc=True)
    return parsed.dt.tz_convert(None)


def _numeric(frame: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    frame = frame.copy()
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def _derive_ascent_descent(records: pd.DataFrame) -> Tuple[float, float]:
    if records.empty or "altitude_m" not in records:
        return pd.NA, pd.NA
    altitude = pd.to_numeric(records["altitude_m"], errors="coerce").dropna()
    if altitude.empty:
        return pd.NA, pd.NA
    delta = altitude.diff().dropna()
    return float(delta[delta > 0].sum()), float((-delta[delta < 0]).sum())


def _quality_flags(activity: dict, records: pd.DataFrame) -> str:
    flags = []
    if pd.isna(activity.get("start_time")):
        flags.append("no_start_time")
    if pd.isna(activity.get("duration_seconds")):
        flags.append("no_duration")
    if pd.isna(activity.get("distance_m")):
        flags.append("no_distance")
    if pd.isna(activity.get("ascent_m")):
        flags.append("no_ascent")
    if pd.isna(activity.get("avg_heart_rate_bpm")):
        flags.append("no_hr")
    if not bool(activity.get("gps_available")):
        flags.append("no_gps")
    if records.empty:
        flags.append("no_stream")
    return ";".join(flags) if flags else "ok"


def _completeness_score(activity: dict) -> float:
    fields = [
        "start_time",
        "sport",
        "duration_seconds",
        "distance_m",
        "ascent_m",
        "descent_m",
        "avg_heart_rate_bpm",
        "max_heart_rate_bpm",
        "gps_available",
    ]
    present = 0
    for field in fields:
        value = activity.get(field)
        if field == "gps_available":
            present += int(bool(value))
        elif value is not None and not pd.isna(value):
            present += 1
    return round(present / len(fields), 3)


def _normalize_records(records: pd.DataFrame, activity_id: str) -> pd.DataFrame:
    records = _ensure_columns(records, RECORD_COLUMNS)
    records["activity_id"] = activity_id
    records["timestamp"] = _to_datetime_series(records["timestamp"])
    records = _numeric(
        records,
        [
            "distance_m",
            "altitude_m",
            "heart_rate_bpm",
            "speed_m_s",
            "cadence",
            "power_w",
            "temperature_c",
            "latitude",
            "longitude",
        ],
    )
    return records


def _normalize_laps(laps: pd.DataFrame, activity_id: str) -> pd.DataFrame:
    laps = _ensure_columns(laps, LAP_COLUMNS)
    laps["activity_id"] = activity_id
    laps["start_time"] = _to_datetime_series(laps["start_time"])
    return _numeric(
        laps,
        [
            "duration_seconds",
            "distance_m",
            "ascent_m",
            "descent_m",
            "avg_speed_m_s",
            "max_speed_m_s",
            "avg_heart_rate_bpm",
            "max_heart_rate_bpm",
            "avg_cadence",
            "avg_power_w",
            "calories",
        ],
    )


def _normalize_activity(activity: dict, records: pd.DataFrame) -> dict:
    row = dict(activity)
    row["activity_id"] = str(row.get("activity_id") or row.get("source_file") or "unknown")
    row["sport"] = str(row.get("sport") or "unknown")
    row["start_time"] = _to_datetime(row.get("start_time"))

    numeric_fields = [
        "duration_seconds",
        "moving_time_seconds",
        "distance_m",
        "ascent_m",
        "descent_m",
        "min_altitude_m",
        "max_altitude_m",
        "avg_speed_m_s",
        "max_speed_m_s",
        "avg_heart_rate_bpm",
        "max_heart_rate_bpm",
        "avg_cadence",
        "avg_power_w",
        "normalized_power_w",
        "calories",
        "avg_temperature_c",
        "training_load",
    ]
    for field in numeric_fields:
        row[field] = pd.to_numeric(pd.Series([row.get(field)]), errors="coerce").iloc[0]

    if pd.isna(row["duration_seconds"]) and not records.empty:
        timestamps = records["timestamp"].dropna()
        if not timestamps.empty:
            row["duration_seconds"] = (timestamps.max() - timestamps.min()).total_seconds()
    if pd.isna(row["moving_time_seconds"]):
        row["moving_time_seconds"] = row["duration_seconds"]
    if pd.isna(row["distance_m"]) and not records.empty:
        row["distance_m"] = records["distance_m"].max(skipna=True)

    derived_ascent, derived_descent = _derive_ascent_descent(records)
    if pd.isna(row["ascent_m"]):
        row["ascent_m"] = derived_ascent
    if pd.isna(row["descent_m"]):
        row["descent_m"] = derived_descent

    if pd.isna(row["min_altitude_m"]) and not records.empty:
        row["min_altitude_m"] = records["altitude_m"].min(skipna=True)
    if pd.isna(row["max_altitude_m"]) and not records.empty:
        row["max_altitude_m"] = records["altitude_m"].max(skipna=True)
    if pd.isna(row["avg_heart_rate_bpm"]) and not records.empty:
        row["avg_heart_rate_bpm"] = records["heart_rate_bpm"].mean(skipna=True)
    if pd.isna(row["max_heart_rate_bpm"]) and not records.empty:
        row["max_heart_rate_bpm"] = records["heart_rate_bpm"].max(skipna=True)
    if pd.isna(row["avg_speed_m_s"]) and row.get("distance_m") and row.get("duration_seconds"):
        row["avg_speed_m_s"] = row["distance_m"] / row["duration_seconds"]

    row["duration_minutes"] = row["duration_seconds"] / 60 if pd.notna(row["duration_seconds"]) else pd.NA
    row["duration_hours"] = row["duration_seconds"] / 3600 if pd.notna(row["duration_seconds"]) else pd.NA
    row["distance_km"] = row["distance_m"] / 1000 if pd.notna(row["distance_m"]) else pd.NA
    row["avg_speed_kmh"] = row["avg_speed_m_s"] * 3.6 if pd.notna(row["avg_speed_m_s"]) else pd.NA
    if pd.notna(row["duration_minutes"]) and pd.notna(row["distance_km"]) and row["distance_km"] > 0:
        row["avg_pace_min_per_km"] = row["duration_minutes"] / row["distance_km"]
    else:
        row["avg_pace_min_per_km"] = pd.NA

    has_gps_stream = bool(
        not records.empty and records[["latitude", "longitude"]].dropna(how="any").shape[0] > 0
    )
    row["gps_available"] = bool(row.get("gps_available")) or has_gps_stream
    indoor_tokens = ["indoor", "treadmill", "trainer", "virtual", "strength", "training", "gym", "pool"]
    outdoor_tokens = ["run", "running", "trail", "hiking", "walk", "ride", "cycling", "bike"]
    sport_name = row["sport"].lower()
    row["is_outdoor"] = bool(row["gps_available"]) or (
        any(token in sport_name for token in outdoor_tokens)
        and not any(token in sport_name for token in indoor_tokens)
    )
    row["date"] = row["start_time"].date() if pd.notna(row["start_time"]) else pd.NaT
    row["data_quality"] = _quality_flags(row, records)
    row["completeness_score"] = _completeness_score(row)

    for column in ACTIVITY_COLUMNS:
        row.setdefault(column, pd.NA)
    return {column: row[column] for column in ACTIVITY_COLUMNS}


def normalize_loaded_activities(activities: List[LoadedActivity]):
    """Normalize loaded activities into activities, records and laps tables."""

    activity_rows = []
    record_frames = []
    lap_frames = []

    for loaded in activities:
        activity_id = str(loaded.activity.get("activity_id") or loaded.activity.get("source_file") or "unknown")
        records = _normalize_records(loaded.records, activity_id)
        laps = _normalize_laps(loaded.laps, activity_id)
        activity_rows.append(_normalize_activity(loaded.activity, records))
        if not records.empty:
            record_frames.append(records)
        if not laps.empty:
            lap_frames.append(laps)

    activities_df = pd.DataFrame(activity_rows, columns=ACTIVITY_COLUMNS)
    records_df = pd.concat(record_frames, ignore_index=True) if record_frames else pd.DataFrame(columns=RECORD_COLUMNS)
    laps_df = pd.concat(lap_frames, ignore_index=True) if lap_frames else pd.DataFrame(columns=LAP_COLUMNS)
    return activities_df, records_df, laps_df
