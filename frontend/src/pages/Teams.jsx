import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Plus, Pencil, Trash2, Users, UserRound, Hash, MapPin, CalendarDays, Search, ChevronRight, RotateCcw, CopyPlus } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, SelectField } from "@/components/form";

const empty = { nombre: "", estado: "activo", limite_jugadores: 20 };
const UNASSIGNED_SEASON = "__sin_temporada__";
const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
const seasonValue = (team) => String(team?.temporada || "").trim() || UNASSIGNED_SEASON;
const seasonTestId = (season) => season === UNASSIGNED_SEASON ? "unassigned" : season.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

const Datalist = ({ id, values }) => (
  <datalist id={id}>
    {unique(values).map((value) => <option key={value} value={value} />)}
  </datalist>
);

const Teams = () => {
  const canCreate = usePermission("teams", "create");
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({ temporadas: [], campos: [], entrenadores: [] });
  const [dialog, setDialog] = useState(false);
  const [seasonCopyDialog, setSeasonCopyDialog] = useState(false);
  const [seasonCopying, setSeasonCopying] = useState(false);
  const [seasonCopyForm, setSeasonCopyForm] = useState({ source_season: "", target_season: "" });
  const [squadDialog, setSquadDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [form, setForm] = useState(empty);
  const [selectedSeason, setSelectedSeason] = useState(() => params.get("temporada") || "");
  const [teamSearch, setTeamSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const openedSearchResult = useRef("");

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setTeams((await api.get("/teams")).data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    Promise.all([api.get("/categories"), api.get("/catalog-options")])
      .then(([cat, cfg]) => { setCategories(cat.data); setSettings(cfg.data || {}); })
      .catch(() => { /* Los equipos siguen siendo utilizables aunque falle el catálogo auxiliar. */ });
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const nextSeason = (value) => {
    const text = String(value || "").trim();
    const parts = text.split("-", 2);
    if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) return `${Number(parts[1])}-${Number(parts[1]) + 1}`;
    if (/^\d+$/.test(text)) return String(Number(text) + 1);
    return "";
  };
  const openSeasonCopy = () => {
    const source = activeSeason && activeSeason !== UNASSIGNED_SEASON
      && seasonCards.some((card) => card.value === activeSeason && card.teams > 0)
      ? activeSeason
      : seasonCards.find((card) => card.value !== UNASSIGNED_SEASON && card.teams > 0)?.value || "";
    setSeasonCopyForm({ source_season: source, target_season: nextSeason(source) });
    setSeasonCopyDialog(true);
  };
  const copySeason = async () => {
    const source = seasonCopyForm.source_season.trim();
    const target = seasonCopyForm.target_season.trim();
    if (!source || !target) { toast.error(t("seasonCopyRequired")); return; }
    if (source === target) { toast.error(t("seasonCopyDifferent")); return; }
    if (seasonCards.some((card) => card.value === target)) { toast.error(t("seasonAlreadyExists")); return; }
    if (!window.confirm(t("seasonCopyConfirm"))) return;
    setSeasonCopying(true);
    try {
      const { data } = await api.post("/teams/season-copy", { source_season: source, target_season: target });
      toast.success(`${t("seasonCopySuccess")} ${data.teams_created} ${t("teamsCount")} · ${data.players_assigned} ${t("playersCount")}`);
      setSeasonCopyDialog(false);
      setSelectedSeason(target);
      const next = new URLSearchParams(params);
      next.set("temporada", target);
      setParams(next, { replace: true });
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("seasonCopyError"));
    } finally {
      setSeasonCopying(false);
    }
  };
  const openEdit = (t) => { setForm(t); setDialog(true); };
  const save = async () => {
    if (!form.nombre?.trim()) { toast.error("Nombre obligatorio"); return; }
    if (form.id) await api.put(`/teams/${form.id}`, form);
    else await api.post("/teams", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (tm) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/teams/${tm.id}`); toast.success(t("deleted")); load(); };
  const openSquad = async (tm) => {
    setSelectedTeam({ ...tm, jugadores: [] });
    setSquadDialog(true);
    setLoadingSquad(true);
    try {
      setSelectedTeam((await api.get(`/teams/${tm.id}`)).data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo cargar la plantilla");
      setSquadDialog(false);
    } finally {
      setLoadingSquad(false);
    }
  };
  useEffect(() => {
    const teamId = params.get("ficha");
    const team = teams.find((item) => item.id === teamId);
    if (team && openedSearchResult.current !== teamId) { openedSearchResult.current = teamId; openSquad(team); }
  }, [teams, params]);
  const seasonOptions = useMemo(() => unique([
    ...(settings.temporadas || []),
    settings.temporada_actual,
    ...teams.map((team) => team.temporada),
  ]), [settings.temporada_actual, settings.temporadas, teams]);
  const seasonCards = useMemo(() => {
    const cards = seasonOptions.map((season) => {
      const seasonTeams = teams.filter((team) => seasonValue(team) === season);
      return {
        value: season,
        teams: seasonTeams.length,
        players: seasonTeams.reduce((total, team) => total + (Number(team.num_jugadores) || 0), 0),
      };
    });
    if (teams.some((team) => seasonValue(team) === UNASSIGNED_SEASON)) {
      const unassignedTeams = teams.filter((team) => seasonValue(team) === UNASSIGNED_SEASON);
      cards.push({
        value: UNASSIGNED_SEASON,
        teams: unassignedTeams.length,
        players: unassignedTeams.reduce((total, team) => total + (Number(team.num_jugadores) || 0), 0),
      });
    }
    return cards;
  }, [seasonOptions, teams]);
  const categoryOptions = useMemo(() => unique([
    ...categories.map((category) => category.name),
    ...teams.map((team) => team.categoria),
  ]), [categories, teams]);
  useEffect(() => {
    if (!seasonCards.length) return;
    const requested = params.get("temporada");
    const available = seasonCards.map((card) => card.value);
    const preferred = requested && available.includes(requested)
      ? requested
      : settings.temporada_actual && available.includes(settings.temporada_actual)
        ? settings.temporada_actual
        : seasonCards[0].value;
    if (!selectedSeason || !available.includes(selectedSeason)) setSelectedSeason(preferred);
  }, [params, seasonCards, selectedSeason, settings.temporada_actual]);
  const selectSeason = (season) => {
    setSelectedSeason(season);
    setTeamSearch("");
    setCategoryFilter("all");
    const next = new URLSearchParams(params);
    if (season === UNASSIGNED_SEASON) next.delete("temporada");
    else next.set("temporada", season);
    setParams(next, { replace: true });
  };
  const activeSeason = selectedSeason || seasonCards[0]?.value || "";
  const selectedSeasonLabel = activeSeason === UNASSIGNED_SEASON ? t("unassignedSeason") : activeSeason || t("seasonFoldersTitle");
  const seasonTeams = useMemo(() => teams.filter((team) => seasonValue(team) === activeSeason), [activeSeason, teams]);
  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLocaleLowerCase();
    return seasonTeams.filter((team) => {
      const matchesCategory = categoryFilter === "all" || team.categoria === categoryFilter;
      if (!matchesCategory) return false;
      if (!query) return true;
      return [team.nombre, team.categoria, team.entrenador, team.segundo_entrenador, team.campo]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [categoryFilter, seasonTeams, teamSearch]);
  const clearTeamFilters = () => { setTeamSearch(""); setCategoryFilter("all"); };
  const fieldOptions = useMemo(() => unique([...(settings.campos || []), ...teams.map((team) => team.campo)]), [settings.campos, teams]);
  const coachOptions = useMemo(() => unique([...(settings.entrenadores || []), ...teams.flatMap((team) => [team.entrenador, team.segundo_entrenador])]), [settings.entrenadores, teams]);

  return (
    <div data-testid="teams-page">
      <PageHeader title={t("teams")} subtitle={t("teamsIntro")} icon={Shield}
        action={canCreate ? <div className="flex flex-wrap justify-end gap-2"><Button data-testid="create-season-btn" onClick={openSeasonCopy} variant="outline" className="h-11 border-[#93C8EE] bg-white px-4 text-[#1B5C8F] hover:bg-[#F5FAFE]"><CopyPlus className="h-5 w-5" />{t("createNextSeason")}</Button><Button data-testid="add-team-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newTeam")}</Button></div> : null} />

      {loading ? (
        <div className="space-y-4" role="status" aria-label={t("loading")}>
          <div className="h-40 animate-pulse rounded-3xl bg-slate-200/70" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" /></div>
        </div>
      ) : loadError ? (
        <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
          <Shield className="mb-3 h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="font-semibold text-slate-800">{t("loadError")}</p>
          <Button onClick={load} variant="outline" className="mt-4">{t("retry")}</Button>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState icon={Shield} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newTeam")}</Button> : null} />
      ) : (
        <>
          <section className="relative mb-8 overflow-hidden rounded-3xl border border-[#1B5C8F]/20 bg-gradient-to-br from-[#0E3554] via-[#1B5C8F] to-[#2B75B0] p-5 text-white shadow-[0_18px_42px_rgba(14,53,84,0.18)] sm:p-7" aria-labelledby="teams-overview-title">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#93C8EE]/20 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#CFE9FA]">{t("teamsSummary")}</p>
                <h2 id="teams-overview-title" className="mt-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{t("seasonFoldersTitle")}</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-sky-50/80">{t("seasonFoldersDescription")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="min-w-24 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-sky-100/70">{t("seasonFoldersTitle")}</p><p className="mt-1 text-2xl font-extrabold">{seasonOptions.length}</p></div>
                <div className="min-w-24 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-sky-100/70">{t("teams")}</p><p className="mt-1 text-2xl font-extrabold">{teams.length}</p></div>
                <div className="min-w-24 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-sky-100/70">{t("players")}</p><p className="mt-1 text-2xl font-extrabold">{teams.reduce((total, team) => total + (Number(team.num_jugadores) || 0), 0)}</p></div>
              </div>
            </div>
          </section>

          <section className="mb-8" aria-labelledby="teams-seasons-title">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="teams-seasons-title" className="font-heading text-xl font-extrabold text-[#0E3554] sm:text-2xl">{t("seasonFoldersTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">{t("seasonFoldersDescription")}</p>
              </div>
              {activeSeason && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EAF6FD] px-3 py-1.5 text-xs font-bold text-[#1B5C8F]"><CalendarDays className="h-3.5 w-3.5" />{selectedSeasonLabel}</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {seasonCards.map((card) => {
                const selected = card.value === activeSeason;
                const label = card.value === UNASSIGNED_SEASON ? t("unassignedSeason") : card.value;
                return (
                  <button
                    type="button"
                    key={card.value}
                    data-testid={`season-card-${seasonTestId(card.value)}`}
                    aria-pressed={selected}
                    onClick={() => selectSeason(card.value)}
                    className={`surface-card group min-h-36 p-5 text-left transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-[#2B75B0] bg-[#F5FAFE] shadow-[0_16px_34px_rgba(43,117,176,0.18)]" : "hover:border-[#93C8EE]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? "bg-[#1B5C8F] text-white" : "bg-[#EAF6FD] text-[#2B75B0]"}`}><CalendarDays className="h-5 w-5" /></span>
                      <ChevronRight className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${selected ? "text-[#1B5C8F]" : "text-slate-300"}`} aria-hidden="true" />
                    </div>
                    <p className="mt-4 font-heading text-lg font-extrabold text-[#0E3554]">{label}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500"><span>{card.teams} {t("teamsCount")}</span><span>{card.players} {t("playersCount")}</span></div>
                    <p className={`mt-3 text-xs font-bold ${selected ? "text-[#1B5C8F]" : "text-slate-400"}`}>{selected ? t("selectedSeason") : t("viewTeams")}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="season-teams-title">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2F7EBE]">{t("season")}</p>
                <h2 id="season-teams-title" className="mt-1 font-heading text-2xl font-extrabold text-[#0E3554]">{selectedSeasonLabel}</h2>
                <p className="mt-1 text-sm text-slate-500">{seasonTeams.length} {t("teamsCount")} · {seasonTeams.reduce((total, team) => total + (Number(team.num_jugadores) || 0), 0)} {t("playersCount")}</p>
              </div>
              <div className="rounded-2xl border border-[#CFE9FA] bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><span className="font-bold text-[#0E3554]">{filteredTeams.length}</span>/{seasonTeams.length} {t("teamsCount")}</div>
            </div>

            <div className="surface-card mb-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,260px)_auto] sm:items-end sm:p-5">
              <div className="space-y-1.5">
                <label htmlFor="team-search" className="text-sm font-semibold text-slate-700">{t("searchTeams")}</label>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input id="team-search" data-testid="team-search" value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder={t("searchTeamsPlaceholder")} className="h-11 pl-10" /></div>
              </div>
              <SelectField label={t("category")} value={categoryFilter} onChange={setCategoryFilter} options={[{ value: "all", label: t("allCategories") }, ...categoryOptions.map((category) => ({ value: category, label: category }))]} testid="team-category-filter" />
              {(teamSearch || categoryFilter !== "all") && <Button type="button" variant="ghost" onClick={clearTeamFilters} className="h-11"><RotateCcw className="h-4 w-4" />{t("clearTeamFilters")}</Button>}
            </div>

            {filteredTeams.length === 0 ? (
              <EmptyState icon={Users} message={seasonTeams.length ? t("noFilteredTeams") : t("seasonNoTeams")} action={seasonTeams.length && (teamSearch || categoryFilter !== "all") ? <Button variant="outline" onClick={clearTeamFilters}>{t("clearTeamFilters")}</Button> : null} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTeams.map((tm) => (
            <div key={tm.id} data-testid={`team-card-${tm.id}`} role="button" tabIndex={0}
              aria-label={`Ver plantilla de ${tm.nombre}`} onClick={() => openSquad(tm)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSquad(tm); } }}
              className="surface-card interactive-card cursor-pointer p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Shield className="h-5 w-5" /></div>
                  <div>
                    <p className="font-heading font-bold text-slate-900">{tm.nombre}</p>
                    <p className="text-xs text-slate-500">{tm.categoria || "—"} · {tm.temporada || "—"}</p>
                  </div>
                </div>
                <StatusBadge status={tm.estado} />
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p><span className="font-medium">{t("coach")}:</span> {tm.entrenador || "—"}</p>
                <p><span className="font-medium">{t("schedule")}:</span> {tm.horario || "—"}</p>
                <p><span className="font-medium">{t("field")}:</span> {tm.campo || "—"}</p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Users className="h-4 w-4" />{tm.num_jugadores}/{tm.limite_jugadores} {t("playersCount")}</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1B5C8F]">{t("viewPlayers")}<ChevronRight className="h-4 w-4" /></span>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="flex gap-1">
                  <PermissionGate resource="teams" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${tm.nombre}`} data-testid={`edit-team-${tm.id}`} onClick={(event) => { event.stopPropagation(); openEdit(tm); }}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="teams" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${tm.nombre}`} data-testid={`delete-team-${tm.id}`} onClick={(event) => { event.stopPropagation(); remove(tm); }} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
            </div>
          ))}
              </div>
            )}
          </section>
        </>
      )}

      <Dialog open={squadDialog} onOpenChange={setSquadDialog}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Shield className="h-5 w-5" /></span>
              <span>{selectedTeam?.nombre || "Equipo"}<span className="block text-sm font-normal text-slate-500">Plantilla completa</span></span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><CalendarDays className="mb-1 h-4 w-4 text-primary" /><span className="font-semibold">Temporada</span><div className="text-slate-500">{selectedTeam?.temporada || "—"}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><Users className="mb-1 h-4 w-4 text-primary" /><span className="font-semibold">Jugadores</span><div className="text-slate-500">{selectedTeam?.jugadores?.length ?? selectedTeam?.num_jugadores ?? 0}/{selectedTeam?.limite_jugadores || "—"}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><MapPin className="mb-1 h-4 w-4 text-primary" /><span className="font-semibold">Campo</span><div className="text-slate-500">{selectedTeam?.campo || "—"}</div></div>
          </div>
          {loadingSquad ? (
            <div className="py-16 text-center text-sm text-slate-500">Cargando plantilla…</div>
          ) : !selectedTeam?.jugadores?.length ? (
            <EmptyState icon={Users} message="Este equipo todavía no tiene jugadores asignados" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_90px_minmax(110px,1fr)] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 sm:grid">
                <span>Jugador</span><span>Posición</span><span>Dorsal</span><span>Estado</span>
              </div>
              {selectedTeam.jugadores
                .slice().sort((a, b) => `${a.nombre} ${a.apellidos || ""}`.localeCompare(`${b.nombre} ${b.apellidos || ""}`))
                .map((player) => (
                  <div key={player.id} data-testid={`team-player-${player.id}`} className="grid grid-cols-2 items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_90px_minmax(110px,1fr)]">
                    <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{player.nombre} {player.apellidos || ""}</p><p className="truncate text-xs text-slate-400">{player.categoria || selectedTeam.categoria || "—"}</p></div></div>
                    <span className="text-right text-slate-600 sm:text-left"><span className="text-xs font-bold uppercase text-slate-400 sm:hidden">Posición · </span>{player.posicion || "—"}</span>
                    <span className="inline-flex items-center gap-1 text-slate-600"><Hash className="h-3.5 w-3.5" /><span className="text-xs font-bold uppercase text-slate-400 sm:hidden">Dorsal </span>{player.dorsal || "—"}</span>
                    <div className="flex justify-end sm:block"><StatusBadge status={player.estado} /></div>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? form.nombre : t("newTeam")}</DialogTitle></DialogHeader>
          <Datalist id="team-seasons-list" values={seasonOptions} />
          <Datalist id="team-fields-list" values={fieldOptions} />
          <Datalist id="team-coaches-list" values={coachOptions} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Field label={t("name")} value={form.nombre} onChange={set("nombre")} testid="team-nombre" />
            <SelectField label={t("category")} value={form.categoria} onChange={set("categoria")} options={categories.map(c=>({value:c.name,label:c.name}))} testid="team-categoria" />
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="team-temporada" list="team-seasons-list" placeholder="2026-2027" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["activo","cerrado","pendiente"].map(s=>({value:s,label:s}))} testid="team-estado" />
            <Field label={t("coach")} value={form.entrenador} onChange={set("entrenador")} testid="team-entrenador" list="team-coaches-list" />
            <Field label={t("secondCoach")} value={form.segundo_entrenador} onChange={set("segundo_entrenador")} testid="team-segundo" list="team-coaches-list" />
            <Field label={t("delegate")} value={form.delegado} onChange={set("delegado")} testid="team-delegado" />
            <Field label={t("trainingDays")} value={form.dias_entrenamiento} onChange={set("dias_entrenamiento")} testid="team-dias" />
            <Field label={t("schedule")} value={form.horario} onChange={set("horario")} testid="team-horario" />
            <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="team-campo" list="team-fields-list" />
            <Field label={t("maxPlayers")} type="number" value={form.limite_jugadores} onChange={set("limite_jugadores")} testid="team-limite" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="team-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seasonCopyDialog} onOpenChange={(open) => !seasonCopying && setSeasonCopyDialog(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 font-heading"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF6FD] text-[#1B5C8F]"><CopyPlus className="h-5 w-5" /></span>{t("createNextSeasonTitle")}</DialogTitle>
            <DialogDescription>{t("createNextSeasonDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <SelectField label={t("sourceSeason")} value={seasonCopyForm.source_season} onChange={(value) => setSeasonCopyForm((current) => ({ ...current, source_season: value, target_season: nextSeason(value) }))} options={seasonCards.filter((card) => card.value !== UNASSIGNED_SEASON && card.teams > 0).map((card) => ({ value: card.value, label: card.value }))} testid="season-copy-source" />
            <Field label={t("targetSeason")} value={seasonCopyForm.target_season} onChange={(value) => setSeasonCopyForm((current) => ({ ...current, target_season: value }))} testid="season-copy-target" placeholder="2027-2028" />
            <div className="rounded-2xl border border-[#CFE9FA] bg-[#F5FAFE] p-4 text-sm leading-relaxed text-slate-600">{t("seasonCopyWarning")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonCopyDialog(false)} disabled={seasonCopying}>{t("cancel")}</Button>
            <Button onClick={copySeason} disabled={seasonCopying} data-testid="season-copy-submit" className="h-11 px-6"><CopyPlus className="h-4 w-4" />{seasonCopying ? t("copyingSeason") : t("createNextSeason")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Teams;
