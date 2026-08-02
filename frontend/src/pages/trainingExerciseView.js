export const emptyExercise = {
  name: "", category: "warmup", objective: "", description: "", instructions: [],
  recommended_duration: 15, min_players: "", max_players: "", materials: [],
  intensity: "medium", recommended_space: "", safety_notes: "", image_url: "",
  team_ids: [], visibility: "private",
};

export const selectedExerciseIds = (rows = []) => rows.map((row) => row.exercise_id);

export const addPlannedExercises = (planned = [], exercises = []) => {
  const existing = new Set(selectedExerciseIds(planned));
  return [
    ...planned,
    ...exercises.filter((exercise) => !existing.has(exercise.id)).map((exercise) => ({
      exercise_id: exercise.id,
      snapshot: { name: exercise.name, category: exercise.category, objective: exercise.objective },
      planned_duration: exercise.recommended_duration || 15,
      completed: null,
      actual_duration: null,
      rating: null,
      observation: "",
      not_completed_reason: "",
    })),
  ].map((row, index) => ({ ...row, order: index + 1 }));
};

export const movePlannedExercise = (planned = [], index, direction) => {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= planned.length || target >= planned.length) return planned;
  const result = [...planned];
  [result[index], result[target]] = [result[target], result[index]];
  return result.map((row, position) => ({ ...row, order: position + 1 }));
};

export const removePlannedExercise = (planned = [], exerciseId) => planned
  .filter((row) => row.exercise_id !== exerciseId)
  .map((row, position) => ({ ...row, order: position + 1 }));

export const markAllCompleted = (planned = []) => planned.map((row) => ({
  ...row,
  completed: true,
  actual_duration: row.actual_duration ?? row.planned_duration,
  not_completed_reason: "",
}));

export const validateEvaluation = (planned = []) => {
  const missingReason = planned.some((row) => row.completed === false && !String(row.not_completed_reason || "").trim());
  return { valid: !missingReason, missingReason };
};

export const exerciseFilters = (items = [], filters = {}) => {
  const search = String(filters.search || "").trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.category && filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.objective && filters.objective !== "all" && item.objective !== filters.objective) return false;
    if (filters.author_id && filters.author_id !== "all" && item.author_id !== filters.author_id) return false;
    if (filters.visibility && filters.visibility !== "all" && item.visibility !== filters.visibility) return false;
    if (filters.team_id && filters.team_id !== "all" && !(item.team_ids || []).includes(filters.team_id)) return false;
    if (search && ![item.name, item.objective, item.description].some((value) => String(value || "").toLocaleLowerCase().includes(search))) return false;
    return true;
  });
  const direction = filters.sort === "name_desc" ? -1 : 1;
  if (filters.sort === "name_asc" || filters.sort === "name_desc") {
    return [...filtered].sort((left, right) => direction * String(left.name || "").localeCompare(String(right.name || "")));
  }
  if (filters.sort === "duration_asc" || filters.sort === "duration_desc") {
    const durationDirection = filters.sort === "duration_desc" ? -1 : 1;
    return [...filtered].sort((left, right) => durationDirection * ((left.recommended_duration || 0) - (right.recommended_duration || 0)));
  }
  return filtered;
};

export const historicalExerciseLabel = (training) => (
  training?.ejercicios && !(training?.planned_exercises || []).length ? training.ejercicios : ""
);

export const templateApplication = (template) => (template?.planned_exercises || []).map((row, index) => ({
  ...row,
  order: index + 1,
  completed: null,
  actual_duration: null,
  rating: null,
  observation: "",
  not_completed_reason: "",
}));
