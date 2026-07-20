import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, Plus, Pencil, Trash2, Mail, Send, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { destinatario_tipo: "equipo", canal: "email", prioridad: "normal" };

const Communications = () => {
  const canCreate = usePermission("communications", "create");
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [players, setPlayers] = useState([]);
  const [providers, setProviders] = useState({});
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setItems((await api.get("/communications")).data);
  useEffect(() => {
    load();
    Promise.all([api.get("/teams"), api.get("/categories"), api.get("/players"), api.get("/notifications/providers")]).then(([tm, c, p, providerData]) => { setTeams(tm.data); setCategories(c.data); setPlayers(p.data); setProviders(providerData.data); });
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (i) => { setForm(i); setDialog(true); };
  const save = async () => {
    let nombre = "";
    if (form.destinatario_tipo === "equipo") nombre = teams.find(x=>x.id===form.destinatario_id)?.nombre || "";
    else if (form.destinatario_tipo === "categoria") nombre = form.destinatario_id;
    else nombre = players.find(x=>x.id===form.destinatario_id)?.nombre || "";
    const payload = { ...form, destinatario_nombre: nombre };
    if (form.id) await api.put(`/communications/${form.id}`, payload);
    else await api.post("/communications", payload);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (i) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/communications/${i.id}`); toast.success(t("deleted")); load(); };

  const destOptions = form.destinatario_tipo === "equipo" ? teams.map(tm=>({value:tm.id,label:tm.nombre}))
    : form.destinatario_tipo === "categoria" ? categories.map(c=>({value:c.name,label:c.name}))
    : players.map(p=>({value:p.id,label:`${p.nombre} ${p.apellidos||""}`.trim()}));

  return (
    <div data-testid="communications-page">
      <PageHeader title={t("communications")} icon={MessageSquare}
        action={canCreate ? <Button data-testid="add-comm-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />

      {items.length === 0 ? (
        <EmptyState icon={MessageSquare} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} data-testid={`comm-card-${i.id}`} className="surface-card interactive-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${i.canal==="whatsapp"?"bg-green-100 text-green-700":"bg-sky-100 text-sky-700"}`}>
                    {i.canal === "whatsapp" ? <Send className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{i.asunto || "(sin asunto)"}</p>
                    <p className="text-xs text-slate-500">{t(i.destinatario_tipo === "equipo" ? "byTeam" : i.destinatario_tipo === "categoria" ? "byCategory" : "individual")}: {i.destinatario_nombre || "—"}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{i.mensaje}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {i.estado_envio === "sent" ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><Check className="h-4 w-4" />{t("sent")}</span> : i.estado_envio === "failed" ? <span className="text-xs font-bold text-red-600">{t("failed")}</span> : <span className="text-xs font-bold text-amber-600">{t("deliveryPending")}</span>}
                  <PermissionGate resource="communications" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${i.asunto || t("communications")}`} data-testid={`edit-comm-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="communications" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${i.asunto || t("communications")}`} data-testid={`delete-comm-${i.id}`} onClick={() => remove(i)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{t("communications")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label={t("recipientType")} value={form.destinatario_tipo} onChange={(v)=>{set("destinatario_tipo")(v);set("destinatario_id")("");}}
                options={[{value:"equipo",label:t("byTeam")},{value:"categoria",label:t("byCategory")},{value:"individual",label:t("individual")}]} testid="comm-tipo" />
              <SelectField label={t("recipientType")} value={form.destinatario_id} onChange={set("destinatario_id")} options={destOptions} testid="comm-dest" />
              <SelectField label={t("channel")} value={form.canal} onChange={set("canal")} options={[{value:"email",label:"Email"},{value:"whatsapp",label:"WhatsApp"},{value:"sms",label:"SMS"}]} testid="comm-canal" />
            </div>
            <SelectField label={t("priority")} value={form.prioridad || "normal"} onChange={set("prioridad")} options={["low","normal","high","urgent"].map((value)=>({value,label:t(`priority_${value}`)}))} testid="comm-priority" />
            <Field label={t("subject")} value={form.asunto} onChange={set("asunto")} testid="comm-asunto" />
            <Area label={t("message")} value={form.mensaje} onChange={set("mensaje")} testid="comm-mensaje" rows={5} />
            {!providers[form.canal]?.configured && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t("providerNotConfiguredPending")}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="comm-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Communications;
