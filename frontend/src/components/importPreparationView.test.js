import { activeModalitiesFromApi, activeTeamsFromApi, applyPreparationFilterChange, canApplyPreparationBulk, canFinalizeDraft, clearPreparationSelection, existingCategoriesFromApi, filterPreparationRecords, historicalReviewCounts, isHistoricalDraft, modalityOptionLabel, officialModalityCode, preparationProgressLabel, selectedOctoberIds, selectVisiblePreparationRecords, teamsForCategory } from "./importPreparationView";

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
  { age: "11" }, { previousTeam: "F7 B" }, { status: "incidents" },
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
