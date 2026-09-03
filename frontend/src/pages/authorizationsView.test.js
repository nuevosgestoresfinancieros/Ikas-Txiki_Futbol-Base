import { familyParentOptions, selectedFamilyParentSlot } from "./authorizationsView";

test("returns both progenitors for every linked family and does not include credentials", () => {
  const families = [{
    id: "family-1",
    progenitor1_nombre: "Ana Uno",
    progenitor1_email: "ana@example.test",
    progenitor2_nombre: "",
    progenitor2_email: "bruno@example.test",
  }];
  const players = [{ id: "player-1", familia_id: "family-1" }];

  expect(familyParentOptions(families, players, "player-1")).toEqual([
    { slot: 1, name: "Ana Uno" },
    { slot: 2, name: "Progenitor/a 2" },
  ]);
  expect(JSON.stringify(familyParentOptions(families, players, "player-1"))).not.toMatch(/@|password|token/i);
});

test("does not offer a parent from another family and falls back to the first valid slot", () => {
  const families = [{ id: "family-1", progenitor1_nombre: "Ana Uno" }];
  const players = [{ id: "player-1", familia_id: "family-1" }, { id: "player-2", familia_id: "family-2" }];
  const options = familyParentOptions(families, players, "player-1");
  expect(options).toEqual([{ slot: 1, name: "Ana Uno" }]);
  expect(familyParentOptions(families, players, "player-2")).toEqual([]);
  expect(selectedFamilyParentSlot(options, 2)).toBe(1);
  expect(selectedFamilyParentSlot(options, 1)).toBe(1);
});
