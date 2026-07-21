import pytest
from pydantic import ValidationError

from modality_service import (
    DEFAULT_MODALITIES, ModalityCreateRequest, ModalityDefinition, active_modalities,
    catalog_from_settings, modality_capacity, normalize_modality, validate_catalog,
    validate_compatibility_catalog,
)


def test_default_catalog_contains_only_compatible_active_modalities():
    catalog = catalog_from_settings({})

    assert [item.code for item in catalog] == ["F7", "F11"]
    assert all(item.active for item in catalog)
    assert [(item.name_es, item.name_eu) for item in catalog] == [
        ("Fútbol 7", "7ko futbola"), ("Fútbol 11", "11ko futbola"),
    ]
    assert all(item.updated_by == "system:compatibility" for item in catalog)


@pytest.mark.parametrize("original", ["F7", "f-7", "F 7", "Fútbol 7", "futbol 7"])
def test_normalizes_only_safe_f7_aliases_and_preserves_original(original):
    result = normalize_modality(original)

    assert result.status == "recognized"
    assert result.code == "F7"
    assert result.original_value == original


@pytest.mark.parametrize("original", ["F11", "f-11", "F 11", "Fútbol 11", "futbol 11"])
def test_normalizes_only_safe_f11_aliases_and_preserves_original(original):
    result = normalize_modality(original)

    assert result.status == "recognized"
    assert result.code == "F11"
    assert result.original_value == original


@pytest.mark.parametrize("original", [None, "", "   ", "modalidad dudosa", "ESKOLA", "FEDERADO"])
def test_empty_and_unknown_values_remain_pending_review(original):
    result = normalize_modality(original)

    assert result.status == "pending_review"
    assert result.code is None
    assert result.original_value == original


def test_alias_cannot_belong_to_two_modalities():
    conflicting = [
        DEFAULT_MODALITIES[0],
        DEFAULT_MODALITIES[1].model_copy(update={"aliases": [*DEFAULT_MODALITIES[1].aliases, "Fútbol 7"]}),
    ]

    with pytest.raises(ValueError, match="Alias de modalidad compartido"):
        validate_catalog(conflicting)


def test_duplicate_codes_are_rejected():
    with pytest.raises(ValueError, match="Código de modalidad duplicado"):
        validate_catalog([DEFAULT_MODALITIES[0], DEFAULT_MODALITIES[0].model_copy(deep=True)])


def test_phase_rejects_modalities_other_than_f7_and_f11():
    unsupported = DEFAULT_MODALITIES[0].model_copy(update={"code": "F8"})

    with pytest.raises(ValueError, match="no autorizadas"):
        validate_compatibility_catalog([unsupported])
    with pytest.raises(ValidationError, match="solo están autorizadas F7 y F11"):
        ModalityCreateRequest(
            code="F8", name_es="Fútbol 8", name_eu="8ko futbola",
            aliases=["F8"], sort_order=30, max_players=20,
        )


def test_empty_catalog_is_rejected():
    with pytest.raises(ValueError, match="no puede estar vacío"):
        validate_catalog([])
    with pytest.raises(ValueError, match="no puede estar vacío"):
        normalize_modality("F7", [])
    with pytest.raises(ValueError, match="no puede estar vacío"):
        modality_capacity("F7", [])


def test_catalog_is_loaded_from_settings_without_mutating_input():
    settings = {"modalities": [item.model_dump() for item in DEFAULT_MODALITIES]}
    settings["modalities"][0]["active"] = False

    catalog = catalog_from_settings(settings)

    assert catalog[0].code == "F7" and catalog[0].active is False
    assert [item.code for item in active_modalities(catalog)] == ["F11"]
    assert settings["modalities"][0]["active"] is False


def test_capacity_comes_from_catalog_and_unknown_has_no_fallback():
    assert modality_capacity("F7") == 18
    assert modality_capacity("F11") == 25
    assert modality_capacity("UNKNOWN") is None
    assert modality_capacity("") is None


@pytest.mark.parametrize("field,value", [
    ("code", "?"), ("max_players", 0), ("sort_order", -1), ("aliases", ["   "]),
    ("updated_at", "fecha-inválida"),
])
def test_invalid_definition_fields_are_rejected(field, value):
    payload = DEFAULT_MODALITIES[0].model_dump()
    payload[field] = value

    with pytest.raises(ValidationError):
        ModalityDefinition.model_validate(payload)
