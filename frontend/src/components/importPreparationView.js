export const DUPLICATE_ACTIONS = ["keep_first", "keep_second", "merge", "different_people"];

export const filterPreparationRecords = (records = [], filters = {}) => records.filter((record) => {
  const query = (filters.query || "").trim().toLocaleLowerCase();
  const haystack = `${record.nombre || ""} ${record.apellidos || ""}`.toLocaleLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (filters.category && record.categoria !== filters.category) return false;
  if (filters.team === "__missing__" && record.equipo) return false;
  if (filters.team && filters.team !== "__missing__" && record.equipo !== filters.team) return false;
  if (filters.status === "incidents" && !record.has_pending_incidents) return false;
  if (filters.status === "ready" && record.has_pending_incidents) return false;
  if (filters.previousTeam && record.equipo_anterior !== filters.previousTeam) return false;
  if (filters.age) {
    if (!record.fecha_nacimiento) return false;
    const year = Number(String(record.fecha_nacimiento).slice(0, 4));
    if (Number(filters.age) !== 2026 - year) return false;
  }
  return true;
});

export const selectedOctoberIds = (records = []) => records.filter((row) => row.selected_october).map((row) => row.id);

export const canFinalizeDraft = (draft, expresslyConfirmed) =>
  Boolean(draft?.summary?.can_import && expresslyConfirmed);

export const preparationProgressLabel = (summary = {}) => `${summary.preparation_percent || 0}%`;
