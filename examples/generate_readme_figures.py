"""Generate the README figures from a synthetic 16-week training block.

The figures are rendered by the pipeline's own plotting code so the README
shows real tool output without publishing any personal training data.

Usage:

    pip install -e .
    python examples/generate_readme_figures.py
"""

import shutil
import tempfile
from pathlib import Path

import pandas as pd

from trail_data_pipeline.plots import create_plots

PUBLISHED_FIGURES = ["estimated_load.png", "trail_specificity.png"]

# Hand-written 16-week block: three build cycles with cutback weeks, a peak,
# then a two-week taper into a race week. Values are plausible for a mountain
# trail preparation but belong to no real athlete.
WEEKS = [
    # (hours, distance_km, ascent_m, sessions)
    (5.0, 42, 1150, 4),
    (6.0, 48, 1500, 4),
    (7.0, 54, 1900, 5),
    (4.5, 38, 950, 3),  # cutback
    (7.5, 56, 2100, 5),
    (8.5, 60, 2500, 5),
    (9.5, 64, 2900, 6),
    (5.0, 40, 1100, 3),  # cutback
    (9.0, 62, 2650, 5),
    (10.0, 66, 3050, 6),
    (11.0, 70, 3400, 6),
    (5.5, 42, 1250, 4),  # cutback
    (9.5, 62, 2800, 5),
    (7.0, 50, 1900, 4),  # taper 1
    (4.5, 34, 950, 3),  # taper 2
    (3.0, 22, 600, 2),  # race week
]


def build_weekly() -> pd.DataFrame:
    week_starts = pd.date_range("2026-03-02", periods=len(WEEKS), freq="7D")
    frame = pd.DataFrame(
        {
            "week_start": week_starts,
            "total_duration_hours": [w[0] for w in WEEKS],
            "total_distance_km": [w[1] for w in WEEKS],
            "total_ascent_m": [w[2] for w in WEEKS],
            "activity_count": [w[3] for w in WEEKS],
        }
    )
    frame["dplus_per_hour"] = (frame["total_ascent_m"] / frame["total_duration_hours"]).round(1)
    # Simple load proxy consistent with the pipeline: duration-driven with an
    # ascent bonus, smoothed for the rolling series.
    frame["estimated_load"] = (
        frame["total_duration_hours"] * 42 + frame["total_ascent_m"] / 22
    ).round(1)
    frame["rolling_7d_load"] = frame["estimated_load"].rolling(2, min_periods=1).mean().round(1)
    return frame


def main() -> None:
    weekly = build_weekly()
    target = Path(__file__).parent / "synthetic" / "figures"
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        paths = create_plots(
            Path(scratch),
            activities=pd.DataFrame(),
            weekly=weekly,
            records=pd.DataFrame(),
            analysis={},
        )
        for name in PUBLISHED_FIGURES:
            shutil.copyfile(Path(scratch) / "figures" / name, target / name)
    print(f"Wrote {', '.join(PUBLISHED_FIGURES)} to {target}")
    del paths


if __name__ == "__main__":
    main()
