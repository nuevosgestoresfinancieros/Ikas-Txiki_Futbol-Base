import { selectableTeams, sortTeamsBySeason, teamLabel } from "./teamOptions";

const teams = [
  { id: "old", nombre: "Kañometa", temporada: "2025-2026" },
  { id: "new", nombre: "Kañometa", temporada: "2026-2027" },
  { id: "alevin", nombre: "Alevín A", temporada: "2026-2027" },
  { id: "loose", nombre: "Sin asignar" },
];

test("labels repeated team names with their season", () => {
  expect(teamLabel(teams[0])).toBe("Kañometa · 2025-2026");
  expect(teamLabel(teams[1])).toBe("Kañometa · 2026-2027");
  expect(teamLabel(teams[3], "denboraldirik gabe")).toBe("Sin asignar · denboraldirik gabe");
});

test("orders the current season first, then newest seasons and names", () => {
  expect(sortTeamsBySeason(teams, "2025-2026").map((team) => team.id)).toEqual(["old", "alevin", "new", "loose"]);
  expect(sortTeamsBySeason(teams).map((team) => team.id)).toEqual(["alevin", "new", "old", "loose"]);
});

test("limits the selector to the season but keeps the assigned team", () => {
  expect(selectableTeams(teams, { season: "2026-2027" }).map((team) => team.id)).toEqual(["alevin", "new"]);
  expect(selectableTeams(teams, { season: "2026-2027", selectedId: "old" }).map((team) => team.id))
    .toEqual(["alevin", "new", "old"]);
  expect(selectableTeams(teams, { season: "2026-2027", showAll: true })).toHaveLength(4);
  expect(selectableTeams(teams, {})).toHaveLength(4);
});
