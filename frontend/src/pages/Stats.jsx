import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileText, Pencil, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { usePermission } from "@/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, SelectField } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/shared";

const EMPTY_FILTERS = {
  temporada: "", categoria: "", equipo_id: "", modalidad: "", player_id: "",
  desde: "", hasta: "", periodo: "weekly", activo: "",
};

const MANUAL_EMPTY = {
  player_id: "", temporada: "", partidos_convocado: 0, partidos_jugados: 0, minutos: 0,
  goles: 0, asistencias: 0, amarillas: 0, rojas: 0, porterias_cero: 0,
  posicion: "", valoracion: "", observaciones: "",
};

const metricValue = (item) => item?.value ?? "—";

const Card = ({ label, metric, tone = "slate" }) => (
  <div className={`rounded-2xl border p-4 ${tone === "blue" ? "border-[#CFE9FA] bg-[#F4FAFE]" : "border-slate-200 bg-white"}`}>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-2 font-heading text-2xl font-extrabold text-[#0E3554]">{metricValue(metric)}</p>
    {metric?.numerator !== null && metric?.denominator !== null && metric?.unit === "percent" && (
      <p className="mt-1 text-xs text-slate-500">{metric.numerator}/{metric.denominator}</p>
    )}
  </div>
);

const ChartFallback = ({ children }) => (
  <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-sm text-slate-500">
    {children}
  </div>
);

const Stats = () => {
  const { t, lang } = useI18n();
  const canCreate = usePermission("stats", "create");
  const canEdit = usePermission("stats", "edit");
  const canDelete = usePermission("stats", "delete");
  const canExport = usePermission("stats", "export");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState({ seasons: [], categories: [], teams: [], players: [], modalities: [] });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualDialog, setManualDialog] = useState(false);
  const [manualForm, setManualForm] = useState(MANUAL_EMPTY);

  const loadOptions = useCallback(async () => {
    const response = await api.get("/statistics/options");
    setOptions(response.data);
  }, []);

  const queryParams = useMemo(() => Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== "all")
      .map(([key, value]) => [key === "periodo" ? "periodo" : key, value]),
  ), [filters]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api.get("/statistics/summary", { params: queryParams });
      setResult(response.data);
    } catch (requestError) {
      setResult(null);
      setError(requestError?.response?.status === 403 ? t("statisticsAccessDenied") : t("statisticsLoadError"));
    } finally { setLoading(false); }
  }, [queryParams, t]);

  useEffect(() => { loadOptions().catch(() => setError(t("statisticsLoadError"))); }, [loadOptions, t]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }));
  const teamOptions = options.teams.map((team) => ({ value: team.id, label: team.name }));
  const playerOptions = options.players.map((player) => ({ value: player.id, label: player.name }));
  const activeFilter = filters.activo === "true" ? true : filters.activo === "false" ? false : undefined;
  const summary = result?.summary || {};
  const attendance = result?.attendance || {};
  const matches = result?.matches || {};
  const callups = result?.callups || {};
  const quality = result?.quality || [];

  const download = async (format) => {
    try {
      const response = await api.get(`/statistics/export.${format}`, { params: { ...queryParams, lang }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `estadisticas-integrales.${format === "pdf" ? "pdf" : "xlsx"}`; link.click();
      URL.revokeObjectURL(url);
    } catch { toast.error(t("statisticsExportError")); }
  };

  const reset = () => setFilters(EMPTY_FILTERS);
  const manualRecords = result?.manual?.records || [];
  const pName = (id) => options.players.find((player) => player.id === id)?.name || id || "—";
  const setManual = (key) => (value) => setManualForm((current) => ({ ...current, [key]: value }));
  const openManual = (record = MANUAL_EMPTY) => { setManualForm({ ...MANUAL_EMPTY, ...record }); setManualDialog(true); };
  const saveManual = async () => {
    if (!manualForm.player_id) { toast.error(t("selectPlayer")); return; }
    try {
      if (manualForm.id) await api.put(`/stats/${manualForm.id}`, manualForm);
      else await api.post("/stats", manualForm);
      toast.success(t("saved")); setManualDialog(false); load();
    } catch { toast.error(t("saveError")); }
  };
  const removeManual = async (record) => {
    if (!window.confirm(t("confirmDelete"))) return;
    try { await api.delete(`/stats/${record.id}`); toast.success(t("deleted")); load(); }
    catch { toast.error(t("saveError")); }
  };

  return (
    <div data-testid="stats-page" className="min-w-0">
      <PageHeader title={t("integralStats")} subtitle={t("integralStatsSubtitle")} icon={BarChart3}
        action={canExport ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => download("pdf")}><FileText className="h-4 w-4" />{t("statisticsExportPdf")}</Button><Button variant="outline" onClick={() => download("xlsx")}><Download className="h-4 w-4" />{t("statisticsExportExcel")}</Button></div> : null} />

      <section className="surface-card mb-5 p-4" aria-labelledby="statistics-filters-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="statistics-filters-title" className="font-heading text-lg font-bold text-[#0E3554]">{t("statisticsFilters")}</h2><Button variant="ghost" size="sm" onClick={reset}>{t("clearFilters")}</Button></div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label={t("season")} value={filters.temporada} onChange={setFilter("temporada")} options={[{ value: "", label: t("all") }, ...options.seasons.map((value) => ({ value, label: value }))]} testid="statistics-season" />
          <SelectField label={t("category")} value={filters.categoria} onChange={setFilter("categoria")} options={[{ value: "", label: t("all") }, ...options.categories.map((value) => ({ value, label: value }))]} testid="statistics-category" />
          <SelectField label={t("team")} value={filters.equipo_id} onChange={setFilter("equipo_id")} options={[{ value: "", label: t("allTeams") }, ...teamOptions]} testid="statistics-team" />
          <SelectField label={t("modality")} value={filters.modalidad} onChange={setFilter("modalidad")} options={[{ value: "", label: t("allModalities") }, ...options.modalities.map((value) => ({ value, label: value }))]} testid="statistics-modality" />
          <SelectField label={t("name")} value={filters.player_id} onChange={setFilter("player_id")} options={[{ value: "", label: t("allPlayers") }, ...playerOptions]} testid="statistics-player" />
          <SelectField label={t("status")} value={filters.activo} onChange={setFilter("activo")} options={[{ value: "", label: t("allStatuses") }, { value: "true", label: t("activeOnly") }, { value: "false", label: t("inactiveOnly") }]} testid="statistics-active" />
          <Field label={t("reportDateFrom")} type="date" value={filters.desde} onChange={setFilter("desde")} testid="statistics-date-from" />
          <Field label={t("reportDateTo")} type="date" value={filters.hasta} onChange={setFilter("hasta")} testid="statistics-date-to" />
          <SelectField label={t("reportPeriod")} value={filters.periodo} onChange={setFilter("periodo")} options={[{ value: "weekly", label: t("reportWeekly") }, { value: "monthly", label: t("reportMonthly") }]} testid="statistics-period" />
        </div>
        {activeFilter !== undefined && <span className="sr-only">{activeFilter ? t("activeOnly") : t("inactiveOnly")}</span>}
      </section>

      {loading && <div className="surface-card flex items-center justify-center gap-2 p-10 text-sm text-slate-500" role="status"><RefreshCw className="h-4 w-4 animate-spin" />{t("loading")}</div>}
      {!loading && error && <div className="surface-card flex flex-col items-center gap-3 p-10 text-center" role="alert"><p className="text-red-700">{error}</p><Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t("retry")}</Button></div>}
      {!loading && !error && result && <>
        <p className="mb-5 rounded-xl border border-[#CFE9FA] bg-[#F4FAFE] p-3 text-sm text-[#0E3554]">{t("derivedStatisticsNotice")}</p>
        {quality.length > 0 && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{t("incompleteStatistics")}</div>}

        <section className="mb-5" aria-labelledby="statistics-overview-title"><h2 id="statistics-overview-title" className="mb-3 font-heading text-xl font-bold text-[#0E3554]">{t("statisticsOverview")}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label={t("activePlayers")} metric={summary.active_players} tone="blue" /><Card label={t("teams")} metric={summary.teams} tone="blue" /><Card label={t("scheduledMatches")} metric={summary.matches_scheduled} /><Card label={t("playedMatches")} metric={summary.matches_played} /><Card label={t("scheduledTrainings")} metric={summary.trainings_scheduled} /><Card label={t("completedTrainings")} metric={summary.trainings_completed} />
        </div></section>

        <section className="mb-5 grid min-w-0 gap-5 xl:grid-cols-2" aria-labelledby="statistics-attendance-title">
          <div className="surface-card min-w-0 p-4"><h2 id="statistics-attendance-title" className="mb-4 font-heading text-xl font-bold text-[#0E3554]">{t("statisticsAttendance")}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Card label={t("sessionsComputable")} metric={attendance.sessions_computable} /><Card label={t("sessionsPending")} metric={attendance.sessions_pending} /><Card label={t("attendanceRecords")} metric={summary.attendance_records} /><Card label={t("attendancePercentage")} metric={attendance.porcentaje_presencia} tone="blue" /></div>{attendance.trend?.length ? <div className="mt-5 h-[240px]" aria-label={t("evolution")}><ResponsiveContainer width="100%" height="100%"><LineChart data={attendance.trend} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="periodo" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="presente" name={t("present")} stroke="#1B5C8F" strokeWidth={3} /><Line type="monotone" dataKey="injustificada" name={t("unjustified")} stroke="#D97706" strokeWidth={2} /></LineChart></ResponsiveContainer></div> : <div className="mt-5"><ChartFallback>{t("noTrainingData")}</ChartFallback></div>}<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">{t("byTeam")}</caption><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">{t("team")}</th><th className="px-2 py-2">{t("sessions")}</th><th className="px-2 py-2">{t("present")}</th><th className="px-2 py-2">{t("justified")}</th><th className="px-2 py-2">{t("unjustified")}</th><th className="px-2 py-2">{t("attendancePercentage")}</th></tr></thead><tbody>{(attendance.by_team || []).map((row) => <tr key={row.team_id} className="border-b last:border-0"><td className="px-2 py-2 font-semibold">{row.team}</td><td className="px-2 py-2">{row.sessions}</td><td className="px-2 py-2">{row.present}</td><td className="px-2 py-2">{row.justified}</td><td className="px-2 py-2">{row.unjustified}</td><td className="px-2 py-2">{row.percentage ?? "—"}</td></tr>)}</tbody></table></div></div>
          <div className="surface-card min-w-0 p-4"><h2 className="mb-4 font-heading text-xl font-bold text-[#0E3554]">{t("statisticsMatches")}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Card label={t("registeredResults")} metric={summary.results_registered} /><Card label={t("wins")} metric={summary.wins} /><Card label={t("draws")} metric={summary.draws} /><Card label={t("losses")} metric={summary.losses} /></div>{matches.results_registered ? <div className="mt-5 h-[240px]" aria-label={t("statisticsMatches")}><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: t("goalsFor"), value: matches.goals_for || 0 }, { name: t("goalsAgainst"), value: matches.goals_against || 0 }]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#2F7EBE" name={t("goalsFor")} /></BarChart></ResponsiveContainer></div> : <div className="mt-5"><ChartFallback>{t("noMatchResult")}</ChartFallback></div>}<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Card label={t("callupsConfirmed")} metric={{ value: callups.confirmed }} /><Card label={t("callupsDeclined")} metric={{ value: callups.declined }} /><Card label={t("callupsPending")} metric={{ value: callups.pending }} /><Card label={t("callups")} metric={summary.callups} /></div></div>
        </section>

        <section className="surface-card mb-5 min-w-0 overflow-hidden p-4" aria-labelledby="statistics-players-title"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="statistics-players-title" className="font-heading text-xl font-bold text-[#0E3554]">{t("byPlayer")}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{result.pagination?.total || 0}</span></div>{result.player_rows?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">{t("byPlayer")}</caption><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">{t("name")}</th><th className="px-2 py-2">{t("team")}</th><th className="px-2 py-2">{t("category")}</th><th className="px-2 py-2">{t("sessions")}</th><th className="px-2 py-2">{t("present")}</th><th className="px-2 py-2">{t("justified")}</th><th className="px-2 py-2">{t("unjustified")}</th><th className="px-2 py-2">{t("attendancePercentage")}</th></tr></thead><tbody>{result.player_rows.map((row) => <tr key={row.player_id} className="border-b last:border-0"><td className="px-2 py-2 font-semibold">{row.name}</td><td className="px-2 py-2">{row.team}</td><td className="px-2 py-2">{row.category}</td><td className="px-2 py-2">{row.sessions}</td><td className="px-2 py-2">{row.present}</td><td className="px-2 py-2">{row.justified}</td><td className="px-2 py-2">{row.unjustified}</td><td className="px-2 py-2">{row.percentage ?? "—"}</td></tr>)}</tbody></table></div> : <EmptyState icon={TrendingUp} message={t("noStatisticsData")} />}</section>

        <section className="surface-card mb-5 min-w-0 overflow-hidden p-4" aria-labelledby="manual-stats-title"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 id="manual-stats-title" className="font-heading text-xl font-bold text-[#0E3554]">{t("manualStatsLegacy")}</h2><p className="mt-1 text-sm text-slate-500">{t("derivedStatisticsNotice")}</p></div>{canCreate && <Button onClick={() => openManual()}><Plus className="h-4 w-4" />{t("add")}</Button>}</div>{manualRecords.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">{t("manualStatsLegacy")}</caption><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">{t("name")}</th><th className="px-2 py-2">{t("season")}</th><th className="px-2 py-2">{t("playedMatches")}</th><th className="px-2 py-2">{t("goals")}</th><th className="px-2 py-2">{t("assists")}</th><th className="px-2 py-2">{t("actions")}</th></tr></thead><tbody>{manualRecords.map((record) => <tr key={record.id} className="border-b last:border-0"><td className="px-2 py-2">{pName(record.player_id)}</td><td className="px-2 py-2">{record.temporada || "—"}</td><td className="px-2 py-2">{record.partidos_jugados ?? 0}</td><td className="px-2 py-2">{record.goles ?? 0}</td><td className="px-2 py-2">{record.asistencias ?? 0}</td><td className="px-2 py-2"><div className="flex gap-1">{canEdit && <Button variant="ghost" size="icon" aria-label={`${t("edit")} ${pName(record.player_id)}`} onClick={() => openManual(record)}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button variant="ghost" size="icon" aria-label={`${t("delete")} ${pName(record.player_id)}`} onClick={() => removeManual(record)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div></td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">{t("noData")}</p>}</section>
      </>}

      <Dialog open={manualDialog} onOpenChange={setManualDialog}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("manualStatsLegacy")}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="col-span-2 sm:col-span-3"><SelectField label={t("name")} value={manualForm.player_id} onChange={setManual("player_id")} options={playerOptions} testid="manual-stats-player" /></div><Field label={t("season")} value={manualForm.temporada} onChange={setManual("temporada")} /><Field label={t("position")} value={manualForm.posicion} onChange={setManual("posicion")} /><Field label={t("playedMatches")} type="number" value={manualForm.partidos_jugados} onChange={setManual("partidos_jugados")} /><Field label={t("goals")} type="number" value={manualForm.goles} onChange={setManual("goles")} /><Field label={t("assists")} type="number" value={manualForm.asistencias} onChange={setManual("asistencias")} /><Field label={t("rating")} type="number" value={manualForm.valoracion} onChange={setManual("valoracion")} /></div><DialogFooter><Button variant="outline" onClick={() => setManualDialog(false)}>{t("cancel")}</Button><Button onClick={saveManual}>{t("save")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default Stats;
