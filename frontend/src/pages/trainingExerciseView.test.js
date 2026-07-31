import { translations } from "../i18n";
import {
  addPlannedExercises, exerciseFilters, historicalExerciseLabel, markAllCompleted,
  movePlannedExercise, removePlannedExercise, templateApplication, validateEvaluation,
} from "./trainingExerciseView";

const exercises = [
  { id: "one", name: "Rondo", category: "possession", objective: "Conservar", status: "active", visibility: "club", author_id: "coach-a", recommended_duration: 15, team_ids: ["a"] },
  { id: "two", name: "Tiro", category: "finishing", objective: "Finalizar", status: "active", visibility: "teams", author_id: "coach-b", recommended_duration: 10, team_ids: ["b"] },
];

test("selects several exercises without duplicates and keeps snapshots", () => {
  const result = addPlannedExercises([{ exercise_id: "one", snapshot: { name: "Rondo" } }], exercises);
  expect(result).toHaveLength(2);
  expect(result[1]).toMatchObject({ exercise_id: "two", planned_duration: 10, order: 2, completed: null });
});

test("orders exercises with accessible controls and removes them", () => {
  const planned = addPlannedExercises([], exercises);
  expect(movePlannedExercise(planned, 1, -1).map((row) => row.exercise_id)).toEqual(["two", "one"]);
  expect(movePlannedExercise(planned, 0, -1)).toEqual(planned);
  expect(removePlannedExercise(planned, "one")).toMatchObject([{ exercise_id: "two", order: 1 }]);
});

test("marks all exercises as performed and preserves expected durations", () => {
  expect(markAllCompleted(addPlannedExercises([], exercises))).toEqual(expect.arrayContaining([
    expect.objectContaining({ exercise_id: "one", completed: true, actual_duration: 15 }),
    expect.objectContaining({ exercise_id: "two", completed: true, actual_duration: 10 }),
  ]));
});

test("requires a reason only when an exercise is explicitly not performed", () => {
  expect(validateEvaluation([{ completed: null }]).valid).toBe(true);
  expect(validateEvaluation([{ completed: false, not_completed_reason: "" }])).toEqual({ valid: false, missingReason: true });
  expect(validateEvaluation([{ completed: false, not_completed_reason: "Lluvia" }]).valid).toBe(true);
});

test("searches and combines category, objective, team and state filters", () => {
  expect(exerciseFilters(exercises, { search: "rondo", category: "possession", objective: "Conservar", team_id: "a", status: "active" })).toEqual([exercises[0]]);
  expect(exerciseFilters(exercises, { category: "finishing" })).toEqual([exercises[1]]);
  expect(exerciseFilters(exercises, { team_id: "missing" })).toEqual([]);
});

test("filters by author and visibility and sorts without mutating the catalog", () => {
  expect(exerciseFilters(exercises, { author_id: "coach-a", visibility: "club" })).toEqual([exercises[0]]);
  expect(exerciseFilters(exercises, { sort: "duration_asc" }).map((item) => item.id)).toEqual(["two", "one"]);
  expect(exercises.map((item) => item.id)).toEqual(["one", "two"]);
});

test("keeps legacy free text visible only when no structured planning exists", () => {
  expect(historicalExerciseLabel({ ejercicios: "Texto histórico", planned_exercises: [] })).toBe("Texto histórico");
  expect(historicalExerciseLabel({ ejercicios: "Texto histórico", planned_exercises: [{ exercise_id: "one" }] })).toBe("");
});

test("applying a template creates an independent unevaluated session", () => {
  const rows = templateApplication({ planned_exercises: [{ exercise_id: "one", completed: true, actual_duration: 12, observation: "Anterior" }] });
  expect(rows[0]).toMatchObject({ exercise_id: "one", completed: null, actual_duration: null, observation: "", order: 1 });
});

test("Spanish and Basque include complete exercise library labels", () => {
  [
    "exerciseLibrary", "createExercise", "plannedExercises", "performed", "notCompletedReason",
    "saveAsTemplate", "copyPreviousTraining", "markAllPerformed", "historicalExerciseRecord",
    "exerciseCategory_warmup", "exerciseCategory_goalkeepers", "exerciseRating_needs_improvement",
    "allObjectives", "allAuthors", "sortBy", "exerciseImageUrl", "viewDetails",
  ].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
});
