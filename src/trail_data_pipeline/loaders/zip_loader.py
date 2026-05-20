"""ZIP loader and activity file dispatch."""

import logging
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import List, Tuple

from .base import LoaderError, LoadedActivity, SkippedFile, SUPPORTED_EXTENSIONS
from .fit_loader import load_fit_file
from .tcx_loader import load_tcx_file

logger = logging.getLogger(__name__)


def _is_safe_zip_name(name: str) -> bool:
    path = PurePosixPath(name)
    return not path.is_absolute() and ".." not in path.parts


def discover_activity_files(zip_path: Path) -> Tuple[List[str], List[SkippedFile]]:
    """Return supported activity members and ignored files from a ZIP."""

    supported = []
    skipped = []
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if not _is_safe_zip_name(name):
                skipped.append(SkippedFile(path=name, reason="unsafe_zip_path"))
                continue
            extension = Path(name).suffix.lower()
            if extension in SUPPORTED_EXTENSIONS:
                supported.append(name)
            else:
                skipped.append(SkippedFile(path=name, reason=f"unsupported_format:{extension or 'none'}"))
    return supported, skipped


def load_activity_path(path: Path, source_name: str = None) -> List[LoadedActivity]:
    """Dispatch one activity file to the correct loader."""

    extension = path.suffix.lower()
    if extension == ".fit":
        return [load_fit_file(path, source_name=source_name)]
    if extension == ".tcx":
        return load_tcx_file(path, source_name=source_name)
    raise LoaderError(f"Unsupported activity format: {path}")


def load_zip_file(zip_path: Path) -> Tuple[List[LoadedActivity], List[SkippedFile]]:
    """Load every supported activity file from a ZIP."""

    zip_path = Path(zip_path)
    supported, skipped = discover_activity_files(zip_path)
    logger.info("Detected %s supported activity files in %s", len(supported), zip_path)

    loaded: List[LoadedActivity] = []
    with tempfile.TemporaryDirectory(prefix="trail-data-pipeline-") as temp_dir:
        temp_root = Path(temp_dir)
        with zipfile.ZipFile(zip_path) as archive:
            for index, member in enumerate(supported, start=1):
                extension = Path(member).suffix.lower()
                temp_path = temp_root / f"{index:05d}_{Path(member).name}"
                logger.info("Parsing %s", member)
                try:
                    with archive.open(member) as source, temp_path.open("wb") as target:
                        shutil.copyfileobj(source, target)
                    loaded.extend(load_activity_path(temp_path, source_name=member))
                except Exception as exc:
                    if exc.__class__.__name__ == "MissingDependencyError":
                        raise
                    logger.warning("Skipping %s: %s", member, exc)
                    skipped.append(SkippedFile(path=member, reason=f"parse_error:{extension}:{exc}"))

    return loaded, skipped
