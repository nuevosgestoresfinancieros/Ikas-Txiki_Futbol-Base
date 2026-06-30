import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { condicion: "local", tipo: "liga", estado: "programado" };

const Matches = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setMatches((await api.get("/matches")).data);
  useEffect(() => {
    load();
    api.get("/teams").then((r) => setTeams(r.data));
    if (params.get("new")) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (m) => { setForm(m); setDialog(true); };
  const save = async () => {
    if (form.id) await api.put(`/matches/${form.id}`, form);
    else await api.post("/matches", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (m) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/matches/${m.id}`); toast.success(t("deleted")); load(); };

  const teamOptions = teams.map((tm) => ({ value: tm.id, label: tm.nombre }));

  return (
    <div data-testid="matches-page">
      <PageHeader title={t("matches")} icon={CalendarDays}
        action={<Button data-testid="add-match-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newMatch")}</Button>} />

      {matches.length === 0 ? (
        <EmptyState icon={CalendarDays} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newMatch")}</Button>} />
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} data-testid={`match-card-${m.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-4 hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="text-center min-w-[60px]">
                  <p className="font-heading text-lg font-bold text-slate-900">{m.fecha?.slice(5) || "--"}</p>
                  <p className="text-xs text-slate-500">{m.hora || "--:--"}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">
                    {m.condicion === "local" ? `${m.equipo_nombre} vs ${m.rival || "—"}` : `${m.rival || "—"} vs ${m.equipo_nombre}`}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{m.tipo} · {t(m.condicion === "local" ? "home" : "away")} {m.jornada ? `· J${m.jornada}` : ""}</p>
                  {m.campo && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{m.campo}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {m.estado === "jugado" && (m.resultado_propio != null) && (
                  <span className="font-heading text-lg font-bold text-slate-900">{m.condicion === "local" ? `${m.resultado_propio}-${m.resultado_rival}` : `${m.resultado_rival}-${m.resultado_propio}`}</span>
                )}
                <StatusBadge status={m.estado} />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" data-testid={`edit-match-${m.id}`} onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" data-testid={`delete-match-${m.id}`} onClick={() => remove(m)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("matches") : t("newMatch")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("ownTeam")} value={form.equipo_id} onChange={set("equipo_id")} options={teamOptions} testid="match-equipo" />
            <Field label={t("rival")} value={form.rival} onChange={set("rival")} testid="match-rival" />
            <Field label={t("date")} type="date" value={form.fecha} onChange={set("fecha")} testid="match-fecha" />
            <Field label={t("time")} type="time" value={form.hora} onChange={set("hora")} testid="match-hora" />
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="match-temporada" />
            <Field label={t("matchday")} value={form.jornada} onChange={set("jornada")} testid="match-jornada" />
            <SelectField label={t("homeAway")} value={form.condicion} onChange={set("condicion")} options={[{value:"local",label:t("home")},{value:"visitante",label:t("away")}]} testid="match-condicion" />
            <SelectField label={t("matchType")} value={form.tipo} onChange={set("tipo")} options={["liga","copa","amistoso","torneo"].map(s=>({value:s,label:s}))} testid="match-tipo" />
            <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="match-campo" />
            <Field label={t("fieldAddress")} value={form.direccion_campo} onChange={set("direccion_campo")} testid="match-direccion" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["programado","jugado","aplazado","suspendido","cancelado"].map(s=>({value:s,label:s}))} testid="match-estado" />
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
    </div>
  );
};

export default Matches;
