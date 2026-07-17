import { attendancePercentage, filterPortalByPlayer, nextPortalActivity, pendingPortalResponses } from "./portalView";

const portal = {
  players: [{ id: "one", equipo_id: "a" }, { id: "two", equipo_id: "b" }],
  schedule: [{ id: "a", equipo_id: "a", fecha: "2026-07-20" }, { id: "b", equipo_id: "b", fecha: "2026-07-21" }],
  callups: [{ id: "c", responses: [{ player_id: "one", estado: "pending" }, { player_id: "other", estado: "confirmed" }] }],
  attendance: { recent: [{ player_id: "one" }, { player_id: "two" }] },
  payments: [{ player_id: "one" }, { player_id: "two" }],
  authorizations: [{ player_id: "one" }], documents: [{ player_id: "one", status: "completo" }],
};

test("filters every child-specific section without leaking siblings", () => {
  const result = filterPortalByPlayer(portal, "one");
  expect(result.schedule.map((item) => item.id)).toEqual(["a"]);
  expect(result.attendance).toHaveLength(1);
  expect(result.payments).toHaveLength(1);
  expect(result.documents.status).toBe("completo");
});

test("selects the nearest future activity", () => {
  expect(nextPortalActivity([
    { id: "later", fecha: "2026-07-21", hora: "10:00" },
    { id: "next", fecha: "2026-07-20", hora: "18:00" },
  ], new Date("2026-07-19T12:00:00")).id).toBe("next");
  expect(nextPortalActivity([], new Date())).toBeNull();
});

test("identifies only the selected player's pending callups", () => {
  expect(pendingPortalResponses(portal.callups, "one").map((item) => item.id)).toEqual(["c"]);
  expect(pendingPortalResponses(portal.callups, "two")).toEqual([]);
});

test("calculates attendance for the selected player", () => {
  expect(attendancePercentage([{ status: "presente" }, { status: "justificada" }])).toBe(50);
  expect(attendancePercentage([])).toBe(0);
});
