import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import server
from authz import current_user_context
from modality_service import DEFAULT_MODALITIES


def run(coro):
    return asyncio.run(coro)


def historical_draft(first="", second="F11"):
    return {
        "id": "draft-safe", "season": "2026-2027", "status": "draft",
        "source_format": "historical_bbdd_v1", "simulation": {"official_writes": 0},
        "records": [
            {"id": "row-1", "active": True, "modalidad": first, "categoria": "Alevín"},
            {"id": "row-2", "active": True, "modalidad": second, "categoria": "Infantil"},
        ],
        "duplicates": [], "incidents": [], "fuzzy_matches": [], "family_candidates": [],
    }


def test_bulk_modality_rejects_unknown_or_inactive_catalog_values(monkeypatch):
    draft = historical_draft()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=draft))
    catalog = [
        DEFAULT_MODALITIES[0].model_copy(update={"active": False}),
        DEFAULT_MODALITIES[1].model_copy(deep=True),
    ]
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=catalog))
    update = AsyncMock()
    monkeypatch.setattr(server, "db", SimpleNamespace(import_staging=SimpleNamespace(update_one=update)))

    for code in ("F7", "F8"):
        with pytest.raises(HTTPException) as error:
            run(server.bulk_update_staging("draft-safe", server.StagingBulkUpdate(
                record_ids=["row-1"], field="modalidad", value=code, confirm_suggestion=True,
            )))
        assert error.value.status_code == 422
    update.assert_not_awaited()


def test_bulk_modality_updates_only_selected_records_and_audits_change(monkeypatch):
    before = historical_draft()
    after = historical_draft(first="F7")
    staging_doc = AsyncMock(side_effect=[before, after])
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", staging_doc)
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    monkeypatch.setattr(server, "db", SimpleNamespace(import_staging=SimpleNamespace(update_one=update)))
    token = current_user_context.set({"id": "admin-safe", "role": "admin", "active": True})
    try:
        result = run(server.bulk_update_staging("draft-safe", server.StagingBulkUpdate(
            record_ids=["row-1"], field="modalidad", value="F7", confirm_suggestion=True,
        )))
    finally:
        current_user_context.reset(token)

    assert result["summary"]["missing_modality"] == 0
    assert result["simulation"]["official_writes"] == 0
    update_doc = update.await_args.args[1]
    assert update_doc["$set"]["records.$[row].modalidad"] == "F7"
    assert update.await_args.kwargs["array_filters"][0] == {"row.id": {"$in": ["row-1"]}}
    audit = update_doc["$push"]["audit"]
    assert audit["actor_user_id"] == "admin-safe"
    assert audit["at"] is not None
    assert audit["detail"]["changes"] == [{
        "record_id": "row-1", "previous_value": None, "new_value": "F7",
    }]


def test_bulk_modality_requires_explicit_confirmation(monkeypatch):
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=historical_draft()))
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    update = AsyncMock()
    monkeypatch.setattr(server, "db", SimpleNamespace(import_staging=SimpleNamespace(update_one=update)))

    with pytest.raises(HTTPException) as error:
        run(server.bulk_update_staging("draft-safe", server.StagingBulkUpdate(
            record_ids=["row-1"], field="modalidad", value="F7", confirm_suggestion=False,
        )))
    assert error.value.status_code == 422
    update.assert_not_awaited()


def test_individual_modality_change_is_catalog_validated_and_audited(monkeypatch):
    before = historical_draft(first="F11")
    after = historical_draft(first="F7")
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(side_effect=[before, after]))
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    update_many = AsyncMock()
    monkeypatch.setattr(server, "db", SimpleNamespace(import_staging=SimpleNamespace(
        update_one=update_one, update_many=update_many,
    )))
    token = current_user_context.set({"id": "admin-safe", "role": "admin", "active": True})
    try:
        result = run(server.update_staging_record(
            "draft-safe", "row-1", server.StagingRecordUpdate(
                field="modalidad", value="F7", confirm_suggestion=True,
            ),
        ))
    finally:
        current_user_context.reset(token)

    assert result["simulation"]["official_writes"] == 0
    event = update_one.await_args.args[1]["$push"]["audit"]
    assert event["detail"] == {
        "record_id": "row-1", "field": "modalidad",
        "previous_value": "F11", "new_value": "F7",
    }
