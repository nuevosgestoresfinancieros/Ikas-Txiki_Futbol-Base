import { translations } from "../i18n";
import { canExportReport, exportFilename, initialReportFilters, professionalExportRequest, professionalExportState, reportFilterChange, reportFilterSummary, reportPreviewRequest, reportPreviewState, safeReportCell, scopedReportOptions } from "./reportView";

test("builds allowlisted preview payload without empty browser filters", () => {
  expect(reportPreviewRequest("roster", { category: "Alevín", team_id: "", status: "all" }, 2, 25)).toEqual({
    report_id: "roster", filters: { category: "Alevín" }, page: 2, page_size: 25,
  });
});

test("resets pagination when a report filter changes", () => {
  expect(reportFilterChange({ category: "", team_id: "team-a" }, { category: "Alevín", team_id: "" })).toEqual({
    filters: { category: "Alevín", team_id: "" }, page: 1, preview: null,
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
  expect(initialReportFilters("equipment", ["category", "team_id", "delivery"])).toEqual({
    category: "", team_id: "", delivery: "",
  });
  expect(initialReportFilters("attendance_evolution", ["period", "date_from"])).toEqual({
    period: "weekly", date_from: "",
  });
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
  ["professionalReports", "professionalReportCatalog", "reportFilters", "previewReport", "legacyReports", "reportDateFrom", "reportGroupBy", "professionalExports", "downloadProfessionalPDF", "downloadProfessionalExcel", "professionalExportPreparing", "professionalExportNoResults", "professionalExportError", "professionalExportLimitError"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
  ["reportFilter_type", "reportFilter_movement", "reportFilter_delivery", "reportFilter_contact_type",
    "reportFilter_payment_method", "reportColumn_missing_documents", "reportColumn_equipment_item",
    "reportColumn_authorization_type", "reportColumn_expected", "reportColumn_paid",
    "reportColumn_pending", "reportTotal_rows"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
});

test("builds safe export payloads and filenames", () => {
  expect(professionalExportRequest("attendance", { team_id: "team-a", player_id: "", period: "weekly" }, "eu")).toEqual({
    report_id: "attendance", filters: { team_id: "team-a", period: "weekly" }, lang: "eu",
  });
  expect(exportFilename('attachment; filename="ikas-txiki_roster_es_20260722.pdf"', "fallback.pdf")).toBe("ikas-txiki_roster_es_20260722.pdf");
  expect(exportFilename('attachment; filename="../../bad name.xlsx"', "fallback.xlsx")).toBe("..-..-bad-name.xlsx");
});

test("enables professional export only for supported non-empty previews", () => {
  const definition = { exports: ["pdf", "xlsx"] };
  expect(canExportReport(definition, { pagination: { total_rows: 2 } }, "pdf")).toBe(true);
  expect(canExportReport(definition, { pagination: { total_rows: 0 } }, "pdf")).toBe(false);
  expect(canExportReport(definition, { pagination: { total_rows: 2 } }, "csv")).toBe(false);
});

test("distinguishes export generation, error, empty and retry-ready states", () => {
  expect(professionalExportState({ format: "pdf", preview: { pagination: { total_rows: 2 } } })).toBe("generating");
  expect(professionalExportState({ error: "network", preview: { pagination: { total_rows: 2 } } })).toBe("error");
  expect(professionalExportState({ preview: { pagination: { total_rows: 0 } } })).toBe("empty");
  expect(professionalExportState({ preview: { pagination: { total_rows: 2 } } })).toBe("ready");
});
