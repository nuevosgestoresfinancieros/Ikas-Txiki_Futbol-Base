import { legacyDaysText, parseTrainingDays, scheduleText, teamFormFromRecord, teamPayload } from "./teamScheduleView";

const t = (key) => ({ monday: "Lunes", wednesday: "Miércoles" }[key] || key);

test("reads existing textual schedules without changing legacy teams", () => {
  expect(parseTrainingDays("L-X")).toEqual(["monday", "wednesday"]);
  expect(teamFormFromRecord({ dias_entrenamiento: "martes, jueves", horario: "19:00" })).toMatchObject({ dias_entrenamiento_lista: ["tuesday", "thursday"], horario: "19:00" });
});

test("keeps the structured days and a compatible schedule on save", () => {
  const payload = teamPayload({ dias_entrenamiento_lista: ["monday", "wednesday"], hora_inicio: "18:00", hora_fin: "19:30", direccion_campo: " Campo Municipal " }, t);
  expect(payload).toMatchObject({ dias_entrenamiento_lista: ["monday", "wednesday"], dias_entrenamiento: "Lunes, Miércoles", horario: "18:00–19:30", direccion_campo: "Campo Municipal" });
  expect(legacyDaysText(["monday", "wednesday"], t)).toBe("Lunes, Miércoles");
  expect(scheduleText("", "", "M-J 19:00")).toBe("M-J 19:00");
});
