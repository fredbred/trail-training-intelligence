"""Markdown report generation."""

from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd

from .loaders.base import SkippedFile


def _fmt(value, digits: int = 1, suffix: str = "") -> str:
    if value is None or pd.isna(value):
        return "n/a"
    return f"{float(value):,.{digits}f}{suffix}".replace(",", " ")


def _date(value) -> str:
    if value is None or pd.isna(value):
        return "n/a"
    return pd.to_datetime(value).strftime("%Y-%m-%d")


def _sport_list(activities: pd.DataFrame) -> str:
    if activities.empty or "sport" not in activities:
        return "n/a"
    sports = activities["sport"].dropna().astype(str).value_counts()
    return ", ".join([f"{sport} ({count})" for sport, count in sports.items()])


def _markdown_table(frame: pd.DataFrame) -> str:
    if frame.empty:
        return "_Aucune donnee._"
    text = frame.fillna("n/a").astype(str)
    headers = list(text.columns)
    rows = text.values.tolist()
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(cell).replace("|", "\\|") for cell in row) + " |")
    return "\n".join(lines)


def _activity_table(frame: pd.DataFrame, columns: List[str], limit: int = 10) -> str:
    if frame.empty:
        return "_Aucune activite._"
    table = frame.head(limit).copy()
    available = [column for column in columns if column in table.columns]
    table = table[available]
    rename = {
        "start_time": "date",
        "sport": "sport",
        "duration_hours": "heures",
        "distance_km": "km",
        "ascent_m": "D+ m",
        "descent_m": "D- m",
        "dplus_per_hour": "D+ / h",
        "source_file": "source",
    }
    table = table.rename(columns=rename)
    for column in ["date"]:
        if column in table:
            table[column] = table[column].apply(_date)
    for column in ["heures", "km", "D+ / h"]:
        if column in table:
            table[column] = table[column].apply(lambda value: _fmt(value, 1))
    for column in ["D+ m", "D- m"]:
        if column in table:
            table[column] = table[column].apply(lambda value: _fmt(value, 0))
    return _markdown_table(table)


def _figure(path: str, caption: str) -> str:
    return f"![{caption}]({path})"


def _missing_limits(activities: pd.DataFrame, records: pd.DataFrame, skipped: Iterable[SkippedFile], config: Dict) -> List[str]:
    limits = []
    if activities.empty:
        return ["Aucune activite normalisee."]
    if activities["avg_heart_rate_bpm"].isna().all():
        limits.append("Frequence cardiaque absente ou non exploitable.")
    if activities["ascent_m"].isna().all():
        limits.append("D+ absent ou non derivable depuis l'altitude.")
    if activities["descent_m"].isna().all():
        limits.append("D- absent ou non derivable depuis l'altitude.")
    if not bool(activities["gps_available"].fillna(False).any()):
        limits.append("Aucun signal GPS exploitable detecte.")
    if records.empty:
        limits.append("Aucun flux temporel detaille exploitable.")
    if not config.get("heart_rate_zones"):
        limits.append("Zones FC non fournies : pas d'interpretation physiologique des intensites.")
    skipped_list = list(skipped)
    if skipped_list:
        limits.append(f"{len(skipped_list)} fichier(s) ignores ou non parsables, voir `skipped_files.csv`.")
    return limits or ["Pas de limite majeure detectee par les controles simples."]


