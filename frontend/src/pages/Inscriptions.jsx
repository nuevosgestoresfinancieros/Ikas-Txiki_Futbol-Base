import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus, Plus, Pencil, Trash2, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { STATUS_LABELS, useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { tipo: "alta", estado: "recibida", nueva_incorporacion: true, nombre: "" };

const Inscriptions = () => {
  const canCreate = usePermission("inscriptions", "create");
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get("/inscriptions")).data); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => { if (k === "nombre") setNameError(""); setForm((f) => ({ ...f, [k]: v })); };
  const openNew = () => { setNameError(""); setForm(empty); setDialog(true); };
  const openEdit = (i) => { setNameError(""); setForm(i); setDialog(true); };
  const save = async () => {
    if (!form.nombre?.trim()) { setNameError(lang === "eu" ? "Izena nahitaezkoa da." : "El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      if (form.id) await api.put(`/inscriptions/${form.id}`, form);
      else await api.post("/inscriptions", form);
      toast.success(t("saved")); setDialog(false); load();
    } catch (error) {
      toast.error(lang === "eu" ? "Ezin izan da gorde." : "No se ha podido guardar.");
    } finally {
      setSaving(false);
    }
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
        action={canCreate ? <Button data-testid="add-inscription-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("alta")}</Button> : null} />

      {loading ? (
        <div className="surface-card space-y-3 p-5" role="status" aria-label={t("loading")}>{[0,1,2,3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={UserPlus} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("alta")}</Button> : null} />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} data-testid={`inscription-card-${i.id}`} className="surface-card interactive-card flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
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
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusBadge status={i.estado} />
                {i.player_id ? (
                  <span className="text-xs font-bold text-green-600 inline-flex items-center gap-1"><UserCheck className="h-4 w-4" />{t("convertedPlayer")}</span>
                ) : (
                  <PermissionGate resource="inscriptions" action="create"><Button size="sm" variant="secondary" data-testid={`to-player-${i.id}`} onClick={() => toPlayer(i)}><UserCheck className="h-4 w-4" />{t("createPlayerFromInscription")}</Button></PermissionGate>
                )}
                <PermissionGate resource="inscriptions" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${i.nombre}`} data-testid={`edit-inscription-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                <PermissionGate resource="inscriptions" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${i.nombre}`} data-testid={`delete-inscription-${i.id}`} onClick={() => remove(i)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
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
            <SelectField label={t("inscriptionStatus")} value={form.estado} onChange={set("estado")} options={["recibida","revisada","aceptada","pendiente","rechazada"].map(s=>({value:s,label:STATUS_LABELS[lang]?.[s] || s}))} testid="insc-estado" />
            <Field label={t("name")} value={form.nombre} onChange={set("nombre")} testid="insc-nombre" required error={nameError} />
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
            <Button variant="outline" onClick={() => setDialog(false)} disabled={saving}>{t("cancel")}</Button>
            <Button onClick={save} disabled={saving} data-testid="inscription-save-btn" className="px-6">{saving ? t("loading") : t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inscriptions;
