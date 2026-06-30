import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Euro, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField, SwitchField } from "@/components/form";

const empty = { concepto: "Cuota temporada", estado: "pendiente", importe_base: 0, descuento_hermano: 0, iban_validado: false, recibo_generado: false };

const Payments = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setPayments((await api.get("/payments")).data);
  useEffect(() => {
    load();
    api.get("/players").then((r) => setPlayers(r.data));
    if (params.get("new")) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (p) => { setForm(p); setDialog(true); };
  const save = async () => {
    if (form.id) await api.put(`/payments/${form.id}`, form);
    else await api.post("/payments", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (p) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/payments/${p.id}`); toast.success(t("deleted")); load(); };

  const final = (Number(form.importe_base) || 0) - (Number(form.descuento_hermano) || 0);
  const playerOptions = players.map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellidos || ""}`.trim() }));
  const totalPend = payments.filter(p => ["pendiente","parcial"].includes(p.estado)).reduce((s, p) => s + (p.importe_final || 0), 0);

  return (
    <div data-testid="payments-page">
      <PageHeader title={t("payments")} icon={Euro} subtitle={`${totalPend.toFixed(2)} € ${t("pendingAmount")}`}
        action={<Button data-testid="add-payment-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newPayment")}</Button>} />

      {payments.length === 0 ? (
        <EmptyState icon={Euro} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newPayment")}</Button>} />
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("name")}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">{t("concept")}</th>
                  <th className="px-4 py-3">{t("finalAmount")}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{t("paymentMethod")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} data-testid={`payment-row-${p.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.player_nombre}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{p.concepto}</td>
                    <td className="px-4 py-3 font-heading font-bold text-slate-900">{(p.importe_final || 0).toFixed(2)} €</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600 capitalize">{p.forma_pago || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" data-testid={`edit-payment-${p.id}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" data-testid={`delete-payment-${p.id}`} onClick={() => remove(p)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("payments") : t("newPayment")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2"><SelectField label={t("name")} value={form.player_id} onChange={set("player_id")} options={playerOptions} testid="payment-player" /></div>
            <Field label={t("concept")} value={form.concepto} onChange={set("concepto")} testid="payment-concepto" />
            <SelectField label={t("paymentMethod")} value={form.forma_pago} onChange={set("forma_pago")} options={["domiciliacion","transferencia","efectivo","bizum"].map(s=>({value:s,label:s}))} testid="payment-forma" />
            <Field label={t("baseAmount")} type="number" value={form.importe_base} onChange={set("importe_base")} testid="payment-base" />
            <Field label={t("siblingDiscount")} type="number" value={form.descuento_hermano} onChange={set("descuento_hermano")} testid="payment-descuento" />
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">{t("finalAmount")}</label>
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-heading font-bold text-slate-900">{final.toFixed(2)} €</div>
            </div>
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["pendiente","pagado","parcial","devuelto"].map(s=>({value:s,label:s}))} testid="payment-estado" />
            <Field label={t("iban")} value={form.iban} onChange={set("iban")} testid="payment-iban" />
            <Field label={t("paymentDate")} type="date" value={form.fecha_pago} onChange={set("fecha_pago")} testid="payment-fecha" />
            <SwitchField label="IBAN validado" checked={form.iban_validado} onChange={set("iban_validado")} testid="payment-iban-val" />
            <SwitchField label="Recibo generado" checked={form.recibo_generado} onChange={set("recibo_generado")} testid="payment-recibo" />
            <div className="sm:col-span-2"><Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="payment-obs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="payment-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payments;
