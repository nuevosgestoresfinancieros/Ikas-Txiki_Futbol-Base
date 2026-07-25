"""Roles, permisos y utilidades de ámbito para Ikas-Txiki."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Dict, Iterable, Mapping, Optional, Set

from fastapi import HTTPException, Request


ROLES = ("admin", "coordinator", "coach", "family", "player")
ACTIONS = ("read", "create", "edit", "delete", "export", "administer", "respond")
RESOURCES = (
    "dashboard", "users", "players", "families", "teams", "trainings",
    "matches", "callups", "attendance", "payments", "authorizations",
    "inscriptions", "communications", "reports", "stats", "search",
    "equipment", "settings", "modalities", "data", "calendar", "portal", "notifications", "assistant",
)


def _actions(*values: str) -> Set[str]:
    return set(values)


ROLE_PERMISSIONS: Dict[str, Dict[str, Set[str]]] = {
    "admin": {resource: set(ACTIONS) for resource in RESOURCES},
    "coordinator": {
        "dashboard": _actions("read"),
        "players": _actions("read", "create", "edit", "export"),
        "families": _actions("read", "edit"),
        "teams": _actions("read", "edit", "export"),
        "trainings": _actions("read", "create", "edit", "delete", "export"),
        "matches": _actions("read", "create", "edit", "delete", "export"),
        "callups": _actions("read", "create", "edit", "delete", "export"),
        "attendance": _actions("read", "edit", "export"),
        "authorizations": _actions("read", "create", "edit", "export"),
        "inscriptions": _actions("read", "edit", "export"),
        "communications": _actions("read", "create", "edit", "export"),
        "reports": _actions("read", "export"),
        "stats": _actions("read", "create", "edit", "export"),
        "search": _actions("read"),
        "equipment": _actions("read", "edit", "export"),
        "calendar": _actions("read", "create", "edit", "delete", "export"),
        "notifications": _actions("read", "edit"),
        "modalities": _actions("read"),
        "assistant": _actions("read", "create", "edit"),
    },
    "coach": {
        "dashboard": _actions("read"),
        "players": _actions("read"),
        "teams": _actions("read"),
        "trainings": _actions("read", "create", "edit", "delete", "export"),
        "matches": _actions("read", "create", "edit", "delete", "export"),
        "callups": _actions("read", "create", "edit", "delete", "export"),
        "attendance": _actions("read", "edit", "export"),
        "communications": _actions("read", "create"),
        "reports": _actions("read", "export"),
        "stats": _actions("read", "edit"),
        "search": _actions("read"),
        "equipment": _actions("read"),
        "calendar": _actions("read", "create", "edit", "delete", "export"),
        "notifications": _actions("read", "edit"),
        "modalities": _actions("read"),
        "assistant": _actions("read", "create", "edit"),
    },
    "family": {
        "dashboard": _actions("read"),
        "players": _actions("read"),
        "families": _actions("read"),
        "teams": _actions("read"),
        "trainings": _actions("read"),
        "matches": _actions("read"),
        "callups": _actions("read", "respond"),
        "payments": _actions("read", "export"),
        "authorizations": _actions("read", "export"),
        "communications": _actions("read"),
        "reports": _actions("read", "export"),
        "stats": _actions("read"),
        "search": _actions("read"),
        "calendar": _actions("read", "export"),
        "portal": _actions("read"),
        "notifications": _actions("read", "edit"),
        "modalities": _actions("read"),
        "assistant": _actions("read", "create", "edit"),
    },
    "player": {
        "dashboard": _actions("read"),
        "players": _actions("read"),
        "teams": _actions("read"),
        "trainings": _actions("read"),
        "matches": _actions("read"),
        "callups": _actions("read", "respond"),
        "authorizations": _actions("read", "export"),
        "communications": _actions("read"),
        "reports": _actions("read", "export"),
        "stats": _actions("read"),
        "search": _actions("read"),
        "calendar": _actions("read", "export"),
        "portal": _actions("read"),
        "notifications": _actions("read", "edit"),
        "modalities": _actions("read"),
        "assistant": _actions("read", "create", "edit"),
    },
}


PATH_RESOURCES = {
    "players": "players", "families": "families", "teams": "teams",
    "trainings": "trainings", "matches": "matches", "callups": "callups",
    "payments": "payments", "authorizations": "authorizations",
    "attendance": "attendance",
    "inscriptions": "inscriptions", "communications": "communications",
    "reports": "reports", "stats": "stats", "search": "search",
    "equipment": "equipment", "settings": "settings", "dashboard": "dashboard",
    "users": "users", "categories": "teams", "compute-category": "players", "calendar": "calendar", "portal": "portal", "notifications": "notifications", "modalities": "modalities",
    "inscription-imports": "data", "assistant": "assistant",
    "export-excel": "data", "import-excel": "data", "clear-all": "data",
    "seed-demo": "data",
}


current_user_context: ContextVar[Optional[dict]] = ContextVar("current_user", default=None)


def public_user(user: Mapping[str, Any]) -> dict:
    role = str(user.get("role", "player"))
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "role": role,
        "active": bool(user.get("active", True)),
        "assigned_team_ids": list(user.get("assigned_team_ids") or []),
        "player_id": user.get("player_id"),
        "family_id": user.get("family_id"),
        "last_access_at": user.get("last_access_at"),
        "language": user.get("language", "es"),
        "notification_preferences": dict(user.get("notification_preferences") or {}),
        "permissions": {
            resource: sorted(actions)
            for resource, actions in ROLE_PERMISSIONS.get(role, {}).items()
        },
    }


def has_permission(user: Mapping[str, Any], resource: str, action: str) -> bool:
    if not user.get("active", True):
        return False
    return action in ROLE_PERMISSIONS.get(str(user.get("role")), {}).get(resource, set())


def route_permission(request: Request) -> tuple[str, str]:
    parts = [part for part in request.url.path.split("/") if part]
    first = parts[1] if len(parts) > 1 and parts[0] == "api" else ""
    resource = PATH_RESOURCES.get(first, first or "dashboard")
    method = request.method.upper()
    if first == "callups" and "respond" in parts:
        return "callups", "respond"
    if first == "reports" and "preview" in parts:
        return "reports", "read"
    if first == "reports" and any(part.startswith("export.") for part in parts):
        return "reports", "export"
    if first == "assistant":
        if "confirm" in parts or "cancel" in parts:
            return "assistant", "edit"
        return "assistant", "create" if method == "POST" else "read"
    if first in {"clear-all", "seed-demo", "import-excel", "inscription-imports"}:
        return resource, "administer"
    if first == "export-excel" or "pdf" in parts or "signed-file" in parts or any(part.endswith((".pdf", ".xlsx", ".ics")) for part in parts):
        return resource, "export" if method == "GET" else "edit"
    if resource == "settings" and method != "GET":
        return resource, "administer"
    if resource == "users":
        return resource, "administer"
    return resource, {"GET": "read", "POST": "create", "PUT": "edit", "PATCH": "edit", "DELETE": "delete"}.get(method, "administer")


def enforce_permission(user: Mapping[str, Any], resource: str, action: str) -> None:
    if not has_permission(user, resource, action):
        raise HTTPException(status_code=403, detail="No tienes permiso para realizar esta acción")


def merge_query(query: Optional[dict], scope: Optional[dict]) -> dict:
    query = query or {}
    if not scope:
        return query
    if not query:
        return scope
    return {"$and": [query, scope]}


def ids(values: Iterable[Any]) -> list[str]:
    return [str(value) for value in values if value]


def enforce_related_scope(
    collection: str, data: Mapping[str, Any], team_ids: Set[str], player_ids: Set[str]
) -> None:
    """Impide introducir referencias ajenas dentro de un recurso autorizado."""
    if collection == "trainings":
        referenced = {item.get("player_id") for item in data.get("asistencia", []) if item.get("player_id")}
        if not referenced.issubset(player_ids):
            raise HTTPException(status_code=403, detail="La asistencia contiene jugadores fuera de tu ámbito")
    if collection == "callups":
        referenced = {item.get("player_id") for item in data.get("convocados", []) if item.get("player_id")}
        if not referenced.issubset(player_ids):
            raise HTTPException(status_code=403, detail="La convocatoria contiene jugadores fuera de tu ámbito")
    if collection == "communications":
        target_type = data.get("destinatario_tipo")
        target_id = data.get("destinatario_id")
        if not (
            (target_type == "equipo" and target_id in team_ids)
            or (target_type == "individual" and target_id in player_ids)
        ):
            raise HTTPException(status_code=403, detail="El destinatario no pertenece a tu ámbito")
