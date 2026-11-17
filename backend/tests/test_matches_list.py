import asyncio

import server


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _length):
        return self.rows


class FakeReports:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def find(self, query, projection):
        self.queries.append((query, projection))
        wanted = set(query["match_id"]["$in"])
        return FakeCursor([{"match_id": r["match_id"], "status": r["status"]} for r in self.rows if r["match_id"] in wanted])


class FakeDb:
    def __init__(self, reports):
        self.match_reports = reports


def test_matches_include_team_season_and_report_status(monkeypatch):
    matches = [
        {"id": "m-1", "equipo_id": "t-1", "rival": "A"},
        {"id": "m-2", "equipo_id": "t-1", "rival": "B"},
        {"id": "m-3", "equipo_id": "missing", "rival": "C"},
    ]
    teams = [{"id": "t-1", "nombre": "Kañometa", "temporada": "2026-2027"}]

    async def fake_list(collection, query=None):
        return [dict(row) for row in (matches if collection == "matches" else teams)]

    reports = FakeReports([{"match_id": "m-1", "status": "closed", "participants": [{"player_id": "p"}]}])
    monkeypatch.setattr(server, "list_docs", fake_list)
    monkeypatch.setattr(server, "db", FakeDb(reports))

    result = {m["id"]: m for m in asyncio.run(server.get_matches())}

    assert result["m-1"]["equipo_nombre"] == "Kañometa"
    assert result["m-1"]["equipo_temporada"] == "2026-2027"
    assert result["m-1"]["acta_estado"] == "closed"
    assert result["m-2"]["acta_estado"] is None
    assert result["m-3"]["equipo_nombre"] == "—"
    assert "participants" not in result["m-1"]
    # Solo se piden match_id y status: nunca participantes ni datos de jugadores.
    assert reports.queries[0][1] == {"_id": 0, "match_id": 1, "status": 1}


def test_matches_without_rows_skip_report_query(monkeypatch):
    async def fake_list(collection, query=None):
        return []

    reports = FakeReports([])
    monkeypatch.setattr(server, "list_docs", fake_list)
    monkeypatch.setattr(server, "db", FakeDb(reports))

    assert asyncio.run(server.get_matches()) == []
    assert reports.queries == []
