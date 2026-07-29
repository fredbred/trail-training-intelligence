import math

import pytest

from trail_data_pipeline.cli import main
from trail_data_pipeline.pacing import (
    build_pacing_plan,
    build_segments,
    format_hms,
    format_pace,
    pace_factor,
    parse_duration_min,
    parse_gpx_course,
    parse_pace_min_per_km,
    render_pacing_markdown,
)

GPX_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>{name}</name>
    <trkseg>
{points}
    </trkseg>
  </trk>
</gpx>
"""

STEP_DEG = 0.001  # ~111.2 m of latitude per step
STEP_M = 111.19


def write_gpx(tmp_path, elevations, name="Synthetic course"):
    points = "\n".join(
        f'      <trkpt lat="{45.0 + index * STEP_DEG:.6f}" lon="6.0">'
        + (f"<ele>{elevation}</ele>" if elevation is not None else "")
        + "</trkpt>"
        for index, elevation in enumerate(elevations)
    )
    path = tmp_path / "course.gpx"
    path.write_text(GPX_TEMPLATE.format(name=name, points=points), encoding="utf-8")
    return path


def test_parse_gpx_course_computes_cumulative_distance_and_elevation(tmp_path):
    path = write_gpx(tmp_path, [1000.0, 1010.0, 1005.0], name="Col synthetique")

    course = parse_gpx_course(path)

    assert course.name == "Col synthetique"
    assert list(course.points.columns) >= ["distance_m", "elevation_m"]
    assert course.points["distance_m"].iloc[0] == 0.0
    assert course.points["distance_m"].iloc[1] == pytest.approx(STEP_M, rel=0.01)
    assert course.points["distance_m"].iloc[2] == pytest.approx(2 * STEP_M, rel=0.01)
    assert course.points["elevation_m"].tolist() == [1000.0, 1010.0, 1005.0]


def test_parse_gpx_course_flags_missing_elevation(tmp_path):
    path = write_gpx(tmp_path, [1000.0, None, 1005.0])

    course = parse_gpx_course(path)

    assert any("elevation" in note for note in course.quality_notes)


def test_pace_factor_flat_is_one():
    assert pace_factor(0.0) == pytest.approx(1.0)


def test_pace_factor_uphill_matches_minetti_cost_ratio():
    # Minetti et al. 2002 cost at +10%: 5.968 J/kg/m vs 3.6 flat.
    assert pace_factor(0.10) == pytest.approx(5.968 / 3.6, rel=1e-3)


def test_pace_factor_gentle_downhill_is_faster_than_flat():
    assert pace_factor(-0.02) == pytest.approx(0.897, rel=1e-2)
    assert pace_factor(-0.02) < 1.0


def test_pace_factor_steep_downhill_is_floored_not_energy_optimal():
    # The raw energy model predicts ~0.60 at -10%; descents are floored
    # because technique and impact tolerance, not energy, limit speed.
    assert pace_factor(-0.10) == pytest.approx(0.85)
    assert pace_factor(-0.10, min_descent_factor=0.9) == pytest.approx(0.9)


def test_pace_factor_clamps_gradient_to_model_validity_range():
    assert pace_factor(0.60) == pytest.approx(pace_factor(0.45))
    assert not math.isnan(pace_factor(-0.60))


def test_build_segments_splits_course_at_exact_boundaries(tmp_path):
    # 10 steps of ~111.19 m climbing 5 m each: ~1111.9 m total, +50 m.
    course = parse_gpx_course(write_gpx(tmp_path, [1000.0 + 5 * i for i in range(11)]))

    segments = build_segments(course, segment_m=500.0)

    assert len(segments) == 3
    assert segments["distance_m"].iloc[0] == pytest.approx(500.0, rel=1e-6)
    assert segments["distance_m"].iloc[1] == pytest.approx(500.0, rel=1e-6)
    assert segments["distance_m"].iloc[2] == pytest.approx(10 * STEP_M - 1000.0, rel=0.01)
    assert segments["distance_m"].sum() == pytest.approx(10 * STEP_M, rel=0.01)
    assert segments["ascent_m"].sum() == pytest.approx(50.0, rel=1e-6)
    assert segments["descent_m"].sum() == pytest.approx(0.0, abs=1e-6)


def test_build_segments_merges_trailing_sliver_into_last_segment(tmp_path):
    # 9 steps of ~111.19 m: ~1000.7 m. The 0.7 m residue past the second
    # boundary must not become its own zero-length segment row.
    course = parse_gpx_course(write_gpx(tmp_path, [1000.0] * 10))

    segments = build_segments(course, segment_m=500.0)

    assert len(segments) == 2
    assert segments["distance_m"].iloc[-1] == pytest.approx(9 * STEP_M - 500.0, rel=0.01)
    assert segments["distance_m"].sum() == pytest.approx(9 * STEP_M, rel=0.01)
    assert segments["end_m"].iloc[-1] == pytest.approx(9 * STEP_M, rel=0.01)


def test_build_segments_weights_gradient_not_net_elevation(tmp_path):
    # Up 40 m then down 40 m inside a single segment: net zero elevation,
    # but a rolling segment must still cost more than flat.
    course = parse_gpx_course(
        write_gpx(
            tmp_path, [1000.0, 1010.0, 1020.0, 1030.0, 1040.0, 1030.0, 1020.0, 1010.0, 1000.0]
        )
    )

    segments = build_segments(course, segment_m=2000.0)

    assert len(segments) == 1
    assert segments["ascent_m"].iloc[0] == pytest.approx(40.0)
    assert segments["descent_m"].iloc[0] == pytest.approx(40.0)
    assert segments["avg_gradient"].iloc[0] == pytest.approx(0.0, abs=1e-6)
    assert segments["pace_factor"].iloc[0] > 1.0


def test_build_pacing_plan_flat_pace_mode(tmp_path):
    course = parse_gpx_course(write_gpx(tmp_path, [1000.0] * 11))
    segments = build_segments(course, segment_m=500.0)

    plan = build_pacing_plan(segments, flat_pace_min_per_km=6.0)

    first = plan.segments.iloc[0]
    assert first["pace_min_per_km"] == pytest.approx(6.0, rel=1e-6)
    assert first["time_min"] == pytest.approx(3.0, rel=1e-6)
    assert plan.total_time_min == pytest.approx(6.0 * 10 * STEP_M / 1000, rel=0.01)
    assert plan.flat_pace_min_per_km == pytest.approx(6.0)
    assert plan.segments["cumulative_time_min"].iloc[-1] == pytest.approx(
        plan.total_time_min, rel=1e-6
    )


def test_build_pacing_plan_target_time_mode_hits_the_target(tmp_path):
    profile = [1000.0 + 12 * i for i in range(11)] + [1120.0 - 12 * i for i in range(1, 11)]
    course = parse_gpx_course(write_gpx(tmp_path, profile))
    segments = build_segments(course, segment_m=1000.0)

    plan = build_pacing_plan(segments, target_time_min=30.0)

    assert plan.total_time_min == pytest.approx(30.0, rel=1e-6)
    uphill = plan.segments.iloc[0]
    downhill = plan.segments.iloc[-1]
    assert uphill["pace_min_per_km"] > plan.flat_pace_min_per_km
    assert downhill["pace_min_per_km"] < plan.flat_pace_min_per_km


def test_build_pacing_plan_requires_exactly_one_mode(tmp_path):
    course = parse_gpx_course(write_gpx(tmp_path, [1000.0, 1005.0, 1010.0]))
    segments = build_segments(course)

    with pytest.raises(ValueError):
        build_pacing_plan(segments)
    with pytest.raises(ValueError):
        build_pacing_plan(segments, flat_pace_min_per_km=6.0, target_time_min=60.0)


def test_format_helpers_render_time_and_pace():
    assert format_hms(390.5) == "6:30:30"
    assert format_hms(45.0) == "0:45:00"
    assert format_pace(5.75) == "5:45"
    assert format_pace(10.0) == "10:00"


def test_parse_helpers_accept_clock_and_numeric_inputs():
    assert parse_duration_min("6:30:00") == pytest.approx(390.0)
    assert parse_duration_min("45:30") == pytest.approx(45.5)
    assert parse_duration_min("390") == pytest.approx(390.0)
    assert parse_pace_min_per_km("5:45") == pytest.approx(5.75)
    assert parse_pace_min_per_km("6") == pytest.approx(6.0)
    with pytest.raises(ValueError):
        parse_duration_min("abc")


def test_render_pacing_markdown_shows_segments_assumptions_and_quality(tmp_path):
    course = parse_gpx_course(write_gpx(tmp_path, [1000.0 + 10 * i for i in range(21)]))
    plan = build_pacing_plan(build_segments(course), target_time_min=20.0)

    markdown = render_pacing_markdown(plan, course)

    assert "Synthetic course" in markdown
    assert "Minetti" in markdown
    assert "| 1 |" in markdown
    assert "Temps total" in markdown
    assert "0:20:00" in markdown


def test_cli_pacing_writes_plan_files(tmp_path):
    gpx_path = write_gpx(tmp_path, [1000.0 + 8 * i for i in range(31)])
    output_dir = tmp_path / "out"

    exit_code = main(
        [
            "pacing",
            "--course",
            str(gpx_path),
            "--target-time",
            "0:30:00",
            "--output",
            str(output_dir),
        ]
    )

    assert exit_code == 0
    assert (output_dir / "pacing_plan.csv").exists()
    assert (output_dir / "pacing_plan.md").exists()
    content = (output_dir / "pacing_plan.md").read_text(encoding="utf-8")
    assert "0:30:00" in content
