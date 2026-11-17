import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CalendarDays, Plus, Pencil, Trash2, MapPin, Users, Check, X, Clock, ChevronDown, ChevronUp, ClipboardList, ClipboardCheck, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { STATUS_LABELS, useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";
import GoogleMapsLinks from "@/components/GoogleMapsLinks";
import MatchReport from "@/components/MatchReport";
import { matchesSearch } from "@/lib/textSearch";
import { sortTeamsBySeason, teamLabel } from "@/lib/teamOptions";
import { formatMatchDate, localIsoDate, matchOutcome, matchSeason, splitMatches } from "@/lib/matchView";

const empty = { condicion: "local", tipo: "liga", estado: "programado" };
const MATCH_STATUSES = ["programado", "jugado", "aplazado", "suspendido", "cancelado"];
const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
const Datalist = ({ id, values }) => <datalist id={id}>{unique(values).map((value) => <option key={value} value={value} />)}</datalist>;
const filterClass = "h-11 w-full rounded-md border border-input bg-white px-3 text-sm";

const OUTCOME_STYLES = {
  win: ["outcomeWin", "outcomeWinShort", "bg-green-100 text-green-800"],
  draw: ["outcomeDraw", "outcomeDrawShort", "bg-slate-200 text-slate-700"],
  loss: ["outcomeLoss", "outcomeLossShort", "bg-red-100 text-red-700"],
};
const REPORT_STYLES = {
  closed: ["matchReportClosed", "bg-green-50 text-green-800 ring-green-200"],
  draft: ["matchReportDraft", "bg-amber-50 text-amber-800 ring-amber-200"],
  reopened: ["matchReportReopened", "bg-amber-50 text-amber-800 ring-amber-200"],
  missing: ["matchReportMissing", "bg-slate-50 text-slate-600 ring-slate-200"],
};

const Matches = () => {
  const canCreate = usePermission("matches", "create");
  const canCreateCallup = usePermission("callups", "create");
  const canReadMatchReport = usePermission("match-reports", "read");
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [matches, setMatches] = useState([]);
  const [callups, setCallups] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [settings, setSettings] = useState({ temporadas: [], campos: [] });
  const [currentSeason, setCurrentSeason] = useState("");
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [expanded, setExpanded] = useState(null); // match_id expandido
  const [reportMatch, setReportMatch] = useState(null);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [seasonFilter, setSeasonFilter] = useState(null); // null = temporada actual
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    const [mRes, cRes, pRes, tRes, settingsRes] = await Promise.all([
      api.get("/matches"),
      api.get("/callups"),
      api.get("/players"),
      api.get("/teams"),
      api.get("/catalog-options"),
    ]);
    setMatches(mRes.data);
    setCallups(cRes.data);
    setPlayers(pRes.data);
    setTeams(tRes.data);
    setSettings(settingsRes.data || {});
  };

  useEffect(() => {
    load();
    api.get("/public/branding").then((r) => setCurrentSeason(r.data?.temporada_actual || "")).catch(() => setCurrentSeason(""));
    if (params.get("new") && canCreate) { setForm({ ...empty }); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const activeSeason = seasonFilter ?? currentSeason;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setTeam = (teamId) => setForm((f) => {
    const team = teams.find((item) => item.id === teamId);
    return { ...f, equipo_id: teamId, temporada: team?.temporada || f.temporada };
  });
  const openNew = () => { setForm({ ...empty, temporada: activeSeason || currentSeason || "" }); setDialog(true); };
  const openEdit = (m) => { setForm(m); setDialog(true); };
  const save = async () => {
    try {
      if (form.id) await api.put(`/matches/${form.id}`, form);
      else await api.post("/matches", form);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : t("saveError"));
      return;
    }
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (m) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/matches/${m.id}`);
    toast.success(t("deleted")); load();
  };

  // Ir a convocatoria del partido (crea nueva si no existe)
  const goToCallup = (m) => {
    const existing = callups.find((c) => c.match_id === m.id);
    if (existing) {
      navigate(`/callups?edit=${existing.id}`);
    } else {
      navigate(`/callups?new=1&match_id=${m.id}`);
    }
  };

  // Datos de convocatoria para un partido
  const getCallup = (matchId) => callups.find((c) => c.match_id === matchId);
  const getPlayerName = (pid) => {
    const p = players.find((x) => x.id === pid);
    return p ? `${p.nombre} ${p.apellidos || ""}`.trim() : "—";
  };

  const sortedTeams = useMemo(() => sortTeamsBySeason(teams, currentSeason), [teams, currentSeason]);
  const teamOptions = sortedTeams.map((tm) => ({ value: tm.id, label: teamLabel(tm, t("noSeason")) }));
  const filterTeams = sortedTeams.filter((tm) => !activeSeason || tm.temporada === activeSeason);
  const seasonOptions = useMemo(() => unique([...(settings.temporadas || []), ...teams.map((team) => team.temporada), ...matches.map((match) => match.temporada)]), [settings.temporadas, teams, matches]);
  const fieldOptions = useMemo(() => unique([...(settings.campos || []), ...teams.map((team) => team.campo), ...matches.flatMap((match) => [match.campo, match.direccion_campo])]), [settings.campos, teams, matches]);

  const today = localIsoDate();
  const visibleMatches = matches.filter((m) => {
    const season = matchSeason(m);
    return (!teamFilter || m.equipo_id === teamFilter)
      && (!activeSeason || !season || season === activeSeason)
      && (!statusFilter || m.estado === statusFilter)
      && matchesSearch(search, [m.rival, m.equipo_nombre, m.campo, m.direccion_campo, m.jornada]);
  });
  const { upcoming, past } = splitMatches(visibleMatches, today);
  const changeSeason = (value) => { setSeasonFilter(value); setTeamFilter(""); };

  const renderMatch = (m, isPast) => {
    const callup = getCallup(m.id);
    const convocados = callup?.convocados || [];
    const confirmados = convocados.filter((c) => ["confirmed", "confirmado"].includes(c.estado)).length;
    const noPueden = convocados.filter((c) => ["declined", "no_puede"].includes(c.estado)).length;
    const pendientes = convocados.filter((c) => ["pending", "pendiente"].includes(c.estado)).length;
    const isExpanded = expanded === m.id;
    const date = formatMatchDate(m.fecha, lang, today);
    const outcome = OUTCOME_STYLES[matchOutcome(m)];
    const reportKey = m.acta_estado ? (REPORT_STYLES[m.acta_estado] ? m.acta_estado : null) : (isPast && m.estado === "jugado" ? "missing" : null);
    const report = reportKey && REPORT_STYLES[reportKey];

    return (
      <div key={m.id} data-testid={`match-card-${m.id}`}
        className="surface-card interactive-card overflow-hidden">

        {/* Fila principal */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-4">
            <div className="text-center min-w-[64px]">
              <p className="text-[11px] font-bold uppercase text-slate-500">{m.fecha === today ? <span className="text-primary">{t("today")}</span> : date.weekday}</p>
              <p className="font-heading text-lg font-bold leading-tight text-slate-900" data-testid={`match-date-${m.id}`}>{date.day}</p>
              <p className="text-xs text-slate-500">{m.hora || "--:--"}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {m.condicion === "local"
                  ? `${m.equipo_nombre} vs ${m.rival || "—"}`
                  : `${m.rival || "—"} vs ${m.equipo_nombre}`}
              </p>
              <p className="text-xs text-slate-500 capitalize">
                {m.tipo} · {t(m.condicion === "local" ? "home" : "away")}
                {m.jornada ? ` · J${m.jornada}` : ""}
                {!activeSeason && matchSeason(m) ? ` · ${matchSeason(m)}` : ""}
              </p>
              {(m.direccion_campo || m.campo) && <div className="mt-1">
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" aria-hidden="true" />{m.direccion_campo || m.campo}
                </p>
              </div>}
              <GoogleMapsLinks sources={m} className="mt-2" />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Resultado */}
            {m.estado === "jugado" && m.resultado_propio != null && (
              <span className="flex items-center gap-1.5">
                <span className="font-heading text-lg font-bold text-slate-900">
                  {m.condicion === "local"
                    ? `${m.resultado_propio}-${m.resultado_rival}`
                    : `${m.resultado_rival}-${m.resultado_propio}`}
                </span>
                {outcome && <span title={t(outcome[0])} aria-label={t(outcome[0])} data-testid={`match-outcome-${m.id}`}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${outcome[2]}`}>{t(outcome[1])}</span>}
              </span>
            )}
            <StatusBadge status={m.estado} />
            {canReadMatchReport && report && (
              <span data-testid={`match-report-status-${m.id}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${report[1]}`}>
                <ClipboardCheck className="h-3 w-3" aria-hidden="true" />{t(report[0])}
              </span>
            )}

            {/* Resumen convocatoria */}
            {convocados.length > 0 && (
              <div className="flex items-center gap-1 text-xs rounded-full bg-slate-100 px-2 py-1">
                <Users className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-slate-600 font-medium">{convocados.length}</span>
                {confirmados > 0 && <span className="text-green-600 flex items-center gap-0.5"><Check className="h-3 w-3" />{confirmados}</span>}
                {noPueden > 0 && <span className="text-red-500 flex items-center gap-0.5"><X className="h-3 w-3" />{noPueden}</span>}
                {pendientes > 0 && <span className="text-amber-500 flex items-center gap-0.5"><Clock className="h-3 w-3" />{pendientes}</span>}
              </div>
            )}

            {/* Botón convocatoria */}
            {(callup || canCreateCallup) && <Button variant="outline" size="sm" onClick={() => goToCallup(m)}
              className="h-8 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
              <ClipboardList className="h-3.5 w-3.5" />
              {callup ? t("viewCallup") : t("createCallup")}
            </Button>}

            {canReadMatchReport && <Button variant="outline" size="sm"
              aria-label={`${t("matchReportAction")} ${m.rival || t("matches")}`}
              data-testid={`match-report-${m.id}`} onClick={() => setReportMatch(m)}
              className="h-8 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
              <ClipboardCheck className="h-3.5 w-3.5" />{t("matchReportAction")}
            </Button>}

            {/* Expandir jugadores */}
            {convocados.length > 0 && (
              <Button variant="ghost" size="icon" aria-label={isExpanded ? t("hideCalledPlayers") : t("showCalledPlayers")}
                onClick={() => setExpanded(isExpanded ? null : m.id)}>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}

            <PermissionGate resource="matches" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${m.rival || t("matches")}`} data-testid={`edit-match-${m.id}`} onClick={() => openEdit(m)}>
              <Pencil className="h-4 w-4" />
            </Button></PermissionGate>
            <PermissionGate resource="matches" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${m.rival || t("matches")}`} data-testid={`delete-match-${m.id}`} onClick={() => remove(m)} className="text-red-500 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </Button></PermissionGate>
          </div>
        </div>

        {/* Panel expandible de jugadores convocados */}
        {isExpanded && convocados.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t("calledPlayers")}</p>
            <div className="flex flex-wrap gap-1.5">
              {convocados.map((cv) => (
                <span key={cv.player_id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
                    ${["confirmed", "confirmado"].includes(cv.estado) ? "bg-green-100 text-green-800"
                    : ["declined", "no_puede"].includes(cv.estado) ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-800"}`}>
                  {["confirmed", "confirmado"].includes(cv.estado) ? <Check className="h-3 w-3" />
                    : ["declined", "no_puede"].includes(cv.estado) ? <X className="h-3 w-3" />
                    : <Clock className="h-3 w-3" />}
                  {getPlayerName(cv.player_id)}
                </span>
              ))}
            </div>
            {callup?.hora_quedada && (
              <p className="text-xs text-slate-500 mt-2">
                📍 {t("meetingPoint")}: {callup.hora_quedada}{callup.lugar_quedada ? ` · ${callup.lugar_quedada}` : ""}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const section = (title, list, isPast, testid) => list.length > 0 && (
    <section className="space-y-3" data-testid={testid}>
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{title} <span className="text-slate-400">({list.length})</span></h2>
      {list.map((m) => renderMatch(m, isPast))}
    </section>
  );

  return (
    <div data-testid="matches-page">
      <PageHeader title={t("matches")} icon={CalendarDays}
        action={canCreate ? <Button data-testid="add-match-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newMatch")}</Button> : null} />

      {matches.length === 0 ? (
        <EmptyState icon={CalendarDays} message={t("noData")}
          action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newMatch")}</Button> : null} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative block">
              <span className="sr-only">{t("matchSearchPlaceholder")}</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input data-testid="match-search" placeholder={t("matchSearchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-10" />
            </label>
            <select aria-label={t("season")} data-testid="match-filter-season" className={filterClass} value={activeSeason} onChange={(e) => changeSeason(e.target.value)}>
              <option value="">{t("allSeasons")}</option>
              {unique([...seasonOptions, activeSeason]).map((season) => <option key={season} value={season}>{season}</option>)}
            </select>
            <select aria-label={t("ownTeam")} data-testid="match-filter-team" className={filterClass} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">{t("allTeams")}</option>
              {filterTeams.map((tm) => <option key={tm.id} value={tm.id}>{teamLabel(tm, t("noSeason"))}</option>)}
            </select>
            <select aria-label={t("status")} data-testid="match-filter-status" className={filterClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("allStatuses")}</option>
              {MATCH_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[lang]?.[status] || status}</option>)}
            </select>
          </div>

          {visibleMatches.length === 0 ? (
            <p className="surface-card p-6 text-center text-sm text-slate-500" data-testid="match-search-empty">{t("noSearchResults")}</p>
          ) : (
            <div className="space-y-6">
              {section(t("upcomingMatches"), upcoming, false, "matches-upcoming")}
              {section(t("pastMatches"), past, true, "matches-past")}
            </div>
          )}
        </>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("matches") : t("newMatch")}</DialogTitle></DialogHeader>
          <Datalist id="match-seasons-list" values={seasonOptions} />
          <Datalist id="match-fields-list" values={fieldOptions} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("ownTeam")} value={form.equipo_id} onChange={setTeam} options={teamOptions} testid="match-equipo" />
            <Field label={t("rival")} value={form.rival} onChange={set("rival")} testid="match-rival" />
            <Field label={t("date")} type="date" value={form.fecha} onChange={set("fecha")} testid="match-fecha" />
            <Field label={t("time")} type="time" value={form.hora} onChange={set("hora")} testid="match-hora" />
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="match-temporada" list="match-seasons-list" placeholder="2026-2027" />
            <Field label={t("matchday")} value={form.jornada} onChange={set("jornada")} testid="match-jornada" />
            <SelectField label={t("homeAway")} value={form.condicion} onChange={set("condicion")} options={[{value:"local",label:t("home")},{value:"visitante",label:t("away")}]} testid="match-condicion" />
            <SelectField label={t("matchType")} value={form.tipo} onChange={set("tipo")} options={["liga","copa","amistoso","torneo"].map(s=>({value:s,label:s}))} testid="match-tipo" />
            <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="match-campo" list="match-fields-list" />
            <Field label={t("fieldAddress")} value={form.direccion_campo} onChange={set("direccion_campo")} testid="match-direccion" list="match-fields-list" />
            <div className="sm:col-span-2"><GoogleMapsLinks preview sources={form} /></div>
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={MATCH_STATUSES.map(s=>({value:s,label:STATUS_LABELS[lang]?.[s] || s}))} testid="match-estado" />
            <div />
            <Field label={t("ownResult")} type="number" value={form.resultado_propio} onChange={set("resultado_propio")} testid="match-res-propio" />
            <Field label={t("rivalResult")} type="number" value={form.resultado_rival} onChange={set("resultado_rival")} testid="match-res-rival" />
            <div className="sm:col-span-2"><Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="match-obs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="match-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {reportMatch && <MatchReport match={reportMatch} open={Boolean(reportMatch)} onOpenChange={(nextOpen) => { if (!nextOpen) setReportMatch(null); }} />}
    </div>
  );
};

export default Matches;
