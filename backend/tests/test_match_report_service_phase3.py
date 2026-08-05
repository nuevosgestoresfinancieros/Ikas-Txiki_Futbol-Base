import pytest

from match_report_service import (
    MatchReportValidationError,
    build_objective_statistics,
    dry_run_historical_rows,
    period_configuration,
    validate_goal_events,
    validate_participants,
    validate_substitutions,
)


def participant(player_id="player-1", **changes):
    row = {
        "player_id": player_id,
        "called_up": True,
        "role": "starter",
        "played": True,
        "minutes": 60,
        "period_ids": ["T1", "T2", "T3"],
        "entries": 0,
        "exits": 0,
        "changes": [],
        "goals": 0,
        "own_goals": 0,
    }
    row.update(changes)
    return row


def test_f7_and_f11_periods_are_backend_configured_and_extensible():
    f7 = period_configuration("F7")
    assert [row["id"] for row in f7["periods"]] == ["T1", "T2", "T3"]
    assert f7["total_minutes"] == 60

    f11 = period_configuration("F11")
    assert [row["id"] for row in f11["periods"]] == ["P1", "P2"]
    assert f11["total_minutes"] == 90

    custom = period_configuration("F7", {
        "periods": [
            {"id": "Q1", "name_es": "Cuarto 1", "name_eu": "1. laurdena", "planned_minutes": 15},
            {"id": "Q2", "name_es": "Cuarto 2", "name_eu": "2. laurdena", "planned_minutes": 15},
            {"id": "Q3", "name_es": "Cuarto 3", "name_eu": "3. laurdena", "planned_minutes": 15},
            {"id": "Q4", "name_es": "Cuarto 4", "name_eu": "4. laurdena", "planned_minutes": 15},
        ]
    })
    assert custom["total_minutes"] == 60
    assert len(custom["periods"]) == 4


def test_participation_contract_distinguishes_called_from_played():
    rows = [
        participant("starter"),
        participant("sub-playing", role="substitute", minutes=20, period_ids=["T3"], entries=1),
        participant("sub-bench", role="substitute", played=False, minutes=0, period_ids=[]),
        participant("called-no-play", role="did_not_play", played=False, minutes=0, period_ids=[]),
        participant("not-called", called_up=False, role="not_called", played=False, minutes=0, period_ids=[]),
    ]
    result = validate_participants(rows, period_configuration("F7"), strict=True)
    assert result["errors"] == []


@pytest.mark.parametrize("changes,message", [
    ({"minutes": 61}, "minutos"),
    ({"played": False, "minutes": 10}, "no participa"),
    ({"period_ids": ["T4"]}, "periodo"),
    ({"goals": -1}, "goles"),
    ({"entries": 2, "exits": 0}, "entradas"),
])
def test_invalid_minutes_periods_goals_and_changes_block_close(changes, message):
    result = validate_participants([participant(**changes)], period_configuration("F7"), strict=True)
    assert any(message in error.lower() for error in result["errors"])


def test_duplicate_players_block_any_save_and_goal_difference_is_warning():
    result = validate_participants(
        [participant(goals=1), participant(goals=1)],
        period_configuration("F7"),
        official_own_goals=3,
        strict=True,
    )
    assert any("duplicado" in error.lower() for error in result["errors"])
    assert any("marcador" in warning.lower() for warning in result["warnings"])


def test_statistics_use_only_closed_reports_and_are_descriptive():
    reports = [
        {
            "status": "closed", "temporada": "2026-2027", "equipo_id": "team-1", "modalidad": "F7",
            "period_configuration": period_configuration("F7"),
            "goal_events": [{"kind": "player", "scorer_player_id": "p1"}, {"kind": "player", "scorer_player_id": "p1"}],
            "participants": [
                participant("p1", role="starter", minutes=60, goals=2, exits=1),
                participant("p2", role="substitute", minutes=20, entries=1),
                participant("p3", role="did_not_play", played=False, minutes=0, period_ids=[]),
            ],
        },
        {"status": "draft", "participants": [participant("p1", goals=99)]},
    ]
    stats = build_objective_statistics(reports, {"player_id": "p1"})
    assert stats["totals"] == {
        "called_matches": 1, "available_matches": 1, "starts": 1, "substitute_matches": 0, "played_matches": 1,
        "did_not_play": 0, "minutes": 60, "entries": 0, "exits": 1, "goals": 2,
        "own_goals": 0, "incidents": 0,
    }
    assert "rating" not in stats["totals"]
    assert stats["players"][0]["minutes_percentage"] == 100
    assert stats["players"][0]["average_minutes"] == 60


