import fs from "fs";
import path from "path";
import { evaluationPayload } from "./TrainingEvaluations";
import { translations } from "../i18n";

test("evaluation payload keeps the training/player link and converts the unset sentinel to null", () => {
  const payload = evaluationPayload({
    player_id: "player-1",
    asistencia: "presente",
    participacion: "5",
    actitud: "unset",
    esfuerzo: 4,
    comprension_tactica: "3",
    tecnica: "unset",
    condicion_fisica: "2",
    observaciones: "Nota interna",
    incidencias: "",
  }, "training-1");
  expect(payload).toMatchObject({
    training_id: "training-1", player_id: "player-1", asistencia: "presente",
    participacion: 5, actitud: null, esfuerzo: 4, comprension_tactica: 3,
    tecnica: null, condicion_fisica: 2, observaciones: "Nota interna",
  });
});

test("the evaluation UI has no empty Radix SelectItem values and translations exist in ES/EU", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "TrainingEvaluations.jsx"), "utf8");
  expect(source).toContain('<SelectItem key={option.value} value={option.value}>');
  expect(source).not.toMatch(/<SelectItem[^>]+value=["']{2}/);
  ["trainingEvaluations", "evaluationPending", "evaluationIncomplete", "evaluationNoScoresAbsent", "evaluationClose"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
});
