import asyncio
from types import SimpleNamespace

import server
from family_access_service import parent_data
from report_service import build_report


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def find_one(self, query, projection=None):
        return next((row for row in self.rows if row.get("id") == query.get("id")), None)

    async def distinct(self, field, query):
        return [row.get(field) for row in self.rows if row.get("familia_id") == query.get("familia_id")]


class UserCollection(Collection):
    async def find_one(self, query, projection=None):
        for row in self.rows:
            if query.get("username_normalized") and row.get("username_normalized") == query["username_normalized"]:
                return row
            if query.get("email_normalized") and row.get("email_normalized") == query["email_normalized"]:
                return row
        return None

    async def insert_one(self, row):
        self.rows.append(row)


def family_database():
    return SimpleNamespace(
        users=UserCollection(), internal_events=Collection(), authorizations=Collection(),
        families=Collection([{
            "id": "family-1", "progenitor1_nombre": "Ana Primera",
            "progenitor1_email": "ana@example.test", "progenitor1_telefono": "600000001",
            "progenitor2_nombre": "Bea Segunda", "progenitor2_email": "bea@example.test",
        }]),
        players=Collection([
            {"id": "player-1", "familia_id": "family-1"},
            {"id": "player-2", "familia_id": "family-1"},
        ]),
        teams=SimpleNamespace(distinct=lambda *args, **kwargs: asyncio.sleep(0, result=[])),
    )


def test_create_user_persists_canonical_parent_and_children(monkeypatch):
    database = family_database()
    monkeypatch.setattr(server, "db", database)
    monkeypatch.setattr(server, "record_user_audit", lambda *args, **kwargs: asyncio.sleep(0))
    monkeypatch.setattr(server, "ensure_family_authorizations", lambda *args, **kwargs: asyncio.sleep(0))
    result = asyncio.run(server.create_user(server.UserCreate(
        username="bea_family", role="family", family_id="family-1", family_contact_slot=2,
        access_method="pending", account_status="pending_activation",
    )))

    saved = database.users.rows[0]
    assert saved["first_name"] == "Bea" and saved["last_name"] == "Segunda"
    assert saved["email"] == "bea@example.test"
    assert saved["linked_player_ids"] == ["player-1", "player-2"]
    assert result["family_contact_slot"] == 2


def test_family_account_uses_parent_identity_and_all_children(monkeypatch):
    monkeypatch.setattr(server, "db", family_database())
    result = asyncio.run(server.validate_user_relationships({
        "role": "family", "family_id": "family-1", "family_contact_slot": 2,
        "first_name": None, "last_name": None, "email": None, "phone": None,
        "account_status": "active", "assigned_team_ids": [], "assigned_category_ids": [],
    }, derive_family_identity=True))

    assert result["first_name"] == "Bea"
    assert result["last_name"] == "Segunda"
    assert result["email"] == "bea@example.test"
    assert result["family_contact_slot"] == 2
    assert result["linked_player_ids"] == ["player-1", "player-2"]


def test_family_parent_helpers_fallback_to_legacy_player_fields():
    legacy_player = {
        "progenitor1_nombre": "Tutor Histórico",
        "progenitor1_email": "historico@example.test",
        "progenitor1_telefono": "600000009",
    }
    assert server.family_parent_name({}, legacy=legacy_player) == "Tutor Histórico"
    assert server.family_parent_name({}, slot=2, legacy=legacy_player) is None
    assert parent_data({}, 1, legacy_player)["email"] == "historico@example.test"


def test_old_payment_gets_parent_holder_and_report_and_csv_keep_it(monkeypatch):
    player = {
        "id": "player-1", "nombre": "Ane", "apellidos": "Histórica", "familia_id": "family-1",
        "equipo_id": "team-1", "progenitor1_nombre": "Tutor Legacy",
        "progenitor1_email": "legacy@example.test", "progenitor1_telefono": "600000010",
    }
    family = {
        "id": "family-1", "progenitor1_nombre": "Progenitor Canónico",
        "progenitor1_email": "parent@example.test", "progenitor1_telefono": "600000011",
    }
    context = {
        "players": [player], "teams": [{"id": "team-1", "nombre": "Equipo"}],
        "families": [family], "payments": [{
            "id": "payment-1", "player_id": "player-1", "concepto": "Cuota",
            "importe_final": 100, "forma_pago": "transferencia", "estado": "pendiente",
        }],
    }
    _, report_rows, _ = build_report("financial_summary", context, {}, "admin")
    assert report_rows[0]["account_holder"] == "Progenitor Canónico"

    sheets = server._visual_export_rows({**context, "authorizations": []})
    contacts = sheets["Contactos familias"][0][0]
    bank = sheets["Cuentas bancarias"][0][0]
    assert contacts["Progenitor 1"] == "Progenitor Canónico"
    assert bank["Titular cuenta"] == "Progenitor Canónico"

    payments = context["payments"]

    async def fake_list_docs(collection, query=None):
        return payments if collection == "payments" else [player] if collection == "players" else [family]

    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    result = asyncio.run(server.get_payments())
    assert result[0]["titular_cuenta"] == "Progenitor Canónico"


def test_new_payment_stores_canonical_parent_holder(monkeypatch):
    database = family_database()
    captured = {}
    monkeypatch.setattr(server, "db", database)

    async def fake_insert(collection, data):
        captured.update(data)
        return data

    monkeypatch.setattr(server, "insert_doc", fake_insert)
    asyncio.run(server.create_payment(server.Payment(player_id="player-1", importe_base=90)))
    assert captured["titular_cuenta"] == "Ana Primera"
