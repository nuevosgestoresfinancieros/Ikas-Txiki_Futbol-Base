import asyncio
import base64
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import server
from authorization_service import AUTHORIZATION_TYPES, ensure_family_authorizations
from authz import has_permission, route_permission
from starlette.requests import Request


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _limit):
        return [dict(row) for row in self.rows]


class Players:
    def __init__(self, rows):
        self.rows = rows

    async def distinct(self, field, query):
        assert field == "id"
        family_id = query.get("familia_id")
        return [row["id"] for row in self.rows if row.get("familia_id") == family_id]


class Authorizations:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def find(self, query, *_args):
        player_ids = set(query["player_id"]["$in"])
        authorization_types = set(query["tipo"]["$in"])
        return Cursor([
            row for row in self.rows
            if row.get("player_id") in player_ids and row.get("tipo") in authorization_types
        ])

    async def insert_many(self, rows, **_kwargs):
        self.rows.extend(dict(row) for row in rows)


class MemoryAuthorizationCollection:
    def __init__(self, row):
        self.row = row

    async def update_one(self, query, update):
        if self.row.get("id") != query.get("id"):
            return SimpleNamespace(modified_count=0)
        if "archivo_firmado" in query:
            allowed = query["archivo_firmado"]["$in"]
            if self.row.get("archivo_firmado") not in allowed:
                return SimpleNamespace(modified_count=0)
        for key, value in update.get("$set", {}).items():
            target = self.row
            parts = key.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
        return SimpleNamespace(modified_count=1)

    async def find_one(self, query, *_args, **_kwargs):
        if self.row.get("id") != query.get("id"):
            return None
        return dict(self.row)


class MemoryDB:
    def __init__(self, row):
        self.authorizations = MemoryAuthorizationCollection(row)
        self.internal_events = SimpleNamespace(insert_one=AsyncMock())

    def __getitem__(self, key):
        return getattr(self, key)


class PendingUsers:
    def __init__(self, rows):
        self.rows = rows

    def find(self, query, *_args):
        family_ids = set((query.get("family_id") or {}).get("$in", []))
        rows = [row for row in self.rows if row.get("role") == "family"
                and row.get("account_status") == "pending_activation"
                and row.get("active") is False
                and (not family_ids or row.get("family_id") in family_ids)]
        return Cursor(rows)

    async def update_one(self, query, update):
        row = next((item for item in self.rows if item.get("id") == query.get("id")), None)
        if not row:
            return SimpleNamespace(modified_count=0)
        for key, value in update.get("$set", {}).items():
            target = row
            parts = key.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
        return SimpleNamespace(modified_count=1)


class DeliveryLogs:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(dict(row))


def pending_authorization(auth_id="auth-1", player_id="player-1"):
    return {
        "id": auth_id, "player_id": player_id, "tipo": "general", "estado": "pendiente",
        "archivo_firmado": None, "firmante": None,
    }


def test_family_authorizations_are_six_and_idempotent():
    db = SimpleNamespace(
        players=Players([{"id": "player-1", "familia_id": "family-1"}, {"id": "player-2", "familia_id": "family-1"}]),
        authorizations=Authorizations(),
    )
    first = asyncio.run(ensure_family_authorizations(db, "family-1"))
    second = asyncio.run(ensure_family_authorizations(db, "family-1"))
    assert first["created"] == 12 and second["created"] == 0
    assert len(db.authorizations.rows) == 12
    assert {(row["player_id"], row["tipo"]) for row in db.authorizations.rows} == {
        (player_id, authorization_type)
        for player_id in ("player-1", "player-2")
        for authorization_type in AUTHORIZATION_TYPES
    }
    assert all(row["estado"] == "pendiente" and row["firmante"] is None and row["archivo_firmado"] is None for row in db.authorizations.rows)


