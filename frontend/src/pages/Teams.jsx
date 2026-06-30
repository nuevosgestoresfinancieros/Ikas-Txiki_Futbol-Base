import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, SelectField } from "@/components/form";

const empty = { nombre: "", estado: "activo", limite_jugadores: 20 };

const Teams = () => {
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
    if (params.get("new")) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
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

  return (
    <div data-testid="teams-page">
      <PageHeader title={t("teams")} icon={Shield}
        action={<Button data-testid="add-team-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newTeam")}</Button>} />

      {teams.length === 0 ? (
        <EmptyState icon={Shield} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newTeam")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((tm) => (
            <div key={tm.id} data-testid={`team-card-${tm.id}`} className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-5 transition-all hover:-translate-y-1 hover:shadow-md">
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
                  <Button variant="ghost" size="icon" data-testid={`edit-team-${tm.id}`} onClick={() => openEdit(tm)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" data-testid={`delete-team-${tm.id}`} onClick={() => remove(tm)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
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
            <Field label={t("trainingDays")} value={form.dias_entrenamiento} onChange={set("dias_entrenamiento")} testid="team-dias" />
            <Field label={t("schedule")} value={form.horario} onChange={set("horario")} testid="team-horario" />
            <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="team-campo" />
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
