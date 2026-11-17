"""Cifra los IBAN de pagos que quedaron guardados en claro.

Por defecto solo informa (sin escribir) y nunca imprime IBAN completos.
Para aplicar hace falta ``--apply`` y la confirmación explícita, después de
hacer una copia lógica de la colección ``payments``. Es idempotente: los pagos
que ya tienen ``iban_encrypted`` no se tocan.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from inscription_import_service import encrypt_iban, normalize_iban  # noqa: E402

CONFIRMATION = "ENCRYPT-PAYMENT-IBANS"


def is_masked(value: str) -> bool:
    return "•" in value or "*" in value


def plan_payment(payment: dict, secret: str) -> tuple[str, dict]:
    """Devuelve (acción, campos) para un pago con IBAN en claro."""
    raw = normalize_iban(payment.get("iban"))
    if not raw:
        return "skip", {}
    if payment.get("iban_encrypted"):
        # Ya protegido: solo se elimina el resto en claro.
        return "clear_plaintext", {"iban": None}
    if is_masked(raw):
        # Un valor enmascarado no es un IBAN real: el IBAN completo se perdió y
        # debe volver a introducirse. Se conservan país y últimos 4 dígitos.
        fields = {"iban": None}
        last4 = re.search(r"([A-Z0-9]{4})$", raw)
        country = re.match(r"([A-Z]{2})", raw)
        if last4 and not payment.get("iban_last4"):
            fields["iban_last4"] = last4.group(1)
        if country and not payment.get("iban_country"):
            fields["iban_country"] = country.group(1)
        return "clear_masked", fields
    return "encrypt", {**encrypt_iban(raw, secret), "iban_country": raw[:2], "iban": None}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Aplicar la migración")
    parser.add_argument("--confirm", default="", help=f"Debe valer {CONFIRMATION} junto a --apply")
    args = parser.parse_args()

    load_dotenv(BACKEND_DIR / ".env")
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise SystemExit("Falta JWT_SECRET; no se puede cifrar")
    client = MongoClient(os.environ["MONGO_URL"])
    payments = client[os.environ["DB_NAME"]]["payments"]
    now = datetime.now(timezone.utc).isoformat()

    changes = []
    counts = {"encrypt": 0, "clear_plaintext": 0, "clear_masked": 0}
    for payment in payments.find({"iban": {"$type": "string", "$ne": ""}}):
        action, fields = plan_payment(payment, secret)
        if action == "skip":
            continue
        counts[action] += 1
        changes.append((payment["_id"], fields))
        last4 = fields.get("iban_last4") or payment.get("iban_last4") or "—"
        note = " reintroducir_iban=true" if action == "clear_masked" else ""
        print(f"payment={payment.get('id')} action={action} last4={last4}{note}")

    print(" ".join(f"{key}={value}" for key, value in counts.items()))
    if not args.apply:
        print("dry_run=true")
        client.close()
        return
    if args.confirm != CONFIRMATION:
        client.close()
        raise SystemExit(f"Para aplicar, añade --confirm {CONFIRMATION}")

    for mongo_id, fields in changes:
        payments.update_one({"_id": mongo_id}, {"$set": {**fields, "updated_at": now}})
    print("applied=true")
    client.close()


if __name__ == "__main__":
    main()
