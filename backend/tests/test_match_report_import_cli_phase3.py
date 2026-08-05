import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "match_report_import_dry_run.py"


def _run(tmp_path, rows):
    source = tmp_path / "rows.json"
    catalog = tmp_path / "catalog.json"
    output = tmp_path / "report.json"
    source.write_text(json.dumps(rows), encoding="utf-8")
    catalog.write_text(json.dumps({
        "matches": {"m1": {"team_id": "team-1", "modality": "F7"}},
        "players": {"p1": {"team_id": "team-1"}},
        "closed_match_ids": [],
    }), encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--input", str(source), "--catalog", str(catalog), "--output", str(output)],
        capture_output=True, text=True, check=False,
    )
    return result, json.loads(output.read_text(encoding="utf-8"))


def test_cli_dry_run_accepts_valid_fictitious_rows_without_writing_a_database(tmp_path):
    result, report = _run(tmp_path, [{
        "match_id": "m1", "player_id": "p1", "role": "starter", "played": True,
        "minutes": 60, "period_ids": ["T1", "T2", "T3"], "goals": 0,
    }])
    assert result.returncode == 0
    assert report["dry_run"] is True and report["can_import"] is True
    assert report["summary"]["valid"] == 1


def test_cli_dry_run_reports_rejections_and_uses_exit_code_two(tmp_path):
    result, report = _run(tmp_path, [{
        "match_id": "unknown", "player_id": "p1", "role": "starter", "minutes": -1,
    }])
    assert result.returncode == 2
    assert report["can_import"] is False
    assert report["summary"]["errors"] == 1
