from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import json
import logging
import math
import shutil
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import pandas as pd
from datetime import datetime, timezone, date


ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Ikas-Txiki Manager API")
api_router = APIRouter(prefix="/api")


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


CATEGORIES = [
    {"name": "Prebenjamín", "min_age": 6, "max_age": 7},
    {"name": "Benjamín", "min_age": 8, "max_age": 9},
    {"name": "Alevín", "min_age": 10, "max_age": 11},
    {"name": "Infantil", "min_age": 12, "max_age": 13},
    {"name": "Cadete", "min_age": 14, "max_age": 15},
    {"name": "Juvenil", "min_age": 16, "max_age": 18},
]


def compute_category(birthdate: Optional[str]) -> Optional[str]:
    if not birthdate:
        return None
    try:
        bd = datetime.fromisoformat(birthdate).date() if "T" in birthdate or "-" in birthdate else None
        if bd is None:
            return None
    except Exception:
        try:
            bd = datetime.strptime(birthdate[:10], "%Y-%m-%d").date()
        except Exception:
            return None
    today = date.today()
    # Football season age: age reached during the season year
    season_year = today.year if today.month >= 7 else today.year - 1
    age = season_year - bd.year
    for c in CATEGORIES:
        if c["min_age"] <= age <= c["max_age"]:
            return c["name"]
    if age < 6:
        return "Querubín"
    return "Senior"


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------- Generic CRUD factory ----------
async def list_docs(coll: str, query: dict = None):
    cursor = db[coll].find(query or {}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(5000)


async def get_doc(coll: str, _id: str):
    doc = await db[coll].find_one({"id": _id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    return doc


async def insert_doc(coll: str, data: dict):
    data["id"] = new_id()
    data["created_at"] = now_iso()
    data["updated_at"] = now_iso()
    await db[coll].insert_one(dict(data))
    return clean(data)


async def update_doc(coll: str, _id: str, data: dict):
    existing = await db[coll].find_one({"id": _id})
    if not existing:
        raise HTTPException(status_code=404, detail="No encontrado")
    data = {k: v for k, v in data.items() if v is not None or k in data}
    data["updated_at"] = now_iso()
    await db[coll].update_one({"id": _id}, {"$set": data})
    return await get_doc(coll, _id)


async def delete_doc(coll: str, _id: str):
    res = await db[coll].delete_one({"id": _id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ================= PLAYERS =================
class Player(BaseModel):
    # Datos del formulario
    fecha_inscripcion: Optional[str] = None
    email_formulario: Optional[str] = None
    nombre: str
    apellidos: Optional[str] = ""
    fecha_nacimiento: Optional[str] = None
    centro_escolar: Optional[str] = None
    # Progenitores
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    # Deportivos / administrativos
    foto: Optional[str] = None  # base64 data url
    categoria: Optional[str] = None
    equipo_id: Optional[str] = None
    dorsal: Optional[str] = None
    posicion: Optional[str] = None
    estado: str = "pendiente_documentacion"  # activo, baja, lesionado, pendiente_documentacion, en_prueba
    numero_licencia: Optional[str] = None
    fecha_alta: Optional[str] = None
    fecha_baja: Optional[str] = None
    nueva_incorporacion: bool = False
    segundo_hermano: bool = False
    hermano_vinculado: Optional[str] = None
    descuento: Optional[float] = 0
    observaciones: Optional[str] = None
    familia_id: Optional[str] = None
    # Salud
    alergias: Optional[str] = None
    enfermedades: Optional[str] = None
    medicacion: Optional[str] = None
    seguro_medico: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    observaciones_medicas: Optional[str] = None
    # Equipación
    talla_camiseta: Optional[str] = None
    talla_pantalon: Optional[str] = None
    talla_chandal: Optional[str] = None
    talla_medias: Optional[str] = None
    talla_calzado: Optional[str] = None
    equipacion_entregada: bool = False
    fecha_entrega_equipacion: Optional[str] = None
    observaciones_material: Optional[str] = None
    # Documentación
    doc_dni_jugador: bool = False
    doc_dni_tutor: bool = False
    doc_foto: bool = False
    doc_autorizacion: bool = False
    doc_justificante_pago: bool = False
    doc_ficha_federativa: bool = False
    estado_documental: str = "pendiente"  # completo, pendiente, incompleto
    fecha_revision_doc: Optional[str] = None
    observaciones_doc: Optional[str] = None


@api_router.post("/players")
async def create_player(player: Player):
    data = player.model_dump()
    if not data.get("fecha_inscripcion"):
        data["fecha_inscripcion"] = now_iso()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await insert_doc("players", data)


@api_router.get("/players")
async def get_players(equipo_id: Optional[str] = None, estado: Optional[str] = None,
                      categoria: Optional[str] = None, q: Optional[str] = None):
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if estado:
        query["estado"] = estado
    if categoria:
        query["categoria"] = categoria
    docs = await list_docs("players", query)
    if q:
        ql = q.lower()
        docs = [d for d in docs if ql in (f"{d.get('nombre','')} {d.get('apellidos','')}").lower()]
    return docs


@api_router.get("/players/{player_id}")
async def get_player(player_id: str):
    return await get_doc("players", player_id)


@api_router.put("/players/{player_id}")
async def edit_player(player_id: str, player: Player):
    data = player.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await update_doc("players", player_id, data)


@api_router.delete("/players/{player_id}")
async def remove_player(player_id: str):
    return await delete_doc("players", player_id)


# ================= FAMILIES =================
class Family(BaseModel):
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    contacto_principal: Optional[str] = None
    preferencia_comunicacion: Optional[str] = "email"  # email, telefono, whatsapp
    observaciones: Optional[str] = None


@api_router.post("/families")
async def create_family(family: Family):
    return await insert_doc("families", family.model_dump())


@api_router.get("/families")
async def get_families():
    fams = await list_docs("families")
    players = await list_docs("players")
    for f in fams:
        linked = [p for p in players if p.get("familia_id") == f["id"]]
        f["num_hijos"] = len(linked)
        f["hijos"] = [{"id": p["id"], "nombre": f"{p.get('nombre','')} {p.get('apellidos','')}"} for p in linked]
    return fams


@api_router.get("/families/{family_id}")
async def get_family(family_id: str):
    return await get_doc("families", family_id)


@api_router.put("/families/{family_id}")
async def edit_family(family_id: str, family: Family):
    return await update_doc("families", family_id, family.model_dump())


@api_router.delete("/families/{family_id}")
async def remove_family(family_id: str):
    return await delete_doc("families", family_id)


# ================= TEAMS =================
class Team(BaseModel):
    nombre: str
    categoria: Optional[str] = None
    temporada: Optional[str] = None
    entrenador: Optional[str] = None
    segundo_entrenador: Optional[str] = None
    delegado: Optional[str] = None
    dias_entrenamiento: Optional[str] = None
    horario: Optional[str] = None
    campo: Optional[str] = None
    limite_jugadores: Optional[int] = 20
    estado: str = "activo"  # activo, cerrado, pendiente


@api_router.post("/teams")
async def create_team(team: Team):
    return await insert_doc("teams", team.model_dump())


@api_router.get("/teams")
async def get_teams():
    teams = await list_docs("teams")
    players = await list_docs("players")
    for t in teams:
        t["num_jugadores"] = len([p for p in players if p.get("equipo_id") == t["id"]])
    return teams


@api_router.get("/teams/{team_id}")
async def get_team(team_id: str):
    team = await get_doc("teams", team_id)
    players = await list_docs("players", {"equipo_id": team_id})
    team["jugadores"] = players
    return team


@api_router.put("/teams/{team_id}")
async def edit_team(team_id: str, team: Team):
    return await update_doc("teams", team_id, team.model_dump())


@api_router.delete("/teams/{team_id}")
async def remove_team(team_id: str):
    return await delete_doc("teams", team_id)


# ================= MATCHES =================
class Match(BaseModel):
    temporada: Optional[str] = None
    jornada: Optional[str] = None
    fecha: Optional[str] = None
    hora: Optional[str] = None
    equipo_id: Optional[str] = None
    rival: Optional[str] = None
    condicion: str = "local"  # local, visitante
    campo: Optional[str] = None
    direccion_campo: Optional[str] = None
    tipo: str = "liga"  # liga, copa, amistoso, torneo
    estado: str = "programado"  # programado, jugado, aplazado, suspendido, cancelado
    resultado_propio: Optional[int] = None
    resultado_rival: Optional[int] = None
    observaciones: Optional[str] = None


@api_router.post("/matches")
async def create_match(match: Match):
    return await insert_doc("matches", match.model_dump())


@api_router.get("/matches")
async def get_matches(equipo_id: Optional[str] = None, estado: Optional[str] = None):
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if estado:
        query["estado"] = estado
    matches = await list_docs("matches", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for m in matches:
        m["equipo_nombre"] = teams.get(m.get("equipo_id"), "—")
    return matches


@api_router.get("/matches/{match_id}")
async def get_match(match_id: str):
    return await get_doc("matches", match_id)


@api_router.put("/matches/{match_id}")
async def edit_match(match_id: str, match: Match):
    return await update_doc("matches", match_id, match.model_dump())


@api_router.delete("/matches/{match_id}")
async def remove_match(match_id: str):
    return await delete_doc("matches", match_id)


# ================= CALLUPS (Convocatorias) =================
class ConvocadoItem(BaseModel):
    player_id: str
    estado: str = "pendiente"  # pendiente, confirmado, no_puede
    motivo: Optional[str] = None


class Callup(BaseModel):
    match_id: str
    equipo_id: Optional[str] = None
    convocados: List[ConvocadoItem] = []
    hora_quedada: Optional[str] = None
    lugar_quedada: Optional[str] = None
    material: Optional[str] = None
    mensaje_familias: Optional[str] = None


@api_router.post("/callups")
async def create_callup(callup: Callup):
    return await insert_doc("callups", callup.model_dump())


@api_router.get("/callups")
async def get_callups():
    callups = await list_docs("callups")
    matches = {m["id"]: m for m in await list_docs("matches")}
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for c in callups:
        m = matches.get(c.get("match_id"), {})
        c["match"] = m
        c["equipo_nombre"] = teams.get(c.get("equipo_id"), "—")
        c["num_convocados"] = len(c.get("convocados", []))
    return callups


@api_router.get("/callups/{callup_id}")
async def get_callup(callup_id: str):
    c = await get_doc("callups", callup_id)
    players = {p["id"]: p for p in await list_docs("players")}
    for item in c.get("convocados", []):
        p = players.get(item["player_id"], {})
        item["nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip()
        item["dorsal"] = p.get("dorsal")
        item["foto"] = p.get("foto")
    return c


@api_router.put("/callups/{callup_id}")
async def edit_callup(callup_id: str, callup: Callup):
    return await update_doc("callups", callup_id, callup.model_dump())


@api_router.delete("/callups/{callup_id}")
async def remove_callup(callup_id: str):
    return await delete_doc("callups", callup_id)


# ================= PAYMENTS =================
class Payment(BaseModel):
    player_id: Optional[str] = None
    concepto: Optional[str] = "Cuota temporada"
    importe_base: Optional[float] = 0
    descuento_hermano: Optional[float] = 0
    importe_final: Optional[float] = 0
    forma_pago: Optional[str] = None  # domiciliacion, transferencia, efectivo, bizum
    iban: Optional[str] = None
    iban_validado: bool = False
    estado: str = "pendiente"  # pendiente, pagado, parcial, devuelto
    fecha_pago: Optional[str] = None
    recibo_generado: bool = False
    observaciones: Optional[str] = None


@api_router.post("/payments")
async def create_payment(payment: Payment):
    data = payment.model_dump()
    base = data.get("importe_base") or 0
    desc = data.get("descuento_hermano") or 0
    data["importe_final"] = round(base - desc, 2)
    return await insert_doc("payments", data)


@api_router.get("/payments")
async def get_payments(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    payments = await list_docs("payments", query)
    players = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in await list_docs("players")}
    for p in payments:
        p["player_nombre"] = players.get(p.get("player_id"), "—")
    return payments


@api_router.put("/payments/{payment_id}")
async def edit_payment(payment_id: str, payment: Payment):
    data = payment.model_dump()
    base = data.get("importe_base") or 0
    desc = data.get("descuento_hermano") or 0
    data["importe_final"] = round(base - desc, 2)
    return await update_doc("payments", payment_id, data)


@api_router.delete("/payments/{payment_id}")
async def remove_payment(payment_id: str):
    return await delete_doc("payments", payment_id)


# ================= AUTHORIZATIONS =================
class Authorization(BaseModel):
    player_id: Optional[str] = None
    tipo: str = "general"  # general, imagen, medica, desplazamientos, recogida, proteccion_datos
    persona_autorizada: Optional[str] = None
    dni_autorizada: Optional[str] = None
    firmante: Optional[str] = None
    fecha_firma: Optional[str] = None
    fecha_caducidad: Optional[str] = None
    estado: str = "pendiente"  # pendiente, firmada, caducada
    archivo_firmado: Optional[str] = None  # ruta relativa al PDF firmado subido
    observaciones: Optional[str] = None


@api_router.post("/authorizations")
async def create_authorization(auth: Authorization):
    return await insert_doc("authorizations", auth.model_dump())


@api_router.get("/authorizations")
async def get_authorizations(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    auths = await list_docs("authorizations", query)
    players = {p["id"]: p for p in await list_docs("players")}
    for a in auths:
        p = players.get(a.get("player_id"), {})
        a["player_nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip() or "—"
    return auths


@api_router.put("/authorizations/{auth_id}")
async def edit_authorization(auth_id: str, auth: Authorization):
    return await update_doc("authorizations", auth_id, auth.model_dump())


@api_router.delete("/authorizations/{auth_id}")
async def remove_authorization(auth_id: str):
    return await delete_doc("authorizations", auth_id)

@api_router.post("/authorizations/{auth_id}/upload-signed")
async def upload_signed_authorization(auth_id: str, file: UploadFile = File(...)):
    """Recibe un PDF firmado, lo guarda en disco y marca la autorización como firmada."""
    auth = await get_doc("authorizations", auth_id)
    # Eliminar archivo anterior si existe
    if auth.get("archivo_firmado"):
        old_path = UPLOADS_DIR / auth["archivo_firmado"]
        if old_path.exists():
            old_path.unlink()
    # Guardar nuevo archivo
    ext = Path(file.filename).suffix if file.filename else ".pdf"
    filename = f"auth_{auth_id}{ext}"
    file_path = UPLOADS_DIR / filename
    with open(file_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    # Actualizar documento
    await db["authorizations"].update_one(
        {"id": auth_id},
        {"$set": {"archivo_firmado": filename, "estado": "firmada", "updated_at": now_iso()}}
    )
    return {"ok": True, "archivo_firmado": filename}


@api_router.get("/authorizations/{auth_id}/signed-file")
async def get_signed_authorization(auth_id: str):
    """Devuelve el PDF firmado almacenado para una autorización."""
    auth = await get_doc("authorizations", auth_id)
    if not auth.get("archivo_firmado"):
        raise HTTPException(status_code=404, detail="No hay archivo firmado para esta autorización")
    file_path = UPLOADS_DIR / auth["archivo_firmado"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=f"autorizacion_firmada_{auth_id}.pdf"
    )


@api_router.delete("/authorizations/{auth_id}/signed-file")
async def delete_signed_authorization(auth_id: str):
    """Elimina el PDF firmado de una autorización y la vuelve a estado pendiente."""
    auth = await get_doc("authorizations", auth_id)
    if auth.get("archivo_firmado"):
        file_path = UPLOADS_DIR / auth["archivo_firmado"]
        if file_path.exists():
            file_path.unlink()
    await db["authorizations"].update_one(
        {"id": auth_id},
        {"$set": {"archivo_firmado": None, "estado": "pendiente", "updated_at": now_iso()}}
    )
    return {"ok": True}


# ================= INSCRIPTIONS =================
class Inscription(BaseModel):
    tipo: str = "alta"  # alta, renovacion
    nombre: str
    apellidos: Optional[str] = ""
    fecha_nacimiento: Optional[str] = None
    email_formulario: Optional[str] = None
    centro_escolar: Optional[str] = None
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    nueva_incorporacion: bool = True
    estado: str = "recibida"  # recibida, revisada, aceptada, pendiente, rechazada
    categoria: Optional[str] = None
    player_id: Optional[str] = None  # set when converted to player
    observaciones: Optional[str] = None


def _detect_siblings(insc: dict, players: list) -> list:
    keys = [insc.get("progenitor1_telefono"), insc.get("progenitor2_telefono"),
            insc.get("progenitor1_email"), insc.get("progenitor2_email"), insc.get("domicilio")]
    keys = [k for k in keys if k]
    matches = []
    for p in players:
        pvals = [p.get("progenitor1_telefono"), p.get("progenitor2_telefono"),
                 p.get("progenitor1_email"), p.get("progenitor2_email"), p.get("domicilio")]
        pvals = [v for v in pvals if v]
        if any(k in pvals for k in keys):
            matches.append({"id": p["id"], "nombre": f"{p.get('nombre','')} {p.get('apellidos','')}".strip()})
    return matches


@api_router.post("/inscriptions")
async def create_inscription(insc: Inscription):
    data = insc.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await insert_doc("inscriptions", data)


@api_router.get("/inscriptions")
async def get_inscriptions(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    inscs = await list_docs("inscriptions", query)
    players = await list_docs("players")
    for i in inscs:
        i["posibles_hermanos"] = _detect_siblings(i, players)
    return inscs


@api_router.put("/inscriptions/{insc_id}")
async def edit_inscription(insc_id: str, insc: Inscription):
    data = insc.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await update_doc("inscriptions", insc_id, data)


@api_router.delete("/inscriptions/{insc_id}")
async def remove_inscription(insc_id: str):
    return await delete_doc("inscriptions", insc_id)


@api_router.post("/inscriptions/{insc_id}/to-player")
async def inscription_to_player(insc_id: str):
    insc = await get_doc("inscriptions", insc_id)
    if insc.get("player_id"):
        raise HTTPException(status_code=400, detail="Ya tiene ficha de jugador")
    pdata = Player(
        nombre=insc.get("nombre"), apellidos=insc.get("apellidos") or "",
        fecha_nacimiento=insc.get("fecha_nacimiento"), email_formulario=insc.get("email_formulario"),
        centro_escolar=insc.get("centro_escolar"), domicilio=insc.get("domicilio"),
        progenitor1_nombre=insc.get("progenitor1_nombre"), progenitor1_telefono=insc.get("progenitor1_telefono"),
        progenitor1_email=insc.get("progenitor1_email"), progenitor2_nombre=insc.get("progenitor2_nombre"),
        progenitor2_telefono=insc.get("progenitor2_telefono"), progenitor2_email=insc.get("progenitor2_email"),
        nueva_incorporacion=insc.get("nueva_incorporacion", True), estado="pendiente_documentacion",
        fecha_inscripcion=insc.get("created_at"),
    ).model_dump()
    if pdata.get("fecha_nacimiento"):
        pdata["categoria"] = compute_category(pdata["fecha_nacimiento"])
    player = await insert_doc("players", pdata)
    await db.inscriptions.update_one({"id": insc_id}, {"$set": {"player_id": player["id"], "estado": "aceptada"}})
    return player


# ================= TRAININGS =================
class AsistenciaItem(BaseModel):
    player_id: str
    estado: str = "presente"  # presente, justificada, injustificada, lesion


class Training(BaseModel):
    fecha: Optional[str] = None
    hora: Optional[str] = None
    equipo_id: Optional[str] = None
    campo: Optional[str] = None
    asistencia: List[AsistenciaItem] = []
    ejercicios: Optional[str] = None
    observaciones: Optional[str] = None


@api_router.post("/trainings")
async def create_training(tr: Training):
    return await insert_doc("trainings", tr.model_dump())


@api_router.get("/trainings")
async def get_trainings(equipo_id: Optional[str] = None):
    query = {"equipo_id": equipo_id} if equipo_id else {}
    trs = await list_docs("trainings", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for tr in trs:
        tr["equipo_nombre"] = teams.get(tr.get("equipo_id"), "—")
        a = tr.get("asistencia", [])
        tr["presentes"] = len([x for x in a if x.get("estado") == "presente"])
        tr["total_asistencia"] = len(a)
    return trs


@api_router.get("/trainings/{tr_id}")
async def get_training(tr_id: str):
    tr = await get_doc("trainings", tr_id)
    players = {p["id"]: p for p in await list_docs("players")}
    for item in tr.get("asistencia", []):
        p = players.get(item["player_id"], {})
        item["nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip()
    return tr


@api_router.put("/trainings/{tr_id}")
async def edit_training(tr_id: str, tr: Training):
    return await update_doc("trainings", tr_id, tr.model_dump())


@api_router.delete("/trainings/{tr_id}")
async def remove_training(tr_id: str):
    return await delete_doc("trainings", tr_id)


# ================= STATS =================
class PlayerStats(BaseModel):
    player_id: str
    temporada: Optional[str] = None
    partidos_convocado: Optional[int] = 0
    partidos_jugados: Optional[int] = 0
    minutos: Optional[int] = 0
    goles: Optional[int] = 0
    asistencias: Optional[int] = 0
    amarillas: Optional[int] = 0
    rojas: Optional[int] = 0
    porterias_cero: Optional[int] = 0
    posicion: Optional[str] = None
    valoracion: Optional[int] = None
    observaciones: Optional[str] = None


@api_router.post("/stats")
async def create_stats(stats: PlayerStats):
    return await insert_doc("stats", stats.model_dump())


@api_router.get("/stats")
async def get_stats(player_id: Optional[str] = None):
    query = {"player_id": player_id} if player_id else {}
    rows = await list_docs("stats", query)
    players = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in await list_docs("players")}
    for r in rows:
        r["player_nombre"] = players.get(r.get("player_id"), "—")
    return rows


@api_router.put("/stats/{stats_id}")
async def edit_stats(stats_id: str, stats: PlayerStats):
    return await update_doc("stats", stats_id, stats.model_dump())


@api_router.delete("/stats/{stats_id}")
async def remove_stats(stats_id: str):
    return await delete_doc("stats", stats_id)


# ================= COMMUNICATIONS =================
class Communication(BaseModel):
    destinatario_tipo: str = "equipo"  # equipo, categoria, individual
    destinatario_id: Optional[str] = None
    destinatario_nombre: Optional[str] = None
    canal: str = "email"  # email, whatsapp
    asunto: Optional[str] = None
    mensaje: Optional[str] = None
    enviado: bool = False
    fecha_envio: Optional[str] = None


@api_router.post("/communications")
async def create_communication(comm: Communication):
    data = comm.model_dump()
    if data.get("enviado") and not data.get("fecha_envio"):
        data["fecha_envio"] = now_iso()
    return await insert_doc("communications", data)


@api_router.get("/communications")
async def get_communications():
    return await list_docs("communications")


@api_router.put("/communications/{comm_id}")
async def edit_communication(comm_id: str, comm: Communication):
    data = comm.model_dump()
    if data.get("enviado") and not data.get("fecha_envio"):
        data["fecha_envio"] = now_iso()
    return await update_doc("communications", comm_id, data)


@api_router.delete("/communications/{comm_id}")
async def remove_communication(comm_id: str):
    return await delete_doc("communications", comm_id)


# ================= SETTINGS / CONFIG =================
class Settings(BaseModel):
    club_nombre: Optional[str] = "Ikas-Txiki"
    club_logo: Optional[str] = None
    club_direccion: Optional[str] = None
    club_email: Optional[str] = None
    club_telefono: Optional[str] = None
    temporada_actual: Optional[str] = None
    temporadas: List[str] = []
    campos: List[str] = []
    entrenadores: List[str] = []
    cuota_base: Optional[float] = 0
    descuento_hermano: Optional[float] = 0


SETTINGS_ID = "global"


@api_router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        default = Settings().model_dump()
        default["id"] = SETTINGS_ID
        default["categories"] = CATEGORIES
        await db.settings.insert_one(dict(default))
        return clean(default)
    doc["categories"] = CATEGORIES
    return doc


@api_router.put("/settings")
async def update_settings(settings: Settings):
    data = settings.model_dump()
    data["id"] = SETTINGS_ID
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": data}, upsert=True)
    return await get_settings()


@api_router.get("/categories")
async def get_categories():
    return CATEGORIES


@api_router.get("/compute-category")
async def api_compute_category(fecha_nacimiento: str):
    return {"categoria": compute_category(fecha_nacimiento)}


# ================= DASHBOARD =================
@api_router.get("/dashboard")
async def dashboard():
    players = await list_docs("players")
    matches = await list_docs("matches")
    payments = await list_docs("payments")
    auths = await list_docs("authorizations")
    inscriptions = await list_docs("inscriptions")
    trainings = await list_docs("trainings")

    activos = [p for p in players if p.get("estado") == "activo"]
    pendientes_doc = [p for p in players if p.get("estado_documental") != "completo"]
    nuevas_inscripciones = [p for p in players if p.get("nueva_incorporacion")]
    inscripciones_pendientes = [p for p in players if p.get("estado") in ("pendiente_documentacion", "en_prueba")]
    pagos_pendientes = [p for p in payments if p.get("estado") in ("pendiente", "parcial")]
    auth_pendientes = [a for a in auths if a.get("estado") == "pendiente"]

    today = date.today().isoformat()
    proximos_partidos = sorted(
        [m for m in matches if m.get("fecha") and m.get("fecha") >= today and m.get("estado") == "programado"],
        key=lambda m: (m.get("fecha"), m.get("hora") or "")
    )[:5]
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for m in proximos_partidos:
        m["equipo_nombre"] = teams.get(m.get("equipo_id"), "—")

    proximos_entrenamientos = sorted(
        [tr for tr in trainings if tr.get("fecha") and tr.get("fecha") >= today],
        key=lambda tr: (tr.get("fecha"), tr.get("hora") or "")
    )[:5]
    for tr in proximos_entrenamientos:
        tr["equipo_nombre"] = teams.get(tr.get("equipo_id"), "—")

    insc_pendientes = [i for i in inscriptions if i.get("estado") in ("recibida", "pendiente", "revisada")]
    nuevas_insc = [i for i in inscriptions if i.get("tipo") == "alta" and not i.get("player_id")]

    alertas = []
    if pagos_pendientes:
        alertas.append({"tipo": "pago", "mensaje": f"{len(pagos_pendientes)} pagos pendientes"})
    if pendientes_doc:
        alertas.append({"tipo": "doc", "mensaje": f"{len(pendientes_doc)} jugadores con documentación incompleta"})
    if auth_pendientes:
        alertas.append({"tipo": "auth", "mensaje": f"{len(auth_pendientes)} autorizaciones pendientes de firma"})
    if insc_pendientes:
        alertas.append({"tipo": "inscripcion", "mensaje": f"{len(insc_pendientes)} inscripciones por revisar"})

    return {
        "jugadores_activos": len(activos),
        "total_jugadores": len(players),
        "nuevas_inscripciones": len(nuevas_insc),
        "inscripciones_pendientes": len(insc_pendientes),
        "documentacion_pendiente": len(pendientes_doc),
        "pagos_pendientes": len(pagos_pendientes),
        "importe_pendiente": round(sum((p.get("importe_final") or 0) for p in pagos_pendientes), 2),
        "autorizaciones_pendientes": len(auth_pendientes),
        "proximos_partidos": proximos_partidos,
        "proximos_entrenamientos": proximos_entrenamientos,
        "alertas": alertas,
    }


@api_router.get("/search")
async def global_search(q: str):
    import unicodedata

    def _norm(s):
        s = str(s or "").lower()
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    ql = _norm(q).strip()
    if not ql or len(ql) < 1:
        return []
    results = []

    teams = {t["id"]: t.get("nombre", "—") for t in await list_docs("teams")}

    players = await list_docs("players")
    for p in players:
        hay = _norm(f"{p.get('nombre','')} {p.get('apellidos','')} {p.get('dorsal','')} {p.get('posicion','')} {p.get('categoria','')} {p.get('numero_licencia','')} {p.get('progenitor1_telefono','')} {p.get('progenitor1_nombre','')} {p.get('email_formulario','')}")
        if ql in hay:
            results.append({"type": "player", "id": p["id"],
                            "title": f"{p.get('nombre','')} {p.get('apellidos','')}".strip(),
                            "subtitle": f"{p.get('categoria') or '—'} · {teams.get(p.get('equipo_id'), 'Sin equipo')}",
                            "route": "/jugadores"})

    for t in await list_docs("teams"):
        hay = _norm(f"{t.get('nombre','')} {t.get('categoria','')} {t.get('entrenador','')} {t.get('campo','')}")
        if ql in hay:
            results.append({"type": "team", "id": t["id"], "title": t.get("nombre", "—"),
                            "subtitle": f"{t.get('categoria') or '—'} · {t.get('entrenador') or ''}", "route": "/equipos"})

    for m in await list_docs("matches"):
        hay = _norm(f"{m.get('rival','')} {teams.get(m.get('equipo_id'),'')} {m.get('tipo','')} {m.get('jornada','')} {m.get('fecha','')}")
        if ql in hay:
            results.append({"type": "match", "id": m["id"],
                            "title": f"{teams.get(m.get('equipo_id'),'—')} vs {m.get('rival') or '—'}",
                            "subtitle": f"{m.get('fecha') or ''} · {m.get('hora') or ''}", "route": "/partidos"})

    for f in await list_docs("families"):
        hay = _norm(f"{f.get('progenitor1_nombre','')} {f.get('progenitor2_nombre','')} {f.get('progenitor1_telefono','')} {f.get('progenitor1_email','')} {f.get('contacto_principal','')} {f.get('domicilio','')}")
        if ql in hay:
            results.append({"type": "family", "id": f["id"],
                            "title": f.get("progenitor1_nombre") or f.get("contacto_principal") or "Familia",
                            "subtitle": f.get("progenitor1_telefono") or f.get("domicilio") or "", "route": "/familias"})

    for i in await list_docs("inscriptions"):
        hay = _norm(f"{i.get('nombre','')} {i.get('apellidos','')} {i.get('progenitor1_telefono','')} {i.get('email_formulario','')}")
        if ql in hay:
            results.append({"type": "inscription", "id": i["id"],
                            "title": f"{i.get('nombre','')} {i.get('apellidos','')}".strip(),
                            "subtitle": f"{i.get('estado','')} · {i.get('categoria') or ''}", "route": "/inscripciones"})

    player_names = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in players}
    for pay in await list_docs("payments"):
        pname = player_names.get(pay.get("player_id"), "")
        hay = _norm(f"{pname} {pay.get('concepto','')} {pay.get('estado','')} {pay.get('forma_pago','')}")
        if ql in hay:
            results.append({"type": "payment", "id": pay["id"],
                            "title": pname or pay.get("concepto", "Pago"),
                            "subtitle": f"{pay.get('importe_final',0)} € · {pay.get('estado','')}", "route": "/pagos"})

    return results[:40]


@api_router.get("/")
async def root():
    return {"message": "Ikas-Txiki Manager API"}


# ================= DEMO SEED / CLEAR =================
ALL_COLLECTIONS = ["players", "families", "teams", "matches", "callups", "payments",
                   "authorizations", "inscriptions", "trainings", "stats", "communications"]


@api_router.post("/clear-all")
async def clear_all():
    for c in ALL_COLLECTIONS:
        await db[c].delete_many({})
    return {"ok": True}


@api_router.post("/seed-demo")
async def seed_demo():
    # wipe first to keep idempotent
    for c in ALL_COLLECTIONS:
        await db[c].delete_many({})

    from datetime import timedelta
    today = date.today()

    # Settings
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": {
        "id": SETTINGS_ID, "club_nombre": "Ikas-Txiki Futbol Eskola",
        "club_direccion": "Kiroldegia, Donostia", "club_email": "info@ikastxiki.eus",
        "club_telefono": "943 000 000", "temporada_actual": "2025-2026",
        "temporadas": ["2024-2025", "2025-2026"], "campos": ["Campo Municipal", "Anoeta B", "Pista cubierta"],
        "entrenadores": ["Mikel Agirre", "Jon Etxeberria", "Ane Garmendia"],
        "cuota_base": 180, "descuento_hermano": 30,
    }}, upsert=True)

    # Teams
    teams_def = [
        {"nombre": "Benjamín A", "categoria": "Benjamín", "entrenador": "Mikel Agirre", "horario": "L-X 17:30", "campo": "Campo Municipal"},
        {"nombre": "Alevín A", "categoria": "Alevín", "entrenador": "Jon Etxeberria", "horario": "M-J 18:00", "campo": "Anoeta B"},
        {"nombre": "Infantil A", "categoria": "Infantil", "entrenador": "Ane Garmendia", "horario": "M-J 19:00", "campo": "Campo Municipal"},
    ]
    teams = []
    for td in teams_def:
        t = await insert_doc("teams", Team(temporada="2025-2026", estado="activo", **td).model_dump())
        teams.append(t)

    # Families + Players
    players_def = [
        ("Unai", "Goikoetxea", "2016-03-12", 0, "Delantero", "9", "activo", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
        ("Ane", "Lizarraga", "2016-07-05", 0, "Centrocampista", "8", "activo", "600111002", "ane.fam@mail.eus", "Av. Libertad 3"),
        ("Iker", "Mendizabal", "2015-11-20", 0, "Portero", "1", "lesionado", "600111003", "iker.fam@mail.eus", "Calle Río 5"),
        ("Maddi", "Sarriegi", "2014-02-18", 1, "Defensa", "4", "activo", "600111004", "maddi.fam@mail.eus", "Plaza Nueva 7"),
        ("Julen", "Aranburu", "2014-09-30", 1, "Delantero", "11", "activo", "600111005", "julen.fam@mail.eus", "Calle Sol 9"),
        ("Nora", "Etxeberria", "2013-05-14", 2, "Centrocampista", "10", "activo", "600111006", "nora.fam@mail.eus", "Av. Mar 2"),
        ("Aitor", "Goikoetxea", "2013-12-01", 2, "Defensa", "3", "pendiente_documentacion", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
        ("Leire", "Otaegi", "2015-08-22", 0, "Delantera", "7", "en_prueba", "600111008", "leire.fam@mail.eus", "Calle Norte 4"),
    ]
    players = []
    for (nombre, ape, fnac, tidx, pos, dorsal, estado, tel, email, dom) in players_def:
        pdata = Player(
            nombre=nombre, apellidos=ape, fecha_nacimiento=fnac, equipo_id=teams[tidx]["id"],
            posicion=pos, dorsal=dorsal, estado=estado, progenitor1_telefono=tel,
            progenitor1_email=email, progenitor1_nombre=f"Familia {ape}", domicilio=dom,
            estado_documental="completo" if estado == "activo" else "pendiente",
            fecha_alta=str(today - timedelta(days=120)),
        ).model_dump()
        pdata["categoria"] = compute_category(fnac)
        p = await insert_doc("players", pdata)
        players.append(p)

    # Families
    for ape, tel, email, dom in [("Goikoetxea", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
                                  ("Etxeberria", "600111006", "nora.fam@mail.eus", "Av. Mar 2")]:
        await insert_doc("families", Family(progenitor1_nombre=f"Familia {ape}", progenitor1_telefono=tel,
                                             progenitor1_email=email, domicilio=dom, contacto_principal=f"Familia {ape}",
                                             preferencia_comunicacion="whatsapp").model_dump())

    # Matches
    matches_def = [
        (teams[0]["id"], "C.D. Antiguoko", str(today + timedelta(days=3)), "10:00", "local", "liga", "programado", None, None, "1"),
        (teams[1]["id"], "Easo S.D.", str(today + timedelta(days=5)), "11:30", "visitante", "liga", "programado", None, None, "2"),
        (teams[2]["id"], "Real Sociedad B", str(today - timedelta(days=4)), "12:00", "local", "liga", "jugado", 3, 1, "1"),
    ]
    matches = []
    for (eid, rival, fecha, hora, cond, tipo, estado, rp, rr, jor) in matches_def:
        m = await insert_doc("matches", Match(equipo_id=eid, rival=rival, fecha=fecha, hora=hora, condicion=cond,
                                               tipo=tipo, estado=estado, resultado_propio=rp, resultado_rival=rr,
                                               jornada=jor, temporada="2025-2026", campo="Campo Municipal").model_dump())
        matches.append(m)

    # Trainings
    t0_players = [p for p in players if p["equipo_id"] == teams[0]["id"]]
    await insert_doc("trainings", Training(
        equipo_id=teams[0]["id"], campo="Campo Municipal", fecha=str(today + timedelta(days=1)), hora="17:30",
        asistencia=[{"player_id": p["id"], "estado": "presente"} for p in t0_players],
        ejercicios="Rondos + tiro a puerta").model_dump())
    t1_players = [p for p in players if p["equipo_id"] == teams[1]["id"]]
    await insert_doc("trainings", Training(
        equipo_id=teams[1]["id"], campo="Anoeta B", fecha=str(today - timedelta(days=2)), hora="18:00",
        asistencia=[{"player_id": p["id"], "estado": "presente" if i % 2 == 0 else "justificada"} for i, p in enumerate(t1_players)],
        ejercicios="Pase y control").model_dump())

    # Callup for first match
    await insert_doc("callups", Callup(
        match_id=matches[0]["id"], equipo_id=teams[0]["id"],
        convocados=[{"player_id": p["id"], "estado": "confirmado"} for p in t0_players],
        hora_quedada="09:15", lugar_quedada="Vestuarios Campo Municipal",
        material="Botas + agua", mensaje_familias="Convocatoria para el partido del fin de semana.").model_dump())

    # Payments
    for i, p in enumerate(players[:5]):
        estado = ["pagado", "pendiente", "pagado", "parcial", "pendiente"][i]
        await insert_doc("payments", Payment(player_id=p["id"], concepto="Cuota temporada", importe_base=180,
                                              descuento_hermano=30 if i in (3, 4) else 0, estado=estado,
                                              forma_pago="domiciliacion").model_dump())

    # Authorizations
    for i, p in enumerate(players[:4]):
        await insert_doc("authorizations", Authorization(player_id=p["id"], tipo=["general", "imagen", "medica", "desplazamientos"][i],
                                                          firmante=f"Familia {p['apellidos']}", estado="firmada" if i < 2 else "pendiente",
                                                          fecha_firma=str(today - timedelta(days=30)) if i < 2 else None).model_dump())

    # Inscriptions (pending)
    for nombre, ape, fnac, tel in [("Oihan", "Beristain", "2017-04-10", "600222001"),
                                    ("Irati", "Zubizarreta", "2016-10-02", "600222002")]:
        idata = Inscription(nombre=nombre, apellidos=ape, fecha_nacimiento=fnac, progenitor1_telefono=tel,
                            progenitor1_nombre=f"Familia {ape}", estado="recibida", tipo="alta").model_dump()
        idata["categoria"] = compute_category(fnac)
        await insert_doc("inscriptions", idata)

    # Stats
    for p in [players[5], players[0]]:
        await insert_doc("stats", PlayerStats(player_id=p["id"], temporada="2025-2026", partidos_convocado=8,
                                               partidos_jugados=7, minutos=420, goles=5, asistencias=3,
                                               amarillas=1, valoracion=8, posicion=p["posicion"]).model_dump())

    # Communications
    await insert_doc("communications", Communication(destinatario_tipo="equipo", destinatario_id=teams[0]["id"],
                                                      destinatario_nombre=teams[0]["nombre"], canal="whatsapp",
                                                      asunto="Entrenamiento del lunes", mensaje="Recordad traer botas de tacos.",
                                                      enviado=True, fecha_envio=now_iso()).model_dump())

    return {"ok": True, "teams": len(teams), "players": len(players), "matches": len(matches)}



# ================= EQUIPMENT =================

@api_router.get("/equipment")
async def get_equipment(equipo_id: Optional[str] = None, entregada: Optional[str] = None):
    """Devuelve todos los jugadores con sus datos de equipación."""
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if entregada is not None:
        query["equipacion_entregada"] = (entregada.lower() == "true")
    players = await list_docs("players", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    result = []
    for p in players:
        result.append({
            "id": p["id"],
            "nombre": p.get("nombre", ""),
            "apellidos": p.get("apellidos", ""),
            "categoria": p.get("categoria"),
            "equipo_id": p.get("equipo_id"),
            "equipo_nombre": teams.get(p.get("equipo_id"), "—"),
            "dorsal": p.get("dorsal"),
            "talla_camiseta": p.get("talla_camiseta"),
            "talla_pantalon": p.get("talla_pantalon"),
            "talla_chandal": p.get("talla_chandal"),
            "talla_medias": p.get("talla_medias"),
            "talla_calzado": p.get("talla_calzado"),
            "equipacion_entregada": p.get("equipacion_entregada", False),
            "fecha_entrega_equipacion": p.get("fecha_entrega_equipacion"),
            "observaciones_material": p.get("observaciones_material"),
            "estado": p.get("estado"),
        })
    return result


@api_router.put("/equipment/{player_id}")
async def update_equipment(player_id: str, data: Dict[str, Any]):
    """Actualiza solo los campos de equipación de un jugador."""
    allowed = {
        "dorsal", "talla_camiseta", "talla_pantalon", "talla_chandal",
        "talla_medias", "talla_calzado", "equipacion_entregada",
        "fecha_entrega_equipacion", "observaciones_material"
    }
    update = {k: v for k, v in data.items() if k in allowed}
    update["updated_at"] = now_iso()
    await db["players"].update_one({"id": player_id}, {"$set": update})
    return await get_doc("players", player_id)


# ================= EXCEL IMPORT / EXPORT =================
EXPORT_COLLECTIONS = ALL_COLLECTIONS + ["settings"]


def _flatten_for_excel(doc: dict) -> dict:
    out = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, (list, dict)):
            out[k] = json.dumps(v, ensure_ascii=False)
        else:
            out[k] = v
    return out


def _unflatten_from_excel(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if v is None:
            continue
        if isinstance(v, float) and math.isnan(v):
            continue
        if isinstance(v, str):
            s = v.strip()
            if s == "":
                continue
            if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
                try:
                    out[k] = json.loads(s)
                    continue
                except Exception:
                    pass
            out[k] = v
        else:
            out[k] = v
    return out


@api_router.get("/export-excel")
async def export_excel():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        wrote_any = False
        for coll in EXPORT_COLLECTIONS:
            docs = await db[coll].find({}, {"_id": 0}).to_list(10000)
            rows = [_flatten_for_excel(d) for d in docs]
            df = pd.DataFrame(rows)
            df.to_excel(writer, sheet_name=coll[:31], index=False)
            wrote_any = True
        if not wrote_any:
            pd.DataFrame().to_excel(writer, sheet_name="empty", index=False)
    buffer.seek(0)
    fname = f"ikastxiki_backup_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.post("/import-excel")
async def import_excel(file: UploadFile = File(...)):
    content = await file.read()
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo Excel: {e}")

    summary = {}
    for coll, df in sheets.items():
        if coll not in EXPORT_COLLECTIONS:
            continue
        records = df.to_dict(orient="records")
        cleaned = [_unflatten_from_excel(r) for r in records]
        cleaned = [c for c in cleaned if c]
        if coll == "settings":
            for c in cleaned:
                c["id"] = SETTINGS_ID
                await db.settings.update_one({"id": SETTINGS_ID}, {"$set": c}, upsert=True)
            summary[coll] = len(cleaned)
            continue
        await db[coll].delete_many({})
        for c in cleaned:
            if not c.get("id"):
                c["id"] = new_id()
            c.setdefault("created_at", now_iso())
            c["updated_at"] = now_iso()
        if cleaned:
            await db[coll].insert_many(cleaned)
        summary[coll] = len(cleaned)
    return {"ok": True, "imported": summary}


app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
