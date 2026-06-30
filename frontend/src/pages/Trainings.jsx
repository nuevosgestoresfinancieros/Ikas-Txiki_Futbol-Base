import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Dumbbell, Plus, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, EmptyState, initials } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const ATT_STATES = ["presente", "justificada", "injustificada", "lesion"];

const Trainings = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ asistencia: [] });

  const load = async () => setItems((await api.get("/trainings")).data);
  useEffect(() => {
    load();
    Promise.all([api.get("/teams"), api.get("/players")]).then(([tm, p]) => { setTeams(tm.data); setPlayers(p.data); });
    if (params.get("new")) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm({ asistencia: [], equipo_id: "" }); setDialog(true); };
  const openEdit = (i) => { setForm({ ...i, asistencia: i.asistencia || [] }); setDialog(true); };

  const teamPlayers = players.filter((p) => p.equipo_id === form.equipo_id);
  const onTeamChange = (id) => {
    const tp = players.filter((p) => p.equipo_id === id);
    setForm((f) => ({ ...f, equipo_id: id, asistencia: tp.map((p) => ({ player_id: p.id, estado: "presente" })) }));
  };
  const setAtt = (pid, estado) => setForm((f) => ({ ...f, asistencia: f.asistencia.map((a) => a.player_id === pid ? { ...a, estado } : a) }));

  const save = async () => {
    if (form.id) await api.put(`/trainings/${form.id}`, form);
    else await api.post("/trainings", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (i) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/trainings/${i.id}`); toast.success(t("deleted")); load(); };

  const teamOptions = teams.map((tm) => ({ value: tm.id, label: tm.nombre }));
  const pName = (pid) => { const p = players.find(x=>x.id===pid); return p ? `${p.nombre} ${p.apellidos||""}`.trim() : "—"; };

  return (
    <div data-testid="trainings-page">
      <PageHeader title={t("trainings")} icon={Dumbbell}
        action={<Button data-testid="add-training-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button>} />

      {items.length === 0 ? (
        <EmptyState icon={Dumbbell} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button>} />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} data-testid={`training-card-${i.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-4 hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Dumbbell className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold text-slate-800">{i.equipo_nombre}</p>
                  <p className="text-xs text-slate-500">{i.fecha} · {i.hora || "--:--"} · {i.campo || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600"><Check className="h-4 w-4" />{i.presentes}/{i.total_asistencia} {t("present_short").toLowerCase()}</span>
                <Button variant="ghost" size="icon" data-testid={`edit-training-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" data-testid={`delete-training-${i.id}`} onClick={() => remove(i)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("manageAttendance") : t("trainings")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label={t("team")} value={form.equipo_id} onChange={onTeamChange} options={teamOptions} testid="training-equipo" />
              <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="training-campo" />
              <Field label={t("date")} type="date" value={form.fecha} onChange={set("fecha")} testid="training-fecha" />
              <Field label={t("time")} type="time" value={form.hora} onChange={set("hora")} testid="training-hora" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t("attendance")}</p>
              {form.asistencia.length === 0 ? <p className="text-sm text-slate-400">{t("team")}…</p> :
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {form.asistencia.map((a) => (
                    <div key={a.player_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{initials(...(pName(a.player_id).split(" ")))}</div>
                      <span className="flex-1 text-sm font-medium text-slate-700">{pName(a.player_id)}</span>
                      <Select value={a.estado} onValueChange={(v) => setAtt(a.player_id, v)}>
                        <SelectTrigger className="h-8 w-40 text-xs" data-testid={`att-${a.player_id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ATT_STATES.map((s) => <SelectItem key={s} value={s}>{t(s)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>}
            </div>
            <Area label={t("exercises")} value={form.ejercicios} onChange={set("ejercicios")} testid="training-ejercicios" />
            <Area label={t("coachNotes")} value={form.observaciones} onChange={set("observaciones")} testid="training-obs" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="training-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Trainings;
