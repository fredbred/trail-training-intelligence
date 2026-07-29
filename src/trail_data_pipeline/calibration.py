"""Personal grade-speed calibration from normalized activity records.

The calibration extracts the athlete's own speed-versus-gradient curve from
GPS records: activities are resampled on a fixed distance grid, filtered for
stops, spikes, and non-running sports, then binned by gradient. Bin speeds
are normalized by the flat-bin median speed into pace factors that the
pacing planner can use instead of the literature model, with a fallback to
Minetti outside the calibrated gradient range.

The result is descriptive: it mixes terrain, weather, and fatigue as they
occurred in training. It is a personal reference curve, not a physiological
model, and calibration outputs built from real exports stay private.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from .pacing import GRADIENT_VALIDITY, MinettiModel, format_pace

DEFAULT_RESAMPLE_M = 25.0
DEFAULT_BIN_PCT = 2.0
DEFAULT_MIN_SAMPLES = 50
SPEED_MIN_M_S = 0.3
SPEED_MAX_M_S = 6.5


@dataclass
class Calibration:
    """A binned personal gradient-to-pace-factor curve."""

    flat_speed_m_s: float
    bins: pd.DataFrame
    total_samples: int
    activity_count: int
    minetti_median_abs_dev_pct: float


@dataclass
class CalibratedPaceModel:
    """Pace-factor model interpolating personal bins, Minetti outside them."""

    calibration: Calibration
    fallback: MinettiModel = field(default_factory=MinettiModel)

    def factor(self, gradient: float) -> float:
        """Pace multiplier versus flat for a gradient."""

        bins = self.calibration.bins.sort_values("gradient")
        gradients = bins["gradient"].to_numpy(float)
        if gradient < gradients[0] or gradient > gradients[-1]:
            return self.fallback.factor(gradient)
        return float(np.interp(gradient, gradients, bins["pace_factor"].to_numpy(float)))


def build_gradient_profile(
    records: pd.DataFrame,
    activities: pd.DataFrame,
    resample_m: float = DEFAULT_RESAMPLE_M,
    bin_pct: float = DEFAULT_BIN_PCT,
) -> pd.DataFrame:
    """Bin running records into median speed per gradient bin.

    Records are joined to activities to keep running sports only, resampled
    every ``resample_m`` meters per activity, and filtered for stops, GPS
    spikes, and gradients outside the model validity range.
    """

    running_ids = activities[
        activities["sport"].astype(str).str.lower().str.contains("run", na=False)
    ]["activity_id"]
    samples = []
    for _, group in records[records["activity_id"].isin(running_ids)].groupby("activity_id"):
        samples.append(_activity_samples(group, resample_m))
    if not samples:
        return pd.DataFrame(columns=["gradient", "median_speed_m_s", "pace_factor", "n_samples"])

    frame = pd.concat(samples, ignore_index=True)
    frame = frame[
        (frame["speed_m_s"] >= SPEED_MIN_M_S)
        & (frame["speed_m_s"] <= SPEED_MAX_M_S)
        & (frame["gradient"].abs() <= GRADIENT_VALIDITY)
    ]
    if frame.empty:
        return pd.DataFrame(columns=["gradient", "median_speed_m_s", "pace_factor", "n_samples"])

    bin_width = bin_pct / 100.0
    frame["gradient_bin"] = (frame["gradient"] / bin_width).round() * bin_width
    profile = (
        frame.groupby("gradient_bin")["speed_m_s"]
        .agg(median_speed_m_s="median", n_samples="count")
        .reset_index()
        .rename(columns={"gradient_bin": "gradient"})
    )
    flat = profile[profile["gradient"].abs() < bin_width / 2]
    if flat.empty:
        raise ValueError("Calibration needs flat samples as the reference bin")
    flat_speed = float(flat["median_speed_m_s"].iloc[0])
    profile["pace_factor"] = flat_speed / profile["median_speed_m_s"]
    return profile.sort_values("gradient").reset_index(drop=True)


def _activity_samples(group: pd.DataFrame, resample_m: float) -> pd.DataFrame:
    frame = group.dropna(subset=["distance_m", "altitude_m", "timestamp"]).sort_values("timestamp")
    if len(frame) < 2:
        return pd.DataFrame(columns=["speed_m_s", "gradient"])
    distance = pd.to_numeric(frame["distance_m"], errors="coerce").to_numpy(float)
    keep = np.concatenate([[True], np.diff(distance) > 0])
    distance = distance[keep]
    seconds = (
        (frame["timestamp"] - frame["timestamp"].iloc[0]).dt.total_seconds().to_numpy(float)[keep]
    )
    altitude = pd.to_numeric(frame["altitude_m"], errors="coerce").to_numpy(float)[keep]
    if len(distance) < 2 or distance[-1] - distance[0] < 2 * resample_m:
        return pd.DataFrame(columns=["speed_m_s", "gradient"])

    # Include the final point when the total distance aligns with the grid;
    # a misaligned sub-step tail is dropped rather than producing a short,
    # noisy sample.
    grid = np.arange(distance[0], distance[-1] + 1e-6, resample_m)
    grid_seconds = np.interp(grid, distance, seconds)
    grid_altitude = np.interp(grid, distance, altitude)
    delta_t = np.diff(grid_seconds)
    delta_alt = np.diff(grid_altitude)
    valid = delta_t > 0
    return pd.DataFrame(
        {"speed_m_s": resample_m / delta_t[valid], "gradient": delta_alt[valid] / resample_m}
    )


def fit_calibration(
    profile: pd.DataFrame,
    min_samples_per_bin: int = DEFAULT_MIN_SAMPLES,
    activity_count: int = 0,
) -> Calibration:
    """Keep well-sampled bins and summarize the deviation from Minetti."""

    bins = profile[profile["n_samples"] >= min_samples_per_bin].reset_index(drop=True)
    flat = bins[bins["gradient"].abs() < 1e-9]
    if flat.empty:
        raise ValueError("Calibration needs a well-sampled flat bin as reference")

    minetti = MinettiModel()
    reference = bins["gradient"].map(minetti.factor)
    deviation_pct = ((bins["pace_factor"] - reference).abs() / reference * 100).median()
    return Calibration(
        flat_speed_m_s=float(flat["median_speed_m_s"].iloc[0]),
        bins=bins[["gradient", "median_speed_m_s", "pace_factor", "n_samples"]],
        total_samples=int(bins["n_samples"].sum()),
        activity_count=activity_count,
        minetti_median_abs_dev_pct=float(deviation_pct),
    )


def save_calibration(calibration: Calibration, path: Path) -> None:
    """Write a calibration to JSON (no personal identifiers)."""

    payload = {
        "version": 1,
        "flat_speed_m_s": calibration.flat_speed_m_s,
        "total_samples": calibration.total_samples,
        "activity_count": calibration.activity_count,
        "minetti_median_abs_dev_pct": calibration.minetti_median_abs_dev_pct,
        "bins": calibration.bins.to_dict(orient="records"),
    }
    Path(path).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_calibration(path: Path) -> Calibration:
    """Load a calibration written by :func:`save_calibration`."""

    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return Calibration(
        flat_speed_m_s=payload["flat_speed_m_s"],
        bins=pd.DataFrame(payload["bins"]),
        total_samples=payload["total_samples"],
        activity_count=payload.get("activity_count", 0),
        minetti_median_abs_dev_pct=payload["minetti_median_abs_dev_pct"],
    )


def render_calibration_markdown(calibration: Calibration) -> str:
    """Render a French calibration report with the Minetti comparison."""

    minetti = MinettiModel()
    flat_pace = format_pace(1000.0 / calibration.flat_speed_m_s / 60.0)
    activities = calibration.activity_count or "?"
    lines = [
        "# Calibration personnelle allure-pente",
        "",
        f"- Échantillons : {calibration.total_samples} pas de distance sur {activities} activités",
        f"- Vitesse à plat (médiane) : {calibration.flat_speed_m_s:.2f} m/s ({flat_pace} min/km)",
        f"- Écart médian au modèle Minetti : {calibration.minetti_median_abs_dev_pct:.1f} %",
        "",
        "| Pente | Vitesse médiane (m/s) | Allure | Facteur | Facteur Minetti | Échantillons |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in calibration.bins.itertuples():
        pace = format_pace(1000.0 / row.median_speed_m_s / 60.0)
        lines.append(
            f"| {row.gradient * 100:+.0f}% | {row.median_speed_m_s:.2f} | {pace} "
            f"| {row.pace_factor:.2f} | {minetti.factor(row.gradient):.2f} | {row.n_samples} |"
        )
    lines += [
        "",
        "## Méthode et limites",
        "",
        "- Resampling par pas de distance fixes, filtres d'arrêts et de pics GPS, "
        "pentes limitées à la plage ±45 %.",
        "- Facteurs normalisés par la vitesse médiane du bin plat.",
        "- Courbe descriptive des sorties réelles : terrain, météo et fatigue mélangés. "
        "Référence personnelle, pas un modèle physiologique.",
        "",
    ]
    return "\n".join(lines)


def make_model(
    path: Path,
    fallback: Optional[MinettiModel] = None,
) -> CalibratedPaceModel:
    """Load a calibration file into a pace model with a Minetti fallback."""

    return CalibratedPaceModel(
        calibration=load_calibration(path), fallback=fallback or MinettiModel()
    )
