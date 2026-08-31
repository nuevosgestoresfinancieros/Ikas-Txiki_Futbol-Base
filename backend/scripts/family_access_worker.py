"""Worker explícito para la cola de accesos familiares.

No se inicia con la aplicación. Se niega a trabajar salvo que la entrega se
habilite de forma deliberada en el entorno del proceso.
"""
from __future__ import annotations

import asyncio
import os
import socket


async def main() -> None:
    if os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") != "1":
        raise SystemExit("family_access_delivery_disabled")
    from server import (  # import tardío: no cargar configuración si está desactivado
        JWT_SECRET, _public_app_url, db, dispatch_email, pwd_context,
    )
    from family_access_service import process_one_job

    worker_id = f"family-access:{socket.gethostname()}:{os.getpid()}"
    actor = {"id": "family-access-worker", "role": "admin"}
    while True:
        result = await process_one_job(
            db, worker_id, actor, JWT_SECRET, pwd_context.hash, dispatch_email,
            _public_app_url(), allow_delivery=True,
        )
        if result is None:
            return


if __name__ == "__main__":
    asyncio.run(main())