def test_portal_onboarding_reports_children_and_never_completes_without_file():
    players = [{"id": "player-1", "nombre": "Ane", "apellidos": "Uno"}]
    authorizations = [
        {"id": f"auth-{index}", "player_id": "player-1", "tipo": authorization_type,
         "estado": "firmada" if index == 0 else "pendiente",
         "archivo_firmado": "server-file.pdf" if index == 0 else None}
        for index, authorization_type in enumerate(AUTHORIZATION_TYPES)
    ]
    result = server._family_authorization_onboarding(players, authorizations)
    assert result["total_count"] == 6 and result["pending_count"] == 5 and result["required"] is True
    assert result["children"][0]["pending_count"] == 5
    incomplete = server._portal_authorization({**authorizations[0], "archivo_firmado": None})
    assert incomplete["estado"] == "pendiente" and incomplete["has_signed_file"] is False


def test_family_submit_permission_is_scoped_and_not_generic_edit():
    family = {"role": "family", "active": True}
    admin = {"role": "admin", "active": True}
    player = {"role": "player", "active": True}
    assert has_permission(family, "authorizations", "submit")
    assert not has_permission(family, "authorizations", "edit")
    assert not has_permission(player, "authorizations", "submit")
    assert has_permission(admin, "authorizations", "submit")
    request = Request({"type": "http", "method": "POST", "path": "/api/authorizations/auth-1/upload-signed", "headers": []})
    assert route_permission(request) == ("authorizations", "submit")


def test_upload_rejects_invalid_binary_and_accepts_mock_pdf_for_family(tmp_path, monkeypatch):
    auth = pending_authorization()
    db = MemoryDB(auth)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "UPLOADS_DIR", Path(tmp_path))
    async def get_doc(collection, _id):
        assert collection == "authorizations"
        if _id != auth["id"]:
            raise HTTPException(status_code=404, detail="No encontrado")
        return dict(auth)
    monkeypatch.setattr(server, "get_doc", get_doc)
    token = server.current_user_context.set({"id": "family-user", "role": "family", "family_id": "family-1", "active": True})
    try:
        invalid = SimpleNamespace(content_type="image/png", read=AsyncMock(return_value=b"not-an-image"))
        with pytest.raises(HTTPException) as invalid_error:
            asyncio.run(server.upload_signed_authorization(auth["id"], invalid))
        assert invalid_error.value.status_code == 422

        pdf = b"%PDF-1.7\nmock fixture\n%%EOF"
        valid = SimpleNamespace(content_type="application/pdf", read=AsyncMock(return_value=pdf))
        result = asyncio.run(server.upload_signed_authorization(auth["id"], valid))
    finally:
        server.current_user_context.reset(token)
    assert result["status"] == "firmada" and result["firma_modalidad"] == "upload"
    assert db.authorizations.row["archivo_firmado"].startswith("auth_auth-1_")
    assert db.authorizations.row["archivo_firmado_sha256"]
    assert Path(tmp_path, db.authorizations.row["archivo_firmado"]).read_bytes() == pdf
    assert db.internal_events.insert_one.await_count == 1


def test_upload_cannot_replace_family_document_and_never_uses_arbitrary_path(tmp_path, monkeypatch):
    auth = {**pending_authorization(), "estado": "firmada", "archivo_firmado": "auth-existing.pdf"}
    db = MemoryDB(auth)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "UPLOADS_DIR", Path(tmp_path))
    monkeypatch.setattr(server, "get_doc", AsyncMock(return_value=dict(auth)))
    token = server.current_user_context.set({"id": "family-user", "role": "family", "active": True})
    try:
        file = SimpleNamespace(content_type="application/pdf", read=AsyncMock(return_value=b"%PDF-1.7\n%%EOF"))
        with pytest.raises(HTTPException) as error:
            asyncio.run(server.upload_signed_authorization(auth["id"], file))
    finally:
        server.current_user_context.reset(token)
    assert error.value.status_code == 409
    assert server._stored_signed_file_path({"archivo_firmado": "../outside.pdf"}) is None


