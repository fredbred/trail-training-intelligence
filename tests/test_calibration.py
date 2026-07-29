import pandas as pd
import pytest

from trail_data_pipeline.calibration import (
    CalibratedPaceModel,
    build_gradient_profile,
    fit_calibration,
    load_calibration,
    render_calibration_markdown,
    save_calibration,
)
from trail_data_pipeline.cli import main
from trail_data_pipeline.pacing import MinettiModel


def make_records(chunks, activity_id="a1", start="2026-05-01T08:00:00"):
    """Build a records frame from (n_steps, speed_m_s, gradient) chunks.

    Points sit on an exact 25 m distance grid so expectations are exact.
    """

    rows = []
    distance = 0.0
    altitude = 1000.0
    clock = pd.Timestamp(start)
    rows.append(
        {"activity_id": activity_id, "timestamp": clock, "distance_m": 0.0, "altitude_m": altitude}
    )
    for steps, speed, gradient in chunks:
        for _ in range(steps):
            distance += 25.0
            altitude += gradient * 25.0
            clock += pd.Timedelta(seconds=25.0 / speed)
            rows.append(
                {
                    "activity_id": activity_id,
                    "timestamp": clock,
                    "distance_m": distance,
                    "altitude_m": altitude,
                }
            )
    return pd.DataFrame(rows)


def make_activities(entries=(("a1", "running"),)):
    return pd.DataFrame([{"activity_id": aid, "sport": sport} for aid, sport in entries])


def bin_row(profile, gradient):
    return profile[(profile["gradient"] - gradient).abs() < 1e-9].iloc[0]


def test_build_gradient_profile_recovers_known_speeds():
    records = make_records([(40, 3.0, 0.0), (40, 1.5, 0.10), (40, 4.0, -0.10)])

    profile = build_gradient_profile(records, make_activities())

    assert bin_row(profile, 0.0)["median_speed_m_s"] == pytest.approx(3.0, rel=1e-6)
    assert bin_row(profile, 0.10)["pace_factor"] == pytest.approx(2.0, rel=1e-6)
    assert bin_row(profile, -0.10)["pace_factor"] == pytest.approx(0.75, rel=1e-6)


def test_build_gradient_profile_filters_stopped_points():
    moving = make_records([(40, 3.0, 0.0)])
    with_stop = make_records([(40, 3.0, 0.0), (10, 0.1, 0.0)], activity_id="a2")
    profile_moving = build_gradient_profile(moving, make_activities())
    profile_mixed = build_gradient_profile(with_stop, make_activities((("a2", "running"),)))

    flat_moving = bin_row(profile_moving, 0.0)
    flat_mixed = bin_row(profile_mixed, 0.0)
    assert flat_mixed["median_speed_m_s"] == pytest.approx(flat_moving["median_speed_m_s"])
    assert flat_mixed["n_samples"] == flat_moving["n_samples"]


def test_build_gradient_profile_ignores_non_running_sports():
    records = pd.concat(
        [
            make_records([(40, 3.0, 0.0)], activity_id="run1"),
            make_records([(40, 9.0, 0.0)], activity_id="bike1"),
        ]
    )
    activities = make_activities((("run1", "running"), ("bike1", "cycling")))

    profile = build_gradient_profile(records, activities)

    assert bin_row(profile, 0.0)["median_speed_m_s"] == pytest.approx(3.0, rel=1e-6)


def test_fit_calibration_drops_sparse_bins_and_compares_to_minetti():
    records = make_records([(200, 3.0, 0.0), (200, 1.5, 0.10), (4, 2.0, 0.20)])

    calibration = fit_calibration(
        build_gradient_profile(records, make_activities()), min_samples_per_bin=10
    )

    gradients = calibration.bins["gradient"].tolist()
    assert 0.20 not in gradients
    assert calibration.flat_speed_m_s == pytest.approx(3.0, rel=1e-6)
    assert calibration.total_samples >= 400
    assert calibration.minetti_median_abs_dev_pct >= 0.0


def test_calibrated_model_interpolates_inside_and_falls_back_outside():
    records = make_records([(200, 3.0, 0.0), (200, 2.0, 0.05), (200, 1.5, 0.10)])
    calibration = fit_calibration(
        build_gradient_profile(records, make_activities()), min_samples_per_bin=10
    )
    model = CalibratedPaceModel(calibration=calibration, fallback=MinettiModel())

    assert model.factor(0.10) == pytest.approx(2.0, rel=1e-3)
    assert 1.5 < model.factor(0.075) < 2.0
    assert model.factor(0.30) == pytest.approx(MinettiModel().factor(0.30))


def test_calibration_json_round_trip(tmp_path):
    records = make_records([(200, 3.0, 0.0), (200, 1.5, 0.10)])
    calibration = fit_calibration(
        build_gradient_profile(records, make_activities()), min_samples_per_bin=10
    )
    path = tmp_path / "calibration.json"

    save_calibration(calibration, path)
    loaded = load_calibration(path)

    original = CalibratedPaceModel(calibration=calibration)
    restored = CalibratedPaceModel(calibration=loaded)
    for gradient in [-0.05, 0.0, 0.08, 0.10]:
        assert restored.factor(gradient) == pytest.approx(original.factor(gradient))


def test_render_calibration_markdown_reports_bins_and_minetti(tmp_path):
    records = make_records([(200, 3.0, 0.0), (200, 1.5, 0.10)])
    calibration = fit_calibration(
        build_gradient_profile(records, make_activities()), min_samples_per_bin=10
    )

    markdown = render_calibration_markdown(calibration)

    assert "Minetti" in markdown
    assert "10" in markdown
    assert "chantillons" in markdown


def test_cli_calibrate_writes_json_and_markdown(tmp_path):
    records = make_records([(200, 3.0, 0.0), (200, 1.5, 0.10)])
    records.to_csv(tmp_path / "records.csv", index=False)
    make_activities().to_csv(tmp_path / "activities.csv", index=False)
    output_dir = tmp_path / "out"

    exit_code = main(
        [
            "calibrate",
            "--records",
            str(tmp_path / "records.csv"),
            "--activities",
            str(tmp_path / "activities.csv"),
            "--min-samples",
            "10",
            "--output",
            str(output_dir),
        ]
    )

    assert exit_code == 0
    assert (output_dir / "calibration.json").exists()
    assert (output_dir / "calibration.md").exists()


def test_cli_pacing_uses_calibration_model(tmp_path):
    records = make_records([(200, 3.0, 0.0), (200, 1.5, 0.10)])
    calibration = fit_calibration(
        build_gradient_profile(records, make_activities()), min_samples_per_bin=10
    )
    model_path = tmp_path / "calibration.json"
    save_calibration(calibration, model_path)

    points = "".join(
        f'<trkpt lat="{45.0 + i * 0.001:.6f}" lon="6.0"><ele>{1000.0 + 8 * i}</ele></trkpt>'
        for i in range(31)
    )
    gpx_path = tmp_path / "course.gpx"
    gpx_path.write_text(
        '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">'
        f"<trk><name>Course</name><trkseg>{points}</trkseg></trk></gpx>",
        encoding="utf-8",
    )
    output_dir = tmp_path / "out"
    exit_code = main(
        [
            "pacing",
            "--course",
            str(gpx_path),
            "--flat-pace",
            "6:00",
            "--model",
            str(model_path),
            "--output",
            str(output_dir),
        ]
    )

    assert exit_code == 0
    content = (output_dir / "pacing_plan.md").read_text(encoding="utf-8")
    assert "calibration personnelle" in content
