import { filterCallups, responseActions } from "./callupView";

const rows = [
  { id: "one", convocados: [{ nombre: "Ane Prueba", estado: "pending" }] },
  { id: "two", convocados: [{ nombre: "Unai Beste", estado: "confirmed" }] },
];

test("filters convocations by normalized status", () => {
  expect(filterCallups(rows, "pending", "").map((row) => row.id)).toEqual(["one"]);
  expect(filterCallups(rows, "confirmed", "").map((row) => row.id)).toEqual(["two"]);
  expect(filterCallups(rows, "declined", "")).toEqual([]);
});

test("searches players case-insensitively", () => {
  expect(filterCallups(rows, "all", "aNe").map((row) => row.id)).toEqual(["one"]);
});

test("family and coach expose different actions", () => {
  expect(responseActions(["read", "respond"])).toEqual({ canRespond: true, canManage: false, canExport: false });
  expect(responseActions(["read", "edit", "export"])).toEqual({ canRespond: false, canManage: true, canExport: true });
});