def test_electronic_signature_requires_consent_and_does_not_store_raw_signature(tmp_path, monkeypatch):
    auth = pending_authorization("auth-sign")
    db = MemoryDB(auth)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "UPLOADS_DIR", Path(tmp_path))
    monkeypatch.setattr(server, "get_settings", AsyncMock(return_value={"club_nombre": "Ikas-Txiki"}))
    async def get_doc(collection, _id):
        if collection == "authorizations": return dict(auth)
        if collection == "players": return {"id": "player-1", "nombre": "Ane", "apellidos": "Uno"}
        raise HTTPException(status_code=404, detail="No encontrado")
    monkeypatch.setattr(server, "get_doc", get_doc)
    one_pixel_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    signature_data = "data:image/png;base64," + base64.b64encode(one_pixel_png).decode()
    request_without_consent = server.ElectronicSignatureRequest(signature_data=signature_data, signer_name="Ana Uno", consent=False)
    token = server.current_user_context.set({"id": "family-user", "role": "family", "active": True})
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(server.sign_authorization(auth["id"], request_without_consent))
        assert error.value.status_code == 422
        request = server.ElectronicSignatureRequest(signature_data=signature_data, signer_name="Ana Uno", consent=True)
        result = asyncio.run(server.sign_authorization(auth["id"], request))
    finally:
        server.current_user_context.reset(token)
    assert result["status"] == "firmada" and result["firma_modalidad"] == "simple_electronic"
    stored = db.authorizations.row
    assert stored["firma_electronica"]["signer_name"] == "Ana Uno"
    assert "signature_data" not in str(stored) and signature_data not in str(stored)
    assert stored["archivo_firmado_mime"] == "application/pdf"
    assert Path(tmp_path, stored["archivo_firmado"]).exists()


def test_signature_token_or_content_never_appears_in_authorization_record():
    signature = "data:image/png;base64,fixture-only-not-stored"
    record = {"id": "auth", "archivo_firmado": "server-generated.pdf", "firma_electronica": {"consent_version": "family-authorization-v1"}}
    assert signature not in str(record)


def test_mass_pending_family_resend_is_admin_only_and_aggregates_delivery(monkeypatch):
    users = PendingUsers([
        {"id": "family-user-1", "role": "family", "family_id": "family-1", "active": False,
         "account_status": "pending_activation", "username": "family.one", "email": "one@example.test"},
        {"id": "family-user-2", "role": "family", "family_id": "family-2", "active": False,
         "account_status": "pending_activation", "username": "family.two", "email": None},
    ])
    logs = DeliveryLogs()
    db = SimpleNamespace(users=users, delivery_logs=logs)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "issue_token", lambda *_args, **_kwargs: ("fixture-plain-token", {
        "digest": "digest-only", "expires_at": "2099-01-01T00:00:00+00:00",
    }))
    monkeypatch.setattr(server, "dispatch_email", lambda recipient, *_args, **_kwargs: {
        "recipient": recipient, "status": "sent" if recipient else "pending",
        "error": None if recipient else "recipient_missing",
    })
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    monkeypatch.setenv("PUBLIC_APP_URL", "https://app.example.test")
    token = server.current_user_context.set({"id": "admin", "role": "admin", "active": True})
    try:
        result = asyncio.run(server.resend_pending_family_invitations(None))
    finally:
        server.current_user_context.reset(token)
    assert result["total"] == 2 and result["sent"] == 1 and result["pending"] == 1 and result["failed"] == 0
    assert len(logs.rows) == 2 and all("fixture-plain-token" not in str(row) for row in logs.rows)
    assert all("fixture-plain-token" not in str(row) for row in users.rows)

    token = server.current_user_context.set({"id": "family", "role": "family", "active": True})
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(server.resend_pending_family_invitations(None))
    finally:
        server.current_user_context.reset(token)
    assert error.value.status_code == 403
