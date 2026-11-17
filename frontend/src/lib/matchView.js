// Utilidades de la pantalla de Partidos: secciones, orden, resultado y fecha.

const pad = (value) => String(value).padStart(2, "0");

/** Fecha local en formato AAAA-MM-DD (la que se guarda en los partidos). */
export const localIsoDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Temporada del partido; si no la tiene, la de su equipo. */
export const matchSeason = (match) => match?.temporada || match?.equipo_temporada || "";

const sortKey = (match) => `${match?.fecha || "9999-99-99"}T${match?.hora || "99:99"}`;

/**
 * Próximos: no jugados con fecha de hoy en adelante (o sin fecha), del más
 * cercano al más lejano. Anteriores: jugados o con fecha pasada, del más
 * reciente al más antiguo.
 */
export const splitMatches = (matches, today = localIsoDate()) => {
  const upcoming = [];
  const past = [];
  for (const match of matches || []) {
    const isPast = match.estado === "jugado" || Boolean(match.fecha && match.fecha < today);
    (isPast ? past : upcoming).push(match);
  }
  upcoming.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  past.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return { upcoming, past };
};

const score = (value) => (value === null || value === undefined || value === "" ? NaN : Number(value));

/** "win", "draw" o "loss" para un partido jugado con marcador; si no, null. */
export const matchOutcome = (match) => {
  if (match?.estado !== "jugado") return null;
  const own = score(match.resultado_propio);
  const rival = score(match.resultado_rival);
  if (!Number.isFinite(own) || !Number.isFinite(rival)) return null;
  if (own > rival) return "win";
  return own < rival ? "loss" : "draw";
};

/** Día y día de la semana legibles; añade el año solo si no es el actual. */
export const formatMatchDate = (fecha, lang = "es", today = localIsoDate()) => {
  const parts = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return { day: "--", weekday: "" };
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  const locale = lang === "eu" ? "eu-ES" : "es-ES";
  const sameYear = parts[1] === today.slice(0, 4);
  try {
    return {
      day: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "2-digit" }) }).format(date),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    };
  } catch {
    return { day: `${parts[3]}/${parts[2]}${sameYear ? "" : `/${parts[1].slice(2)}`}`, weekday: "" };
  }
};
