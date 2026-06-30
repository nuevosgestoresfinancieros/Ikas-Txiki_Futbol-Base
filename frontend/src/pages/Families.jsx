import React, { useEffect, useState } from "react";
import { Home, Plus, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { preferencia_comunicacion: "email" };

const Families = () => {
  const { t } = useI18n();
  const [families, setFamilies] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setFamilies((await api.get("/families")).data);
  useEffect(() => { load(); }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (f) => { setForm(f); setDialog(true); };
  const save = async () => {
    if (form.id) await api.put(`/families/${form.id}`, form);
    else await api.post("/families", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (f) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/families/${f.id}`); toast.success(t("deleted")); load(); };

  const commOptions = [
    { value: "email", label: "Email" }, { value: "telefono", label: t("phone") }, { value: "whatsapp", label: "WhatsApp" },
  ];

  return (
    <div data-testid="families-page">
      <PageHeader title={t("families")} icon={Home}
        action={<Button data-testid="add-family-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button>} />

      {families.length === 0 ? (
        <EmptyState icon={Home} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {families.map((f) => (
            <div key={f.id} data-testid={`family-card-${f.id}`} className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-5 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading font-bold text-slate-900">{f.progenitor1_nombre || f.contacto_principal || "Familia"}</p>
                  <p className="text-xs text-slate-500">{f.num_hijos} {t("children")}</p>
                </div>
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">{f.preferencia_comunicacion}</span>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                {f.progenitor1_telefono && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" />{f.progenitor1_telefono}</p>}
                {f.progenitor1_email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" />{f.progenitor1_email}</p>}
              </div>
              {f.hijos?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.hijos.map((h) => <span key={h.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{h.nombre}</span>)}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-1">
                <Button variant="ghost" size="icon" data-testid={`edit-family-${f.id}`} onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" data-testid={`delete-family-${f.id}`} onClick={() => remove(f)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{t("families")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("parent1")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("name")} value={form.progenitor1_nombre} onChange={set("progenitor1_nombre")} testid="fam-p1-nombre" />
              <Field label={t("phone")} value={form.progenitor1_telefono} onChange={set("progenitor1_telefono")} testid="fam-p1-tel" />
              <Field label={t("email")} value={form.progenitor1_email} onChange={set("progenitor1_email")} testid="fam-p1-email" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("parent2")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("name")} value={form.progenitor2_nombre} onChange={set("progenitor2_nombre")} testid="fam-p2-nombre" />
              <Field label={t("phone")} value={form.progenitor2_telefono} onChange={set("progenitor2_telefono")} testid="fam-p2-tel" />
              <Field label={t("email")} value={form.progenitor2_email} onChange={set("progenitor2_email")} testid="fam-p2-email" />
            </div>
            <Field label={t("address")} value={form.domicilio} onChange={set("domicilio")} testid="fam-domicilio" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("mainContact")} value={form.contacto_principal} onChange={set("contacto_principal")} testid="fam-contacto" />
              <SelectField label={t("commPreference")} value={form.preferencia_comunicacion} onChange={set("preferencia_comunicacion")} options={commOptions} testid="fam-comm" />
            </div>
            <Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="fam-obs" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="family-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Families;
