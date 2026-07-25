"""Base de conocimiento controlada del asistente de Ikas-Txiki.

Solo contiene rutas, funciones y procedimientos públicos de la propia
aplicación. No se alimenta con documentos ni datos de usuarios.
"""
from __future__ import annotations

from typing import Any, Mapping


KNOWLEDGE_VERSION = "2026.07.25"

MODULES: dict[str, dict[str, Any]] = {
    "dashboard": {
        "routes": ["/"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "El panel resume las tareas y próximas actividades permitidas para tu rol.",
        "eu": "Panelak zure rolak baimentzen dituen zereginak eta hurrengo jarduerak laburbiltzen ditu.",
    },
    "players": {
        "routes": ["/jugadores"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Jugadores permite consultar las fichas dentro de tu ámbito. Crear y editar depende de tus permisos.",
        "eu": "Jokalariak atalak zure esparruko fitxak kontsultatzeko aukera ematen du. Sortzea eta editatzea baimenen araberakoa da.",
    },
    "families": {
        "routes": ["/familias", "/portal"],
        "roles": ["admin", "coordinator", "family"],
        "es": "Familias reúne las relaciones familiares autorizadas; el portal familiar limita la vista a sus hijos.",
        "eu": "Familiak atalak baimendutako familia-harremanak biltzen ditu; familia-atariak seme-alabetara mugatzen du ikuspegia.",
    },
    "teams": {
        "routes": ["/equipos"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Equipos muestra plantilla, categoría y planificación de los equipos que puedes consultar.",
        "eu": "Taldeak atalak kontsulta ditzakezun taldeen plantilla, kategoria eta plangintza erakusten ditu.",
    },
    "inscriptions": {
        "routes": ["/inscripciones"],
        "roles": ["admin", "coordinator"],
        "es": "Inscripciones permite revisar altas y renovaciones. La importación histórica no forma parte del asistente.",
        "eu": "Inskripzioak atalak altak eta berritzeak berrikusteko aukera ematen du. Inportazio historikoa ez da laguntzailearen parte.",
    },
    "trainings": {
        "routes": ["/entrenamientos"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Entrenamientos incluye planificación y asistencia; la edición está limitada al personal autorizado.",
        "eu": "Entrenamenduak atalak plangintza eta asistentzia biltzen ditu; edizioa baimendutako langileetara mugatuta dago.",
    },
    "matches": {
        "routes": ["/partidos"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Partidos permite consultar calendario, rival, lugar y resultado dentro de tu ámbito.",
        "eu": "Partidak atalak zure esparruko egutegia, aurkaria, lekua eta emaitza kontsultatzeko aukera ematen du.",
    },
    "callups": {
        "routes": ["/convocatorias"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Convocatorias muestra convocados y respuestas. Familias y jugadores solo responden por las personas vinculadas.",
        "eu": "Deialdiak atalak deitutakoak eta erantzunak erakusten ditu. Familiek eta jokalariek lotutako pertsonengatik soilik erantzuten dute.",
    },
    "payments": {
        "routes": ["/pagos"],
        "roles": ["admin", "family"],
        "es": "Cuotas y pagos muestra únicamente la información económica permitida. El asistente no realiza cargos ni remesas.",
        "eu": "Kuotak eta ordainketak atalak baimendutako informazio ekonomikoa soilik erakusten du. Laguntzaileak ez du kobrantzarik edo sortarik egiten.",
    },
    "authorizations": {
        "routes": ["/autorizaciones"],
        "roles": ["admin", "coordinator", "family", "player"],
        "es": "Autorizaciones permite consultar, imprimir y descargar documentos según el rol. El asistente no modifica documentos firmados.",
        "eu": "Baimenak atalak dokumentuak kontsultatu, inprimatu eta deskargatzeko aukera ematen du. Laguntzaileak ez ditu sinatutako dokumentuak aldatzen.",
    },
    "equipment": {
        "routes": ["/equipamiento"],
        "roles": ["admin", "coordinator", "coach"],
        "es": "Equipamiento registra tallas y entregas, incluida más de una equipación mediante la ficha autorizada.",
        "eu": "Ekipamendua atalak neurriak eta entregak erregistratzen ditu, baimendutako fitxaren bidez ekipazio bat baino gehiago barne.",
    },
    "communications": {
        "routes": ["/comunicacion"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Comunicación reúne avisos permitidos. El asistente no envía correos, SMS ni WhatsApp.",
        "eu": "Komunikazioa atalak baimendutako oharrak biltzen ditu. Laguntzaileak ez du mezu elektronikorik, SMSrik edo WhatsApp mezurik bidaltzen.",
    },
    "calendar": {
        "routes": ["/calendario"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Calendario unifica partidos, entrenamientos y eventos visibles para tu rol.",
        "eu": "Egutegiak zure rolarentzat ikusgai dauden partidak, entrenamenduak eta ekitaldiak bateratzen ditu.",
    },
    "reports": {
        "routes": ["/informes"],
        "roles": ["admin", "coordinator", "coach", "family", "player"],
        "es": "Informes ofrece vista previa y exportaciones PDF y Excel respetando filtros y ámbito.",
        "eu": "Txostenak atalak aurrebista eta PDF/Excel esportazioak eskaintzen ditu, iragazkiak eta esparrua errespetatuz.",
    },
    "settings": {
        "routes": ["/configuracion", "/usuarios"],
        "roles": ["admin"],
        "es": "Configuración y usuarios son funciones administrativas. Solo se muestran a quien tenga permiso.",
        "eu": "Konfigurazioa eta erabiltzaileak administrazio-funtzioak dira. Baimena duenari soilik erakusten zaizkio.",
    },
}

ALIASES = {
    "inicio": "dashboard", "panel": "dashboard", "dashboard": "dashboard",
    "jugador": "players", "jugadores": "players", "jokalari": "players",
    "familia": "families", "familias": "families", "familia-ataria": "families",
    "equipo": "teams", "equipos": "teams", "talde": "teams",
    "inscripcion": "inscriptions", "inscripciones": "inscriptions", "inskripzio": "inscriptions",
    "entrenamiento": "trainings", "asistencia": "trainings", "entrenamendu": "trainings",
    "partido": "matches", "partidos": "matches", "partida": "matches",
    "convocatoria": "callups", "convocatorias": "callups", "deialdi": "callups",
    "pago": "payments", "pagos": "payments", "ordainketa": "payments",
    "autorizacion": "authorizations", "autorizaciones": "authorizations", "baimen": "authorizations",
    "equipamiento": "equipment", "ekipamendu": "equipment",
    "comunicacion": "communications", "komunikazio": "communications",
    "calendario": "calendar", "egutegi": "calendar",
    "informe": "reports", "informes": "reports", "txosten": "reports",
    "configuracion": "settings", "usuarios": "settings", "konfigurazio": "settings",
}


def available_modules(role: str) -> list[dict]:
    return [
        {"id": key, "routes": value["routes"], "title": key}
        for key, value in MODULES.items() if role in value["roles"]
    ]


def contextual_help(message: str, role: str, lang: str, route: str | None = None) -> Mapping[str, Any]:
    language = "eu" if lang == "eu" else "es"
    normalized = message.casefold()
    module_id = next(
        (module for alias, module in ALIASES.items() if alias in normalized),
        None,
    )
    if not module_id and route:
        module_id = next(
            (key for key, value in MODULES.items() if route in value["routes"]),
            None,
        )
    module = MODULES.get(module_id or "dashboard", MODULES["dashboard"])
    if role not in module["roles"]:
        return {
            "text": (
                "Esa función no está disponible para tu rol."
                if language == "es" else
                "Funtzio hori ez dago erabilgarri zure rolarentzat."
            ),
            "links": [],
            "module": module_id,
        }
    return {"text": module[language], "links": module["routes"], "module": module_id}
