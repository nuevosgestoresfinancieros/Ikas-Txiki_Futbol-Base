import { canFinalizeDraft, filterPreparationRecords, preparationProgressLabel, selectedOctoberIds } from "./importPreparationView";

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
