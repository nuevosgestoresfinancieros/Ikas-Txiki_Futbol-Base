export const DUPLICATE_ACTIONS = ["keep_first", "keep_second", "merge", "different_people"];

export const MODALITY_CONTROL_COPY = {
  es: {
    filtersTitle: "Filtros", results: "resultados", modalityFilter: "Filtrar por modalidad", allModalities: "Todas", withoutModality: "Sin modalidad",
    assignModality: "Asignar modalidad", selectRecordsReason: "Selecciona al menos un registro.", selectModalityReason: "Selecciona F7 o F11 para asignar.",
  },
  eu: {
    filtersTitle: "Iragazkiak", results: "emaitza", modalityFilter: "Modalitatearen arabera iragazi", allModalities: "Guztiak", withoutModality: "Modalitaterik gabe",
    assignModality: "Modalitatea esleitu", selectRecordsReason: "Hautatu gutxienez erregistro bat.", selectModalityReason: "Hautatu F7 edo F11 esleitzeko.",
  },
};

export const filterPreparationRecords = (records = [], filters = {}, modalities = []) => records.filter((record) => {
  const query = (filters.query || "").trim().toLocaleLowerCase();
  const haystack = `${record.nombre || ""} ${record.apellidos || ""}`.toLocaleLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (filters.category && record.categoria !== filters.category) return false;
  if (filters.team === "__missing__" && record.equipo) return false;
  if (filters.team && filters.team !== "__missing__" && record.equipo !== filters.team) return false;
  if (filters.status === "incidents" && !record.has_pending_incidents) return false;
  if (filters.status === "ready" && record.has_pending_incidents) return false;
  if (filters.previousTeam && record.equipo_anterior !== filters.previousTeam) return false;
  if (filters.modality) {
    const currentModality = officialModalityCode(record.modalidad, modalities);
    if (filters.modality === "__missing__" && currentModality) return false;
    if (filters.modality !== "__missing__" && currentModality !== filters.modality) return false;
  }
  if (filters.age) {
    if (!record.fecha_nacimiento) return false;
    const year = Number(String(record.fecha_nacimiento).slice(0, 4));
    if (Number(filters.age) !== 2026 - year) return false;
  }
  return true;
});

export const selectedOctoberIds = (records = []) => records.filter((row) => row.selected_october).map((row) => row.id);

export const clearPreparationSelection = () => [];

export const selectVisiblePreparationRecords = (records = []) =>
  [...new Set(records.map((record) => record.id).filter(Boolean))];

export const modalityOptionLabel = (modality, lang = "es") => {
  if (!modality) return "";
  const name = lang === "eu" ? modality.name_eu : modality.name_es;
  return `${name || modality.code} (${modality.code})`;
};

export const activeModalitiesFromApi = (payload = []) =>
  payload.filter((item) => item?.active && item.code);

const modalityKey = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");

export const officialModalityCode = (value, modalities = []) => {
  const requested = modalityKey(value);
  if (!requested) return "";
  const match = modalities.find((item) => item?.active && [
    item.code, item.name_es, item.name_eu, ...(item.aliases || []),
  ].some((candidate) => modalityKey(candidate) === requested));
  return match?.code || "";
};

export const existingCategoriesFromApi = (payload = []) =>
  payload.filter((item) => item?.name).map((item) => item.name);

const categoryKey = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");

const teamIsUsable = (team) => !team?.estado || ["activo", "active"].includes(categoryKey(team.estado));

export const teamMatchesCategory = (team, category = "") => {
  const teamCategory = categoryKey(team?.categoria); const requested = categoryKey(category);
  return Boolean(requested && (teamCategory === requested || teamCategory.startsWith(requested)));
};

export const activeTeamsFromApi = (payload = []) =>
  payload.filter((item) => item?.id && item?.nombre && teamIsUsable(item));

export const teamsForCategory = (teams = [], category = "") =>
  teams.filter((item) => teamIsUsable(item) && teamMatchesCategory(item, category));

export const canApplyPreparationBulk = (
  selected = [], bulk = {}, modalities = [], categories = [], teams = [], records = [], catalogAssignments = true,
) => {
  if (!selected.length || !bulk.value) return false;
  if (bulk.field === "modalidad") return Boolean(officialModalityCode(bulk.value, modalities));
  if (!catalogAssignments && ["categoria", "equipo"].includes(bulk.field)) return true;
  if (bulk.field === "categoria") return categories.includes(bulk.value);
  if (bulk.field === "equipo") {
    const team = teams.find((item) => item.id === bulk.value && teamIsUsable(item));
    const selectedRecords = records.filter((item) => selected.includes(item.id));
    return Boolean(team && selectedRecords.length === selected.length
      && selectedRecords.every((item) => teamMatchesCategory(team, item.categoria)));
  }
  return true;
};

export const modalityAssignmentDisabledReason = (selected = [], value = "", modalities = []) => {
  if (!selected.length) return "selection";
  if (!officialModalityCode(value, modalities)) return "modality";
  return "";
};

export const applyPreparationFilterChange = (filters = {}, patch = {}) => ({
  filters: { ...filters, ...patch },
  selected: clearPreparationSelection(),
});

export const applyPreparationAssignmentChange = (bulk = {}, patch = {}, selected = []) => ({
  bulk: { ...bulk, ...patch },
  selected,
});

export const canFinalizeDraft = (draft, expresslyConfirmed) =>
  Boolean(draft?.summary?.can_import && expresslyConfirmed);

export const preparationProgressLabel = (summary = {}) => `${summary.preparation_percent || 0}%`;

export const isHistoricalDraft = (draft) => draft?.source_format === "historical_bbdd_v1";

// Older drafts can use "pending" instead of the newer explicit review values.
// Keep every unknown value visible and blocked until an administrator decides it.
export const isUnresolvedFuzzyMatch = (item = {}) =>
  !["same_person", "different_people"].includes(item.decision);

export const historicalReviewCounts = (draft = {}) => ({
  fuzzy: (draft.fuzzy_matches || []).filter(isUnresolvedFuzzyMatch).length,
  families: (draft.family_candidates || []).filter((item) => !item.decision).length,
  officialWrites: draft.simulation?.official_writes || 0,
});
