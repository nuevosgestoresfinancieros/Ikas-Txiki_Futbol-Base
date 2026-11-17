import { formatMatchDate, localIsoDate, matchOutcome, matchSeason, splitMatches } from "./matchView";

test("localIsoDate usa la fecha local", () => {
  expect(localIsoDate(new Date(2026, 10, 7))).toBe("2026-11-07");
});

test("matchSeason usa la del partido o, si falta, la del equipo", () => {
  expect(matchSeason({ temporada: "2025-2026", equipo_temporada: "2026-2027" })).toBe("2025-2026");
  expect(matchSeason({ equipo_temporada: "2026-2027" })).toBe("2026-2027");
  expect(matchSeason({})).toBe("");
});

test("separa próximos y anteriores y los ordena", () => {
  const today = "2026-11-17";
  const { upcoming, past } = splitMatches([
    { id: "late", fecha: "2026-11-30", hora: "10:00", estado: "programado" },
    { id: "soon-pm", fecha: "2026-11-17", hora: "18:00", estado: "programado" },
    { id: "soon-am", fecha: "2026-11-17", hora: "09:00", estado: "programado" },
    { id: "nodate", estado: "programado" },
    { id: "old", fecha: "2026-10-01", estado: "jugado" },
    { id: "recent", fecha: "2026-11-15", estado: "jugado" },
    { id: "pending-result", fecha: "2026-11-10", estado: "programado" },
    { id: "played-today", fecha: "2026-11-17", estado: "jugado" },
  ], today);
  expect(upcoming.map((m) => m.id)).toEqual(["soon-am", "soon-pm", "late", "nodate"]);
  expect(past.map((m) => m.id)).toEqual(["played-today", "recent", "pending-result", "old"]);
});

test("calcula victoria, empate y derrota solo en partidos jugados con marcador", () => {
  expect(matchOutcome({ estado: "jugado", resultado_propio: 3, resultado_rival: 1 })).toBe("win");
  expect(matchOutcome({ estado: "jugado", resultado_propio: "2", resultado_rival: "2" })).toBe("draw");
  expect(matchOutcome({ estado: "jugado", resultado_propio: 0, resultado_rival: 1 })).toBe("loss");
  expect(matchOutcome({ estado: "jugado", resultado_propio: 0, resultado_rival: null })).toBeNull();
  expect(matchOutcome({ estado: "programado", resultado_propio: 1, resultado_rival: 0 })).toBeNull();
});

test("formatea la fecha con día de la semana y año solo si cambia", () => {
  const same = formatMatchDate("2026-11-22", "es", "2026-11-17");
  expect(same.day).toContain("22");
  expect(same.day).not.toContain("26");
  expect(same.weekday).not.toBe("");
  expect(formatMatchDate("2025-11-22", "es", "2026-11-17").day).toMatch(/25/);
  expect(formatMatchDate("", "es")).toEqual({ day: "--", weekday: "" });
});
