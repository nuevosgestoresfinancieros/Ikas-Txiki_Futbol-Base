import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Plus, Pencil, Trash2, Check, X, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState, initials } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const Callups = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [callups, setCallups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ match_id: "", convocados: [] });

  const load = async () => setCallups((await api.get("/callups")).data);
  useEffect(() => {
    load();
    Promise.all([api.get("/matches"), api.get("/players")]).then(([m, p]) => { setMatches(m.data); setPlayers(p.data); });
    if (params.get("new")) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const openNew = () => { setForm({ match_id: "", equipo_id: "", convocados: [] }); setDialog(true); };
  const openEdit = (c) => { setForm({ ...c, convocados: c.convocados || [] }); setDialog(true); };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onMatchChange = (mid) => {
    const m = matches.find((x) => x.id === mid);
    setForm((f) => ({ ...f, match_id: mid, equipo_id: m?.equipo_id || "" }));
  };

  const teamPlayers = players.filter((p) => p.equipo_id === form.equipo_id);
  const isConvocado = (pid) => form.convocados.some((c) => c.player_id === pid);
  const toggle = (pid) => setForm((f) => ({
    ...f,
    convocados: isConvocado(pid) ? f.convocados.filter((c) => c.player_id !== pid) : [...f.convocados, { player_id: pid, estado: "pendiente" }],
  }));
  const setConfirm = (pid, estado) => setForm((f) => ({
    ...f, convocados: f.convocados.map((c) => c.player_id === pid ? { ...c, estado } : c),
  }));

  const save = async () => {
    if (!form.match_id) { toast.error("Selecciona un partido"); return; }
    const payload = { ...form };
    if (form.id) await api.put(`/callups/${form.id}`, payload);
    else await api.post("/callups", payload);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (c) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/callups/${c.id}`); toast.success(t("deleted")); load(); };

  const matchLabel = (m) => m ? `${m.equipo_nombre || ""} vs ${m.rival || "—"} · ${m.fecha || ""}` : "—";
  const matchOptions = matches.map((m) => ({ value: m.id, label: matchLabel(m) }));
  const pName = (pid) => { const p = players.find(x=>x.id===pid); return p ? `${p.nombre} ${p.apellidos||""}`.trim() : "—"; };

  return (
    <div data-testid="callups-page">
      <PageHeader title={t("callups")} icon={ClipboardList}
        action={<Button data-testid="add-callup-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newCallup")}</Button>} />

      {callups.length === 0 ? (
        <EmptyState icon={ClipboardList} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newCallup")}</Button>} />
      ) : (
        <div className="space-y-3">
          {callups.map((c) => (
            <div key={c.id} data-testid={`callup-card-${c.id}`} className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading font-bold text-slate-900">{c.match?.equipo_nombre} vs {c.match?.rival || "—"}</p>
                  <p className="text-xs text-slate-500">{c.match?.fecha} · {c.match?.hora || "--:--"} · {c.lugar_quedada || ""}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" data-testid={`edit-callup-${c.id}`} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" data-testid={`delete-callup-${c.id}`} onClick={() => remove(c)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-600"><Users className="h-4 w-4" />{c.num_convocados} {t("calledPlayers").toLowerCase()}</span>
                <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-4 w-4" />{(c.convocados||[]).filter(x=>x.estado==="confirmado").length}</span>
                <span className="inline-flex items-center gap-1 text-red-500"><X className="h-4 w-4" />{(c.convocados||[]).filter(x=>x.estado==="no_puede").length}</span>
                <span className="inline-flex items-center gap-1 text-amber-500"><Clock className="h-4 w-4" />{(c.convocados||[]).filter(x=>x.estado==="pendiente").length}</span>
              </div>
              {c.convocados?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.convocados.map((cv) => (
                    <span key={cv.player_id} className={`rounded px-2 py-0.5 text-xs ${cv.estado==="confirmado"?"bg-green-100 text-green-800":cv.estado==="no_puede"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-800"}`}>{pName(cv.player_id)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("callups") : t("newCallup")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <SelectField label={t("match")} value={form.match_id} onChange={onMatchChange} options={matchOptions} testid="callup-match" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("meetTime")} type="time" value={form.hora_quedada} onChange={set("hora_quedada")} testid="callup-hora" />
              <Field label={t("meetPlace")} value={form.lugar_quedada} onChange={set("lugar_quedada")} testid="callup-lugar" />
            </div>
            <Field label={t("material")} value={form.material} onChange={set("material")} testid="callup-material" />
            <Area label={t("messageFamilies")} value={form.mensaje_familias} onChange={set("mensaje_familias")} testid="callup-mensaje" />

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t("selectPlayers")}</p>
              {!form.match_id ? <p className="text-sm text-slate-400">{t("match")}…</p> :
                teamPlayers.length === 0 ? <p className="text-sm text-slate-400">{t("noData")}</p> :
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {teamPlayers.map((p) => {
                    const conv = form.convocados.find((c) => c.player_id === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
                        <Checkbox data-testid={`callup-player-${p.id}`} checked={isConvocado(p.id)} onCheckedChange={() => toggle(p.id)} />
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{initials(p.nombre, p.apellidos)}</div>
                        <span className="flex-1 text-sm font-medium text-slate-700">{p.nombre} {p.apellidos}</span>
                        {conv && (
                          <div className="flex gap-1">
                            {[["confirmado",Check,"text-green-600"],["pendiente",Clock,"text-amber-500"],["no_puede",X,"text-red-500"]].map(([st,Ic,cl])=>(
                              <button key={st} data-testid={`confirm-${st}-${p.id}`} onClick={() => setConfirm(p.id, st)} className={`flex h-7 w-7 items-center justify-center rounded ${conv.estado===st?"bg-slate-200":""} ${cl}`}><Ic className="h-4 w-4" /></button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="callup-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Callups;
