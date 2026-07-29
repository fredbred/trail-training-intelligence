"""GPX course parsing and grade-adjusted pacing plans.

The pacing model converts gradient into a pace multiplier using the running
energy-cost polynomial from Minetti et al., "Energy cost of walking and
running at extreme uphill and downhill slopes", J Appl Physiol 93:1039-1046,
2002. Assumptions and known limits:

- Constant metabolic output over the whole course: no fatigue drift, no
  altitude, weather, surface, or technicality effects.
- The polynomial is only valid for gradients within +/-45%; steeper values
  are clamped to that range.
- On descents the energy model alone predicts unrealistic speeds, because
  descending is limited by technique and impact tolerance rather than
  energy. Descent gains are therefore floored at a configurable fraction of
  flat pace.

The output is decision support for pacing a course, not a physiological
prediction.
"""

import math
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

EARTH_RADIUS_M = 6_371_000.0

# Minetti et al. 2002 cost of running and walking (J/kg/m) as polynomials
# of gradient. Both are normalized by the flat running cost.
MINETTI_COEFFICIENTS = (155.4, -30.4, -43.3, 46.3, 19.5, 3.6)
MINETTI_WALK_COEFFICIENTS = (280.5, -58.7, -76.8, 51.9, 19.6, 2.5)
FLAT_COST = 3.6
GRADIENT_VALIDITY = 0.45
DEFAULT_MIN_DESCENT_FACTOR = 0.85


@dataclass
class Course:
    """A parsed GPX course with cumulative distance and elevation."""

    name: Optional[str]
    points: pd.DataFrame
    quality_notes: list[str]


@dataclass
class PacingPlan:
    """A per-segment pacing plan with resolved flat pace and totals."""

    segments: pd.DataFrame
    flat_pace_min_per_km: float
    total_time_min: float
    total_distance_km: float
    total_ascent_m: float
    total_descent_m: float
    drift_pct_per_hour: float = 0.0


@dataclass
class MinettiModel:
    """Grade-to-pace-factor model based on Minetti et al. 2002 cost curves.

    ``hike_threshold`` switches to the walking cost curve above that uphill
    gradient: most trail runners hike steep climbs, and walking costs less
    per meter there. Both gaits are normalized by the flat running cost and
    assume the same sustainable metabolic power.
    """

    min_descent_factor: float = DEFAULT_MIN_DESCENT_FACTOR
    hike_threshold: Optional[float] = None

    def factor(self, gradient: float) -> float:
        """Pace multiplier versus flat running for a gradient."""

        clamped = max(-GRADIENT_VALIDITY, min(GRADIENT_VALIDITY, gradient))
        coefficients = MINETTI_COEFFICIENTS
        if self.hike_threshold is not None and clamped > self.hike_threshold:
            coefficients = MINETTI_WALK_COEFFICIENTS
        factor = _poly_cost(clamped, coefficients) / FLAT_COST
        if clamped < 0:
            return max(factor, self.min_descent_factor)
        return factor


def parse_gpx_course(path: Path) -> Course:
    """Parse a GPX file into cumulative distance and elevation points."""

    tree = ElementTree.parse(Path(path))
    root = tree.getroot()

    name: Optional[str] = None
    latitudes: list[float] = []
    longitudes: list[float] = []
    elevations: list[Optional[float]] = []

    for element in root.iter():
        tag = _local_tag(element.tag)
        if tag == "name" and name is None and element.text:
            name = element.text.strip()
        if tag != "trkpt":
            continue
        latitudes.append(float(element.attrib["lat"]))
        longitudes.append(float(element.attrib["lon"]))
        elevations.append(_point_elevation(element))

    if len(latitudes) < 2:
        raise ValueError(f"GPX course needs at least two track points: {path}")

    distances = [0.0]
    for index in range(1, len(latitudes)):
        step = _haversine_m(
            latitudes[index - 1],
            longitudes[index - 1],
            latitudes[index],
            longitudes[index],
        )
        distances.append(distances[-1] + step)

    quality_notes = []
    missing_elevation = sum(1 for elevation in elevations if elevation is None)
    if missing_elevation:
        quality_notes.append(
            f"{missing_elevation}/{len(elevations)} points have no elevation; "
            "gradients around them are interpolated"
        )

    points = pd.DataFrame(
        {
            "distance_m": distances,
            "elevation_m": pd.to_numeric(pd.Series(elevations), errors="coerce"),
            "latitude": latitudes,
            "longitude": longitudes,
        }
    )
    points["elevation_m"] = points["elevation_m"].interpolate(limit_direction="both")
    return Course(name=name, points=points, quality_notes=quality_notes)


