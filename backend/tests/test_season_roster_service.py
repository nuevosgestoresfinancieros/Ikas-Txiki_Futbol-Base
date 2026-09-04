from season_roster_service import build_season_copy, next_season_label


def test_next_season_label_supports_year_and_year_range():
    assert next_season_label("2026") == "2027"
    assert next_season_label("2026-2027") == "2027-2028"
    assert next_season_label("temporada actual") == ""


def test_season_copy_materializes_legacy_roster_without_mutating_source():
    teams = [{
        "id": "team-old", "nombre": "Alevín A", "categoria": "Alevín",
        "temporada": "2026-2027", "estado": "cerrado", "created_at": "old",
    }]
    players = [{
        "id": "player-1", "nombre": "Ane", "equipo_id": "team-old",
        "dorsal": "8", "posicion": "Medio", "estado": "activo",
    }]
    identifiers = iter(["new-team", "source-membership", "target-membership"])

    plan = build_season_copy(
        teams, players, [], "2027-2028", timestamp="now", id_factory=lambda: next(identifiers),
    )

    assert teams[0]["temporada"] == "2026-2027"
    assert players[0]["equipo_id"] == "team-old"
    assert plan["teams"][0]["id"] == "new-team"
    assert plan["teams"][0]["temporada"] == "2027-2028"
    assert plan["teams"][0]["estado"] == "activo"
    assert plan["source_memberships"][0]["team_id"] == "team-old"
    assert plan["memberships"][0]["team_id"] == "new-team"
    assert plan["memberships"][0]["player_id"] == "player-1"
    assert plan["player_updates"] == [{
        "player_id": "player-1", "previous_team_id": "team-old", "new_team_id": "new-team",
    }]


def test_season_copy_uses_existing_membership_snapshot():
    teams = [{"id": "team-old", "nombre": "Cadete A", "temporada": "2026-2027"}]
    players = [{
        "id": "player-1", "nombre": "Iker", "equipo_id": "team-old",
        "dorsal": "99", "posicion": "Defensa", "estado": "activo",
    }]
    memberships = [{
        "id": "membership-old", "team_id": "team-old", "player_id": "player-1",
        "temporada": "2026-2027", "active": True,
        "dorsal": "4", "posicion": "Portero", "estado": "baja",
    }]
    identifiers = iter(["new-team", "target-membership"])

    plan = build_season_copy(
        teams, players, memberships, "2027-2028", timestamp="now", id_factory=lambda: next(identifiers),
    )

    assert plan["source_memberships"] == []
    assert plan["memberships"][0]["dorsal"] == "4"
    assert plan["memberships"][0]["posicion"] == "Portero"
    assert plan["memberships"][0]["estado"] == "baja"
    assert plan["source_memberships_created"] == 0


def test_season_copy_does_not_readd_an_inactive_source_membership():
    teams = [{"id": "team-old", "nombre": "Cadete A", "temporada": "2026-2027"}]
    players = [{"id": "player-1", "nombre": "June", "equipo_id": "team-old"}]
    inactive = [{
        "id": "membership-old", "team_id": "team-old", "player_id": "player-1",
        "temporada": "2026-2027", "active": False,
    }]
    identifiers = iter(["new-team"])

    plan = build_season_copy(
        teams, players, inactive, "2027-2028", timestamp="now", id_factory=lambda: next(identifiers),
    )

    assert plan["memberships"] == []
    assert plan["player_updates"] == []
