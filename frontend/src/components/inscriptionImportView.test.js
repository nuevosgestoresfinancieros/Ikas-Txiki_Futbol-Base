import { canConfirmImport, unresolvedConflictIds } from "./inscriptionImportView";

const clean = { blocking_errors: 0, duplicate_file: false, rows: [], summary: {} };

test("blocks confirmation until it is explicit and no serious errors remain", () => {
  expect(canConfirmImport(clean, {}, false)).toBe(false);
  expect(canConfirmImport(clean, {}, true)).toBe(true);
  expect(canConfirmImport({ ...clean, blocking_errors: 1 }, {}, true)).toBe(false);
  expect(canConfirmImport({ ...clean, duplicate_file: true }, {}, true)).toBe(false);
});

test("requires a human decision for each conflict", () => {
  const analysis = { ...clean, rows: [{ status: "conflict", conflict_id: "row:2" }] };
  expect(unresolvedConflictIds(analysis, {})).toEqual(["row:2"]);
  expect(canConfirmImport(analysis, { "row:2": "skip" }, true)).toBe(true);
});
