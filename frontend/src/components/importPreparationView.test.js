import { activeModalitiesFromApi, activeTeamsFromApi, applyPreparationAssignmentChange, applyPreparationFilterChange, canApplyPreparationBulk, canFinalizeDraft, clearPreparationSelection, existingCategoriesFromApi, filterPreparationRecords, historicalReviewCounts, isHistoricalDraft, MODALITY_CONTROL_COPY, modalityAssignmentDisabledReason, modalityOptionLabel, officialModalityCode, preparationProgressLabel, selectedOctoberIds, selectVisiblePreparationRecords, teamMatchesCategory, teamsForCategory } from "./importPreparationView";

const records = [
  { id: "one", nombre: "Ane", apellidos: "Ficticia", categoria: "Alevín", equipo: "F7 A", selected_october: true },
  { id: "two", nombre: "Unai", apellidos: "Ficticio", categoria: "Infantil", equipo: "", fecha_nacimiento: "2015-01-01", selected_october: false, has_pending_incidents: true },
];

test("filters the preparation list without changing it", () => {
  expect(filterPreparationRecords(records, { query: "ane" })).toHaveLength(1);
  expect(filterPreparationRecords(records, { team: "__missing__" })[0].id).toBe("two");
  expect(filterPreparationRecords(records, { age: "11" })[0].id).toBe("two");
  expect(filterPreparationRecords(records, { status: "incidents" })[0].id).toBe("two");
  expect(records).toHaveLength(2);
});

test("filters canonical, legacy and missing modalities together with other filters", () => {
  const modalities = [
    { code: "F7", active: true, aliases: ["7"] },
    { code: "F11", active: true, aliases: ["11"] },
  ];
  const modalityRecords = [
    { id: "f7", nombre: "A", categoria: "Alevín", modalidad: "F7" },
    { id: "legacy-f7", nombre: "B", categoria: "Alevín", modalidad: 7 },
    { id: "f11", nombre: "C", categoria: "Infantil", modalidad: "F11" },
    { id: "legacy-f11", nombre: "D", categoria: "Infantil", modalidad: "11" },
    { id: "missing", nombre: "E", categoria: "Alevín", modalidad: "" },
    { id: "unknown", nombre: "F", categoria: "Alevín", modalidad: "F8" },
  ];
  expect(filterPreparationRecords(modalityRecords, {}, modalities)).toHaveLength(6);
  expect(filterPreparationRecords(modalityRecords, { modality: "F7" }, modalities).map((row) => row.id)).toEqual(["f7", "legacy-f7"]);
  expect(filterPreparationRecords(modalityRecords, { modality: "F11" }, modalities).map((row) => row.id)).toEqual(["f11", "legacy-f11"]);
  expect(filterPreparationRecords(modalityRecords, { modality: "__missing__" }, modalities).map((row) => row.id)).toEqual(["missing", "unknown"]);
  expect(filterPreparationRecords(modalityRecords, { modality: "F7", category: "Infantil" }, modalities)).toEqual([]);
});

test("final import needs a ready draft and express confirmation", () => {
  expect(canFinalizeDraft({ summary: { can_import: true } }, false)).toBe(false);
  expect(canFinalizeDraft({ summary: { can_import: true } }, true)).toBe(true);
  expect(canFinalizeDraft({ summary: { can_import: false } }, true)).toBe(false);
});

test("october selection and progress are deterministic", () => {
  expect(selectedOctoberIds(records)).toEqual(["one"]);
  expect(preparationProgressLabel({ preparation_percent: 67 })).toBe("67%");
});

test("clears the current preparation selection explicitly", () => {
  expect(clearPreparationSelection(["one", "two"])).toEqual([]);
});

test("selects every visible record without duplicates", () => {
  expect(selectVisiblePreparationRecords([records[0], records[0], records[1]])).toEqual(["one", "two"]);
});

test("bulk modality requires selected records and an active catalog option", () => {
  const modalities = [{ code: "F7", active: true, aliases: ["7"] }, { code: "F11", active: false, aliases: ["11"] }];
  expect(canApplyPreparationBulk([], { field: "modalidad", value: "F7" }, modalities)).toBe(false);
  expect(canApplyPreparationBulk(["one"], { field: "modalidad", value: "F11" }, modalities)).toBe(false);
  expect(canApplyPreparationBulk(["one"], { field: "modalidad", value: "F7" }, modalities)).toBe(true);
  expect(canApplyPreparationBulk(["one"], { field: "modalidad", value: 7 }, modalities)).toBe(true);
});

test("explains why a modality assignment cannot be applied", () => {
  const modalities = [{ code: "F7", active: true, aliases: ["7"] }, { code: "F11", active: true, aliases: ["11"] }];
  expect(modalityAssignmentDisabledReason([], "F7", modalities)).toBe("selection");
  expect(modalityAssignmentDisabledReason(["one"], "", modalities)).toBe("modality");
  expect(modalityAssignmentDisabledReason(["one"], "F8", modalities)).toBe("modality");
  expect(modalityAssignmentDisabledReason(["one"], "7", modalities)).toBe("");
  expect(modalityAssignmentDisabledReason(["one"], "F11", modalities)).toBe("");
});

test("changing the assignment modality preserves the selected records", () => {
  expect(applyPreparationAssignmentChange(
    { field: "modalidad", value: "" }, { value: "F11" }, ["one", "two"],
  )).toEqual({ bulk: { field: "modalidad", value: "F11" }, selected: ["one", "two"] });
});

