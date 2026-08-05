#!/usr/bin/env python3
"""Simula una importación histórica de actas sin abrir ni escribir MongoDB.

La entrada puede ser JSON (lista de filas) o CSV. El catálogo JSON separado
describe exclusivamente los identificadores ficticios permitidos para la
simulación. Código de salida: 0 si todas las filas son importables, 2 si el
informe contiene rechazos y 1 para errores de uso o formato.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from match_report_service import dry_run_historical_rows  # noqa: E402


def _rows(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
            raise ValueError("El JSON de entrada debe ser una lista de objetos")
        return value
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    raise ValueError("La simulación solo admite archivos JSON o CSV")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Dry-run histórico de actas de partido")
    parser.add_argument("--input", required=True, type=Path, help="Fixture JSON o CSV")
    parser.add_argument("--catalog", required=True, type=Path, help="Catálogo ficticio JSON")
    parser.add_argument("--output", type=Path, help="Ruta opcional del informe JSON")
    args = parser.parse_args(argv)
    try:
        rows = _rows(args.input)
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        matches = catalog.get("matches") or {}
        players = catalog.get("players") or {}
        report = dry_run_historical_rows(
            rows,
            known_match_ids=set(matches),
            known_player_ids=set(players),
            closed_match_ids=set(catalog.get("closed_match_ids") or []),
            match_contexts=matches,
            player_contexts=players,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"dry_run": True, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0 if report["can_import"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
