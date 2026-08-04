"""Agregación pura del calendario deportivo e iCal autenticado."""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Iterable, Optional


CALENDAR_TYPES = ("match", "training", "meeting", "club_event")


def _iso_date(value: object) -> Optional[str]:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except (TypeError, ValueError):
        return None


def _event(source: str, item: dict, teams: dict[str, dict]) -> Optional[dict]:
    event_date = _iso_date(item.get("fecha"))
    if not event_date:
        return None
    team = teams.get(item.get("equipo_id"), {})
    if source == "match":
        title = item.get("rival") or "Partido"
        location = item.get("direccion_campo") or item.get("campo")
        detail_path = f"/partidos?event={item.get('id')}"
    elif source == "training":
        title = item.get("ejercicios") or "Entrenamiento"
        location = item.get("campo")
        detail_path = f"/entrenamientos?event={item.get('id')}"
    else:
        title = item.get("titulo") or ("Reunión" if item.get("tipo") == "meeting" else "Evento del club")
        location = item.get("lugar")
        detail_path = f"/calendario?event={item.get('id')}"
    event_type = item.get("tipo") if source == "club_event" else source
    return {
        "id": f"{source}:{item.get('id')}", "source": source, "source_id": item.get("id"),
        "tipo": event_type, "titulo": title, "fecha": event_date, "hora": item.get("hora"),
        "fecha_fin": _iso_date(item.get("fecha_fin")) or event_date, "hora_fin": item.get("hora_fin"),
        "equipo_id": item.get("equipo_id"), "equipo_nombre": team.get("nombre"),
        "categoria": team.get("categoria") or item.get("categoria"),
        "temporada": team.get("temporada") or item.get("temporada"),
        "lugar": location, "descripcion": item.get("descripcion") or item.get("observaciones"),
        "estado": item.get("estado"), "detail_path": detail_path,
        "latitude": item.get("latitude", item.get("latitud", item.get("lat"))),
        "longitude": item.get("longitude", item.get("longitud", item.get("lng", item.get("lon")))),
    }


def aggregate_calendar_events(matches: Iterable[dict], trainings: Iterable[dict], club_events: Iterable[dict],
                              teams: Iterable[dict], start: Optional[str] = None, end: Optional[str] = None,
                              team_id: Optional[str] = None, category: Optional[str] = None,
                              season: Optional[str] = None, event_type: Optional[str] = None) -> list[dict]:
    team_map = {team.get("id"): team for team in teams}
    rows = []
    for source, items in (("match", matches), ("training", trainings), ("club_event", club_events)):
        for item in items:
            event = _event(source, item, team_map)
            if not event:
                continue
            if start and event["fecha_fin"] < start[:10]:
                continue
            if end and event["fecha"] > end[:10]:
                continue
            if team_id and event.get("equipo_id") != team_id:
                continue
            if category and event.get("categoria") != category:
                continue
            if season and event.get("temporada") != season:
                continue
            if event_type and event.get("tipo") != event_type:
                continue
            rows.append(event)
    return sorted(rows, key=lambda row: (row["fecha"], row.get("hora") or "00:00", row["titulo"]))


def _moment(event: dict) -> datetime:
    parsed_date = date.fromisoformat(event["fecha"])
    try:
        parsed_time = time.fromisoformat(str(event.get("hora") or "00:00")[:5])
    except ValueError:
        parsed_time = time.min
    return datetime.combine(parsed_date, parsed_time, tzinfo=timezone.utc)


def next_calendar_event(events: Iterable[dict], now: Optional[datetime] = None) -> Optional[dict]:
    now = now or datetime.now(timezone.utc)
    future = [event for event in events if _moment(event) >= now]
    return min(future, key=_moment) if future else None


def _ical_escape(value: object) -> str:
    return str(value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ical_datetime(day: str, clock: Optional[str]) -> str:
    if not clock:
        return day.replace("-", "")
    return day.replace("-", "") + "T" + str(clock)[:5].replace(":", "") + "00"


def calendar_to_ical(events: Iterable[dict], calendar_name: str = "Ikas-Txiki") -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ikas-Txiki//Manager//ES",
             f"X-WR-CALNAME:{_ical_escape(calendar_name)}", "CALSCALE:GREGORIAN"]
    for event in events:
        has_time = bool(event.get("hora"))
        start = _ical_datetime(event["fecha"], event.get("hora"))
        finish = _ical_datetime(event.get("fecha_fin") or event["fecha"], event.get("hora_fin") or event.get("hora"))
        lines.extend(["BEGIN:VEVENT", f"UID:{_ical_escape(event['id'])}@ikas-txiki",
                      f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"])
        if has_time:
            lines.extend([f"DTSTART:{start}", f"DTEND:{finish}"])
        else:
            lines.append(f"DTSTART;VALUE=DATE:{start}")
        lines.extend([f"SUMMARY:{_ical_escape(event.get('titulo'))}",
                      f"LOCATION:{_ical_escape(event.get('lugar'))}",
                      f"DESCRIPTION:{_ical_escape(event.get('descripcion'))}", "END:VEVENT"])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def subscription_capability() -> dict:
    return {"enabled": False, "public_url": None, "token_required": True, "revocable": True}
