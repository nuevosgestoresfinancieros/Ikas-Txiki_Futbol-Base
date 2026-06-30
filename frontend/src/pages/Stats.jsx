import React, { useEffect, useState } from "react";
import { BarChart3, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { partidos_convocado: 0, partidos_jugados: 0, minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0, porterias_cero: 0 };

const Stats = () => {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [players, setPlayers] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setItems((await api.get("/stats")).data);
  useEffect(() => { load(); api.get("/players").then((r) => setPlayers(r.data)); }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (i) => { setForm(i); setDialog(true); };
  const save = async () => {
    if (!form.player_id) { toast.error("Selecciona un jugador"); return; }
    if (form.id) await api.put(`/stats/${form.id}`, form);
    else await api.post("/stats", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (i) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/stats/${i.id}`); toast.success(t("deleted")); load(); };

  const playerOptions = players.map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellidos || ""}`.trim() }));
  const cols = [
    ["calledMatches", "partidos_convocado"], ["playedMatches", "partidos_jugados"], ["minutes", "minutos"],
    ["goals", "goles"], ["assists", "asistencias"], ["yellowCards", "amarillas"],
    ["redCards", "rojas"], ["cleanSheets", "porterias_cero"],
  ];

  return (
    <div data-testid="stats-page">
      <PageHeader title={t("stats")} icon={BarChart3}
        action={<Button data-testid="add-stats-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button>} />

      {items.length === 0 ? (
        <EmptyState icon={BarChart3} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button>} />
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("name")}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">{t("season")}</th>
                  {cols.map(([lbl]) => <th key={lbl} className="px-3 py-3 text-center">{t(lbl)}</th>)}
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => (
                  <tr key={i.id} data-testid={`stats-row-${i.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{i.player_nombre}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{i.temporada || "—"}</td>
                    {cols.map(([lbl, key]) => <td key={key} className="px-3 py-3 text-center text-slate-700">{i[key] ?? 0}</td>)}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" data-testid={`edit-stats-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" data-testid={`delete-stats-${i.id}`} onClick={() => remove(i)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{t("stats")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
            <div className="col-span-2 sm:col-span-3"><SelectField label={t("name")} value={form.player_id} onChange={set("player_id")} options={playerOptions} testid="stats-player" /></div>
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="stats-temporada" />
            <Field label={t("position")} value={form.posicion} onChange={set("posicion")} testid="stats-posicion" />
            <Field label={t("rating")} type="number" value={form.valoracion} onChange={set("valoracion")} testid="stats-valoracion" />
            {cols.map(([lbl, key]) => (
              <Field key={key} label={t(lbl)} type="number" value={form[key]} onChange={set(key)} testid={`stats-${key}`} />
            ))}
            <div className="col-span-2 sm:col-span-3"><Area label={t("sportNotes")} value={form.observaciones} onChange={set("observaciones")} testid="stats-obs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="stats-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Stats;
