export const filterCallups = (callups, status, search) => {
  const needle = search.trim().toLocaleLowerCase();
  return callups.filter((callup) => {
    const entries = callup.convocados || [];
    const statusMatches = status === "all" || entries.some((item) => item.estado === status);
    const playerMatches = !needle || entries.some((item) => (item.nombre || "").toLocaleLowerCase().includes(needle));
    return statusMatches && playerMatches;
  });
};

export const responseActions = (permissions = []) => ({
  canRespond: permissions.includes("respond"),
  canManage: permissions.includes("edit"),
  canExport: permissions.includes("export"),
});
