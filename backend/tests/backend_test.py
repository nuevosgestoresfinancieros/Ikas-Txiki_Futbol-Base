"""Backend API tests for Ikas-Txiki Manager"""
import pytest
from datetime import date

API = "/api"


@pytest.fixture(scope="module")
def created_ids():
    return {"players": [], "teams": [], "families": [], "matches": [],
            "callups": [], "payments": [], "authorizations": []}


# ---------- Health / Dashboard ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()

    def test_dashboard(self, session):
        r = session.get(f"{API}/dashboard")
        assert r.status_code == 200
        data = r.json()
        for k in ["jugadores_activos", "total_jugadores", "nuevas_inscripciones",
                  "documentacion_pendiente", "pagos_pendientes",
                  "autorizaciones_pendientes", "proximos_partidos", "alertas"]:
            assert k in data

    def test_categories(self, session):
        r = session.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) >= 6
        assert any(c["name"] == "Alevín" for c in cats)

    def test_compute_category_alevin(self, session):
        # A child born in 2015: season age depends on date; check that endpoint responds
        r = session.get(f"{API}/compute-category", params={"fecha_nacimiento": "2015-05-10"})
        assert r.status_code == 200
        cat = r.json().get("categoria")
        assert cat is not None


# ---------- Teams ----------
class TestTeams:
    def test_create_team(self, session, created_ids):
        payload = {"nombre": "TEST_Alevines A", "categoria": "Alevín",
                   "temporada": "2025-2026", "entrenador": "TEST_Coach"}
        r = session.post(f"{API}/teams", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["nombre"] == payload["nombre"]
        assert "id" in data
        created_ids["teams"].append(data["id"])

    def test_list_teams(self, session, created_ids):
        r = session.get(f"{API}/teams")
        assert r.status_code == 200
        teams = r.json()
        ids = [t["id"] for t in teams]
        assert created_ids["teams"][0] in ids
        team = next(t for t in teams if t["id"] == created_ids["teams"][0])
        assert "num_jugadores" in team

    def test_update_team(self, session, created_ids):
        tid = created_ids["teams"][0]
        r = session.put(f"{API}/teams/{tid}", json={"nombre": "TEST_Alevines A2", "categoria": "Alevín"})
        assert r.status_code == 200
        assert r.json()["nombre"] == "TEST_Alevines A2"


# ---------- Families ----------
class TestFamilies:
    def test_create_family(self, session, created_ids):
        r = session.post(f"{API}/families", json={
            "progenitor1_nombre": "TEST_Padre", "progenitor1_email": "p1@test.com",
            "preferencia_comunicacion": "whatsapp"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["progenitor1_nombre"] == "TEST_Padre"
        created_ids["families"].append(d["id"])

    def test_list_families_num_hijos(self, session, created_ids):
        r = session.get(f"{API}/families")
        assert r.status_code == 200
        fam = next(f for f in r.json() if f["id"] == created_ids["families"][0])
        assert fam["num_hijos"] == 0


# ---------- Players ----------
class TestPlayers:
    def test_create_player_with_team_and_category(self, session, created_ids):
        team_id = created_ids["teams"][0]
        fam_id = created_ids["families"][0]
        payload = {
            "nombre": "TEST_Iker", "apellidos": "TEST_Goikoetxea",
            "fecha_nacimiento": "2015-05-10",
            "equipo_id": team_id, "familia_id": fam_id,
            "estado": "activo", "nueva_incorporacion": True,
        }
        r = session.post(f"{API}/players", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["nombre"] == "TEST_Iker"
        assert data["categoria"] is not None  # auto-computed
        assert data["equipo_id"] == team_id
        created_ids["players"].append(data["id"])

    def test_get_player_persisted(self, session, created_ids):
        pid = created_ids["players"][0]
        r = session.get(f"{API}/players/{pid}")
        assert r.status_code == 200
        assert r.json()["nombre"] == "TEST_Iker"

    def test_family_num_hijos_increments(self, session, created_ids):
        r = session.get(f"{API}/families")
        fam = next(f for f in r.json() if f["id"] == created_ids["families"][0])
        assert fam["num_hijos"] == 1

    def test_search_players(self, session):
        r = session.get(f"{API}/players", params={"q": "TEST_Iker"})
        assert r.status_code == 200
        assert any("TEST_Iker" in p.get("nombre", "") for p in r.json())

    def test_filter_players_by_team(self, session, created_ids):
        r = session.get(f"{API}/players", params={"equipo_id": created_ids["teams"][0]})
        assert r.status_code == 200
        assert all(p.get("equipo_id") == created_ids["teams"][0] for p in r.json())

    def test_update_player(self, session, created_ids):
        pid = created_ids["players"][0]
        r = session.put(f"{API}/players/{pid}", json={
            "nombre": "TEST_Iker", "apellidos": "TEST_Modified",
            "fecha_nacimiento": "2015-05-10", "estado": "activo"
        })
        assert r.status_code == 200
        # Verify persistence
        g = session.get(f"{API}/players/{pid}").json()
        assert g["apellidos"] == "TEST_Modified"


# ---------- Matches ----------
class TestMatches:
    def test_create_match(self, session, created_ids):
        team_id = created_ids["teams"][0]
        future_date = f"{date.today().year + 1}-06-15"
        payload = {"fecha": future_date, "hora": "10:00", "equipo_id": team_id,
                   "rival": "TEST_Rival FC", "condicion": "local", "tipo": "liga",
                   "estado": "programado"}
        r = session.post(f"{API}/matches", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["rival"] == "TEST_Rival FC"
        created_ids["matches"].append(d["id"])

    def test_list_matches_has_team_name(self, session, created_ids):
        r = session.get(f"{API}/matches")
        assert r.status_code == 200
        m = next(x for x in r.json() if x["id"] == created_ids["matches"][0])
        assert m["equipo_nombre"] != "—"

    def test_update_match_result(self, session, created_ids):
        mid = created_ids["matches"][0]
        r = session.put(f"{API}/matches/{mid}", json={
            "rival": "TEST_Rival FC", "estado": "jugado",
            "resultado_propio": 3, "resultado_rival": 1, "condicion": "local"
        })
        assert r.status_code == 200
        assert r.json()["resultado_propio"] == 3


# ---------- Callups ----------
class TestCallups:
    def test_create_callup(self, session, created_ids):
        payload = {
            "match_id": created_ids["matches"][0],
            "equipo_id": created_ids["teams"][0],
            "convocados": [{"player_id": created_ids["players"][0], "estado": "confirmado"}],
            "hora_quedada": "09:00", "lugar_quedada": "TEST_Campo",
            "material": "Botas", "mensaje_familias": "TEST_message"
        }
        r = session.post(f"{API}/callups", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert len(d["convocados"]) == 1
        created_ids["callups"].append(d["id"])

    def test_get_callup_enriched(self, session, created_ids):
        cid = created_ids["callups"][0]
        r = session.get(f"{API}/callups/{cid}")
        assert r.status_code == 200
        c = r.json()
        assert c["convocados"][0]["nombre"].strip().startswith("TEST_Iker")

    def test_list_callups_counts(self, session, created_ids):
        r = session.get(f"{API}/callups")
        c = next(x for x in r.json() if x["id"] == created_ids["callups"][0])
        assert c["num_convocados"] == 1

    def test_callup_pdf_is_vector_document(self, session, created_ids):
        r = session.get(f"{API}/callups/{created_ids['callups'][0]}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content.startswith(b"%PDF-")
        assert len(r.content) > 2_000


# ---------- Payments ----------
class TestPayments:
    def test_create_payment_auto_final(self, session, created_ids):
        r = session.post(f"{API}/payments", json={
            "player_id": created_ids["players"][0],
            "concepto": "TEST_Cuota", "importe_base": 300, "descuento_hermano": 50,
            "forma_pago": "transferencia", "estado": "pendiente"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["importe_final"] == 250
        created_ids["payments"].append(d["id"])

    def test_list_payments_has_player_name(self, session, created_ids):
        r = session.get(f"{API}/payments")
        p = next(x for x in r.json() if x["id"] == created_ids["payments"][0])
        assert "TEST_Iker" in p["player_nombre"]

    def test_update_payment(self, session, created_ids):
        pid = created_ids["payments"][0]
        r = session.put(f"{API}/payments/{pid}", json={
            "importe_base": 200, "descuento_hermano": 0, "estado": "pagado"
        })
        assert r.status_code == 200
        assert r.json()["importe_final"] == 200
        assert r.json()["estado"] == "pagado"


# ---------- Authorizations ----------
class TestAuthorizations:
    def test_create_auth(self, session, created_ids):
        r = session.post(f"{API}/authorizations", json={
            "player_id": created_ids["players"][0],
            "tipo": "imagen", "firmante": "TEST_Padre",
            "fecha_firma": "2026-01-10", "estado": "firmada"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["tipo"] == "imagen"
        created_ids["authorizations"].append(d["id"])

    def test_list_auths(self, session, created_ids):
        r = session.get(f"{API}/authorizations")
        a = next(x for x in r.json() if x["id"] == created_ids["authorizations"][0])
        assert "TEST_Iker" in a["player_nombre"]

    def test_authorization_pdf_is_complete_document(self, session, created_ids):
        r = session.get(f"{API}/authorizations/{created_ids['authorizations'][0]}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content.startswith(b"%PDF-")
        assert len(r.content) > 3_000


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self, session):
        r = session.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        assert "categories" in s

    def test_update_settings(self, session):
        r = session.put(f"{API}/settings", json={
            "club_nombre": "TEST_Ikas", "club_email": "test@ikas.eus",
            "temporada_actual": "2025-2026",
            "temporadas": ["2025-2026"], "campos": ["TEST_Campo Norte"],
            "entrenadores": ["TEST_Coach"], "cuota_base": 350, "descuento_hermano": 50
        })
        assert r.status_code == 200
        s = r.json()
        assert s["club_nombre"] == "TEST_Ikas"
        assert s["cuota_base"] == 350
        assert "TEST_Campo Norte" in s["campos"]


# ---------- Cleanup (delete in reverse order) ----------
class TestZCleanup:
    def test_delete_all(self, session, created_ids):
        for cid in created_ids["callups"]:
            assert session.delete(f"{API}/callups/{cid}").status_code == 200
        for pid in created_ids["payments"]:
            assert session.delete(f"{API}/payments/{pid}").status_code == 200
        for aid in created_ids["authorizations"]:
            assert session.delete(f"{API}/authorizations/{aid}").status_code == 200
        for mid in created_ids["matches"]:
            assert session.delete(f"{API}/matches/{mid}").status_code == 200
        for pid in created_ids["players"]:
            assert session.delete(f"{API}/players/{pid}").status_code == 200
            # Verify deletion
            assert session.get(f"{API}/players/{pid}").status_code == 404
        for fid in created_ids["families"]:
            assert session.delete(f"{API}/families/{fid}").status_code == 200
        for tid in created_ids["teams"]:
            assert session.delete(f"{API}/teams/{tid}").status_code == 200
