// Misma regla que la importación (backend/import_staging_service.py):
// la categoría solo sugiere la modalidad; siempre se puede cambiar a mano.
const MODALITY_SUGGESTIONS = {
  chupetin: "F7", querubin: "F7", prebenjamin: "F7", benjamin: "F7", alevin: "F7",
  infantil: "F11", cadete: "F11", juvenil: "F11",
};

const normalizeKey = (value) => String(value || "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const modalitySuggestion = (category) => {
  const key = normalizeKey(category);
  if (!key) return "";
  if (MODALITY_SUGGESTIONS[key]) return MODALITY_SUGGESTIONS[key];
  const parts = key.split("_");
  const base = Object.keys(MODALITY_SUGGESTIONS).find((name) => parts.includes(name));
  return base ? MODALITY_SUGGESTIONS[base] : "";
};

/** Rellena la modalidad sugerida solo si el equipo no tiene ninguna. */
export const withSuggestedModality = (team) => (
  team?.modalidad ? team : { ...team, modalidad: modalitySuggestion(team?.categoria) || team?.modalidad || "" }
);
