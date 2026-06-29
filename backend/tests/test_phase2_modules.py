"""Backend API tests for Phase 2 modules:
Inscriptions, Trainings, Stats, Communications, Reports & updated Dashboard.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://ikas-futbol-base.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ctx():
    return {"teams": [], "players": [], "inscriptions": [], "trainings": [],
            "stats": [], "communications": [], "converted_players": []}


# ---------- prerequisites (team + 2 players, one with phone for sibling detection) ----------
class TestSetup:
    def test_create_team(self, session, ctx):
        r = session.post(f"{API}/teams", json={
            "nombre": "TEST_Ph2 Team", "categoria": "Alevín",
            "temporada": "2025-2026", "entrenador": "TEST_Coach Ph2"
        })
        assert r.status_code == 200, r.text
        ctx["teams"].append(r.json()["id"])

    def test_create_two_players(self, session, ctx):
        team_id = ctx["teams"][0]
        # Player1 has a known phone we'll reuse on the inscription to trigger sibling detection
        for nombre, phone in [("TEST_Aitor", "+34666123123"), ("TEST_Eneko", "+34611000111")]:
            r = session.post(f"{API}/players", json={
                "nombre": nombre, "apellidos": "TEST_Ph2",
                "fecha_nacimiento": "2015-04-01",
                "equipo_id": team_id, "estado": "activo",
                "progenitor1_nombre": "TEST_P", "progenitor1_telefono": phone,
                "progenitor1_email": f"{nombre.lower()}@test.eus",
            })
            assert r.status_code == 200, r.text
            ctx["players"].append(r.json()["id"])


# ---------- Inscriptions ----------
class TestInscriptions:
    def test_create_inscription_auto_category(self, session, ctx):
        r = session.post(f"{API}/inscriptions", json={
            "tipo": "alta", "nombre": "TEST_Insc Maite", "apellidos": "TEST_Lopez",
            "fecha_nacimiento": "2016-06-15",
            "progenitor1_nombre": "TEST_Mama", "progenitor1_telefono": "+34999000111",
            "progenitor1_email": "mama@test.eus",
            "estado": "recibida"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["nombre"] == "TEST_Insc Maite"
        assert d["categoria"] is not None  # auto-computed
        ctx["inscriptions"].append(d["id"])

    def test_list_inscriptions_has_siblings_field(self, session, ctx):
        r = session.get(f"{API}/inscriptions")
        assert r.status_code == 200
        target = next(i for i in r.json() if i["id"] == ctx["inscriptions"][0])
        assert "posibles_hermanos" in target
        # First inscription used unique phone, so should be empty
        assert target["posibles_hermanos"] == []

    def test_sibling_detection_via_progenitor_phone(self, session, ctx):
        # Use SAME phone as Player1 to trigger sibling match
        r = session.post(f"{API}/inscriptions", json={
            "tipo": "alta", "nombre": "TEST_Insc Hermano", "apellidos": "TEST_Aitor",
            "fecha_nacimiento": "2017-03-10",
            "progenitor1_nombre": "TEST_Padre Aitor", "progenitor1_telefono": "+34666123123",
            "progenitor1_email": "padre@test.eus",
            "estado": "recibida"
        })
        assert r.status_code == 200, r.text
        ctx["inscriptions"].append(r.json()["id"])

        r = session.get(f"{API}/inscriptions")
        target = next(i for i in r.json() if i["id"] == ctx["inscriptions"][1])
        assert len(target["posibles_hermanos"]) >= 1
        names = " ".join(s.get("nombre", "") for s in target["posibles_hermanos"])
        assert "TEST_Aitor" in names

    def test_update_inscription(self, session, ctx):
        iid = ctx["inscriptions"][0]
        r = session.put(f"{API}/inscriptions/{iid}", json={
            "tipo": "alta", "nombre": "TEST_Insc Maite", "apellidos": "TEST_Modified",
            "fecha_nacimiento": "2016-06-15",
            "estado": "revisada"
        })
        assert r.status_code == 200
        assert r.json()["estado"] == "revisada"
        assert r.json()["apellidos"] == "TEST_Modified"

    def test_inscription_to_player(self, session, ctx):
        iid = ctx["inscriptions"][1]  # the sibling-matched one
        r = session.post(f"{API}/inscriptions/{iid}/to-player")
        assert r.status_code == 200, r.text
        player = r.json()
        assert player["nombre"] == "TEST_Insc Hermano"
        assert player["categoria"] is not None
        ctx["converted_players"].append(player["id"])

        # Inscription should now have player_id and estado=aceptada
        listing = session.get(f"{API}/inscriptions").json()
        target = next(i for i in listing if i["id"] == iid)
        assert target["player_id"] == player["id"]
        assert target["estado"] == "aceptada"

    def test_to_player_idempotency_fails(self, session, ctx):
        iid = ctx["inscriptions"][1]
        r = session.post(f"{API}/inscriptions/{iid}/to-player")
        assert r.status_code == 400


# ---------- Trainings ----------
class TestTrainings:
    def test_create_training(self, session, ctx):
        team_id = ctx["teams"][0]
        payload = {
            "fecha": "2026-02-20", "hora": "18:00", "equipo_id": team_id,
            "campo": "TEST_Campo Sur",
            "asistencia": [
                {"player_id": ctx["players"][0], "estado": "presente"},
                {"player_id": ctx["players"][1], "estado": "justificada"},
            ],
            "ejercicios": "TEST_calentamiento, rondos",
            "observaciones": "TEST_obs",
        }
        r = session.post(f"{API}/trainings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        ctx["trainings"].append(d["id"])
        assert len(d["asistencia"]) == 2

    def test_list_trainings_counts(self, session, ctx):
        r = session.get(f"{API}/trainings")
        assert r.status_code == 200
        t = next(x for x in r.json() if x["id"] == ctx["trainings"][0])
        assert t["presentes"] == 1
        assert t["total_asistencia"] == 2
        assert t["equipo_nombre"] != "—"

    def test_get_training_enriched(self, session, ctx):
        r = session.get(f"{API}/trainings/{ctx['trainings'][0]}")
        assert r.status_code == 200
        a = r.json()["asistencia"]
        names = [x.get("nombre", "") for x in a]
        assert any("TEST_Aitor" in n for n in names)

    def test_update_training(self, session, ctx):
        tid = ctx["trainings"][0]
        r = session.put(f"{API}/trainings/{tid}", json={
            "fecha": "2026-02-21", "hora": "19:00", "equipo_id": ctx["teams"][0],
            "campo": "TEST_Campo Norte",
            "asistencia": [
                {"player_id": ctx["players"][0], "estado": "lesion"},
                {"player_id": ctx["players"][1], "estado": "presente"},
            ],
        })
        assert r.status_code == 200
        # Verify update
        listing = session.get(f"{API}/trainings").json()
        t = next(x for x in listing if x["id"] == tid)
        assert t["presentes"] == 1
        assert t["total_asistencia"] == 2


# ---------- Stats ----------
class TestStats:
    def test_create_stats(self, session, ctx):
        r = session.post(f"{API}/stats", json={
            "player_id": ctx["players"][0],
            "temporada": "2025-2026",
            "partidos_jugados": 10, "goles": 5, "asistencias": 3, "valoracion": 8
        })
        assert r.status_code == 200, r.text
        d = r.json()
        ctx["stats"].append(d["id"])
        assert d["goles"] == 5

    def test_list_stats_enriched(self, session, ctx):
        r = session.get(f"{API}/stats")
        assert r.status_code == 200
        row = next(x for x in r.json() if x["id"] == ctx["stats"][0])
        assert "TEST_Aitor" in row["player_nombre"]

    def test_update_stats(self, session, ctx):
        sid = ctx["stats"][0]
        r = session.put(f"{API}/stats/{sid}", json={
            "player_id": ctx["players"][0], "temporada": "2025-2026",
            "partidos_jugados": 11, "goles": 7, "asistencias": 4, "valoracion": 9
        })
        assert r.status_code == 200
        assert r.json()["goles"] == 7


# ---------- Communications ----------
class TestCommunications:
    def test_create_communication_marked_sent(self, session, ctx):
        r = session.post(f"{API}/communications", json={
            "destinatario_tipo": "equipo", "destinatario_id": ctx["teams"][0],
            "destinatario_nombre": "TEST_Ph2 Team",
            "canal": "email", "asunto": "TEST_Asunto", "mensaje": "TEST_Mensaje",
            "enviado": True
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["enviado"] is True
        assert d["fecha_envio"]  # auto-set
        ctx["communications"].append(d["id"])

    def test_list_communications(self, session, ctx):
        r = session.get(f"{API}/communications")
        assert r.status_code == 200
        c = next(x for x in r.json() if x["id"] == ctx["communications"][0])
        assert c["canal"] == "email"

    def test_update_communication(self, session, ctx):
        cid = ctx["communications"][0]
        r = session.put(f"{API}/communications/{cid}", json={
            "destinatario_tipo": "individual", "destinatario_id": ctx["players"][0],
            "canal": "whatsapp", "asunto": "TEST_Mod", "mensaje": "TEST_Mod msg",
            "enviado": True
        })
        assert r.status_code == 200
        assert r.json()["canal"] == "whatsapp"
        assert r.json()["destinatario_tipo"] == "individual"


# ---------- Dashboard updated ----------
class TestDashboardUpdated:
    def test_dashboard_includes_new_fields(self, session, ctx):
        r = session.get(f"{API}/dashboard")
        assert r.status_code == 200
        d = r.json()
        for key in ["proximos_entrenamientos", "inscripciones_pendientes"]:
            assert key in d
        # inscripciones_pendientes should be >= 1 (we have a 'revisada' inscription)
        assert d["inscripciones_pendientes"] >= 1
        # alertas should include an inscripcion alert
        alerts = [a for a in d.get("alertas", []) if a.get("tipo") == "inscripcion"]
        assert len(alerts) >= 1
        # proximos_entrenamientos sorted future-dated
        assert isinstance(d["proximos_entrenamientos"], list)


# ---------- Cleanup ----------
class TestZCleanup:
    def test_cleanup(self, session, ctx):
        for cid in ctx["communications"]:
            session.delete(f"{API}/communications/{cid}")
        for sid in ctx["stats"]:
            session.delete(f"{API}/stats/{sid}")
        for tid in ctx["trainings"]:
            session.delete(f"{API}/trainings/{tid}")
        for iid in ctx["inscriptions"]:
            session.delete(f"{API}/inscriptions/{iid}")
        for pid in ctx["converted_players"]:
            session.delete(f"{API}/players/{pid}")
        for pid in ctx["players"]:
            session.delete(f"{API}/players/{pid}")
        for t in ctx["teams"]:
            session.delete(f"{API}/teams/{t}")
