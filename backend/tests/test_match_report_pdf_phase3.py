from server import _match_report_pdf


def _context():
    return {
        "settings": {},
        "match": {
            "id": "match-1", "temporada": "2026-2027", "fecha": "2026-08-20", "hora": "18:00",
            "equipo_id": "team-1", "rival": "Rival", "campo": "Campo ficticio", "resultado_propio": 1,
            "resultado_rival": 0, "estado": "jugado", "tipo": "liga",
        },
        "team": {"id": "team-1", "nombre": "Equipo ficticio", "categoria": "Alevín", "modalidad": "F7"},
        "players": [
            {"id": "p1", "nombre": "Ane", "apellidos": "Ficticia"},
            {"id": "p2", "nombre": "June", "apellidos": "Ficticia"},
        ],
        "modality": "F7",
    }


def test_closed_match_report_pdf_is_non_empty_bilingual_and_omits_private_notes():
    report = {
        "status": "closed", "closed_at": "2026-08-20T20:00:00Z", "closed_by": "admin-test",
        "participants": [
            {"player_id": "p1", "role": "starter", "minutes": 60, "goals": 1,
             "incidents": ["Incidencia objetiva"], "internal_notes": "SECRETO-TECNICO"},
            {"player_id": "p2", "role": "substitute", "minutes": 20, "goals": 0,
             "incidents": [], "internal_notes": "OTRO-SECRETO"},
        ],
        "substitutions": [{
            "incoming_player_id": "p2", "outgoing_player_id": "p1", "period_id": "T3", "minute": 40,
        }],
        "goal_events": [{
            "kind": "player", "scorer_player_id": "p1", "period_id": "T2", "minute": 25,
        }],
        "internal_notes": "NOTA-PRIVADA-DEL-ACTA",
    }
    for language in ("es", "eu"):
        payload = _match_report_pdf(report, _context(), language).getvalue()
        assert payload.startswith(b"%PDF-")
        assert len(payload) > 2_000
        assert b"SECRETO-TECNICO" not in payload
        assert b"NOTA-PRIVADA-DEL-ACTA" not in payload