def pace_factor(gradient: float, min_descent_factor: float = DEFAULT_MIN_DESCENT_FACTOR) -> float:
    """Pace multiplier versus flat for a gradient (rise over run).

    Uses the Minetti cost ratio at constant metabolic output; descent gains
    are floored at ``min_descent_factor`` of flat pace (see module docstring).
    """

    return MinettiModel(min_descent_factor=min_descent_factor).factor(gradient)


def build_segments(
    course: Course,
    segment_m: float = 1000.0,
    min_descent_factor: float = DEFAULT_MIN_DESCENT_FACTOR,
    model: Optional[MinettiModel] = None,
) -> pd.DataFrame:
    """Split a course into distance segments with gradient-weighted factors.

    Steps are split exactly at segment boundaries, and the segment pace
    factor is the distance-weighted factor of its sub-steps, so rolling
    terrain costs more than its net gradient suggests. ``model`` defaults to
    ``MinettiModel(min_descent_factor)``.
    """

    if model is None:
        model = MinettiModel(min_descent_factor=min_descent_factor)
    distances = course.points["distance_m"].to_numpy()
    elevations = course.points["elevation_m"].to_numpy()
    rows: list[dict] = []
    state = {"distance": 0.0, "ascent": 0.0, "descent": 0.0, "effective": 0.0, "net": 0.0}
    boundary = segment_m

    for index in range(1, len(distances)):
        start_m, end_m = distances[index - 1], distances[index]
        start_ele, end_ele = elevations[index - 1], elevations[index]
        if end_m <= start_m:
            continue
        position = start_m
        while position < end_m - 1e-9:
            piece_end = min(end_m, boundary)
            fraction_start = (position - start_m) / (end_m - start_m)
            fraction_end = (piece_end - start_m) / (end_m - start_m)
            piece_delta_e = (end_ele - start_ele) * (fraction_end - fraction_start)
            piece_delta_d = piece_end - position
            state["distance"] += piece_delta_d
            state["net"] += piece_delta_e
            state["ascent"] += max(piece_delta_e, 0.0)
            state["descent"] += max(-piece_delta_e, 0.0)
            gradient = piece_delta_e / piece_delta_d
            state["effective"] += piece_delta_d * model.factor(gradient)
            position = piece_end
            if position >= boundary - 1e-9:
                rows.append(_segment_row(len(rows) + 1, boundary - segment_m, boundary, state))
                state = {key: 0.0 for key in state}
                boundary += segment_m

    if state["distance"] > 1e-6:
        if rows and state["distance"] < 0.01 * segment_m:
            rows[-1] = _merge_trailing_sliver(rows[-1], state)
        else:
            segment_start = boundary - segment_m
            rows.append(
                _segment_row(len(rows) + 1, segment_start, segment_start + state["distance"], state)
            )
    return pd.DataFrame(rows)


def _merge_trailing_sliver(row: dict, state: dict) -> dict:
    merged = {
        "distance": row["distance_m"] + state["distance"],
        "ascent": row["ascent_m"] + state["ascent"],
        "descent": row["descent_m"] + state["descent"],
        "effective": row["pace_factor"] * row["distance_m"] + state["effective"],
        "net": row["avg_gradient"] * row["distance_m"] + state["net"],
    }
    return _segment_row(row["segment"], row["start_m"], row["end_m"] + state["distance"], merged)


def build_pacing_plan(
    segments: pd.DataFrame,
    flat_pace_min_per_km: Optional[float] = None,
    target_time_min: Optional[float] = None,
    drift_pct_per_hour: float = 0.0,
) -> PacingPlan:
    """Turn segments into a pacing plan from a flat pace or a target time.

    Exactly one of ``flat_pace_min_per_km`` (pace on flat ground) and
    ``target_time_min`` (total time to distribute over the course) must be
    given. ``drift_pct_per_hour`` slows the pace linearly with elapsed time
    (first-order positive-split model); in target-time mode the drifted
    shape is rescaled so the total still hits the target.
    """

    if (flat_pace_min_per_km is None) == (target_time_min is None):
        raise ValueError("Provide exactly one of flat_pace_min_per_km or target_time_min")

    effective_km = float((segments["distance_m"] * segments["pace_factor"]).sum()) / 1000.0
    if target_time_min is not None:
        flat_pace_min_per_km = target_time_min / effective_km

    plan = segments.copy()
    base_times = (plan["distance_m"] / 1000.0 * flat_pace_min_per_km * plan["pace_factor"]).tolist()
    times = _apply_drift(base_times, drift_pct_per_hour)
    if target_time_min is not None:
        scale = target_time_min / sum(times)
        times = [time * scale for time in times]
        flat_pace_min_per_km *= scale

    plan["time_min"] = times
    plan["pace_min_per_km"] = plan["time_min"] / (plan["distance_m"] / 1000.0)
    plan["cumulative_time_min"] = plan["time_min"].cumsum()
    plan["cumulative_km"] = plan["distance_m"].cumsum() / 1000.0

    return PacingPlan(
        segments=plan,
        flat_pace_min_per_km=float(flat_pace_min_per_km),
        total_time_min=float(plan["time_min"].sum()),
        total_distance_km=float(plan["distance_m"].sum()) / 1000.0,
        total_ascent_m=float(plan["ascent_m"].sum()),
        total_descent_m=float(plan["descent_m"].sum()),
        drift_pct_per_hour=drift_pct_per_hour,
    )


