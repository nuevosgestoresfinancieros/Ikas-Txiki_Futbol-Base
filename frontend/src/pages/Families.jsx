import React, { useCallback, useEffect, useState } from "react";
import { Home, Plus, Pencil, Trash2, Phone, Mail, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { preferencia_comunicacion: "email" };

const Families = () => {
  const canCreate = usePermission("families", "create");
  const canManageAccess = usePermission("users", "administer");
  const { t } = useI18n();
  const [families, setFamilies] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [accesses, setAccesses] = useState([]);
  const [selectedAccesses, setSelectedAccesses] = useState([]);
  const [sending, setSending] = useState(false);

  const load = async () => setFamilies((await api.get("/families")).data);
  useEffect(() => { load(); }, []);
  const loadAccesses = useCallback(async () => {
    if (!canManageAccess) return;
    setAccesses((await api.get("/families/accesses")).data);
  }, [canManageAccess]);
  useEffect(() => { loadAccesses().catch(() => {}); }, [loadAccesses]);

  const sendInvitations = async (ids) => {
    if (!ids.length || !window.confirm(`Se enviarán ${ids.length} invitación(es) para crear contraseña. ¿Continuar?`)) return;
    setSending(true);
    try {
      const response = await api.post("/families/accesses/invitations", { family_ids: ids });
      const sent = response.data.sent || 0;
      toast.success(sent ? `${sent} invitación(es) enviada(s)` : "No se ha enviado ninguna invitación");
      setSelectedAccesses([]); await loadAccesses();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se han podido enviar las invitaciones");
    } finally { setSending(false); }
  };

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
        action={canCreate ? <Button data-testid="add-family-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />

      {canManageAccess && (
        <section className="surface-card mb-6 p-5" aria-labelledby="family-access-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 id="family-access-title" className="font-heading text-xl font-bold text-slate-900">Accesos familiares</h2>
              <p className="mt-1 text-sm text-slate-600">Revisa todas las familias y envía invitaciones para que cada tutor cree su propia contraseña.</p></div>
            <Button disabled={sending || !selectedAccesses.length} onClick={() => sendInvitations(selectedAccesses)}><Send className="h-4 w-4" />Enviar seleccionadas ({selectedAccesses.length})</Button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3"><input aria-label="Seleccionar familias listas" type="checkbox" checked={accesses.filter((a) => a.status === "ready" || a.status === "expired" || a.status === "pending").length > 0 && selectedAccesses.length === accesses.filter((a) => a.status === "ready" || a.status === "expired" || a.status === "pending").length} onChange={(e) => setSelectedAccesses(e.target.checked ? accesses.filter((a) => ["ready", "expired", "pending"].includes(a.status)).map((a) => a.family_id) : [])} /></th><th className="p-3">Familia</th><th className="p-3">Correo</th><th className="p-3">Jugadores</th><th className="p-3">Estado</th><th className="p-3"><span className="sr-only">Acción</span></th></tr></thead>
              <tbody>{accesses.map((access) => { const eligible = ["ready", "expired", "pending"].includes(access.status); return <tr key={access.family_id} className="border-t"><td className="p-3"><input aria-label={`Seleccionar ${access.family_name}`} disabled={!eligible} type="checkbox" checked={selectedAccesses.includes(access.family_id)} onChange={() => setSelectedAccesses((current) => current.includes(access.family_id) ? current.filter((id) => id !== access.family_id) : [...current, access.family_id])} /></td><td className="p-3 font-semibold text-slate-900">{access.family_name}</td><td className="p-3 text-slate-600">{access.email || "Sin email"}</td><td className="p-3 text-slate-600">{access.children.map((child) => child.name).join(", ") || "—"}</td><td className="p-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${access.status === "active" ? "bg-emerald-100 text-emerald-800" : access.status === "missing_email" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>{access.status === "active" ? <CheckCircle2 className="h-3.5 w-3.5" /> : access.status === "missing_email" ? <AlertCircle className="h-3.5 w-3.5" /> : null}{({ ready: "Lista para invitar", pending: "Invitación enviada", expired: "Caducada", active: "Activa", missing_email: "Sin email" })[access.status] || access.status}</span></td><td className="p-3">{eligible && <Button size="sm" variant="outline" disabled={sending} onClick={() => sendInvitations([access.family_id])}><Send className="h-3.5 w-3.5" />{access.status === "pending" ? "Reenviar" : "Invitar"}</Button>}</td></tr>; })}</tbody>
            </table>
          </div>
        </section>
      )}

      {families.length === 0 ? (
        <EmptyState icon={Home} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {families.map((f) => (
            <div key={f.id} data-testid={`family-card-${f.id}`} className="surface-card interactive-card p-5">
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
                <PermissionGate resource="families" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${f.contacto_principal || t("families")}`} data-testid={`edit-family-${f.id}`} onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                <PermissionGate resource="families" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${f.contacto_principal || t("families")}`} data-testid={`delete-family-${f.id}`} onClick={() => remove(f)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
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
