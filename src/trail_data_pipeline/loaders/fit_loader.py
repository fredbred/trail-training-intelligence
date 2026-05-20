"""FIT activity loader."""

import warnings as warnings_module
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from .base import LoadedActivity, LoaderError, MissingDependencyError


def _load_fitfile_class():
    try:
        from fitparse import FitFile
    except ImportError as exc:
        raise MissingDependencyError(
            "Cannot read FIT files because `fitparse` is not installed. "
            "Install the project with `python3 -m pip install -e .`."
        ) from exc
    return FitFile


def _load_fitdecode_module():
    try:
        import fitdecode
    except ImportError as exc:
        raise MissingDependencyError(
            "Cannot read FIT files because neither `fitparse` nor `fitdecode` is installed. "
            "Install the project with `python3 -m pip install -e .`."
        ) from exc
    return fitdecode


def _message_values(message: Any) -> Dict[str, Any]:
    try:
        return dict(message.get_values())
    except Exception:
        values = {}
        for field in getattr(message, "fields", []):
            values[field.name] = field.value
        return values


def _first(values: Dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        value = values.get(name)
        if value is not None and value != "":
            return value
    return None


def _number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, timedelta):
        return float(value.total_seconds())
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _seconds(value: Any) -> Optional[float]:
    return _number(value)


def _semicircles_to_degrees(value: Any) -> Optional[float]:
    number = _number(value)
    if number is None:
        return None
    return number * (180.0 / 2**31)


def _sport_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value).strip().lower().replace(" ", "_")


def _sport_name(session: Dict[str, Any]) -> str:
    sport = _sport_value(session.get("sport"))
    sub_sport = _sport_value(session.get("sub_sport"))
    if sport and sub_sport and sub_sport not in {"generic", "none"}:
        return f"{sport}/{sub_sport}"
    if sport:
        return sport
    return "unknown"


def _fitdecode_message_values(message: Any) -> Dict[str, Any]:
    return {field.name: field.value for field in getattr(message, "fields", [])}


def _build_loaded_activity(
    sessions: List[Dict[str, Any]],
    records: List[Dict[str, Any]],
    laps: List[Dict[str, Any]],
    source: str,
    parser_warnings: Optional[List[str]] = None,
) -> LoadedActivity:
    activity_id = Path(source).stem
    session = sessions[-1] if sessions else {}
    records_df = _records_from_messages(records, activity_id, source)
    laps_df = _laps_from_messages(laps, activity_id, source)

    start_time = _first(session, ["start_time", "timestamp"])
    if start_time is None and not records_df.empty and "timestamp" in records_df:
        start_time = records_df["timestamp"].dropna().min()

    warnings = list(parser_warnings or [])
    if not sessions:
        warnings.append("no_session_message")
    if records_df.empty:
        warnings.append("no_record_stream")

    activity = {
        "activity_id": activity_id,
        "start_time": start_time,
        "sport": _sport_name(session),
        "duration_seconds": _seconds(_first(session, ["total_timer_time", "total_elapsed_time"])),
        "moving_time_seconds": _seconds(session.get("total_timer_time")),
        "distance_m": _number(session.get("total_distance")),
        "ascent_m": _number(session.get("total_ascent")),
        "descent_m": _number(session.get("total_descent")),
        "min_altitude_m": _number(_first(session, ["enhanced_min_altitude", "min_altitude"])),
        "max_altitude_m": _number(_first(session, ["enhanced_max_altitude", "max_altitude"])),
        "avg_speed_m_s": _number(_first(session, ["enhanced_avg_speed", "avg_speed"])),
        "max_speed_m_s": _number(_first(session, ["enhanced_max_speed", "max_speed"])),
        "avg_heart_rate_bpm": _number(session.get("avg_heart_rate")),
        "max_heart_rate_bpm": _number(session.get("max_heart_rate")),
        "avg_cadence": _number(_first(session, ["avg_cadence", "avg_running_cadence"])),
        "avg_power_w": _number(session.get("avg_power")),
        "normalized_power_w": _number(_first(session, ["normalized_power", "normalized_power_w"])),
        "calories": _number(session.get("total_calories")),
        "avg_temperature_c": _number(session.get("avg_temperature")),
        "training_load": _number(
            _first(
                session,
                [
                    "training_load",
                    "training_stress_score",
                    "total_training_effect",
                    "total_anaerobic_training_effect",
                ],
            )
        ),
        "gps_available": bool(
            not records_df.empty
            and records_df[["latitude", "longitude"]].dropna(how="any").shape[0] > 0
        ),
        "source_file": source,
        "source_format": "fit",
    }

    return LoadedActivity(activity=activity, records=records_df, laps=laps_df, warnings=warnings)


