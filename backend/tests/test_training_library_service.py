from pathlib import Path

from training_library_service import build_catalog, catalog_summary, find_library_root, public_record


def test_catalog_preserves_hierarchy_and_ignores_macos_metadata(tmp_path):
    uploads = tmp_path / "uploads"
    root = uploads / "Entrenamientos_fútbol"
    first = root / "02_Técnica_individual" / "Conducción"
    first.mkdir(parents=True)
    (first / "Conducción orientada.pdf").write_bytes(b"%PDF-1.4 test")
    (root / ".DS_Store").write_bytes(b"metadata")

    discovered = find_library_root(uploads)
    result = build_catalog(discovered, uploads)

    assert len(result["records"]) == 1
    record = result["records"][0]
    assert record["block"] == "02_Técnica_individual"
    assert record["subblock"] == "Conducción"
    assert record["block_label"] == "Técnica individual"
    assert record["subblock_label"] == "Conducción"
    assert record["relative_path"].endswith("Conducción orientada.pdf")
    assert public_record(record)["title"] == "Conducción orientada"
    assert "search_text_normalized" not in public_record(record)


def test_summary_reports_expected_catalog_count():
    records = [
        {"block": "01_Activación", "block_label": "Activación", "subblock": None},
        {"block": "02_Técnica", "block_label": "Técnica", "subblock": "Conducción", "subblock_label": "Conducción"},
    ]
    summary = catalog_summary(records, expected=2, root="Entrenamientos_fútbol")

    assert summary["total"] == 2
    assert summary["complete"] is True
    assert summary["categories"][1]["subblocks"][0]["count"] == 1