test("provides distinct accessible modality filter and assignment copy in ES and EU", () => {
  expect(MODALITY_CONTROL_COPY.es).toMatchObject({
    modalityFilter: "Filtrar por modalidad", assignModality: "Asignar modalidad",
    selectRecordsReason: "Selecciona al menos un registro.", selectModalityReason: "Selecciona F7 o F11 para asignar.",
  });
  expect(MODALITY_CONTROL_COPY.eu).toMatchObject({
    modalityFilter: "Modalitatearen arabera iragazi", assignModality: "Modalitatea esleitu",
    selectRecordsReason: "Hautatu gutxienez erregistro bat.", selectModalityReason: "Hautatu F7 edo F11 esleitzeko.",
  });
});

test("resolves browser values to active official modality codes", () => {
  const modalities = [
    { code: "F7", name_es: "Fútbol 7", active: true, aliases: ["7", "F-7"] },
    { code: "F11", name_es: "Fútbol 11", active: true, aliases: ["11"] },
    { code: "F8", active: false, aliases: ["8"] },
  ];
  expect(officialModalityCode("F7", modalities)).toBe("F7");
  expect(officialModalityCode(7, modalities)).toBe("F7");
  expect(officialModalityCode("fútbol 11", modalities)).toBe("F11");
  expect(officialModalityCode("8", modalities)).toBe("");
  expect(officialModalityCode("manipulated", modalities)).toBe("");
});

test("renders modality names from the API in Spanish and Basque", () => {
  const modality = { code: "F7", name_es: "Fútbol 7", name_eu: "7ko futbola" };
  expect(modalityOptionLabel(modality, "es")).toBe("Fútbol 7 (F7)");
  expect(modalityOptionLabel(modality, "eu")).toBe("7ko futbola (F7)");
});

test("loads only active modality options from the API payload", () => {
  const payload = [{ code: "F7", active: true }, { code: "F11", active: false }];
  expect(activeModalitiesFromApi(payload)).toEqual([{ code: "F7", active: true }]);
});

test("loads existing categories and active teams from API payloads", () => {
  expect(existingCategoriesFromApi([{ name: "Alevín" }, { min_age: 8 }])).toEqual(["Alevín"]);
  const teams = [
    { id: "a", nombre: "A", categoria: "Alevín", estado: "activo" },
    { id: "b", nombre: "B", categoria: "Infantil", estado: "cerrado" },
  ];
  expect(activeTeamsFromApi(teams)).toEqual([teams[0]]);
  expect(teamsForCategory(teams, "Alevín")).toEqual([teams[0]]);
  expect(teamsForCategory(teams, "Infantil")).toEqual([]);
});

test("loads the real legacy team schema and matches official category labels", () => {
  const legacyTeams = [
    { id: "a", nombre: "A", categoria: "ALEVIN", temporada: "2025-2026", estado: "activo" },
    { id: "b", nombre: "B", categoria: "BENJAMIN FEM.", temporada: "2025-2026" },
    { id: "c", nombre: "C", categoria: "INFANTIL", estado: "pendiente" },
  ];
  expect(activeTeamsFromApi(legacyTeams)).toEqual([legacyTeams[0], legacyTeams[1]]);
  expect(teamsForCategory(legacyTeams, "Alevín")).toEqual([legacyTeams[0]]);
  expect(teamsForCategory(legacyTeams, "Benjamín")).toEqual([legacyTeams[1]]);
  expect(teamMatchesCategory(legacyTeams[0], "Alevín")).toBe(true);
  expect(teamMatchesCategory(legacyTeams[0], "Infantil")).toBe(false);
});

test("category and team assignment require valid compatible API values", () => {
  const categories = ["Alevín", "Infantil"];
  const teams = [{ id: "team-a", nombre: "A", categoria: "Alevín", estado: "activo" }];
  const selectedRecords = [{ id: "one", categoria: "Alevín" }, { id: "two", categoria: "Infantil" }];
  expect(canApplyPreparationBulk(["one"], { field: "categoria", value: "Alevín" }, [], categories)).toBe(true);
  expect(canApplyPreparationBulk(["one"], { field: "categoria", value: "Inventada" }, [], categories)).toBe(false);
  expect(canApplyPreparationBulk(["one"], { field: "equipo", value: "team-a" }, [], categories, teams, selectedRecords)).toBe(true);
  expect(canApplyPreparationBulk(["two"], { field: "equipo", value: "team-a" }, [], categories, teams, selectedRecords)).toBe(false);
  expect(canApplyPreparationBulk(["one"], { field: "equipo", value: "manipulated" }, [], categories, teams, selectedRecords)).toBe(false);
  expect(canApplyPreparationBulk(["one"], { field: "equipo", value: "legacy free text" }, [], [], [], selectedRecords, false)).toBe(true);
});

test.each([
  { query: "ane" }, { category: "Alevín" }, { team: "F7 A" },
  { age: "11" }, { previousTeam: "F7 B" }, { status: "incidents" }, { modality: "F7" },
])("clears the selection when a preparation filter changes: %o", (patch) => {
  expect(applyPreparationFilterChange({ query: "", category: "" }, patch)).toEqual({
    filters: { query: "", category: "", ...patch },
    selected: [],
  });
});

test("historical drafts remain simulation-only and expose aggregate review counts", () => {
  const draft = {
    source_format: "historical_bbdd_v1", summary: { can_import: false },
    fuzzy_matches: [{ id: "f1", decision: null }, { id: "f2", decision: "different_people" }],
    family_candidates: [{ id: "g1", decision: null }], simulation: { official_writes: 0 },
  };
  expect(isHistoricalDraft(draft)).toBe(true);
  expect(historicalReviewCounts(draft)).toEqual({ fuzzy: 1, families: 1, officialWrites: 0 });
  expect(canFinalizeDraft(draft, true)).toBe(false);
});