def test_f7_and_f11_reject_too_many_initial_starters():
    for modality, limit in (("F7", 7), ("F11", 11)):
        rows = [participant(f"p-{index}", minutes=20) for index in range(limit + 1)]
        result = validate_participants(rows, period_configuration(modality), strict=True)
        assert any(str(limit) in error and "titulares" in error for error in result["errors"])


def test_substitution_sequence_requires_active_outgoing_and_inactive_incoming():
    players = [
        participant("starter"),
        participant("bench", role="substitute", played=True, minutes=20, period_ids=["T3"]),
    ]
    valid = validate_substitutions(players, [{
        "incoming_player_id": "bench", "outgoing_player_id": "starter", "period_id": "T3", "minute": 40,
    }], period_configuration("F7"))
    assert valid["errors"] == []
    invalid = validate_substitutions(players, [{
        "incoming_player_id": "starter", "outgoing_player_id": "bench", "period_id": "T3", "minute": 40,
    }], period_configuration("F7"))
    assert any("activo" in error for error in invalid["errors"])


def test_goal_events_block_close_when_score_differs_unless_admin_discrepancy_is_documented():
    players = [participant("p1")]
    goals = [{"kind": "player", "scorer_player_id": "p1", "period_id": "T1", "minute": 10}]
    blocked = validate_goal_events(
        players, goals, period_configuration("F7"), official_own_goals=2, strict=True,
    )
    assert any("marcador oficial" in error for error in blocked["errors"])
    justified = validate_goal_events(
        players, goals, period_configuration("F7"), official_own_goals=2, strict=True,
        discrepancy_confirmed=True, discrepancy_reason="Gol colectivo documentado en el acta arbitral",
    )
    assert justified["errors"] == []
    assert justified["warnings"]


def test_declined_or_exceptional_participation_requires_explicit_reason_and_confirmation():
    declined = participant("declined", callup_response="declined")
    exceptional = participant("exceptional", called_up=False)
    result = validate_participants([declined, exceptional], period_configuration("F7"), strict=True)
    assert any("rechazó" in error for error in result["errors"])
    assert any("no estaba convocado" in error for error in result["errors"])
    accepted = validate_participants([
        participant("declined", callup_response="declined", availability_override_reason="Cambio confirmado", warning_confirmed=True),
        participant("exceptional", called_up=False, exceptional_reason="Alta excepcional autorizada", warning_confirmed=True),
    ], period_configuration("F7"), strict=True)
    assert accepted["errors"] == []


def test_historical_dry_run_never_writes_and_reports_ambiguous_or_duplicate_rows():
    rows = [
        {"match_id": "m1", "player_id": "p1", "minutes": 20, "role": "substitute"},
        {"match_id": "m1", "player_id": "p1", "minutes": 20, "role": "substitute"},
        {"match_id": "unknown", "player_id": "p1", "minutes": 20},
        {"match_id": "m2", "player_id": "unknown", "minutes": 20},
        {"match_id": "closed", "player_id": "p2", "minutes": 20},
    ]
    result = dry_run_historical_rows(
        rows,
        known_match_ids={"m1", "m2", "closed"},
        known_player_ids={"p1", "p2"},
        closed_match_ids={"closed"},
        match_contexts={
            "m1": {"team_id": "team-1", "modality": "F7"},
            "m2": {"team_id": "team-1", "modality": "F7"},
            "closed": {"team_id": "team-1", "modality": "F7"},
            "unknown": {"team_id": "team-1", "modality": "F7"},
        },
        player_contexts={
            "p1": {"team_id": "team-1"},
            "p2": {"team_id": "team-1"},
        },
    )
    assert result["dry_run"] is True
    assert result["summary"] == {"rows": 5, "valid": 1, "warnings": 0, "errors": 4, "duplicates": 1}
    assert all("status" in row for row in result["rows"])


def test_historical_dry_run_validates_modality_periods_minutes_and_team_membership():
    result = dry_run_historical_rows(
        [{
            "match_id": "m1", "player_id": "p1", "modality": "F7",
            "role": "starter", "played": True, "minutes": 61,
            "period_ids": ["T4"], "goals": -1, "incidents": "texto",
        }],
        known_match_ids={"m1"},
        known_player_ids={"p1"},
        match_contexts={"m1": {"team_id": "team-1", "modality": "F7"}},
        player_contexts={"p1": {"team_id": "team-2"}},
    )
    assert result["can_import"] is False
    errors = " ".join(result["rows"][0]["errors"]).lower()
    assert "equipo" in errors
    assert "minutos" in errors
    assert "periodo" in errors
    assert "goles" in errors
    assert "incidencias" in errors


def test_unknown_modality_is_rejected_instead_of_assuming_ninety_minutes():
    with pytest.raises(MatchReportValidationError):
        period_configuration("F9")