def _records_from_messages(messages: List[Dict[str, Any]], activity_id: str, source_name: str) -> pd.DataFrame:
    rows = []
    for values in messages:
        rows.append(
            {
                "activity_id": activity_id,
                "timestamp": values.get("timestamp"),
                "distance_m": _number(values.get("distance")),
                "altitude_m": _number(_first(values, ["enhanced_altitude", "altitude"])),
                "heart_rate_bpm": _number(values.get("heart_rate")),
                "speed_m_s": _number(_first(values, ["enhanced_speed", "speed"])),
                "cadence": _number(_first(values, ["cadence", "running_cadence"])),
                "power_w": _number(values.get("power")),
                "temperature_c": _number(values.get("temperature")),
                "latitude": _semicircles_to_degrees(values.get("position_lat")),
                "longitude": _semicircles_to_degrees(values.get("position_long")),
                "source_file": source_name,
            }
        )
    return pd.DataFrame(rows)


def _laps_from_messages(messages: List[Dict[str, Any]], activity_id: str, source_name: str) -> pd.DataFrame:
    rows = []
    for index, values in enumerate(messages, start=1):
        rows.append(
            {
                "activity_id": activity_id,
                "lap_index": index,
                "start_time": values.get("start_time"),
                "duration_seconds": _seconds(_first(values, ["total_timer_time", "total_elapsed_time"])),
                "distance_m": _number(values.get("total_distance")),
                "ascent_m": _number(values.get("total_ascent")),
                "descent_m": _number(values.get("total_descent")),
                "avg_speed_m_s": _number(_first(values, ["enhanced_avg_speed", "avg_speed"])),
                "max_speed_m_s": _number(_first(values, ["enhanced_max_speed", "max_speed"])),
                "avg_heart_rate_bpm": _number(values.get("avg_heart_rate")),
                "max_heart_rate_bpm": _number(values.get("max_heart_rate")),
                "avg_cadence": _number(_first(values, ["avg_cadence", "avg_running_cadence"])),
                "avg_power_w": _number(values.get("avg_power")),
                "calories": _number(values.get("total_calories")),
                "source_file": source_name,
            }
        )
    return pd.DataFrame(rows)


def _load_fitparse_file(path: Path, source: str) -> LoadedActivity:
    FitFile = _load_fitfile_class()

    fit = FitFile(str(path))
    sessions = [_message_values(message) for message in fit.get_messages("session")]
    records = [_message_values(message) for message in fit.get_messages("record")]
    laps = [_message_values(message) for message in fit.get_messages("lap")]
    return _build_loaded_activity(sessions, records, laps, source)


def _load_fitdecode_file(path: Path, source: str, previous_error: str = None) -> LoadedActivity:
    fitdecode = _load_fitdecode_module()
    messages = {"session": [], "record": [], "lap": []}
    parser_warnings = []
    if previous_error:
        parser_warnings.append(f"fitparse_failed:{previous_error}")

    with warnings_module.catch_warnings(record=True) as caught:
        warnings_module.simplefilter("always")
        with fitdecode.FitReader(str(path)) as reader:
            for frame in reader:
                if isinstance(frame, fitdecode.records.FitDataMessage) and frame.name in messages:
                    messages[frame.name].append(_fitdecode_message_values(frame))
        parser_warnings.extend(str(item.message) for item in caught)

    return _build_loaded_activity(
        messages["session"],
        messages["record"],
        messages["lap"],
        source,
        parser_warnings=parser_warnings,
    )


def load_fit_file(path: Path, source_name: Optional[str] = None) -> LoadedActivity:
    """Parse one FIT activity file, with a tolerant fallback parser."""

    source = source_name or str(path)
    try:
        return _load_fitparse_file(path, source)
    except MissingDependencyError as exc:
        fitparse_error = str(exc)
    except Exception as exc:
        fitparse_error = str(exc)

    try:
        return _load_fitdecode_file(path, source, previous_error=fitparse_error)
    except MissingDependencyError:
        raise
    except Exception as exc:
        raise LoaderError(f"FIT parse failed with fitparse ({fitparse_error}) and fitdecode ({exc})") from exc
