export const filterPortalByPlayer = (portal = {}, playerId) => {
  const player = (portal.players || []).find((item) => item.id === playerId) || portal.players?.[0] || null;
  if (!player) return { player: null, schedule: [], callups: [], attendance: [], payments: [], authorizations: [], documents: null };
  const schedule = (portal.schedule || []).filter((item) => !item.equipo_id || item.equipo_id === player.equipo_id);
  return {
    player,
    schedule,
    callups: (portal.callups || []).filter((item) => item.responses?.some((row) => row.player_id === player.id)),
    attendance: (portal.attendance?.recent || []).filter((item) => item.player_id === player.id),
    payments: (portal.payments || []).filter((item) => item.player_id === player.id),
    authorizations: (portal.authorizations || []).filter((item) => item.player_id === player.id),
    documents: (portal.documents || []).find((item) => item.player_id === player.id) || null,
  };
};

export const nextPortalActivity = (schedule = [], now = new Date()) => schedule
  .filter((item) => new Date(`${item.fecha}T${item.hora || "00:00"}`) >= now)
  .sort((a, b) => `${a.fecha}${a.hora || ""}`.localeCompare(`${b.fecha}${b.hora || ""}`))[0] || null;

export const pendingPortalResponses = (callups = [], playerId) => callups.filter((callup) =>
  callup.responses?.some((row) => row.player_id === playerId && row.estado === "pending"));

export const attendancePercentage = (rows = []) => rows.length
  ? Math.round((rows.filter((row) => row.status === "presente").length / rows.length) * 1000) / 10
  : 0;
