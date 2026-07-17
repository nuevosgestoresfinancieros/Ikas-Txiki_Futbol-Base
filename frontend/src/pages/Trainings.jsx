import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Dumbbell, Plus, Pencil, Trash2, Check, Download, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
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
  const canCreate = usePermission("trainings", "create");
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ asistencia: [] });
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");

  const load = async () => {
    try {
      const [trainingResponse, attendanceResponse] = await Promise.all([
        api.get("/trainings", { params: teamFilter !== "all" ? { equipo_id: teamFilter } : {} }),
        api.get("/attendance/summary", { params: teamFilter !== "all" ? { equipo_id: teamFilter } : {} }),
      ]);
      setItems(trainingResponse.data); setSummary(attendanceResponse.data); setSummaryError(false);
    } catch { setSummaryError(true); }
  };
  useEffect(() => {
    load();
    Promise.all([api.get("/teams"), api.get("/players")]).then(([tm, p]) => { setTeams(tm.data); setPlayers(p.data); });
    if (params.get("new") && canCreate) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  useEffect(() => { if (teams.length || teamFilter === "all") load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [teamFilter]);

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
  const download = async (type) => {
    try {
      const response = await api.get(`/attendance/export.${type}`, { params: { ...(teamFilter !== "all" ? { equipo_id: teamFilter } : {}), lang }, responseType: "blob" });
      const url = URL.createObjectURL(response.data); const link = document.createElement("a");
      link.href = url; link.download = `asistencia.${type === "pdf" ? "pdf" : "xlsx"}`; link.click(); URL.revokeObjectURL(url);
    } catch { toast.error(t("attendanceExportError")); }
  };

  const teamOptions = teams.map((tm) => ({ value: tm.id, label: tm.nombre }));
  const pName = (pid) => { const p = players.find(x=>x.id===pid); return p ? `${p.nombre} ${p.apellidos||""}`.trim() : "—"; };

  return (
    <div data-testid="trainings-page">
      <PageHeader title={t("trainings")} icon={Dumbbell}
        action={canCreate ? <Button data-testid="add-training-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />

      <section className="surface-card mb-5 p-4" aria-label={t("attendance")}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:w-64"><SelectField label={t("team")} value={teamFilter} onChange={setTeamFilter} options={[{ value: "all", label: t("allTeams") }, ...teamOptions]} testid="attendance-team-filter" /></div>
          <PermissionGate resource="attendance" action="export"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => download("pdf")}><FileText className="h-4 w-4" />PDF</Button><Button variant="outline" size="sm" onClick={() => download("xlsx")}><Download className="h-4 w-4" />Excel</Button></div></PermissionGate>
        </div>
        {summaryError ? <div className="flex items-center justify-between text-sm text-red-600"><span>{t("attendanceLoadError")}</span><Button variant="link" onClick={load}>{t("retry")}</Button></div> : !summary ? <p className="text-sm text-slate-400">{t("loading")}</p> : <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["presente", "present"], ["justificada", "justified"], ["injustificada", "unjustified"], ["lesion", "injury"]].map(([key, label]) => <div key={key} className="rounded-lg bg-slate-50 p-3 text-center"><p className="font-heading text-xl font-bold text-slate-800">{summary.summary[key]}</p><p className="text-xs text-slate-500">{t(label)}</p></div>)}
            <div className="rounded-lg bg-primary/5 p-3 text-center"><p className="font-heading text-xl font-bold text-primary">{summary.summary.porcentaje_presencia}%</p><p className="text-xs text-slate-500">{t("attendanceRate")}</p></div>
          </div>
          {summary.alerts?.length > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" />{summary.alerts.length} {t("attendanceAlerts")}</div>}
        </>}
      </section>

      {items.length === 0 ? (
        <EmptyState icon={Dumbbell} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} data-testid={`training-card-${i.id}`} className="surface-card interactive-card flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Dumbbell className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold text-slate-800">{i.equipo_nombre}</p>
                  <p className="text-xs text-slate-500">{i.fecha} · {i.hora || "--:--"} · {i.campo || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600"><Check className="h-4 w-4" />{i.presentes}/{i.total_asistencia} {t("present_short").toLowerCase()}</span>
                <PermissionGate resource="trainings" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${i.fecha || t("trainings")}`} data-testid={`edit-training-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                <PermissionGate resource="trainings" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${i.fecha || t("trainings")}`} data-testid={`delete-training-${i.id}`} onClick={() => remove(i)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
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
                      <input value={a.motivo || ""} onChange={(event) => setForm((f) => ({ ...f, asistencia: f.asistencia.map((row) => row.player_id === a.player_id ? { ...row, motivo: event.target.value } : row) }))}
                        aria-label={t("attendanceReason")} placeholder={t("attendanceReason")} className="hidden h-8 w-40 rounded border border-slate-200 px-2 text-xs sm:block" />
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
