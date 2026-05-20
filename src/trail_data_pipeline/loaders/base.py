"""Shared loader types."""

from dataclasses import dataclass, field
from typing import Any, Dict, List

import pandas as pd


SUPPORTED_EXTENSIONS = {".fit", ".tcx"}


class LoaderError(Exception):
    """Raised when an activity file cannot be loaded."""


class MissingDependencyError(LoaderError):
    """Raised when an optional parser dependency is missing."""


@dataclass
class LoadedActivity:
    """A parsed activity before normalization."""

    activity: Dict[str, Any]
    records: pd.DataFrame = field(default_factory=pd.DataFrame)
    laps: pd.DataFrame = field(default_factory=pd.DataFrame)
    warnings: List[str] = field(default_factory=list)


@dataclass
class SkippedFile:
    """A file ignored or skipped during loading."""

    path: str
    reason: str
