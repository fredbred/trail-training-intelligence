"""Command-line interface."""

import argparse
import logging
from pathlib import Path

import pandas as pd

from .calibration import (
    DEFAULT_BIN_PCT,
    DEFAULT_MIN_SAMPLES,
    DEFAULT_RESAMPLE_M,
    build_gradient_profile,
    fit_calibration,
    make_model,
    render_calibration_markdown,
    save_calibration,
)
from .loaders.base import SUPPORTED_EXTENSIONS, LoadedActivity, MissingDependencyError, SkippedFile
from .loaders.zip_loader import load_activity_path, load_zip_file
from .metrics import compute_analysis, load_config
from .normalization import normalize_loaded_activities
from .pacing import (
    DEFAULT_MIN_DESCENT_FACTOR,
    MinettiModel,
    build_checkpoint_table,
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


def _parse_checkpoints(raw: "list[str] | None") -> list[tuple[float, str]]:
    checkpoints = []
    for entry in raw or []:
        km_text, _, name = entry.partition(":")
        if not name:
            raise ValueError(f"Invalid checkpoint {entry!r} (expected KM:NAME)")
        checkpoints.append((float(km_text), name.strip()))
    return checkpoints


def pacing(args: argparse.Namespace) -> int:
    """Build a grade-adjusted pacing plan from a GPX course."""

    _configure_logging(args.verbose)
    output_dir = Path(args.output)
    try:
        course = parse_gpx_course(Path(args.course))
        minetti = MinettiModel(
            min_descent_factor=args.min_descent_factor,
            hike_threshold=args.hike_threshold,
        )
        model_note = None
        if args.model:
            model = make_model(Path(args.model), fallback=minetti)
            calibration = model.calibration
            model_note = (
                f"Facteurs issus d'une calibration personnelle ({calibration.total_samples} "
                f"échantillons, écart médian au modèle Minetti "
                f"{calibration.minetti_median_abs_dev_pct:.1f} %) ; repli Minetti hors "
                "plage calibrée."
            )
        else:
            model = minetti
        segments = build_segments(course, segment_m=args.segment_km * 1000.0, model=model)
        plan = build_pacing_plan(
            segments,
            flat_pace_min_per_km=parse_pace_min_per_km(args.flat_pace) if args.flat_pace else None,
            target_time_min=parse_duration_min(args.target_time) if args.target_time else None,
            drift_pct_per_hour=args.drift_pct_per_hour,
        )
        checkpoints = _parse_checkpoints(args.checkpoint)
        checkpoint_table = (
            build_checkpoint_table(plan, checkpoints, start_time=args.start_time)
            if checkpoints
            else None
        )
    except (ValueError, FileNotFoundError) as exc:
        logger.error(str(exc))
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    plan.segments.to_csv(output_dir / "pacing_plan.csv", index=False)
    if checkpoint_table is not None:
        checkpoint_table.to_csv(output_dir / "pacing_checkpoints.csv", index=False)
    markdown = render_pacing_markdown(
        plan,
        course,
        min_descent_factor=args.min_descent_factor,
        checkpoints=checkpoint_table,
        start_time=args.start_time,
        hike_threshold=args.hike_threshold,
        model_note=model_note,
    )
    (output_dir / "pacing_plan.md").write_text(markdown, encoding="utf-8")

    logger.info(
        "Pacing plan: %.1f km, %.0f m D+, total %s",
        plan.total_distance_km,
        plan.total_ascent_m,
        format_hms(plan.total_time_min),
    )
    logger.info("Wrote pacing plan to: %s", output_dir)
    return 0


def calibrate(args: argparse.Namespace) -> int:
    """Fit a personal grade-speed calibration from normalized CSV exports."""

    _configure_logging(args.verbose)
    output_dir = Path(args.output)
    try:
        records = pd.read_csv(args.records)
        records["timestamp"] = pd.to_datetime(records["timestamp"], errors="coerce")
        activities = pd.read_csv(args.activities)
        profile = build_gradient_profile(
            records, activities, resample_m=args.resample_m, bin_pct=args.bin_pct
        )
        running = activities["sport"].astype(str).str.lower().str.contains("run", na=False)
        calibration = fit_calibration(
            profile,
            min_samples_per_bin=args.min_samples,
            activity_count=int(running.sum()),
        )
    except (ValueError, FileNotFoundError, KeyError) as exc:
        logger.error(str(exc))
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    save_calibration(calibration, output_dir / "calibration.json")
    (output_dir / "calibration.md").write_text(
        render_calibration_markdown(calibration), encoding="utf-8"
    )
    logger.info(
        "Calibration: %s bins, %s samples, median deviation vs Minetti %.1f%%",
        len(calibration.bins),
        calibration.total_samples,
        calibration.minetti_median_abs_dev_pct,
    )
    logger.info("Wrote calibration to: %s", output_dir)
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
    pacing_parser.add_argument(
        "--hike-threshold",
        type=float,
        help="Uphill gradient above which the plan assumes hiking (e.g. 0.20)",
    )
    pacing_parser.add_argument(
        "--model",
        help="Personal calibration JSON from the calibrate command (Minetti fallback)",
    )
    pacing_parser.add_argument(
        "--drift-pct-per-hour",
        type=float,
        default=0.0,
        help="Fatigue drift in percent of pace per elapsed hour (e.g. 4)",
    )
    pacing_parser.add_argument(
        "--start-time", help="Race start as H:MM to add clock times at checkpoints"
    )
    pacing_parser.add_argument(
        "--checkpoint",
        action="append",
        help="Checkpoint as KM:NAME (repeatable), e.g. --checkpoint '21.5:Ravito 2'",
    )
    pacing_parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    pacing_parser.set_defaults(func=pacing)

    calibrate_parser = subparsers.add_parser(
        "calibrate", help="Fit a personal grade-speed curve from analyzed exports"
    )
    calibrate_parser.add_argument(
        "--records", required=True, help="records.csv produced by the analyze command"
    )
    calibrate_parser.add_argument(
        "--activities", required=True, help="activities.csv produced by the analyze command"
    )
    calibrate_parser.add_argument(
        "--output", required=True, help="Output directory for calibration.json and calibration.md"
    )
    calibrate_parser.add_argument(
        "--resample-m",
        type=float,
        default=DEFAULT_RESAMPLE_M,
        help="Distance resampling step in meters (default 25)",
    )
    calibrate_parser.add_argument(
        "--bin-pct",
        type=float,
        default=DEFAULT_BIN_PCT,
        help="Gradient bin width in percent (default 2)",
    )
    calibrate_parser.add_argument(
        "--min-samples",
        type=int,
        default=DEFAULT_MIN_SAMPLES,
        help="Minimum samples for a gradient bin to be kept (default 50)",
    )
    calibrate_parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    calibrate_parser.set_defaults(func=calibrate)
    return parser


def main(argv=None) -> int:
    """Run the CLI."""

    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
