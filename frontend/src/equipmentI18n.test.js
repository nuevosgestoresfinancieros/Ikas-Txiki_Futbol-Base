import { translations } from "./i18n";

const equipmentKeys = [
  "equipment", "equipmentExport", "equipmentTotalPlayers", "equipmentDelivered",
  "equipmentPending", "equipmentMissingSize", "equipmentAllTeams",
  "equipmentAllDeliveries", "equipmentPlayer", "equipmentTeam", "equipmentBib",
  "equipmentShirt", "equipmentShorts", "equipmentTracksuit", "equipmentSocks",
  "equipmentShoes", "equipmentDeliveryDate", "equipmentNotes", "equipmentActions",
  "equipmentNoResults", "equipmentUpdated", "equipmentSaveError", "equipmentEditHint",
];

test.each(equipmentKeys)("equipment label %s exists in Spanish and Basque", (key) => {
  expect(translations.es[key]).toBeTruthy();
  expect(translations.eu[key]).toBeTruthy();
  expect(translations.eu[key]).not.toBe(translations.es[key]);
});
