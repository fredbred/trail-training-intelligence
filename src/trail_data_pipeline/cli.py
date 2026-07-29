"""Command-line interface."""

import argparse
import logging
from pathlib import Path

import pandas as pd

from .loaders.base import SUPPORTED_EXTENSIONS, LoadedActivity, MissingDependencyError, SkippedFile
from .loaders.zip_loader import load_activity_path, load_zip_file
from .metrics import compute_analysis, load_config
from .normalization import normalize_loaded_activities
from .pacing import (
    DEFAULT_MIN_DESCENT_FACTOR,
    build_pacing_plan,
    build_segments,
    format_hms,
    parse_duration_min,
    parse_gpx_course,
    parse_pace_min_per_km,
    render_pacing_markdown,
)
from .plots import create_plots
from .report import render_report

logger = logging.getLogger(__name__)


def _configure_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def _load_directory(path: Path) -> tuple[list[LoadedActivity], list[SkippedFile]]:
    loaded: list[LoadedActivity] = []
    skipped: list[SkippedFile] = []
    files = sorted([candidate for candidate in path.rglob("*") if candidate.is_file()])
    for file_path in files:
        extension = file_path.suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            skipped.append(
                SkippedFile(path=str(file_path), reason=f"unsupported_format:{extension or 'none'}")
            )
            continue
        try:
            loaded.extend(
                load_activity_path(file_path, source_name=str(file_path.relative_to(path)))
            )
        except Exception as exc:
            if isinstance(exc, MissingDependencyError):
                raise
            logger.warning("Skipping %s: %s", file_path, exc)
            skipped.append(
                SkippedFile(path=str(file_path), reason=f"parse_error:{extension}:{exc}")
            )
    return loaded, skipped


def load_input(path: Path) -> tuple[list[LoadedActivity], list[SkippedFile]]:
    """Load a ZIP, directory, FIT file or TCX file."""

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input path does not exist: {path}")
    if path.is_dir():
        return _load_directory(path)
    if path.suffix.lower() == ".zip":
        return load_zip_file(path)
    if path.suffix.lower() in SUPPORTED_EXTENSIONS:
        return load_activity_path(path, source_name=path.name), []
    raise ValueError(f"Unsupported input format: {path.suffix or 'none'}")


def _write_outputs(
    output_dir: Path,
    activities: pd.DataFrame,
    records: pd.DataFrame,
    laps: pd.DataFrame,
    weekly: pd.DataFrame,
    monthly: pd.DataFrame,
    skipped: list[SkippedFile],
):
    output_dir.mkdir(parents=True, exist_ok=True)
    activities.to_csv(output_dir / "activities.csv", index=False)
    records.to_csv(output_dir / "records.csv", index=False)
    laps.to_csv(output_dir / "laps.csv", index=False)
    weekly.to_csv(output_dir / "summary_weekly.csv", index=False)
    monthly.to_csv(output_dir / "summary_monthly.csv", index=False)
    pd.DataFrame(
        [skipped_file.__dict__ for skipped_file in skipped], columns=["path", "reason"]
    ).to_csv(output_dir / "skipped_files.csv", index=False)


def analyze(args: argparse.Namespace) -> int:
    """Run the full analysis pipeline."""

    _configure_logging(args.verbose)
    input_path = Path(args.input)
    output_dir = Path(args.output)
    config = load_config(Path(args.config) if args.config else None)

    logger.info("Loading input: %s", input_path)
    try:
        loaded, skipped = load_input(input_path)
    except MissingDependencyError as exc:
        logger.error(str(exc))
        return 2

    if not loaded:
        logger.warning("No supported activities were parsed.")
    else:
        logger.info("Parsed %s activities", len(loaded))

    activities, records, laps = normalize_loaded_activities(loaded)
    analysis = compute_analysis(activities, records, config)
    activities = analysis["activities"]
    weekly = analysis["weekly"]
    monthly = analysis["monthly"]

    _write_outputs(output_dir, activities, records, laps, weekly, monthly, skipped)
    plots = create_plots(output_dir, activities, weekly, records, analysis)
    report_path = render_report(
        output_dir=output_dir,
        activities=activities,
        weekly=weekly,
        monthly=monthly,
        records=records,
        analysis=analysis,
        plots=plots,
        skipped=skipped,
        config=config,
    )

    logger.info("Wrote report: %s", report_path)
    logger.info("Wrote CSV files and figures to: %s", output_dir)
    return 0


def pacing(args: argparse.Namespace) -> int:
    """Build a grade-adjusted pacing plan from a GPX course."""

    _configure_logging(args.verbose)
    output_dir = Path(args.output)
    try:
        course = parse_gpx_course(Path(args.course))
        segments = build_segments(
            course,
            segment_m=args.segment_km * 1000.0,
            min_descent_factor=args.min_descent_factor,
        )
        plan = build_pacing_plan(
            segments,
            flat_pace_min_per_km=parse_pace_min_per_km(args.flat_pace) if args.flat_pace else None,
            target_time_min=parse_duration_min(args.target_time) if args.target_time else None,
        )
    except (ValueError, FileNotFoundError) as exc:
        logger.error(str(exc))
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    plan.segments.to_csv(output_dir / "pacing_plan.csv", index=False)
    markdown = render_pacing_markdown(plan, course, min_descent_factor=args.min_descent_factor)
    (output_dir / "pacing_plan.md").write_text(markdown, encoding="utf-8")

    logger.info(
        "Pacing plan: %.1f km, %.0f m D+, total %s",
        plan.total_distance_km,
        plan.total_ascent_m,
        format_hms(plan.total_time_min),
    )
    logger.info("Wrote pacing plan to: %s", output_dir)
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser."""

    parser = argparse.ArgumentParser(prog="trail-data-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    analyze_parser = subparsers.add_parser(
        "analyze", help="Analyze a COROS/Garmin-style local export"
    )
    analyze_parser.add_argument(
        "--input", required=True, help="ZIP, directory, FIT file or TCX file to analyze"
    )
    analyze_parser.add_argument(
        "--output", required=True, help="Output directory for CSV, PNG and report files"
    )
    analyze_parser.add_argument(
        "--config", help="Optional YAML config with heart-rate zones and thresholds"
    )
    analyze_parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    analyze_parser.set_defaults(func=analyze)

    pacing_parser = subparsers.add_parser(
        "pacing", help="Build a grade-adjusted pacing plan from a GPX course"
    )
    pacing_parser.add_argument("--course", required=True, help="GPX course file")
    pacing_parser.add_argument(
        "--output", required=True, help="Output directory for the pacing plan CSV and Markdown"
    )
    pacing_parser.add_argument(
        "--flat-pace", help="Pace on flat ground as M:SS or minutes per km (e.g. 5:45)"
    )
    pacing_parser.add_argument(
        "--target-time", help="Target total time as H:MM:SS, MM:SS or minutes (e.g. 6:30:00)"
    )
    pacing_parser.add_argument(
        "--segment-km", type=float, default=1.0, help="Segment length in km (default 1.0)"
    )
    pacing_parser.add_argument(
        "--min-descent-factor",
        type=float,
        default=DEFAULT_MIN_DESCENT_FACTOR,
        help="Floor for descent pace as a fraction of flat pace (default 0.85)",
    )
    pacing_parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    pacing_parser.set_defaults(func=pacing)
    return parser


def main(argv=None) -> int:
    """Run the CLI."""

    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
