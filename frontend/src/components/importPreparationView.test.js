import { applyPreparationFilterChange, canFinalizeDraft, clearPreparationSelection, filterPreparationRecords, historicalReviewCounts, isHistoricalDraft, preparationProgressLabel, selectedOctoberIds } from "./importPreparationView";

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
