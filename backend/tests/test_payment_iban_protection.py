import asyncio

import pytest
from fastapi import HTTPException

import server

VALID_ES = "ES9121000418450200051332"
VALID_ES_2 = "ES7921000813610123456789"
VALID_DE = "DE89370400440532013000"


@pytest.fixture
def store(monkeypatch):
    rows = {}

    async def fake_insert(collection, data):
        data = dict(data, id="payment-new")
        rows[data["id"]] = data
        return dict(data)

    async def fake_get(collection, _id):
        return dict(rows[_id])

    async def fake_update(collection, _id, data):
        rows[_id] = {**rows[_id], **data}
        return dict(rows[_id])

    async def fake_holder(player_id, requested=None, **kwargs):
        return requested or ""

    monkeypatch.setattr(server, "insert_doc", fake_insert)
    monkeypatch.setattr(server, "get_doc", fake_get)
    monkeypatch.setattr(server, "update_doc", fake_update)
    monkeypatch.setattr(server, "_resolve_payment_holder", fake_holder)
    return rows


def create(iban):
    return asyncio.run(server.create_payment(server.Payment(player_id="player-1", iban=iban)))


def edit(payment_id, **fields):
    return asyncio.run(server.edit_payment(payment_id, server.Payment(**fields)))


def test_manual_payment_stores_only_encrypted_iban(store):
    result = create("es91 2100 0418 4502 0005 1332")
    saved = store["payment-new"]
    assert saved["iban"] is None
    assert saved["iban_last4"] == "1332" and saved["iban_country"] == "ES"
    assert server._decrypt_iban(saved["iban_encrypted"]) == VALID_ES
    assert result["iban"] == "ES•• •••• •••• •••• •••• 1332"
    assert result["cuenta_protegida"] is True
    assert "iban_encrypted" not in result


def test_invalid_iban_is_rejected(store):
    with pytest.raises(HTTPException) as error:
        create("ES0021000418450200051332")
    assert error.value.status_code == 422
    assert not store


def test_editing_with_masked_value_keeps_account(store):
    create(VALID_ES)
    result = edit("payment-new", player_id="player-1", iban="ES•• •••• •••• •••• •••• 1332", estado="pagado")
    saved = store["payment-new"]
    assert server._decrypt_iban(saved["iban_encrypted"]) == VALID_ES
    assert saved["iban"] is None and saved["estado"] == "pagado"
    assert result["iban"].endswith("1332")


def test_new_iban_replaces_last_four_digits(store):
    create(VALID_ES)
    result = edit("payment-new", player_id="player-1", iban=VALID_ES_2)
    assert store["payment-new"]["iban_last4"] == "6789"
    assert server._decrypt_iban(store["payment-new"]["iban_encrypted"]) == VALID_ES_2
    assert result["iban"].endswith("6789")


def test_empty_iban_removes_account(store):
    create(VALID_ES)
    result = edit("payment-new", player_id="player-1", iban="")
    saved = store["payment-new"]
    assert saved["iban_encrypted"] is None and saved["iban_last4"] is None
    assert result["cuenta_protegida"] is False and "iban" not in result


def test_legacy_plaintext_iban_is_encrypted_on_next_edit(store):
    store["legacy"] = {"id": "legacy", "player_id": "player-1", "iban": VALID_ES}
    result = edit("legacy", player_id="player-1", iban="ES•• •••• •••• •••• •••• 1332", estado="pagado")
    saved = store["legacy"]
    assert saved["iban"] is None
    assert server._decrypt_iban(saved["iban_encrypted"]) == VALID_ES
    assert result["cuenta_protegida"] is True


def test_foreign_iban_keeps_country_in_mask(store):
    result = create(VALID_DE)
    assert result["iban"] == "DE•• •••• •••• •••• •••• 3000"


def test_listing_flags_every_encrypted_account(monkeypatch):
    payments = [
        {"id": "new", "player_id": "p", "estado": "pendiente", "iban_encrypted": "x", "iban_last4": "1332"},
        {"id": "hist", "player_id": "p", "estado": "referencia", "iban_encrypted": "y", "iban_last4": "0000",
         "historical_bank_reference": True},
        {"id": "plain", "player_id": "p", "estado": "pendiente", "iban": VALID_ES},
    ]

    async def fake_list_docs(collection, query=None):
        return {"payments": [dict(p) for p in payments], "players": [], "families": []}[collection]

    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    result = {p["id"]: p for p in asyncio.run(server.get_payments())}
    assert result["new"]["cuenta_protegida"] and result["hist"]["cuenta_protegida"]
    assert result["plain"]["cuenta_protegida"] is False
    assert result["plain"]["iban"] == "ES•• •••• •••• •••• •••• 1332"


def test_migration_plan_encrypts_plaintext_and_never_keeps_it():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "migrations" / "011_encrypt_payment_ibans.py"
    spec = importlib.util.spec_from_file_location("migration_011", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    action, fields = module.plan_payment({"iban": VALID_ES}, server.JWT_SECRET)
    assert action == "encrypt" and fields["iban"] is None and fields["iban_last4"] == "1332"
    assert server._decrypt_iban(fields["iban_encrypted"]) == VALID_ES
    assert module.plan_payment({"iban": VALID_ES, "iban_encrypted": "x"}, "s") == ("clear_plaintext", {"iban": None})
    assert module.plan_payment({"iban": "ES•• •••• •••• •••• •••• 1332"}, "s") == (
        "clear_masked", {"iban": None, "iban_last4": "1332", "iban_country": "ES"})
    assert module.plan_payment({"iban": ""}, "s") == ("skip", {})
