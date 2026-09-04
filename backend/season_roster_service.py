"""Construcción segura de copias de temporada y plantillas históricas."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable, Mapping, Sequence


SEASON_PLAYER_FIELDS = ("categoria", "dorsal", "posicion", "estado")


def next_season_label(value: str | None) -> str:
    """Devuelve la etiqueta de temporada siguiente para formatos habituales."""
    text = str(value or "").strip()
    parts = text.split("-", 1)
    if len(parts) == 2 and all(part.isdigit() for part in parts):
        start, end = (int(part) for part in parts)
        return f"{end}-{end + 1}"
    if text.isdigit():
        return str(int(text) + 1)
    return ""


def _snapshot_fields(player: Mapping[str, Any], membership: Mapping[str, Any] | None = None) -> dict[str, Any]:
    membership = membership or {}
    return {field: membership.get(field, player.get(field)) for field in SEASON_PLAYER_FIELDS}


def _membership_document(
    *,
    identifier: str,
    player_id: str,
    team_id: str,
    season: str,
    snapshot: Mapping[str, Any],
    timestamp: str,
    source_team_id: str | None = None,
) -> dict[str, Any]:
    document = {
        "id": identifier,
        "player_id": player_id,
        "team_id": team_id,
        "temporada": season,
        "active": True,
        **{field: snapshot.get(field) for field in SEASON_PLAYER_FIELDS},
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    if source_team_id:
        document["source_team_id"] = source_team_id
    return document


def build_season_copy(
    source_teams: Sequence[Mapping[str, Any]],
    source_players: Sequence[Mapping[str, Any]],
    source_memberships: Sequence[Mapping[str, Any]],
    target_season: str,
    *,
    timestamp: str,
    id_factory: Callable[[], str],
) -> dict[str, Any]:
    """Prepara equipos, plantillas y actualizaciones sin tocar datos de origen.

    Los jugadores siguen siendo fichas únicas. La pertenencia a cada temporada
    se guarda en ``team_memberships`` y conserva categoría, dorsal, posición y
    estado de aquella plantilla como una pequeña instantánea operativa.
    """
    teams = [deepcopy(team) for team in source_teams if team.get("id")]
    players = {str(player.get("id")): deepcopy(player) for player in source_players if player.get("id")}
    source_ids = {str(team["id"]) for team in teams}
    memberships_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    inactive_pairs: set[tuple[str, str]] = set()
    for membership in source_memberships:
        team_id = str(membership.get("team_id") or "")
        player_id = str(membership.get("player_id") or "")
        if team_id in source_ids and player_id in players:
            if membership.get("active") is False:
                inactive_pairs.add((team_id, player_id))
                continue
            memberships_by_pair[(team_id, player_id)] = deepcopy(membership)

    # Legacy installations only have players.equipo_id. Those assignments are
    # materialised as historical memberships the first time a season is copied.
    for player_id, player in players.items():
        team_id = str(player.get("equipo_id") or "")
        if team_id in source_ids and (team_id, player_id) not in inactive_pairs:
            memberships_by_pair.setdefault((team_id, player_id), {
                "team_id": team_id,
                "player_id": player_id,
                **_snapshot_fields(player),
            })

    created_teams: list[dict[str, Any]] = []
    source_memberships_to_create: list[dict[str, Any]] = []
    target_memberships: list[dict[str, Any]] = []
    player_updates: dict[str, dict[str, Any]] = {}
    team_map: list[dict[str, Any]] = []

    for source_team in teams:
        source_team_id = str(source_team["id"])
        new_team = deepcopy(source_team)
        for field in ("_id", "id", "created_at", "updated_at", "num_jugadores"):
            new_team.pop(field, None)
        new_team.update({
            "id": id_factory(),
            "temporada": target_season,
            "estado": "activo",
            "created_at": timestamp,
            "updated_at": timestamp,
        })
        created_teams.append(new_team)

        team_players = [
            (player_id, player, membership)
            for (team_id, player_id), membership in memberships_by_pair.items()
            if team_id == source_team_id and (player := players.get(player_id))
        ]
        source_snapshot_count = 0
        for player_id, player, membership in team_players:
            snapshot = _snapshot_fields(player, membership)
            # If the source pair came from a legacy equipo_id, create its
            # immutable source membership before the canonical equipo_id moves.
            if "id" not in membership:
                source_memberships_to_create.append(_membership_document(
                    identifier=id_factory(), player_id=player_id, team_id=source_team_id,
                    season=str(source_team.get("temporada") or ""), snapshot=snapshot,
                    timestamp=timestamp,
                ))
                source_snapshot_count += 1
            target_memberships.append(_membership_document(
                identifier=id_factory(), player_id=player_id, team_id=new_team["id"],
                season=target_season, snapshot=snapshot, timestamp=timestamp,
                source_team_id=source_team_id,
            ))
            # The ordinary player contract continues to point at the latest
            # copied assignment, while historical queries use memberships.
            if player_id not in player_updates and (
                not player.get("equipo_id") or str(player.get("equipo_id")) in source_ids
            ):
                player_updates[player_id] = {
                    "player_id": player_id,
                    "previous_team_id": player.get("equipo_id"),
                    "new_team_id": new_team["id"],
                }

        team_map.append({
            "source_team_id": source_team_id,
            "team_id": new_team["id"],
            "nombre": new_team.get("nombre"),
            "jugadores": len(team_players),
            "source_membership_created": source_snapshot_count,
        })

    return {
        "teams": created_teams,
        "source_memberships": source_memberships_to_create,
        "memberships": target_memberships,
        "player_updates": list(player_updates.values()),
        "team_map": team_map,
        "teams_created": len(created_teams),
        "players_assigned": len(target_memberships),
        "source_memberships_created": len(source_memberships_to_create),
    }
