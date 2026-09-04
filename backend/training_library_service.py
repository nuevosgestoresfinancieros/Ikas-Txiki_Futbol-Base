"""Catalog and filesystem helpers for the club's prepared training library."""

from __future__ import annotations

import csv
import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional


CANONICAL_ROOT_NAME = "Entrenamientos_fútbol"
INDEX_DIRECTORY = "00_Índice_y_plantillas"
INDEX_FILENAME = "indice_entrenamientos.csv"
README_FILENAME = "README_estructura.md"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalized(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def find_library_root(uploads_dir: Path) -> Optional[Path]:
    """Find the root folder despite composed/decomposed accent differences."""
    if not uploads_dir.exists():
        return None
    expected = _normalized(CANONICAL_ROOT_NAME)
    for child in uploads_dir.iterdir():
        if child.is_dir() and _normalized(child.name) == expected:
            return child
    return None


def _label(folder_name: Optional[str]) -> Optional[str]:
    if not folder_name:
        return None
    return re.sub(r"^\d+[_-]?", "", folder_name).replace("_", " ").strip() or folder_name


def _slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-")


def search_key(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _manifest_expected_count(root: Path) -> Optional[int]:
    index_path = root / INDEX_DIRECTORY / INDEX_FILENAME
    if not index_path.exists():
        return None
    try:
        with index_path.open("r", encoding="utf-8-sig", newline="") as stream:
            rows = csv.DictReader(stream, delimiter=";")
            for row in rows:
                if row.get("nivel") == "0" and row.get("tipo") == "directorio":
                    value = str(row.get("pdf_recursivos") or "").strip()
                    return int(value) if value.isdigit() else None
    except (OSError, UnicodeError, ValueError):
        return None
    return None


def _record_id(relative_path: str) -> str:
    return "training-library-" + hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[:24]


def _is_pdf(path: Path) -> bool:
    try:
        with path.open("rb") as stream:
            return stream.read(5) == b"%PDF-"
    except OSError:
        return False


def build_catalog(root: Path, uploads_dir: Path, *, now: Optional[str] = None) -> dict[str, Any]:
    """Build one catalog record per PDF and a compact import summary."""
    now = now or _now_iso()
    records: list[dict[str, Any]] = []
    invalid: list[dict[str, str]] = []
    if not root.exists():
        return {"records": records, "invalid": invalid, "expected": None, "root": None}

    for path in sorted(root.rglob("*"), key=lambda item: str(item).casefold()):
        if not path.is_file() or path.suffix.casefold() != ".pdf":
            continue
        relative = path.relative_to(root).as_posix()
        if not _is_pdf(path):
            invalid.append({"path": relative, "reason": "El archivo no parece un PDF válido"})
            continue
        parts = Path(relative).parts
        block = parts[0] if parts else ""
        subblock = parts[1] if len(parts) > 2 else None
        collection = subblock if block.startswith("99_") else None
        relative_from_uploads = path.relative_to(uploads_dir).as_posix()
        title = path.stem.strip() or path.name
        records.append({
            "id": _record_id(relative),
            "title": title,
            "block": block,
            "block_label": _label(block),
            "subblock": subblock,
            "subblock_label": _label(subblock),
            "collection": collection,
            "collection_label": _label(collection),
            "relative_path": relative_from_uploads,
            "source_path": relative,
            "filename": path.name,
            "slug": _slug(title),
            "search_text": " ".join(filter(None, (title, block, subblock, collection, relative))),
            "search_text_normalized": search_key(" ".join(filter(None, (title, block, subblock, collection, relative)))),
            "file_size_bytes": path.stat().st_size,
            "file_sha256": _file_sha256(path),
            "status": "active",
            "created_at": now,
            "updated_at": now,
        })

    return {
        "records": records,
        "invalid": invalid,
        "expected": _manifest_expected_count(root),
        "root": root.name,
    }


def public_record(record: Mapping[str, Any]) -> dict[str, Any]:
    """Return metadata safe for the frontend; never expose an absolute path."""
    fields = (
        "id", "title", "block", "block_label", "subblock", "subblock_label",
        "collection", "collection_label", "source_path", "filename", "slug",
        "file_size_bytes", "file_sha256", "status", "created_at", "updated_at",
    )
    return {key: record.get(key) for key in fields}


def snapshot(record: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "block": record.get("block"),
        "block_label": record.get("block_label"),
        "subblock": record.get("subblock"),
        "subblock_label": record.get("subblock_label"),
        "source_path": record.get("source_path"),
        "filename": record.get("filename"),
    }


def catalog_summary(records: Iterable[Mapping[str, Any]], *, expected: Optional[int] = None,
                    invalid_count: int = 0, root: Optional[str] = None) -> dict[str, Any]:
    rows = list(records)
    blocks: dict[str, dict[str, Any]] = {}
    for record in rows:
        block = str(record.get("block") or "")
        entry = blocks.setdefault(block, {
            "value": block, "label": record.get("block_label") or block,
            "count": 0, "subblocks": {},
        })
        entry["count"] += 1
        subblock = record.get("subblock")
        if subblock:
            sub = entry["subblocks"].setdefault(subblock, {
                "value": subblock, "label": record.get("subblock_label") or subblock, "count": 0,
            })
            sub["count"] += 1
    categories = []
    for value in sorted(blocks, key=lambda item: item.casefold()):
        entry = blocks[value]
        entry["subblocks"] = [entry["subblocks"][key] for key in sorted(entry["subblocks"], key=str.casefold)]
        categories.append(entry)
    return {
        "root": root,
        "total": len(rows),
        "expected": expected,
        "invalid": invalid_count,
        "categories": categories,
        "complete": expected is None or expected == len(rows),
    }
