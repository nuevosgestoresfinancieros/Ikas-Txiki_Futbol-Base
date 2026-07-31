import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, SelectField } from "@/components/form";
import GoogleMapsLinks from "@/components/GoogleMapsLinks";
import { TRAINING_DAYS, scheduleText, teamFormFromRecord, teamPayload } from "./teamScheduleView";

const empty = { nombre: "", estado: "activo", limite_jugadores: 20, dias_entrenamiento_lista: [], hora_inicio: "", hora_fin: "", direccion_campo: "" };

const Teams = () => {
  const canCreate = usePermission("teams", "create");
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setTeams((await api.get("/teams")).data);
  useEffect(() => {
    load();
    api.get("/categories").then((r) => setCategories(r.data));
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (t) => { setForm(teamFormFromRecord(t)); setDialog(true); };
  const save = async () => {
    if (!form.nombre?.trim()) { toast.error("Nombre obligatorio"); return; }
    const payload = teamPayload(form, t);
    if (form.id) await api.put(`/teams/${form.id}`, payload);
    else await api.post("/teams", payload);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (tm) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/teams/${tm.id}`); toast.success(t("deleted")); load(); };

  return (
    <div data-testid="teams-page">
      <PageHeader title={t("teams")} icon={Shield}
        action={canCreate ? <Button data-testid="add-team-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newTeam")}</Button> : null} />

      {teams.length === 0 ? (
        <EmptyState icon={Shield} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newTeam")}</Button> : null} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((tm) => (
            <div key={tm.id} data-testid={`team-card-${tm.id}`} className="surface-card interactive-card p-5">
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
                <p><span className="font-medium">{t("schedule")}:</span> {scheduleText(tm.hora_inicio, tm.hora_fin, tm.horario) || "—"}</p>
                <p><span className="font-medium">{t("field")}:</span> {tm.campo || "—"}</p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Users className="h-4 w-4" />{tm.num_jugadores}/{tm.limite_jugadores} {t("playersCount")}</span>
                <div className="flex gap-1">
                  <PermissionGate resource="teams" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${tm.nombre}`} data-testid={`edit-team-${tm.id}`} onClick={() => openEdit(tm)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="teams" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${tm.nombre}`} data-testid={`delete-team-${tm.id}`} onClick={() => remove(tm)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? form.nombre : t("newTeam")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Field label={t("name")} value={form.nombre} onChange={set("nombre")} testid="team-nombre" />
            <SelectField label={t("category")} value={form.categoria} onChange={set("categoria")} options={categories.map(c=>({value:c.name,label:c.name}))} testid="team-categoria" />
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="team-temporada" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["activo","cerrado","pendiente"].map(s=>({value:s,label:s}))} testid="team-estado" />
            <Field label={t("coach")} value={form.entrenador} onChange={set("entrenador")} testid="team-entrenador" />
            <Field label={t("secondCoach")} value={form.segundo_entrenador} onChange={set("segundo_entrenador")} testid="team-segundo" />
            <Field label={t("delegate")} value={form.delegado} onChange={set("delegado")} testid="team-delegado" />
            <fieldset className="sm:col-span-2 space-y-2" data-testid="team-training-days">
              <legend className="text-sm font-semibold text-slate-700">{t("trainingDays")}</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("trainingDays")}>
                {TRAINING_DAYS.map(({ code, labelKey }) => {
                  const selected = (form.dias_entrenamiento_lista || []).includes(code);
                  return <Button key={code} type="button" variant={selected ? "default" : "outline"} aria-pressed={selected} data-testid={`team-day-${code}`} className="min-h-11" onClick={() => setForm((current) => ({ ...current, dias_entrenamiento_lista: selected ? current.dias_entrenamiento_lista.filter((day) => day !== code) : [...(current.dias_entrenamiento_lista || []), code] }))}>{t(labelKey)}</Button>;
                })}
              </div>
            </fieldset>
            <Field label={t("startTime")} type="time" value={form.hora_inicio} onChange={set("hora_inicio")} testid="team-start-time" />
            <Field label={t("endTime")} type="time" value={form.hora_fin} onChange={set("hora_fin")} testid="team-end-time" />
            <Field label={t("fieldOrFacility")} value={form.campo} onChange={set("campo")} testid="team-campo" />
            <Field label={t("fieldFullAddress")} value={form.direccion_campo} onChange={set("direccion_campo")} testid="team-field-address" />
            <div className="sm:col-span-2"><GoogleMapsLinks preview sources={form} /></div>
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
