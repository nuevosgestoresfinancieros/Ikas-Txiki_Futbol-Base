export const initialReportFilters = (reportId) => reportId === "attendance"
  ? { date_from: "", date_to: "", category: "", team_id: "", player_id: "", period: "weekly", group_by: "player" }
  : { season: "", category: "", team_id: "", modality: "", status: "", search: "" };

export const reportPreviewRequest = (reportId, filters = {}, page = 1, pageSize = 25) => ({
  report_id: reportId,
  filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== "all" && value != null)),
  page,
  page_size: pageSize,
});

export const reportFilterChange = (filters = {}, patch = {}) => ({
  filters: { ...filters, ...patch },
  page: 1,
});

export const scopedReportOptions = (options = {}, filters = {}) => {
  const teams = (options.teams || []).filter((team) =>
    (!filters.category || team.category === filters.category)
    && (!filters.season || team.season === filters.season));
  const teamIds = new Set(teams.map((team) => team.id));
  const players = (options.players || []).filter((player) =>
    (!filters.category || player.category === filters.category)
    && (!filters.team_id || player.team_id === filters.team_id)
    && (!filters.team_id && (filters.category || filters.season) ? teamIds.has(player.team_id) : true));
  return { ...options, teams, players };
};

export const reportFilterSummary = (filters = {}, options = {}) => Object.entries(filters)
  .filter(([, value]) => value && value !== "all")
  .map(([key, value]) => {
    if (key === "team_id") return [key, (options.teams || []).find((item) => item.id === value)?.name || value];
    if (key === "player_id") return [key, (options.players || []).find((item) => item.id === value)?.name || value];
    return [key, value];
  });

export const safeReportCell = (value) => value === null || value === undefined || value === "" ? "—" : value;

export const reportPreviewState = ({ loading = false, error = "", preview = null } = {}) => {
  if (loading) return "loading";
  if (error) return "error";
  if (!preview || !Array.isArray(preview.rows) || preview.rows.length === 0) return "empty";
  return "ready";
};
