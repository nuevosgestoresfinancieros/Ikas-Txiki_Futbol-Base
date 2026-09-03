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

export const authorizationOnboardingData = (portal = {}) => {
  const onboarding = portal.authorization_onboarding || {};
  const topLevelParents = Array.isArray(portal.family_parents) ? portal.family_parents : [];
  const nestedParents = Array.isArray(onboarding.family_parents) ? onboarding.family_parents : [];
  return {
    ...onboarding,
    // The API currently exposes these fields at the portal root. Keep the
    // nested fallback for older/newer responses so the selector cannot lose
    // its options because of a response-shape transition.
    family_parents: topLevelParents.length ? topLevelParents : nestedParents,
    current_parent_slot: portal.current_parent_slot ?? onboarding.current_parent_slot ?? null,
  };
};

export const attendancePercentage = (rows = []) => rows.length
  ? Math.round((rows.filter((row) => row.status === "presente").length / rows.length) * 1000) / 10
  : 0;
