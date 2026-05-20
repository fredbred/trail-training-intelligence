import pandas as pd

from trail_data_pipeline.loaders.base import LoadedActivity
from trail_data_pipeline.normalization import normalize_loaded_activities


def test_normalize_activity_derives_missing_fields_from_records():
    loaded = LoadedActivity(
        activity={
            "activity_id": "a1",
            "start_time": "2026-01-01T10:00:00Z",
            "sport": "running/trail",
            "source_file": "a1.fit",
            "source_format": "fit",
        },
        records=pd.DataFrame(
            [
                {"timestamp": "2026-01-01T10:00:00Z", "distance_m": 0, "altitude_m": 100, "heart_rate_bpm": 120},
                {"timestamp": "2026-01-01T10:05:00Z", "distance_m": 800, "altitude_m": 140, "heart_rate_bpm": 130},
                {"timestamp": "2026-01-01T10:10:00Z", "distance_m": 1500, "altitude_m": 130, "heart_rate_bpm": 128},
            ]
        ),
    )

    activities, records, laps = normalize_loaded_activities([loaded])

    row = activities.iloc[0]
    assert row["duration_seconds"] == 600
    assert row["distance_m"] == 1500
    assert row["ascent_m"] == 40
    assert row["descent_m"] == 10
    assert round(row["avg_heart_rate_bpm"], 1) == 126.0
    assert records.shape[0] == 3
    assert laps.empty


def test_normalize_missing_fields_does_not_crash():
    loaded = LoadedActivity(activity={"activity_id": "minimal"})

    activities, records, laps = normalize_loaded_activities([loaded])

    assert len(activities) == 1
    assert activities.iloc[0]["sport"] == "unknown"
    assert "no_duration" in activities.iloc[0]["data_quality"]
    assert records.empty
    assert laps.empty