def _apply_drift(base_times: list[float], drift_pct_per_hour: float) -> list[float]:
    if not drift_pct_per_hour:
        return base_times
    times = []
    elapsed = 0.0
    for base in base_times:
        drifted = base * (1.0 + drift_pct_per_hour / 100.0 * elapsed / 60.0)
        times.append(drifted)
        elapsed += drifted
    return times


def build_checkpoint_table(
    plan: PacingPlan,
    checkpoints: list[tuple[float, str]],
    start_time: Optional[str] = None,
) -> pd.DataFrame:
    """Interpolate arrival time, split, and clock time at course markers."""

    start_min = _parse_clock_min(start_time) if start_time else None
    rows = []
    previous = 0.0
    for km, name in sorted(checkpoints):
        cumulative = _time_at_km(plan, km)
        row = {
            "name": name,
            "km": km,
            "cumulative_time_min": cumulative,
            "split_min": cumulative - previous,
        }
        if start_min is not None:
            row["clock"] = _format_clock(start_min + cumulative)
        rows.append(row)
        previous = cumulative
    return pd.DataFrame(rows)


def _time_at_km(plan: PacingPlan, km: float) -> float:
    segments = plan.segments
    target_km = min(km, float(segments["cumulative_km"].iloc[-1]))
    previous_km = 0.0
    previous_time = 0.0
    for row in segments.itertuples():
        if target_km <= row.cumulative_km + 1e-9:
            return previous_time + (target_km - previous_km) * row.pace_min_per_km
        previous_km = row.cumulative_km
        previous_time = row.cumulative_time_min
    return float(segments["cumulative_time_min"].iloc[-1])


def _parse_clock_min(text: str) -> float:
    values = _split_clock(text)
    if len(values) != 2:
        raise ValueError(f"Invalid start time: {text!r} (expected H:MM)")
    return values[0] * 60 + values[1]


def _format_clock(minutes: float) -> str:
    total = round(minutes)
    suffix = " (+1j)" if total >= 24 * 60 else ""
    total %= 24 * 60
    return f"{total // 60}:{total % 60:02d}{suffix}"


