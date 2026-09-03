"""Router aislado para administración de accesos familiares."""
from __future__ import annotations

from typing import Any, Callable, Mapping
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from family_access_service import (
    campaign_action, campaign_preflight, confirm_campaign, get_mode, list_campaigns,
    decisions_for_family, manual_invitation, prepare_account, process_one_job,
    public_accesses, set_mode,
)


class ModeRequest(BaseModel):
    mode: str
    confirmation: str


class ConfirmRequest(BaseModel):
    confirmation: str


class CampaignConfirmRequest(BaseModel):
    preflight_fingerprint: str
    confirmation: str


class CampaignActionRequest(BaseModel):
    action: str


def build_family_access_router(
    *, db: Any, actor_getter: Callable[[], Mapping[str, Any] | None], secret: str,
    password_hasher: Callable[[str], str], dispatcher: Callable[..., Mapping[str, Any]],
    public_url: Callable[[], str], temporary_password: Callable[[str], Any],
    lock_access: Callable[[str], Any],
) -> APIRouter:
    router = APIRouter(prefix="/api")

    def actor() -> dict:
        current = dict(actor_getter() or {})
        if current.get("role") != "admin" or current.get("active", True) is False:
            raise HTTPException(status_code=403, detail="Solo administración puede gestionar accesos familiares")
        return current

    async def family(family_id: str) -> dict:
        record = await db.families.find_one({"id": family_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="Familia no encontrada")
        return record

    async def slot_user(family_id: str, slot: int) -> dict:
        record = await family(family_id)
        card = next((row for row in await public_accesses(db, record) if row["slot"] == slot), None)
        if not card or not card.get("user_id"):
            raise HTTPException(status_code=409, detail="El progenitor no tiene una cuenta vinculada")
        user = await db.users.find_one({
            "id": card["user_id"], "role": "family", "family_id": family_id,
        }, {"_id": 0})
        if not user:
            raise HTTPException(status_code=409, detail="La cuenta no se puede gestionar desde esta ficha")
        return user

    @router.get("/family-access/mode")
    async def read_mode():
        actor()
        return await get_mode(db)

    @router.put("/family-access/mode")
    async def write_mode(request: ModeRequest):
        current = actor()
        expected = "ACTIVAR APROVISIONAMIENTO AUTOMÁTICO" if request.mode == "automatic" else "DESACTIVAR APROVISIONAMIENTO AUTOMÁTICO"
        if request.confirmation != expected:
            raise HTTPException(status_code=422, detail="La confirmación del modo no es válida")
        try:
            return await set_mode(db, request.mode, current)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @router.get("/family-access/families/{family_id}")
    async def read_cards(family_id: str):
        actor()
        return {"family_id": family_id, "accesses": await public_accesses(db, await family(family_id))}

    async def invitation(family_id: str, slot: int, request: ConfirmRequest, resend: bool):
        current = actor()
        expected = "REENVIAR INVITACIÓN" if resend else "ENVIAR INVITACIÓN"
        if request.confirmation != expected:
            raise HTTPException(status_code=422, detail="La confirmación no es válida")
        try:
            return await manual_invitation(
                db, await family(family_id), slot, current, secret, password_hasher,
                dispatcher, public_url(), resend=resend, allow_delivery=True,
            )
        except (ValueError, RuntimeError) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.post("/family-access/families/{family_id}/{slot}/invitation")
    async def invite(family_id: str, slot: int, request: ConfirmRequest):
        return await invitation(family_id, slot, request, False)

    @router.post("/family-access/families/{family_id}/{slot}/invitation/resend")
    async def resend(family_id: str, slot: int, request: ConfirmRequest):
        return await invitation(family_id, slot, request, True)

    @router.post("/family-access/families/{family_id}/{slot}/temporary-password")
    async def temporary(family_id: str, slot: int, request: ConfirmRequest):
        actor()
        if request.confirmation != "GENERAR CONTRASEÑA TEMPORAL":
            raise HTTPException(status_code=422, detail="La confirmación reforzada no es válida")
        record = await family(family_id)
        try:
            user = await slot_user(family_id, slot)
        except HTTPException as error:
            decision = (await decisions_for_family(db, record))[slot - 1]
            if error.status_code != 409 or decision["state"] != "missing_email":
                raise
            user = await prepare_account(db, record, decision, password_hasher)
        return await temporary_password(user["id"])

    @router.post("/family-access/families/{family_id}/{slot}/block")
    async def block(family_id: str, slot: int, request: ConfirmRequest):
        actor()
        if request.confirmation != "BLOQUEAR ACCESO":
            raise HTTPException(status_code=422, detail="La confirmación reforzada no es válida")
        return await lock_access((await slot_user(family_id, slot))["id"])

    @router.post("/family-access-campaigns/preflight")
    async def preflight():
        return await campaign_preflight(db, actor(), secret)

    @router.get("/family-access-campaigns")
    async def campaigns():
        actor()
        return await list_campaigns(db)

    @router.post("/family-access-campaigns/{campaign_id}/confirm")
    async def confirm(campaign_id: str, request: CampaignConfirmRequest):
        try:
            return await confirm_campaign(db, campaign_id, request.preflight_fingerprint,
                                          request.confirmation, actor(), secret)
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.post("/family-access-campaigns/{campaign_id}/action")
    async def act(campaign_id: str, request: CampaignActionRequest):
        try:
            return await campaign_action(db, campaign_id, request.action, actor())
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.post("/family-access/jobs/process-one")
    async def process():
        current = actor()
        if os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") != "1":
            raise HTTPException(status_code=409, detail="La entrega de accesos familiares está desactivada")
        result = await process_one_job(
            db, f"api:{current.get('id')}", current, secret, password_hasher,
            dispatcher, public_url(), allow_delivery=True,
        )
        return {"processed": bool(result), "result": result}

    return router
