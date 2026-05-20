"""Command-line interface."""

import argparse
import logging
from pathlib import Path
from typing import List, Tuple

import pandas as pd

from .loaders.base import LoadedActivity, MissingDependencyError, SkippedFile, SUPPORTED_EXTENSIONS
from .loaders.zip_loader import load_activity_path, load_zip_file
from .metrics import compute_analysis, load_config
from .normalization import normalize_loaded_activities
from .plots import create_plots
from .report import render_report


logger = logging.getLogger(__name__)


def _configure_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def _load_directory(path: Path) -> Tuple[List[LoadedActivity], List[SkippedFile]]:
    loaded: List[LoadedActivity] = []
    skipped: List[SkippedFile] = []
    files = sorted([candidate for candidate in path.rglob("*") if candidate.is_file()])
    for file_path in files:
        extension = file_path.suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            skipped.append(SkippedFile(path=str(file_path), reason=f"unsupported_format:{extension or 'none'}"))
            continue
        try:
            loaded.extend(load_activity_path(file_path, source_name=str(file_path.relative_to(path))))
        except Exception as exc:
            if isinstance(exc, MissingDependencyError):
                raise
            logger.warning("Skipping %s: %s", file_path, exc)
            skipped.append(SkippedFile(path=str(file_path), reason=f"parse_error:{extension}:{exc}"))
    return loaded, skipped


def load_input(path: Path) -> Tuple[List[LoadedActivity], List[SkippedFile]]:
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
    skipped: List[SkippedFile],
):
    output_dir.mkdir(parents=True, exist_ok=True)
    activities.to_csv(output_dir / "activities.csv", index=False)
    records.to_csv(output_dir / "records.csv", index=False)
    laps.to_csv(output_dir / "laps.csv", index=False)
    weekly.to_csv(output_dir / "summary_weekly.csv", index=False)
    monthly.to_csv(output_dir / "summary_monthly.csv", index=False)
    pd.DataFrame([skipped_file.__dict__ for skipped_file in skipped], columns=["path", "reason"]).to_csv(
        output_dir / "skipped_files.csv", index=False
    )


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


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser."""

    parser = argparse.ArgumentParser(prog="trail-data-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    analyze_parser = subparsers.add_parser("analyze", help="Analyze a COROS/Garmin-style local export")
    analyze_parser.add_argument("--input", required=True, help="ZIP, directory, FIT file or TCX file to analyze")
    analyze_parser.add_argument("--output", required=True, help="Output directory for CSV, PNG and report files")
    analyze_parser.add_argument("--config", help="Optional YAML config with heart-rate zones and thresholds")
    analyze_parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    analyze_parser.set_defaults(func=analyze)
    return parser


def main(argv=None) -> int:
    """Run the CLI."""

    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
