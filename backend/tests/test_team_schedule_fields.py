from server import Team


def test_team_schedule_fields_are_optional_for_legacy_documents():
    legacy = Team(nombre="Equipo histórico", dias_entrenamiento="L-X", horario="18:00")
    assert legacy.dias_entrenamiento == "L-X"
    assert legacy.dias_entrenamiento_lista is None
    assert legacy.hora_inicio is None
    assert legacy.direccion_campo is None


def test_team_accepts_structured_schedule_without_requiring_a_migration():
    team = Team(
        nombre="Equipo de prueba",
        dias_entrenamiento="Lunes, Miércoles",
        dias_entrenamiento_lista=["monday", "wednesday"],
        hora_inicio="18:00",
        hora_fin="19:30",
        campo="Campo Municipal",
        direccion_campo="Campo Municipal, Bilbao",
    )
    assert team.model_dump()["dias_entrenamiento_lista"] == ["monday", "wednesday"]
    assert team.model_dump()["horario"] is None
