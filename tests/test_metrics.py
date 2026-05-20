import pandas as pd

from trail_data_pipeline.metrics import DEFAULT_CONFIG, compute_analysis


def test_weekly_aggregation_sums_volume_and_distance():
    activities = pd.DataFrame(
        [
            {
                "activity_id": "a1",
                "start_time": "2026-01-05T07:00:00",
                "sport": "running",
                "duration_seconds": 3600,
                "duration_minutes": 60,
                "duration_hours": 1,
                "distance_km": 10,
                "ascent_m": 200,
                "descent_m": 180,
                "avg_heart_rate_bpm": 140,
                "max_heart_rate_bpm": 170,
                "gps_available": True,
                "is_outdoor": True,
            },
            {
                "activity_id": "a2",
                "start_time": "2026-01-06T07:00:00",
                "sport": "running",
                "duration_seconds": 5400,
                "duration_minutes": 90,
                "duration_hours": 1.5,
                "distance_km": 15,
                "ascent_m": 500,
                "descent_m": 450,
                "avg_heart_rate_bpm": 145,
                "max_heart_rate_bpm": 175,
                "gps_available": True,
                "is_outdoor": True,
            },
        ]
    )

    analysis = compute_analysis(activities, pd.DataFrame(), dict(DEFAULT_CONFIG))
    weekly = analysis["weekly"]

    assert len(weekly) == 1
    assert weekly.iloc[0]["activity_count"] == 2
    assert weekly.iloc[0]["total_duration_hours"] == 2.5
    assert weekly.iloc[0]["total_distance_km"] == 25
    assert weekly.iloc[0]["total_ascent_m"] == 700
    assert weekly.iloc[0]["long_run_count"] == 1


def test_unknown_or_empty_data_returns_empty_summaries():
    analysis = compute_analysis(pd.DataFrame(), pd.DataFrame(), dict(DEFAULT_CONFIG))

    assert analysis["weekly"].empty
    assert analysis["monthly"].empty
    assert analysis["back_to_back"].empty
