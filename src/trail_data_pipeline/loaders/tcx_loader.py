"""TCX activity loader."""

from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

import pandas as pd

from .base import LoadedActivity, LoaderError


def _text(element: ET.Element, path: str) -> Optional[str]:
    found = element.find(path)
    if found is None or found.text is None:
        return None
    return found.text.strip()


def _number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _trackpoint_rows(trackpoints: List[ET.Element], activity_id: str, source_name: str) -> pd.DataFrame:
    rows = []
    for point in trackpoints:
        rows.append(
            {
                "activity_id": activity_id,
                "timestamp": _text(point, "{*}Time"),
                "distance_m": _number(_text(point, "{*}DistanceMeters")),
                "altitude_m": _number(_text(point, "{*}AltitudeMeters")),
                "heart_rate_bpm": _number(_text(point, "{*}HeartRateBpm/{*}Value")),
                "speed_m_s": None,
                "cadence": _number(_text(point, "{*}Cadence")),
                "power_w": None,
                "temperature_c": None,
                "latitude": _number(_text(point, "{*}Position/{*}LatitudeDegrees")),
                "longitude": _number(_text(point, "{*}Position/{*}LongitudeDegrees")),
                "source_file": source_name,
            }
        )
    return pd.DataFrame(rows)


def _lap_rows(laps: List[ET.Element], activity_id: str, source_name: str) -> pd.DataFrame:
    rows = []
    for index, lap in enumerate(laps, start=1):
        rows.append(
            {
                "activity_id": activity_id,
                "lap_index": index,
                "start_time": lap.attrib.get("StartTime"),
                "duration_seconds": _number(_text(lap, "{*}TotalTimeSeconds")),
                "distance_m": _number(_text(lap, "{*}DistanceMeters")),
                "ascent_m": None,
                "descent_m": None,
                "avg_speed_m_s": None,
                "max_speed_m_s": None,
                "avg_heart_rate_bpm": _number(_text(lap, "{*}AverageHeartRateBpm/{*}Value")),
                "max_heart_rate_bpm": _number(_text(lap, "{*}MaximumHeartRateBpm/{*}Value")),
                "avg_cadence": None,
                "avg_power_w": None,
                "calories": _number(_text(lap, "{*}Calories")),
                "source_file": source_name,
            }
        )
    return pd.DataFrame(rows)


def _ascent_descent(records: pd.DataFrame) -> Dict[str, Optional[float]]:
    if records.empty or "altitude_m" not in records:
        return {"ascent_m": None, "descent_m": None}
    altitude = pd.to_numeric(records["altitude_m"], errors="coerce").dropna()
    if altitude.empty:
        return {"ascent_m": None, "descent_m": None}
    delta = altitude.diff().dropna()
    return {
        "ascent_m": float(delta[delta > 0].sum()),
        "descent_m": float((-delta[delta < 0]).sum()),
    }


def load_tcx_file(path: Path, source_name: Optional[str] = None) -> List[LoadedActivity]:
    """Parse one TCX file and return every activity found."""

    source = source_name or str(path)
    root = ET.parse(path).getroot()
    activity_nodes = root.findall(".//{*}Activity")
    if not activity_nodes:
        raise LoaderError(f"No TCX Activity element found in {source}")

    loaded = []
    for index, activity_node in enumerate(activity_nodes, start=1):
        base_id = _text(activity_node, "{*}Id") or Path(source).stem
        activity_id = Path(source).stem if len(activity_nodes) == 1 else f"{Path(source).stem}_{index}"
        sport = (activity_node.attrib.get("Sport") or "unknown").lower()
        lap_nodes = activity_node.findall("{*}Lap")
        trackpoints = activity_node.findall(".//{*}Trackpoint")
        records_df = _trackpoint_rows(trackpoints, activity_id, source)
        laps_df = _lap_rows(lap_nodes, activity_id, source)

        duration = None
        distance = None
        calories = None
        if not laps_df.empty:
            duration = laps_df["duration_seconds"].sum(skipna=True)
            distance = laps_df["distance_m"].max(skipna=True)
            calories = laps_df["calories"].sum(skipna=True)
        if pd.isna(distance) and not records_df.empty:
            distance = records_df["distance_m"].max(skipna=True)

        altitude = pd.to_numeric(records_df.get("altitude_m"), errors="coerce") if not records_df.empty else pd.Series(dtype=float)
        heart_rate = pd.to_numeric(records_df.get("heart_rate_bpm"), errors="coerce") if not records_df.empty else pd.Series(dtype=float)
        ascent = _ascent_descent(records_df)

        warnings = []
        if records_df.empty:
            warnings.append("no_record_stream")

        loaded.append(
            LoadedActivity(
                activity={
                    "activity_id": activity_id,
                    "external_activity_id": base_id,
                    "start_time": _text(activity_node, "{*}Id"),
                    "sport": sport,
                    "duration_seconds": duration,
                    "moving_time_seconds": duration,
                    "distance_m": distance,
                    "ascent_m": ascent["ascent_m"],
                    "descent_m": ascent["descent_m"],
                    "min_altitude_m": altitude.min(skipna=True) if not altitude.empty else None,
                    "max_altitude_m": altitude.max(skipna=True) if not altitude.empty else None,
                    "avg_speed_m_s": (distance / duration) if distance and duration else None,
                    "max_speed_m_s": None,
                    "avg_heart_rate_bpm": heart_rate.mean(skipna=True) if not heart_rate.empty else None,
                    "max_heart_rate_bpm": heart_rate.max(skipna=True) if not heart_rate.empty else None,
                    "avg_cadence": None,
                    "avg_power_w": None,
                    "normalized_power_w": None,
                    "calories": calories,
                    "avg_temperature_c": None,
                    "training_load": None,
                    "gps_available": bool(
                        not records_df.empty
                        and records_df[["latitude", "longitude"]].dropna(how="any").shape[0] > 0
                    ),
                    "source_file": source,
                    "source_format": "tcx",
                },
                records=records_df,
                laps=laps_df,
                warnings=warnings,
            )
        )
    return loaded
