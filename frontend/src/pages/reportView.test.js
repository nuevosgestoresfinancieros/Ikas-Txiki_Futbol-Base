import { translations } from "../i18n";
import { initialReportFilters, reportFilterChange, reportFilterSummary, reportPreviewRequest, reportPreviewState, safeReportCell, scopedReportOptions } from "./reportView";

test("builds allowlisted preview payload without empty browser filters", () => {
  expect(reportPreviewRequest("roster", { category: "Alevín", team_id: "", status: "all" }, 2, 25)).toEqual({
    report_id: "roster", filters: { category: "Alevín" }, page: 2, page_size: 25,
  });
});

test("resets pagination when a report filter changes", () => {
  expect(reportFilterChange({ category: "", team_id: "team-a" }, { category: "Alevín", team_id: "" })).toEqual({
    filters: { category: "Alevín", team_id: "" }, page: 1,
  });
});

test("filters dependent teams and players from authorized options", () => {
  const options = {
    teams: [{ id: "a", name: "A", category: "Alevín", season: "2026" }, { id: "b", name: "B", category: "Infantil", season: "2026" }],
    players: [{ id: "one", name: "One", team_id: "a", category: "Alevín" }, { id: "two", name: "Two", team_id: "b", category: "Infantil" }],
  };
  expect(scopedReportOptions(options, { category: "Alevín" })).toMatchObject({ teams: [options.teams[0]], players: [options.players[0]] });
  expect(scopedReportOptions(options, { team_id: "b" }).players).toEqual([options.players[1]]);
});

test("provides report defaults, readable summaries and explicit missing values", () => {
  expect(initialReportFilters("attendance").period).toBe("weekly");
  expect(initialReportFilters("roster").modality).toBe("");
  expect(reportFilterSummary({ team_id: "a", category: "Alevín" }, { teams: [{ id: "a", name: "Equipo A" }] })).toEqual([["team_id", "Equipo A"], ["category", "Alevín"]]);
  expect(safeReportCell(null)).toBe("—");
});

test("distinguishes loading, error, empty and ready preview states", () => {
  expect(reportPreviewState({ loading: true })).toBe("loading");
  expect(reportPreviewState({ error: "network" })).toBe("error");
  expect(reportPreviewState({ preview: { rows: [] } })).toBe("empty");
  expect(reportPreviewState({ preview: { rows: [{ name: "Ficticio" }] } })).toBe("ready");
});

test("contains the professional report interface in Spanish and Basque", () => {
  ["professionalReports", "professionalReportCatalog", "reportFilters", "previewReport", "legacyReports", "reportDateFrom", "reportGroupBy"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
});
