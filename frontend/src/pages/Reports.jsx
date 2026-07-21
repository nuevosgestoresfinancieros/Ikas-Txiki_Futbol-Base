import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Download, Printer, RotateCw, Search, Sheet } from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared";
import { canExportReport, exportFilename, initialReportFilters, professionalExportRequest, professionalExportState, reportFilterChange, reportFilterSummary, reportPreviewRequest, safeReportCell, scopedReportOptions } from "./reportView";

const Reports = () => {
  const { t, lang } = useI18n();
  const [report, setReport] = useState("playersList");
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fTeam, setFTeam] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [data, setData] = useState({ headers: [], rows: [], title: "" });
  const [catalog, setCatalog] = useState([]);
  const [reportOptions, setReportOptions] = useState({});
  const [professionalReport, setProfessionalReport] = useState("roster");
  const [professionalFilters, setProfessionalFilters] = useState(initialReportFilters("roster"));
  const [preview, setPreview] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [exportingFormat, setExportingFormat] = useState("");
  const [exportError, setExportError] = useState("");
  const [lastExportFormat, setLastExportFormat] = useState("");

  useEffect(() => {
    Promise.all([api.get("/teams"), api.get("/categories")]).then(([tm, c]) => { setTeams(tm.data); setCategories(c.data); });
  }, []);

  const loadCatalog = useCallback(async () => {
    setPreviewLoading(true); setPreviewError("");
    try {
      const response = await api.get("/reports/catalog");
      setCatalog(response.data.reports || []); setReportOptions(response.data.filter_options || {});
      const reports = response.data.reports || [];
      setProfessionalReport((current) => {
        const next = reports.some((item) => item.id === current) ? current : reports[0]?.id;
        if (next && next !== current) setProfessionalFilters(initialReportFilters(next));
        return next || "";
      });
    } catch (error) { setPreviewError(error.response?.data?.detail || t("professionalReportsLoadError")); }
    finally { setPreviewLoading(false); }
  }, [t]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const runPreview = useCallback(async (requestedPage = 1) => {
    if (!professionalReport) return;
    setPreviewLoading(true); setPreviewError("");
    try {
      const response = await api.post("/reports/preview", reportPreviewRequest(professionalReport, professionalFilters, requestedPage, 25));
      setPreview(response.data); setReportOptions(response.data.filter_options || reportOptions); setPreviewPage(response.data.pagination?.page || 1);
    } catch (error) { setPreview(null); setPreviewError(error.response?.data?.detail || t("professionalReportsPreviewError")); }
    finally { setPreviewLoading(false); }
  }, [professionalFilters, professionalReport, reportOptions, t]);

  useEffect(() => { if (catalog.length) runPreview(1); }, [catalog.length, professionalReport]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopedOptions = useMemo(() => scopedReportOptions(reportOptions, professionalFilters), [reportOptions, professionalFilters]);
  const selectedDefinition = catalog.find((item) => item.id === professionalReport);
  const exportState = professionalExportState({ format: exportingFormat, error: exportError, preview });
  const changeProfessionalFilter = (patch) => {
    const next = reportFilterChange(professionalFilters, patch);
    setProfessionalFilters(next.filters); setPreviewPage(next.page); setPreview(next.preview); setExportError("");
  };

  const downloadProfessional = async (format) => {
    if (!canExportReport(selectedDefinition, preview, format) || exportingFormat) {
      if (!preview?.pagination?.total_rows) setExportError(t("professionalExportNoResults"));
      return;
    }
    setExportError(""); setExportingFormat(format); setLastExportFormat(format);
    try {
      const response = await api.post(`/reports/export.${format}`, professionalExportRequest(professionalReport, professionalFilters, lang), { responseType: "blob" });
      const fallback = `ikas-txiki_${professionalReport}_${lang}.${format}`;
      const filename = exportFilename(response.headers["content-disposition"], fallback);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error.response?.status === 413 ? t("professionalExportLimitError") : t("professionalExportError"));
    } finally { setExportingFormat(""); }
  };

  const teamName = useCallback((id) => teams.find((x) => x.id === id)?.nombre || "—", [teams]);

  const build = useCallback(async () => {
    let headers = [], rows = [], title = t(report);
    if (report === "playersList") {
      let players = (await api.get("/players")).data;
      if (fTeam !== "all") players = players.filter(p => p.equipo_id === fTeam);
      if (fCat !== "all") players = players.filter(p => p.categoria === fCat);
      headers = [t("name"), t("category"), t("team"), t("number"), t("status")];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.categoria||"—", teamName(p.equipo_id), p.dorsal||"—", p.estado]);
    } else if (report === "familyPhones") {
      const players = (await api.get("/players")).data;
      headers = [t("name"), `${t("parent1")}`, `${t("phone")} 1`, `${t("phone")} 2`];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.progenitor1_nombre||"—", p.progenitor1_telefono||"—", p.progenitor2_telefono||"—"]);
    } else if (report === "familyEmails") {
      const players = (await api.get("/players")).data;
      headers = [t("name"), `${t("email")} 1`, `${t("email")} 2`];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.progenitor1_email||"—", p.progenitor2_email||"—"]);
    } else if (report === "pendingPaymentsReport") {
      let pays = (await api.get("/payments")).data.filter(p => ["pendiente","parcial"].includes(p.estado));
      headers = [t("name"), t("concept"), t("finalAmount"), t("status")];
      rows = pays.map(p => [p.player_nombre, p.concepto, `${(p.importe_final||0).toFixed(2)} €`, p.estado]);
    } else if (report === "pendingAuthsReport") {
      let auths = (await api.get("/authorizations")).data.filter(a => a.estado !== "firmada");
      headers = [t("name"), t("authType"), t("status")];
      rows = auths.map(a => [a.player_nombre, a.tipo, a.estado]);
    } else if (report === "statsReport") {
      const stats = (await api.get("/stats")).data;
      headers = [t("name"), t("season"), t("playedMatches"), t("goals"), t("assists"), t("rating")];
      rows = stats.map(s => [s.player_nombre, s.temporada||"—", s.partidos_jugados??0, s.goles??0, s.asistencias??0, s.valoracion??"—"]);
    }
    setData({ headers, rows, title });
  }, [fCat, fTeam, report, t, teamName]);

  useEffect(() => { build(); }, [build]);

  const exportCSV = () => {
    const csv = [data.headers.join(";"), ...data.rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${report}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const legacyReportOptions = ["playersList","familyPhones","familyEmails","pendingPaymentsReport","pendingAuthsReport","statsReport"];

  return (
    <div data-testid="reports-page">
      <PageHeader title={t("reports")} icon={FileText} />

      <section className="mb-8 space-y-4" aria-labelledby="professional-reports-title" data-testid="professional-reports">
        <div>
          <h2 id="professional-reports-title" className="font-heading text-xl font-bold text-slate-900">{t("professionalReports")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("professionalReportsHelp")}</p>
        </div>
        {previewError && !catalog.length ? <div role="alert" className="surface-card p-5 text-center"><p className="text-red-700">{previewError}</p><Button className="mt-3" onClick={loadCatalog}><RotateCw className="h-4 w-4" />{t("retry")}</Button></div> : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="surface-card min-w-0 p-4" aria-label={t("professionalReportCatalog")}>
              <h3 className="mb-3 font-heading font-bold">{t("professionalReportCatalog")}</h3>
              <div className="grid gap-2">{catalog.map((item) => <button key={item.id} type="button" onClick={() => { setProfessionalReport(item.id); setProfessionalFilters(initialReportFilters(item.id)); setPreview(null); setPreviewPage(1); }} aria-pressed={professionalReport === item.id} className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${professionalReport === item.id ? "border-primary bg-primary text-white" : "bg-white text-slate-700 hover:border-primary"}`}>{item.name?.[lang] || item.name?.es || item.id}</button>)}</div>
            </aside>
            <div className="min-w-0 space-y-4">
              <section className="surface-card min-w-0 overflow-hidden p-4" aria-labelledby="professional-filters-title">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 id="professional-filters-title" className="font-heading font-bold">{t("reportFilters")}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{selectedDefinition?.name?.[lang] || selectedDefinition?.name?.es}</span></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedDefinition?.filters.includes("season") && <label className="grid gap-1 text-sm font-semibold">{t("season")}<select value={professionalFilters.season || ""} onChange={(event) => changeProfessionalFilter({ season: event.target.value, team_id: "", player_id: "" })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(reportOptions.seasons || []).map((value) => <option key={value}>{value}</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("date_from") && <label className="grid gap-1 text-sm font-semibold">{t("reportDateFrom")}<input type="date" value={professionalFilters.date_from || ""} onChange={(event) => changeProfessionalFilter({ date_from: event.target.value })} className="h-11 rounded-xl border px-3" /></label>}
                  {selectedDefinition?.filters.includes("date_to") && <label className="grid gap-1 text-sm font-semibold">{t("reportDateTo")}<input type="date" value={professionalFilters.date_to || ""} onChange={(event) => changeProfessionalFilter({ date_to: event.target.value })} className="h-11 rounded-xl border px-3" /></label>}
                  {selectedDefinition?.filters.includes("category") && <label className="grid gap-1 text-sm font-semibold">{t("category")}<select value={professionalFilters.category || ""} onChange={(event) => changeProfessionalFilter({ category: event.target.value, team_id: "", player_id: "" })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(reportOptions.categories || []).map((value) => <option key={value}>{value}</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("team_id") && <label className="grid gap-1 text-sm font-semibold">{t("team")}<select value={professionalFilters.team_id || ""} onChange={(event) => changeProfessionalFilter({ team_id: event.target.value, player_id: "" })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(scopedOptions.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("modality") && <label className="grid gap-1 text-sm font-semibold">{t("modality")}<select value={professionalFilters.modality || ""} onChange={(event) => changeProfessionalFilter({ modality: event.target.value })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(reportOptions.modalities || []).map((item) => <option key={item.code} value={item.code}>{item[lang === "eu" ? "name_eu" : "name_es"]} ({item.code})</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("status") && <label className="grid gap-1 text-sm font-semibold">{t("status")}<select value={professionalFilters.status || ""} onChange={(event) => changeProfessionalFilter({ status: event.target.value })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(reportOptions.states || []).map((value) => <option key={value}>{value}</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("player_id") && <label className="grid gap-1 text-sm font-semibold">{t("name")}<select value={professionalFilters.player_id || ""} onChange={(event) => changeProfessionalFilter({ player_id: event.target.value })} className="h-11 rounded-xl border px-3"><option value="">{t("all")}</option>{(scopedOptions.players || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                  {selectedDefinition?.filters.includes("period") && <label className="grid gap-1 text-sm font-semibold">{t("reportPeriod")}<select value={professionalFilters.period || "weekly"} onChange={(event) => changeProfessionalFilter({ period: event.target.value })} className="h-11 rounded-xl border px-3"><option value="weekly">{t("reportWeekly")}</option><option value="monthly">{t("reportMonthly")}</option></select></label>}
                  {selectedDefinition?.filters.includes("group_by") && <label className="grid gap-1 text-sm font-semibold">{t("reportGroupBy")}<select value={professionalFilters.group_by || "player"} onChange={(event) => changeProfessionalFilter({ group_by: event.target.value })} className="h-11 rounded-xl border px-3"><option value="player">{t("reportByPlayer")}</option><option value="team">{t("reportByTeam")}</option></select></label>}
                  {selectedDefinition?.filters.includes("search") && <label className="grid gap-1 text-sm font-semibold">{t("search")}<span className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={professionalFilters.search || ""} onChange={(event) => changeProfessionalFilter({ search: event.target.value })} className="h-11 w-full rounded-xl border pl-9 pr-3" /></span></label>}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-2" aria-label={t("appliedFilters")}>{reportFilterSummary(professionalFilters, reportOptions).map(([key, value]) => <span key={key} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{t(`reportFilter_${key}`)}: {value}</span>)}</div><Button onClick={() => runPreview(1)} disabled={previewLoading}><Search className="h-4 w-4" />{t("previewReport")}</Button></div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" aria-label={t("professionalExports")}>
                  {selectedDefinition?.exports?.includes("pdf") && <Button variant="outline" onClick={() => downloadProfessional("pdf")} disabled={!canExportReport(selectedDefinition, preview, "pdf") || Boolean(exportingFormat)} aria-label={t("downloadProfessionalPDF")}><Download className="h-4 w-4" />{exportingFormat === "pdf" ? t("preparingExport") : t("downloadProfessionalPDF")}</Button>}
                  {selectedDefinition?.exports?.includes("xlsx") && <Button variant="outline" onClick={() => downloadProfessional("xlsx")} disabled={!canExportReport(selectedDefinition, preview, "xlsx") || Boolean(exportingFormat)} aria-label={t("downloadProfessionalExcel")}><Sheet className="h-4 w-4" />{exportingFormat === "xlsx" ? t("preparingExport") : t("downloadProfessionalExcel")}</Button>}
                  <span className="text-xs text-slate-500" aria-live="polite">{exportState === "generating" ? t("professionalExportPreparing") : (exportState === "empty" ? t("professionalExportNoResults") : "")}</span>
                </div>
              </section>
              {exportError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><p>{exportError}</p>{lastExportFormat && <Button variant="outline" className="mt-3" onClick={() => downloadProfessional(lastExportFormat)} disabled={Boolean(exportingFormat)}><RotateCw className="h-4 w-4" />{t("retry")}</Button>}</div>}
              {previewError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p>{previewError}</p><Button variant="outline" className="mt-3" onClick={() => runPreview(previewPage)}><RotateCw className="h-4 w-4" />{t("retry")}</Button></div>}
              <section className="surface-card min-w-0 overflow-hidden" aria-busy={previewLoading} aria-live="polite">
                {previewLoading ? <div className="p-10 text-center text-slate-500" role="status">{t("loading")}</div> : !preview || preview.rows.length === 0 ? <div className="p-10 text-center text-slate-500">{t("noData")}</div> : <><div className="grid grid-cols-2 gap-2 border-b bg-slate-50 p-3 sm:grid-cols-4">{Object.entries(preview.totals || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-white p-2 text-center"><p className="text-lg font-bold">{value}</p><p className="text-xs text-slate-500">{t(`reportTotal_${key}`)}</p></div>)}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{preview.report.columns.map((column) => <th key={column} className="px-4 py-3">{t(`reportColumn_${column}`)}</th>)}</tr></thead><tbody className="divide-y">{preview.rows.map((row, index) => <tr key={`${preview.pagination.page}-${index}`}>{preview.report.columns.map((column) => <td key={column} className="px-4 py-3 text-slate-700">{safeReportCell(row[column])}</td>)}</tr>)}</tbody></table></div><div className="flex items-center justify-between border-t p-3"><span className="text-sm text-slate-500">{preview.pagination.total_rows} {t("rows")}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={preview.pagination.page <= 1} onClick={() => runPreview(preview.pagination.page - 1)}>{t("previous")}</Button><span className="text-sm">{preview.pagination.page}/{preview.pagination.total_pages}</span><Button variant="outline" size="sm" disabled={preview.pagination.page >= preview.pagination.total_pages} onClick={() => runPreview(preview.pagination.page + 1)}>{t("next")}</Button></div></div></>}
              </section>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="legacy-reports-title">
      <h2 id="legacy-reports-title" className="mb-3 font-heading text-xl font-bold text-slate-900">{t("legacyReports")}</h2>

      <div className="flex flex-col sm:flex-row gap-3 mb-5 no-print">
        <Select value={report} onValueChange={setReport}>
          <SelectTrigger className="h-11 sm:w-72" data-testid="report-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {legacyReportOptions.map(r => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        {report === "playersList" && <>
          <Select value={fTeam} onValueChange={setFTeam}>
            <SelectTrigger className="h-11 sm:w-44" data-testid="report-filter-team"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("team")}: {t("all")}</SelectItem>
              {teams.map(tm=><SelectItem key={tm.id} value={tm.id}>{tm.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="h-11 sm:w-44" data-testid="report-filter-cat"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("category")}: {t("all")}</SelectItem>
              {categories.map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </>}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={exportCSV} data-testid="export-csv-btn" className="h-11"><Download className="h-4 w-4" />{t("exportCSV")}</Button>
          <Button onClick={() => window.print()} data-testid="export-pdf-btn" className="h-11"><Printer className="h-4 w-4" />{t("exportPDF")}</Button>
        </div>
      </div>

      <div className="surface-card overflow-hidden print-area">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-heading font-bold text-slate-900">{data.title}</h2>
          <span className="text-xs text-slate-400 no-print">{data.rows.length} {t("rows")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>{data.headers.map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.length === 0 ? (
                <tr><td colSpan={data.headers.length} className="px-4 py-8 text-center text-slate-400">{t("noData")}</td></tr>
              ) : data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {r.map((c, j) => <td key={j} className="px-4 py-2.5 text-slate-700">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </section>
    </div>
  );
};

export default Reports;
