"""Reglas puras para la biblioteca de ejercicios y la planificación de sesiones."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Iterable, Mapping


EXERCISE_CATEGORIES = (
    "warmup", "technique", "tactics", "fitness", "goalkeepers", "finishing",
    "possession", "small_sided_game", "set_pieces", "cooldown", "other",
)
INTENSITIES = ("low", "medium", "high")
VISIBILITIES = ("club", "teams", "private")
EXERCISE_STATES = ("active", "archived")
RATINGS = ("very_good", "good", "needs_improvement", "poor")


class ExerciseValidationError(ValueError):
    pass


def clean_text(value: Any, maximum: int = 500) -> str:
    text = " ".join(str(value or "").strip().split())
    return text[:maximum]


def clean_list(values: Any, maximum_items: int = 30, item_length: int = 300) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = [part for part in values.splitlines() if part.strip()]
    if not isinstance(values, list):
        raise ExerciseValidationError("La lista no tiene un formato válido")
    result = []
    for value in values[:maximum_items]:
        text = clean_text(value, item_length)
        if text and text not in result:
            result.append(text)
    return result


def positive_int(value: Any, field: str, *, minimum: int = 0, maximum: int = 600) -> int | None:
    if value in (None, ""):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ExerciseValidationError(f"{field} debe ser un número entero") from exc
    if number < minimum or number > maximum:
        raise ExerciseValidationError(f"{field} está fuera del intervalo permitido")
    return number


def normalize_exercise(payload: Mapping[str, Any], *, partial: bool = False) -> dict:
    result: dict[str, Any] = {}
    required = ("name", "category", "objective", "description")
    for field in required:
        if field in payload or not partial:
            result[field] = clean_text(payload.get(field), 160 if field != "description" else 3000)
            if not result[field]:
                raise ExerciseValidationError(f"{field} es obligatorio")
    category = result.get("category", payload.get("category"))
    if category is not None and category not in EXERCISE_CATEGORIES:
        raise ExerciseValidationError("Categoría no válida")
    for field, length in (
        ("recommended_space", 500), ("safety_notes", 1500), ("image_url", 1000),
    ):
        if field in payload or not partial:
            result[field] = clean_text(payload.get(field), length) or None
    if "instructions" in payload or not partial:
        result["instructions"] = clean_list(payload.get("instructions"), 40, 500)
    if "materials" in payload or not partial:
        result["materials"] = clean_list(payload.get("materials"), 30, 120)
    for field, maximum in (
        ("recommended_duration", 240), ("min_players", 100), ("max_players", 100),
    ):
        if field in payload or not partial:
            result[field] = positive_int(payload.get(field), field, minimum=1, maximum=maximum)
    minimum, maximum = result.get("min_players"), result.get("max_players")
    if minimum is not None and maximum is not None and minimum > maximum:
        raise ExerciseValidationError("El mínimo de jugadores no puede superar el máximo")
    if "intensity" in payload or not partial:
        result["intensity"] = clean_text(payload.get("intensity") or "medium", 20)
        if result["intensity"] not in INTENSITIES:
            raise ExerciseValidationError("Intensidad no válida")
    if "visibility" in payload or not partial:
        result["visibility"] = clean_text(payload.get("visibility") or "private", 20)
        if result["visibility"] not in VISIBILITIES:
            raise ExerciseValidationError("Visibilidad no válida")
    if payload.get("status") not in (None, ""):
        result["status"] = clean_text(payload.get("status"), 20)
        if result["status"] not in EXERCISE_STATES:
            raise ExerciseValidationError("Estado no válido")
    if "team_ids" in payload or not partial:
        result["team_ids"] = clean_list(payload.get("team_ids"), 100, 80)
    if result.get("visibility") == "teams" and not result.get("team_ids"):
        raise ExerciseValidationError("Selecciona al menos un equipo para esta visibilidad")
    return result


def exercise_snapshot(exercise: Mapping[str, Any]) -> dict:
    return {
        "name": clean_text(exercise.get("name"), 160),
        "category": exercise.get("category"),
        "objective": clean_text(exercise.get("objective"), 160),
    }


def normalize_planned_exercises(
    rows: Any, exercises: Mapping[str, Mapping[str, Any]], *, allow_archived_existing: bool = False,
) -> list[dict]:
    if rows is None:
        return []
    if not isinstance(rows, list) or len(rows) > 60:
        raise ExerciseValidationError("La planificación no tiene un formato válido")
    result = []
    seen = set()
    for position, raw in enumerate(rows):
        exercise_id = clean_text(raw.get("exercise_id"), 80)
        exercise = exercises.get(exercise_id)
        if not exercise:
            raise ExerciseValidationError("Uno de los ejercicios no existe")
        if exercise.get("status", "active") != "active" and not allow_archived_existing:
            raise ExerciseValidationError("No se puede añadir un ejercicio archivado")
        if exercise_id in seen:
            raise ExerciseValidationError("Un ejercicio no puede repetirse en la sesión")
        seen.add(exercise_id)
        completed = raw.get("completed")
        if completed not in (None, True, False):
            raise ExerciseValidationError("El estado de realización no es válido")
        actual = positive_int(raw.get("actual_duration"), "actual_duration", minimum=0, maximum=240)
        planned = positive_int(
            raw.get("planned_duration", exercise.get("recommended_duration")),
            "planned_duration", minimum=1, maximum=240,
        )
        rating = clean_text(raw.get("rating"), 30) or None
        if rating and rating not in RATINGS:
            raise ExerciseValidationError("Valoración no válida")
        reason = clean_text(raw.get("not_completed_reason"), 500) or None
        if completed is False and not reason:
            raise ExerciseValidationError("Indica el motivo de no realización")
        result.append({
            "exercise_id": exercise_id,
            "snapshot": exercise_snapshot(exercise),
            "planned_duration": planned,
            "order": position + 1,
            "completed": completed,
            "actual_duration": actual,
            "rating": rating,
            "observation": clean_text(raw.get("observation"), 1000) or None,
            "not_completed_reason": reason,
        })
    return result


def normalize_template(payload: Mapping[str, Any], exercises: Mapping[str, Mapping[str, Any]]) -> dict:
    name = clean_text(payload.get("name"), 160)
    if not name:
        raise ExerciseValidationError("El nombre de la plantilla es obligatorio")
    visibility = clean_text(payload.get("visibility") or "private", 20)
    if visibility not in VISIBILITIES:
        raise ExerciseValidationError("Visibilidad no válida")
    team_ids = clean_list(payload.get("team_ids"), 100, 80)
    if visibility == "teams" and not team_ids:
        raise ExerciseValidationError("Selecciona el ámbito de la plantilla")
    return {
        "name": name,
        "description": clean_text(payload.get("description"), 1000) or None,
        "team_ids": team_ids,
        "visibility": visibility,
        "status": "archived" if payload.get("status") == "archived" else "active",
        "planned_exercises": normalize_planned_exercises(payload.get("planned_exercises"), exercises),
    }


def exercise_statistics(exercises: Iterable[dict], trainings: Iterable[dict]) -> dict:
    exercise_map = {item.get("id"): item for item in exercises if item.get("id")}
    planned = Counter()
    completed = Counter()
    planned_minutes = Counter()
    actual_minutes = Counter()
    omitted = Counter()
    ratings: dict[str, list[int]] = defaultdict(list)
    rating_values = {"poor": 1, "needs_improvement": 2, "good": 3, "very_good": 4}
    category_usage = Counter()
    objective_usage = Counter()
    team_usage: dict[str, Counter] = defaultdict(Counter)
    season_usage: dict[str, Counter] = defaultdict(Counter)
    for training in trainings:
        for row in training.get("planned_exercises") or []:
            identifier = row.get("exercise_id")
            if identifier not in exercise_map:
                continue
            planned[identifier] += 1
            planned_minutes[identifier] += int(row.get("planned_duration") or 0)
            if row.get("completed") is True:
                completed[identifier] += 1
                actual_minutes[identifier] += int(row.get("actual_duration") or 0)
            elif row.get("completed") is False:
                omitted[identifier] += 1
            if row.get("rating") in rating_values:
                ratings[identifier].append(rating_values[row["rating"]])
            exercise = exercise_map[identifier]
            category_usage[exercise.get("category") or "other"] += 1
            objective_usage[exercise.get("objective") or "—"] += 1
            team_usage[str(training.get("equipo_id") or "—")][identifier] += 1
            season_usage[str(training.get("temporada") or "—")][identifier] += 1
    rows = []
    for identifier, exercise in exercise_map.items():
        total = planned[identifier]
        rows.append({
            "exercise_id": identifier,
            "name": exercise.get("name"),
            "category": exercise.get("category"),
            "objective": exercise.get("objective"),
            "planned_count": total,
            "completed_count": completed[identifier],
            "completion_rate": round(completed[identifier] * 100 / total, 1) if total else 0,
            "planned_minutes": planned_minutes[identifier],
            "actual_minutes": actual_minutes[identifier],
            "average_rating": round(sum(ratings[identifier]) / len(ratings[identifier]), 2) if ratings[identifier] else None,
            "omitted_count": omitted[identifier],
        })
    rows.sort(key=lambda row: (-row["planned_count"], str(row["name"] or "").casefold()))
    return {
        "exercises": rows,
        "by_category": dict(category_usage),
        "by_objective": dict(objective_usage),
        "by_team": {key: dict(value) for key, value in team_usage.items()},
        "by_season": {key: dict(value) for key, value in season_usage.items()},
    }
