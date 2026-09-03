import asyncio
import io

from unittest.mock import AsyncMock

from brand_assets import BRAND_NAME, CLUB_NAME, LOGO_PATH, logo_bytes
import server
from server import attendance_export_pdf, build_authorization_pdf


def test_official_logo_is_the_single_shared_backend_asset():
    assert LOGO_PATH.name == "ikas-txiki-logo.png"
    payload = logo_bytes()
    assert payload.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(payload) > 10_000


def test_configured_invalid_logo_falls_back_to_official_asset():
    assert logo_bytes("data:image/png;base64,not-valid") == logo_bytes()


def test_authorization_and_attendance_pdfs_include_logo_and_selectable_text():
    authorization = build_authorization_pdf(
        {"tipo": "imagen", "firmante": "Tutor ficticio"},
        {"nombre": "Jugador", "apellidos": "Ficticio", "fecha_nacimiento": "2015-01-01"},
        {"club_nombre": CLUB_NAME, "temporada_actual": "2026-2027"},
    ).getvalue()
    attendance = attendance_export_pdf({
        "summary": {
            "desde": "2026-07-01", "hasta": "2026-07-30", "presente": 1,
            "justificada": 0, "injustificada": 0, "lesion": 0, "porcentaje_presencia": 100,
        }
    }, "es").getvalue()
    for payload in (authorization, attendance):
        assert b"/Subtype /Image" in payload
        assert b"/Font" in payload and b"/Subtype /Type1" in payload


def test_brand_names_are_public_corporate_text_only():
    assert BRAND_NAME == "Ikas-Txiki Manager"
    assert CLUB_NAME == "Zornotzako Futbol Eskola"


def test_authorization_pdf_download_uses_selected_parent_in_both_fields(monkeypatch):
    captured = {}

    async def get_doc(collection, _id):
        if collection == "authorizations":
            return {"id": _id, "player_id": "player-1", "tipo": "desplazamientos", "firmante": None}
        if collection == "players":
            return {"id": _id, "nombre": "Ane", "apellidos": "Uno"}
        raise AssertionError(collection)

    def build_pdf(auth, player, settings, lang):
        captured.update({"auth": auth, "player": player, "settings": settings, "lang": lang})
        return io.BytesIO(b"pdf-fixture")

    monkeypatch.setattr(server, "get_doc", get_doc)
    monkeypatch.setattr(server, "get_settings", AsyncMock(return_value={"club_nombre": "Ikas-Txiki"}))
    monkeypatch.setattr(server, "_selected_authorization_parent", AsyncMock(return_value={
        "slot": 2, "name": "Bruno Dos", "is_current": False,
    }))
    monkeypatch.setattr(server, "build_authorization_pdf", build_pdf)

    response = asyncio.run(server.download_authorization_pdf("auth-1", "eu", 2))

    assert captured["auth"]["firmante"] == "Bruno Dos"
    assert captured["auth"]["firmante_parent_slot"] == 2
    assert captured["lang"] == "eu"
    assert response.media_type == "application/pdf"
