#!/usr/bin/env python3
"""Índices idempotentes para la biblioteca de ejercicios.

Sin ``--apply`` solo informa. No transforma ni elimina documentos.
"""
from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient


INDEXES = {
    "exercises": [
        ([("id", ASCENDING)], {"name": "exercise_id_unique", "unique": True}),
        ([("status", ASCENDING), ("name", ASCENDING)], {"name": "exercise_status_name"}),
        ([("category", ASCENDING), ("status", ASCENDING)], {"name": "exercise_category_status"}),
        ([("team_ids", ASCENDING), ("status", ASCENDING)], {"name": "exercise_team_status"}),
        ([("author_id", ASCENDING), ("updated_at", DESCENDING)], {"name": "exercise_author_updated"}),
    ],
    "training_templates": [
        ([("id", ASCENDING)], {"name": "training_template_id_unique", "unique": True}),
        ([("status", ASCENDING), ("name", ASCENDING)], {"name": "training_template_status_name"}),
        ([("team_ids", ASCENDING), ("status", ASCENDING)], {"name": "training_template_team_status"}),
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    load_dotenv()
    if not arguments.apply:
        print(f"Modo informativo: {sum(map(len, INDEXES.values()))} índices en {len(INDEXES)} colecciones")
        return
    client = MongoClient(os.environ["MONGO_URL"])
    database = client[os.environ["DB_NAME"]]
    for collection, indexes in INDEXES.items():
        for keys, options in indexes:
            database[collection].create_index(keys, **options)
    client.close()
    print("Índices creados o confirmados de forma idempotente")


if __name__ == "__main__":
    main()