def render_pacing_markdown(
    plan: PacingPlan,
    course: Course,
    min_descent_factor: float = DEFAULT_MIN_DESCENT_FACTOR,
    checkpoints: Optional[pd.DataFrame] = None,
    start_time: Optional[str] = None,
    hike_threshold: Optional[float] = None,
    model_note: Optional[str] = None,
) -> str:
    """Render a pacing plan as a French Markdown report."""

    lines = [
        f"# Plan d'allure : {course.name or 'Parcours'}",
        "",
        f"- Distance : {plan.total_distance_km:.1f} km",
        f"- D+ : {plan.total_ascent_m:.0f} m / D- : {plan.total_descent_m:.0f} m",
        f"- Allure à plat retenue : {format_pace(plan.flat_pace_min_per_km)} min/km",
        f"- Temps total : {format_hms(plan.total_time_min)}",
    ]
    if start_time:
        lines.append(f"- Départ : {start_time}")
    lines += [
        "",
        "| Segment | Fin (km) | Distance (km) | D+ (m) | D- (m) | Pente | "
        "Allure (min/km) | Temps | Cumul |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in plan.segments.itertuples():
        lines.append(
            f"| {row.segment} | {row.cumulative_km:.1f} | {row.distance_m / 1000:.2f} "
            f"| {row.ascent_m:.0f} | {row.descent_m:.0f} | {row.avg_gradient * 100:.1f}% "
            f"| {format_pace(row.pace_min_per_km)} | {format_hms(row.time_min)} "
            f"| {format_hms(row.cumulative_time_min)} |"
        )
    if checkpoints is not None and not checkpoints.empty:
        lines += [
            "",
            "## Passages",
            "",
            "| Point | Km | Temps course | Écart |" + (" Heure |" if start_time else ""),
            "| --- | --- | --- | --- |" + (" --- |" if start_time else ""),
        ]
        for row in checkpoints.itertuples():
            line = (
                f"| {row.name} | {row.km:.1f} | {format_hms(row.cumulative_time_min)} "
                f"| {format_hms(row.split_min)} |"
            )
            if start_time:
                line += f" {row.clock} |"
            lines.append(line)

    descent_gain_pct = round((1 - min_descent_factor) * 100)
    model_line = (
        model_note
        if model_note
        else "Coût énergétique de course selon Minetti et al. 2002, à effort métabolique constant."
    )
    lines += [
        "",
        "## Hypothèses et limites",
        "",
        f"- {model_line}",
        f"- Gain en descente plafonné à {descent_gain_pct} % plus rapide que le plat : "
        "la descente est limitée par la technique et la tolérance aux impacts, pas par l'énergie.",
        "- Pentes ramenées à la plage de validité du modèle (±45 %).",
    ]
    if hike_threshold is not None:
        lines.append(
            f"- Marche au-delà de {hike_threshold * 100:.0f} % de pente "
            "(coût de marche Minetti 2002, même puissance métabolique)."
        )
    if plan.drift_pct_per_hour:
        lines.append(
            f"- Dérive de fatigue : +{plan.drift_pct_per_hour:g} %/h sur l'allure "
            "(modèle linéaire de premier ordre)."
        )
    lines += [
        "- Ni altitude, ni technicité, ni météo"
        + ("" if plan.drift_pct_per_hour else ", ni fatigue")
        + " : support de décision, pas une prédiction physiologique.",
        "",
        "## Qualité des données",
        "",
    ]
    if course.quality_notes:
        lines += [f"- {note}" for note in course.quality_notes]
    else:
        lines.append("- Aucune anomalie détectée dans la trace.")
    lines.append("")
    return "\n".join(lines)


def format_hms(minutes: float) -> str:
    """Format minutes as H:MM:SS."""

    total_seconds = round(minutes * 60)
    return f"{total_seconds // 3600}:{total_seconds % 3600 // 60:02d}:{total_seconds % 60:02d}"


def format_pace(min_per_km: float) -> str:
    """Format a pace in minutes per km as M:SS."""

    total_seconds = round(min_per_km * 60)
    return f"{total_seconds // 60}:{total_seconds % 60:02d}"


def parse_duration_min(text: str) -> float:
    """Parse ``H:MM:SS``, ``MM:SS`` or plain minutes into minutes."""

    values = _split_clock(text)
    if len(values) == 3:
        return values[0] * 60 + values[1] + values[2] / 60
    if len(values) == 2:
        return values[0] + values[1] / 60
    return values[0]


def parse_pace_min_per_km(text: str) -> float:
    """Parse ``M:SS`` or plain minutes per km into minutes per km."""

    values = _split_clock(text)
    if len(values) == 2:
        return values[0] + values[1] / 60
    if len(values) == 1:
        return values[0]
    raise ValueError(f"Invalid pace: {text!r} (expected M:SS or minutes per km)")


def _split_clock(text: str) -> list[float]:
    parts = text.strip().split(":")
    try:
        values = [float(part) for part in parts]
    except ValueError as exc:
        raise ValueError(f"Invalid time value: {text!r}") from exc
    if not 1 <= len(values) <= 3:
        raise ValueError(f"Invalid time value: {text!r}")
    return values


def _segment_row(index: int, start_m: float, end_m: float, state: dict) -> dict:
    return {
        "segment": index,
        "start_m": round(start_m, 1),
        "end_m": round(end_m, 1),
        "distance_m": state["distance"],
        "ascent_m": state["ascent"],
        "descent_m": state["descent"],
        "avg_gradient": state["net"] / state["distance"] if state["distance"] else 0.0,
        "pace_factor": state["effective"] / state["distance"] if state["distance"] else 1.0,
    }


def _poly_cost(gradient: float, coefficients: tuple) -> float:
    cost = 0.0
    for coefficient in coefficients:
        cost = cost * gradient + coefficient
    return cost


def _point_elevation(element: ElementTree.Element) -> Optional[float]:
    for child in element:
        if _local_tag(child.tag) == "ele" and child.text:
            return float(child.text)
    return None


def _local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    chord = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(chord))
