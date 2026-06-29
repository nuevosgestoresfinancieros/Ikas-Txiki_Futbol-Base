import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus, Plus, Pencil, Trash2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { tipo: "alta", estado: "recibida", nueva_incorporacion: true, nombre: "" };

const Inscriptions = () => {
  const { t } = useI18n();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setItems((await api.get("/inscriptions")).data);
  useEffect(() => {
    load();
    if (params.get("new")) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (i) => { setForm(i); setDialog(true); };
  const save = async () => {
    if (!form.nombre?.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (form.id) await api.put(`/inscriptions/${form.id}`, form);
    else await api.post("/inscriptions", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (i) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/inscriptions/${i.id}`); toast.success(t("deleted")); load(); };
  const toPlayer = async (i) => {
    try {
      await api.post(`/inscriptions/${i.id}/to-player`);
      toast.success(t("convertedPlayer"));
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  return (
    <div data-testid="inscriptions-page">
      <PageHeader title={t("inscriptions")} icon={UserPlus}
        action={<Button data-testid="add-inscription-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("alta")}</Button>} />

      {items.length === 0 ? (
        <EmptyState icon={UserPlus} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("alta")}</Button>} />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} data-testid={`inscription-card-${i.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-heading font-bold text-slate-900">{i.nombre} {i.apellidos}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{t(i.tipo)}</span>
                  {i.categoria && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{i.categoria}</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">{i.progenitor1_nombre || ""} {i.progenitor1_telefono ? `· ${i.progenitor1_telefono}` : ""}</p>
                {i.posibles_hermanos?.length > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700"><Users className="h-3.5 w-3.5" />{t("possibleSibling")}: {i.posibles_hermanos.map(h => h.nombre).join(", ")}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={i.estado} />
                {i.player_id ? (
                  <span className="text-xs font-bold text-green-600 inline-flex items-center gap-1"><UserCheck className="h-4 w-4" />{t("convertedPlayer")}</span>
                ) : (
                  <Button size="sm" variant="secondary" data-testid={`to-player-${i.id}`} onClick={() => toPlayer(i)} className="h-9"><UserCheck className="h-4 w-4" />{t("createPlayerFromInscription")}</Button>
                )}
                <Button variant="ghost" size="icon" data-testid={`edit-inscription-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" data-testid={`delete-inscription-${i.id}`} onClick={() => remove(i)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("review") : t("alta")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("inscriptionType")} value={form.tipo} onChange={set("tipo")} options={[{value:"alta",label:t("alta")},{value:"renovacion",label:t("renovacion")}]} testid="insc-tipo" />
            <SelectField label={t("inscriptionStatus")} value={form.estado} onChange={set("estado")} options={["recibida","revisada","aceptada","pendiente","rechazada"].map(s=>({value:s,label:s}))} testid="insc-estado" />
            <Field label={t("name")} value={form.nombre} onChange={set("nombre")} testid="insc-nombre" />
            <Field label={t("surname")} value={form.apellidos} onChange={set("apellidos")} testid="insc-apellidos" />
            <Field label={t("birthdate")} type="date" value={form.fecha_nacimiento} onChange={set("fecha_nacimiento")} testid="insc-fecha-nac" />
            <Field label={t("school")} value={form.centro_escolar} onChange={set("centro_escolar")} testid="insc-centro" />
            <Field label={t("formEmail")} type="email" value={form.email_formulario} onChange={set("email_formulario")} testid="insc-email" />
            <Field label={t("address")} value={form.domicilio} onChange={set("domicilio")} testid="insc-domicilio" />
            <Field label={`${t("parent1")} - ${t("name")}`} value={form.progenitor1_nombre} onChange={set("progenitor1_nombre")} testid="insc-p1-nombre" />
            <Field label={`${t("parent1")} - ${t("phone")}`} value={form.progenitor1_telefono} onChange={set("progenitor1_telefono")} testid="insc-p1-tel" />
            <Field label={`${t("parent1")} - ${t("email")}`} value={form.progenitor1_email} onChange={set("progenitor1_email")} testid="insc-p1-email" />
            <Field label={`${t("parent2")} - ${t("phone")}`} value={form.progenitor2_telefono} onChange={set("progenitor2_telefono")} testid="insc-p2-tel" />
            <div className="sm:col-span-2"><Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="insc-obs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="inscription-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inscriptions;
