export const TRAINING_DAYS = [
  { code: "monday", labelKey: "monday" },
  { code: "tuesday", labelKey: "tuesday" },
  { code: "wednesday", labelKey: "wednesday" },
  { code: "thursday", labelKey: "thursday" },
  { code: "friday", labelKey: "friday" },
  { code: "saturday", labelKey: "saturday" },
  { code: "sunday", labelKey: "sunday" },
];

const LEGACY_DAY_ALIASES = {
  l: "monday", lunes: "monday", monday: "monday", astelehena: "monday",
  m: "tuesday", martes: "tuesday", tuesday: "tuesday", asteartea: "tuesday",
  x: "wednesday", miercoles: "wednesday", miércoles: "wednesday", wednesday: "wednesday", asteazkena: "wednesday",
  j: "thursday", jueves: "thursday", thursday: "thursday", osteguna: "thursday",
  v: "friday", viernes: "friday", friday: "friday", ostirala: "friday",
  s: "saturday", sabado: "saturday", sábado: "saturday", saturday: "saturday", larunbata: "saturday",
  d: "sunday", domingo: "sunday", sunday: "sunday", igandea: "sunday",
};

const normalize = (value) => String(value || "").trim().toLowerCase();

export const parseTrainingDays = (value) => {
  if (Array.isArray(value)) return value.filter((day) => TRAINING_DAYS.some(({ code }) => code === day));
  const text = normalize(value);
  if (!text) return [];
  const aliases = text.split(/[\s,;/]+/).flatMap((part) => {
    if (LEGACY_DAY_ALIASES[part]) return [LEGACY_DAY_ALIASES[part]];
    if (part.includes("-")) return part.split("-").map((day) => LEGACY_DAY_ALIASES[day]).filter(Boolean);
    return [];
  });
  return TRAINING_DAYS.map(({ code }) => code).filter((day) => aliases.includes(day));
};

export const scheduleText = (start, end, legacy = "") => {
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return legacy || "";
};

export const legacyDaysText = (days, translate) => days.map((day) => translate(day)).join(", ");

export const teamFormFromRecord = (team = {}) => ({
  ...team,
  dias_entrenamiento_lista: parseTrainingDays(team.dias_entrenamiento_lista || team.dias_entrenamiento),
  hora_inicio: team.hora_inicio || "",
  hora_fin: team.hora_fin || "",
  direccion_campo: team.direccion_campo || "",
});

export const teamPayload = (form, translate) => {
  const days = parseTrainingDays(form.dias_entrenamiento_lista);
  const start = String(form.hora_inicio || "");
  const end = String(form.hora_fin || "");
  return {
    ...form,
    dias_entrenamiento_lista: days,
    dias_entrenamiento: days.length ? legacyDaysText(days, translate) : (form.dias_entrenamiento || ""),
    horario: scheduleText(start, end, form.horario),
    hora_inicio: start || undefined,
    hora_fin: end || undefined,
    direccion_campo: String(form.direccion_campo || "").trim() || undefined,
  };
};
