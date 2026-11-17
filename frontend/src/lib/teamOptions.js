// Etiquetas y orden de equipos cuando hay nombres repetidos entre temporadas.

const seasonStart = (season) => {
  const match = String(season || "").match(/(\d{2,4})/);
  if (!match) return -Infinity;
  const year = Number(match[1]);
  return year < 100 ? 2000 + year : year;
};

export const teamLabel = (team, noSeasonLabel = "sin temporada") =>
  `${team?.nombre || "—"} · ${team?.temporada || noSeasonLabel}`;

/** Temporada actual primero; después de más reciente a más antigua y por nombre. */
export const sortTeamsBySeason = (teams, currentSeason = "") =>
  [...(teams || [])].sort((a, b) => {
    const aCurrent = currentSeason && a.temporada === currentSeason ? 1 : 0;
    const bCurrent = currentSeason && b.temporada === currentSeason ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    const bySeason = seasonStart(b.temporada) - seasonStart(a.temporada);
    if (bySeason) return bySeason;
    const byLabel = String(b.temporada || "").localeCompare(String(a.temporada || ""));
    if (byLabel) return byLabel;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
  });

/**
 * Equipos para el selector del jugador. Sin ``showAll`` se limita a la
 * temporada indicada, pero conserva siempre el equipo ya asignado.
 */
export const selectableTeams = (teams, { season = "", selectedId = "", showAll = false } = {}) => {
  if (showAll || !season) return sortTeamsBySeason(teams, season);
  return sortTeamsBySeason(
    (teams || []).filter((team) => team.temporada === season || (selectedId && team.id === selectedId)),
    season,
  );
};
