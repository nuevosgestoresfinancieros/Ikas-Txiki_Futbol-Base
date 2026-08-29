import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Plus, Pencil, Trash2, Users, UserRound, Hash, MapPin, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, SelectField } from "@/components/form";

const empty = { nombre: "", estado: "activo", limite_jugadores: 20 };
const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));

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
  const [squadDialog, setSquadDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [form, setForm] = useState(empty);
  const openedSearchResult = useRef("");

  const load = async () => setTeams((await api.get("/teams")).data);
  useEffect(() => {
    load();
    Promise.all([api.get("/categories"), api.get("/catalog-options")])
      .then(([cat, cfg]) => { setCategories(cat.data); setSettings(cfg.data || {}); });
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, params]);
  const seasonOptions = useMemo(() => unique([...(settings.temporadas || []), ...teams.map((team) => team.temporada)]), [settings.temporadas, teams]);
  const fieldOptions = useMemo(() => unique([...(settings.campos || []), ...teams.map((team) => team.campo)]), [settings.campos, teams]);
  const coachOptions = useMemo(() => unique([...(settings.entrenadores || []), ...teams.flatMap((team) => [team.entrenador, team.segundo_entrenador])]), [settings.entrenadores, teams]);

  return (
    <div data-testid="teams-page">
      <PageHeader title={t("teams")} icon={Shield}
        action={canCreate ? <Button data-testid="add-team-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newTeam")}</Button> : null} />

      {teams.length === 0 ? (
        <EmptyState icon={Shield} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newTeam")}</Button> : null} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((tm) => (
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
                <div className="flex gap-1">
                  <PermissionGate resource="teams" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${tm.nombre}`} data-testid={`edit-team-${tm.id}`} onClick={(event) => { event.stopPropagation(); openEdit(tm); }}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="teams" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${tm.nombre}`} data-testid={`delete-team-${tm.id}`} onClick={(event) => { event.stopPropagation(); remove(tm); }} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
};

export default Teams;
