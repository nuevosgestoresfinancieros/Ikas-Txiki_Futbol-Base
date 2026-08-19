"""Estado operativo del proceso sin efectos laterales."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def deployment_version(repository_root: Path) -> str:
    """Resuelve una vez la versión desplegada; nunca ejecuta Git por petición."""
    configured = str(os.environ.get("APP_VERSION") or os.environ.get("GIT_COMMIT") or "").strip()
    if configured:
        return configured
    try:
        result = subprocess.run(
            ["git", "-C", str(repository_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=0.5,
        )
        commit = result.stdout.strip()
        return commit if len(commit) == 40 else "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"