def render_report(
    output_dir: Path,
    activities: pd.DataFrame,
    weekly: pd.DataFrame,
    monthly: pd.DataFrame,
    records: pd.DataFrame,
    analysis: Dict,
    plots: Dict[str, str],
    skipped: Iterable[SkippedFile],
    config: Dict,
) -> Path:
    """Write the Markdown report."""

    output_dir = Path(output_dir)
    report_path = output_dir / "report.md"
    lines = ["# Analyse entraînement COROS — dernière année", ""]

    if activities.empty:
        period = "n/a"
        longest = None
        peak_week = None
    else:
        period = f"{_date(activities['start_time'].min())} au {_date(activities['start_time'].max())}"
        longest = activities.sort_values("duration_hours", ascending=False).iloc[0]
        peak_week = weekly.sort_values("total_duration_hours", ascending=False).iloc[0] if not weekly.empty else None

    total_hours = activities["duration_hours"].sum(skipna=True) if not activities.empty else 0
    total_distance = activities["distance_km"].sum(skipna=True) if not activities.empty else 0
    total_ascent = activities["ascent_m"].sum(skipna=True) if not activities.empty else 0
    avg_weekly = weekly["total_duration_hours"].mean(skipna=True) if not weekly.empty else 0

    lines += [
        "## Résumé exécutif",
        f"- Période analysée : {period}.",
        f"- Nombre d'activités : {len(activities)}.",
        f"- Sports détectés : {_sport_list(activities)}.",
        f"- Volume total : {_fmt(total_hours, 1, ' h')}.",
        f"- Volume moyen hebdomadaire : {_fmt(avg_weekly, 1, ' h')}.",
        f"- Distance totale : {_fmt(total_distance, 1, ' km')}.",
        f"- D+ total : {_fmt(total_ascent, 0, ' m')}.",
        f"- Plus longue sortie : {_fmt(longest['duration_hours'], 1, ' h')} le {_date(longest['start_time'])}." if longest is not None else "- Plus longue sortie : n/a.",
        f"- Semaine la plus chargée : semaine du {_date(peak_week['week_start'])}, {_fmt(peak_week['total_duration_hours'], 1, ' h')}." if peak_week is not None else "- Semaine la plus chargée : n/a.",
    ]
    trends = analysis.get("trends", pd.DataFrame())
    if not trends.empty:
        lines.append("- Principales tendances : " + " ".join(trends["summary"].tolist()))
    lines.append("")

    lines += [
        "## Volume et régularité",
        _figure(plots["weekly_hours"], "Volume hebdomadaire"),
        _figure(plots["weekly_distance"], "Distance hebdomadaire"),
        _figure(plots["weekly_sessions"], "Nombre de séances par semaine"),
        "",
        f"- Semaines analysées : {len(weekly)}.",
        f"- Semaines sans entraînement détecté : {int((weekly['activity_count'] == 0).sum()) if not weekly.empty else 0}.",
        f"- Jours actifs moyens par semaine : {_fmt(weekly['active_days'].mean(skipna=True) if not weekly.empty else None, 1)}.",
        f"- Part moyenne week-end : {_fmt((weekly['weekend_share'].mean(skipna=True) * 100) if not weekly.empty else None, 0, ' %')}.",
        "",
        "## Dénivelé et spécificité trail",
        _figure(plots["weekly_ascent"], "Dénivelé positif hebdomadaire"),
        _figure(plots["trail_specificity"], "D+ par heure"),
        "",
        f"- D+ moyen par heure : {_fmt(activities['dplus_per_hour'].mean(skipna=True) if 'dplus_per_hour' in activities else None, 0, ' m/h')}.",
        f"- D+ moyen par km : {_fmt(activities['dplus_per_km'].mean(skipna=True) if 'dplus_per_km' in activities else None, 0, ' m/km')}.",
        f"- D- total : {_fmt(activities['descent_m'].sum(skipna=True) if 'descent_m' in activities else None, 0, ' m')}.",
        f"- Temps estimé en montée : {_fmt(activities['estimated_uphill_hours'].sum(skipna=True) if 'estimated_uphill_hours' in activities else None, 1, ' h')}.",
        f"- Temps outdoor / indoor : {_fmt(activities.loc[activities['is_outdoor'] == True, 'duration_hours'].sum(skipna=True) if 'is_outdoor' in activities else None, 1, ' h')} / {_fmt(activities.loc[activities['is_outdoor'] == False, 'duration_hours'].sum(skipna=True) if 'is_outdoor' in activities else None, 1, ' h')}.",
        f"- Sorties avec D+ significatif : {int(activities['has_significant_ascent'].sum()) if 'has_significant_ascent' in activities else 0}.",
        f"- Blocs back-to-back détectés : {len(analysis.get('back_to_back', pd.DataFrame()))}.",
        "",
    ]

    lines += [
        "## Intensité",
        _figure(plots["heart_rate_distribution"], "Distribution FC"),
        _figure(plots["time_in_zones"], "Temps en zones FC"),
        "",
    ]
    zones = analysis.get("heart_rate_zones", pd.DataFrame())
    if zones.empty:
        lines.append("Zones FC non fournies ou données FC insuffisantes : synthèse descriptive uniquement.")
    else:
        zones_table = zones.copy()
        for column in ["seconds", "minutes"]:
            if column in zones_table:
                zones_table[column] = zones_table[column].apply(lambda value: _fmt(value, 1))
        if "share" in zones_table:
            zones_table["share"] = zones_table["share"].apply(lambda value: _fmt(value * 100, 0, " %"))
        lines.append(_markdown_table(zones_table))
    lines.append("")

    lines += [
        "## Sorties longues",
        _figure(plots["long_runs"], "Evolution des sorties longues"),
        "",
        _activity_table(
            analysis.get("top_long", pd.DataFrame()),
            ["start_time", "sport", "duration_hours", "distance_km", "ascent_m", "descent_m", "dplus_per_hour"],
        ),
        "",
        "## Charge estimée",
        _figure(plots["estimated_load"], "Charge estimée"),
        "",
        "La charge estimée est un indicateur simple : durée en minutes, pondérée par le ratio FC moyenne / référence FC quand la FC est disponible. Sans FC exploitable, la durée est utilisée comme proxy. Ce calcul sert à repérer des tendances, pas à mesurer une fatigue physiologique réelle.",
        "",
        f"- Charge hebdomadaire moyenne : {_fmt(weekly['estimated_load'].mean(skipna=True) if not weekly.empty else None, 1)}.",
        f"- Ratio aigu / chronique maximum : {_fmt(weekly['acute_chronic_ratio'].max(skipna=True) if not weekly.empty else None, 2)}.",
        f"- Monotonie hebdomadaire moyenne : {_fmt(weekly['monotony'].mean(skipna=True) if not weekly.empty else None, 2)}.",
        "",
        "## Points d’attention",
    ]
    alerts = analysis.get("alerts", {})
    for alert in alerts.get("alerts", []):
        lines.append(f"- {alert}")
    for note in alerts.get("notes", []):
        lines.append(f"- {note}")
    lines.append("")

    lines += [
        "## Données manquantes / limites",
    ]
    for limit in _missing_limits(activities, records, skipped, config):
        lines.append(f"- {limit}")
    lines.append("")

    lines += [
        "## Recommandations pour la suite",
        "Ne pas créer encore un plan d'entraînement complet. Pour construire un plan trail long solide, demander :",
        "- objectif trail ;",
        "- date de course ;",
        "- distance ;",
        "- D+ ;",
        "- D- ;",
        "- technicité ;",
        "- altitude ;",
        "- contraintes familiales ;",
        "- contraintes pro ;",
        "- historique blessures ;",
        "- disponibilité hebdomadaire ;",
        "- accès à côtes / montagne / tapis / vélo / musculation ;",
        "- zones FC connues ;",
        "- seuils connus ;",
        "- VFC / FC repos / sommeil si disponibles.",
        "",
        "## Top 10 D+",
        _activity_table(
            analysis.get("top_ascent", pd.DataFrame()),
            ["start_time", "sport", "duration_hours", "distance_km", "ascent_m", "descent_m", "dplus_per_hour"],
        ),
        "",
    ]

    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path
