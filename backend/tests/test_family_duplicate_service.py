from family_duplicate_service import candidates, merged_data, reasons


def family(identifier, **values):
    return {"id": identifier, "progenitor1_nombre": "Abdellah Khallouf", "progenitor2_nombre": "Nadia Akallach", **values}


def test_same_parents_with_split_emails_is_high_confidence_and_keeps_all_links():
    left = family("left", progenitor1_email="abdellah@example.test")
    right = family("right", progenitor2_email="nadia@example.test")
    rows = candidates([left, right], [{"id": "p1", "nombre": "Safaa", "familia_id": "left"}, {"id": "p2", "nombre": "Anouar", "familia_id": "right"}], [{"username": "fam", "account_status": "active", "family_id": "right"}])
    assert rows[0]["confidence"] == "high" and rows[0]["merge_allowed"]
    assert {p["id"] for side in (rows[0]["left"], rows[0]["right"]) for p in side["jugadores"]} == {"p1", "p2"}
    assert rows[0]["right"]["cuentas"] == [{"usuario": "fam", "estado": "active"}]


def test_partial_matches_and_archived_families_are_not_candidates():
    left = family("left", progenitor2_nombre="Otro", domicilio="Calle Uno")
    partial = {"id": "right", "progenitor1_nombre": "Distinta", "domicilio": "calle uno"}
    archived = family("old", merged_into="left")
    rows = candidates([left, partial, archived], [], [])
    assert rows == []


def test_frequent_first_name_only_matches_are_never_shown_for_review():
    families = [
        {"id": "asier-1", "progenitor1_nombre": "Asier", "progenitor2_nombre": "Leire Arana"},
        {"id": "asier-2", "progenitor1_nombre": "Asier", "progenitor2_nombre": "Nora Garmendia"},
        {"id": "gorka-1", "progenitor1_nombre": "Gorka", "progenitor2_nombre": "Ane Ibarra"},
        {"id": "gorka-2", "progenitor1_nombre": "Gorka", "progenitor2_nombre": "Maialen Ruiz"},
        {"id": "mikel-1", "progenitor1_nombre": "Mikel", "progenitor2_nombre": "Irati Garcia"},
        {"id": "mikel-2", "progenitor1_nombre": "Mikel", "progenitor2_nombre": "June Lopez"},
        {"id": "first-names-1", "progenitor1_nombre": "Asier", "progenitor2_nombre": "Gorka"},
        {"id": "first-names-2", "progenitor1_nombre": "Gorka", "progenitor2_nombre": "Asier"},
    ]
    assert candidates(families, [], []) == []


def test_swapped_parents_and_single_surname_matches_are_never_shown():
    left = family("left", domicilio="Calle Uno")
    swapped = {"id": "swapped", "progenitor1_nombre": "Nadia Akallach", "progenitor2_nombre": "Abdellah Khallouf", "domicilio": "Calle Uno"}
    one_surname = {"id": "surname", "progenitor1_nombre": "Otra Persona", "progenitor2_nombre": "Nadia Akallach", "domicilio": "Calle Uno"}
    assert reasons(left, swapped) is None
    assert reasons(left, one_surname) is None


def test_contact_plus_complete_parent_or_address_plus_both_surnames_is_high_confidence():
    contact_left = family("contact-left", progenitor1_email="abdellah@example.test")
    contact_right = family("contact-right", progenitor1_telefono="600 123 456", progenitor1_email="abdellah@example.test")
    address_left = family("address-left", domicilio="Calle Uno, 1")
    address_right = family("address-right", domicilio="calle uno 1")

    assert reasons(contact_left, contact_right)[0] == "high"
    assert reasons(address_left, address_right)[0] == "high"


def test_consolidation_prefers_existing_values_without_secret_fields():
    result = merged_data(family("a", progenitor1_email="a@example.test"), family("b", progenitor2_email="b@example.test", observaciones="nota"))
    assert result["progenitor1_email"] == "a@example.test" and result["progenitor2_email"] == "b@example.test"
    assert "password" not in str(result).lower() and "token" not in str(result).lower()

class Cursor:
    def __init__(self, rows): self.rows = rows
    def sort(self, *_): return self
    async def to_list(self, _): return [dict(row) for row in self.rows]

class Collection:
    def __init__(self, rows=()): self.rows = [dict(row) for row in rows]
    def _matches(self, row, query):
        for key, value in query.items():
            if isinstance(value, dict) and "$exists" in value:
                if (key in row) != bool(value["$exists"]): return False
            elif row.get(key) != value: return False
        return True
    async def find_one(self, query, *_):
        return next((dict(row) for row in self.rows if self._matches(row, query)), None)
    def find(self, query, *_): return Cursor([row for row in self.rows if self._matches(row, query)])
    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.rows if self._matches(row, query)), None)
        if row is None and upsert: row = {k: v for k, v in query.items() if not isinstance(v, dict)}; self.rows.append(row)
        if row is not None:
            for key, value in update.get("$setOnInsert", {}).items(): row.setdefault(key, value)
            row.update(update.get("$set", {}))
            for key in update.get("$unset", {}): row.pop(key, None)
    async def update_many(self, query, update):
        for row in self.rows:
            if self._matches(row, query): row.update(update.get("$set", {}))
    async def insert_one(self, row): self.rows.append(dict(row))


def test_merge_retry_archive_and_revert_preserve_family_credentials_and_links():
    import asyncio
    from types import SimpleNamespace
    from family_duplicate_service import merge, revert
    primary = family("main", progenitor1_email="abdellah@example.test")
    duplicate = family("dup", progenitor2_email="nadia@example.test", observaciones="segunda ficha")
    account = {"id": "u1", "role": "family", "family_id": "dup", "username": "familia", "password_hash": "unchanged", "account_status": "active", "session_version": 7}
    db = SimpleNamespace(families=Collection([primary, duplicate]), players=Collection([{"id": "p1", "familia_id": "dup"}, {"id": "p2", "familia_id": "dup"}]), users=Collection([account]), family_merge_history=Collection(), internal_events=Collection())
    actor = {"id": "admin", "role": "admin"}
    first = asyncio.run(merge(db, "main", "dup", actor, "coinciden progenitores"))
    assert first["status"] == "merged"
    assert {row["familia_id"] for row in db.players.rows} == {"main"}
    saved = db.users.rows[0]
    assert saved["family_id"] == "main" and saved["username"] == "familia" and saved["password_hash"] == "unchanged" and saved["session_version"] == 7
    archived = next(row for row in db.families.rows if row["id"] == "dup")
    assert archived["merged_into"] == "main" and archived["merged_by_user_id"] == "admin" and archived["merged_reason"] == "coinciden progenitores"
    again = asyncio.run(merge(db, "main", "dup", actor, "coinciden progenitores"))
    assert again["status"] == "already_merged" and len(db.internal_events.rows) == 1 and len(db.family_merge_history.rows) == 1
    restored = asyncio.run(revert(db, first["merge_id"], actor))
    assert restored["status"] == "reverted" and {row["familia_id"] for row in db.players.rows} == {"dup"}
    assert db.users.rows[0]["family_id"] == "dup" and "merged_into" not in archived
