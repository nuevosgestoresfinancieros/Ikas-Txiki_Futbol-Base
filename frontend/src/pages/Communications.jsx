import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageSquare, Plus, Pencil, Trash2, Mail, Send, Check, Loader2, ChevronDown, ChevronUp, ShieldCheck, FilePenLine, Save, Eye, CircleCheck, Clock3, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";
import { canSendCommunication, communicationFailureNeedsAuthorizationHelp, communicationSendConfirmation, isCommunicationSending } from "./communicationsView";

const empty = { destinatario_tipo: "equipo", canal: "email", prioridad: "normal", audience_mode: "all", selected_family_ids: [] };

const Communications = () => {
  const canCreate = usePermission("communications", "create");
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scopeFamilies, setScopeFamilies] = useState([]);
  const [familySearch, setFamilySearch] = useState("");
  const [providers, setProviders] = useState({});
  const [recipientPreview, setRecipientPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [sendingId, setSendingId] = useState(null);
  const [sendError, setSendError] = useState("");
  const [guideOpen, setGuideOpen] = useState(true);

  const load = async () => setItems((await api.get("/communications")).data);
  useEffect(() => {
    load();
    Promise.all([api.get("/teams"), api.get("/categories"), api.get("/players"), api.get("/notifications/providers")]).then(([tm, c, p, providerData]) => { setTeams(tm.data); setCategories(c.data); setPlayers(p.data); setProviders(providerData.data); });
    if (params.get("new") && canCreate) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setRecipientPreview(null); setPreviewError(""); setDialog(true); };
  const openEdit = (i) => { setForm(i); setRecipientPreview(null); setPreviewError(""); setDialog(true); };
  const previewRecipients = async () => {
    setPreviewError("");
    try {
      const response = await api.post("/communications/recipients/preview", { ...form, enviado: false });
      setRecipientPreview(response.data);
    } catch (error) {
      setRecipientPreview(null);
      setPreviewError(error.response?.data?.detail || t("recipientPreviewError"));
    }
  };
  const loadScopeFamilies = async (type, id) => {
    setScopeFamilies([]); setFamilySearch("");
    if (!id) return;
    try {
      const response = await api.post("/communications/recipients/families", { destinatario_tipo: type, destinatario_id: id, canal: form.canal, audience_mode: "all" });
      setScopeFamilies(response.data.families || []);
    } catch (error) { setPreviewError(error.response?.data?.detail || t("recipientPreviewError")); }
  };
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
  const sendCommunication = async (item) => {
    setSendError("");
    setSendingId(item.id);
    try {
      const preview = await api.get(`/communications/${item.id}/send-preview`);
      if (!preview.data.can_send) throw new Error(t("communicationAlreadySent"));
      const recipientCount = preview.data.summary?.authorized_contacts || 0;
      if (!recipientCount) { setSendError("No hay contactos autorizados. Revisa las Autorizaciones antes de enviar."); return; }
      if (!window.confirm(communicationSendConfirmation(t, recipientCount))) return;
      await api.post(`/communications/${item.id}/send`);
      toast.success(t("communicationSent"));
      await load();
    } catch (error) {
      setSendError(error.response?.data?.detail || error.message || t("communicationSendError"));
    } finally {
      setSendingId(null);
    }
  };
  const remove = async (i) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/communications/${i.id}`); toast.success(t("deleted")); load(); };

  const destOptions = form.destinatario_tipo === "equipo" ? teams.map(tm=>({value:tm.id,label:tm.nombre}))
    : form.destinatario_tipo === "categoria" ? categories.map(c=>({value:c.name,label:c.name}))
    : players.map(p=>({value:p.id,label:`${p.nombre} ${p.apellidos||""}`.trim()}));
  const channelOptions = [
    { value: "email", label: "Email" }, { value: "telegram", label: "Telegram" }, { value: "sms", label: "SMS" },
    ...(form.canal === "whatsapp" ? [{ value: "whatsapp", label: "WhatsApp (histórico)" }] : []),
  ];

  return (
    <div data-testid="communications-page">
      <PageHeader title={t("communications")} icon={MessageSquare}
        action={canCreate ? <Button data-testid="add-comm-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />

      <section className="mb-6 overflow-hidden rounded-2xl border border-[#93C8EE] bg-white shadow-sm" aria-labelledby="communication-guide-title" data-testid="communication-guide">
        <div className="flex items-center justify-between gap-4 bg-[#0E3554] px-4 py-3 text-white sm:px-5">
          <div className="min-w-0"><h2 id="communication-guide-title" className="font-heading text-base font-bold sm:text-lg">{t("communicationGuideTitle")}</h2>{!guideOpen && <p className="mt-0.5 text-xs text-[#DCEFFD]">{t("communicationGuideCollapsed")}</p>}</div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setGuideOpen((open) => !open)} aria-expanded={guideOpen} aria-controls="communication-guide-content" className="shrink-0 border border-[#93C8EE] bg-white/10 text-white hover:bg-white hover:text-[#0E3554]">{guideOpen ? <ChevronUp /> : <ChevronDown />}{t(guideOpen ? "hideGuide" : "viewGuide")}</Button>
        </div>
        {guideOpen && <div id="communication-guide-content" className="p-4 sm:p-5">
          <p className="max-w-4xl text-sm leading-6 text-slate-700">{t("communicationGuideIntro")}</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
            [ShieldCheck, "communicationGuideStepAuthorizations", "communicationGuideStepAuthorizationsText", true], [FilePenLine, "communicationGuideStepCreate", "communicationGuideStepCreateText"], [Save, "communicationGuideStepSave", "communicationGuideStepSaveText"], [Eye, "communicationGuideStepPreview", "communicationGuideStepPreviewText"], [CircleCheck, "communicationGuideStepConfirm", "communicationGuideStepConfirmText"]
          ].map(([Icon, title, text, authorizationLink], index) => <li key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E7F4FC] text-[#2B75B0]"><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-bold uppercase tracking-wide text-[#2B75B0]">{index + 1}. {t(title)}</p><p className="mt-1 text-xs leading-5 text-slate-600">{t(text)}</p>{authorizationLink && <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0 py-0 text-xs"><Link to="/autorizaciones">{t("reviewAuthorizations")}</Link></Button>}</div></div></li>)}</ol>
          <div className="mt-4 border-t border-[#D7EAF7] pt-4"><h3 className="text-sm font-bold text-[#0E3554]">{t("communicationStatesTitle")}</h3><dl className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[[Clock3, "deliveryPending", "communicationStatePendingText", "text-amber-700 bg-amber-50 border-amber-200"], [Loader2, "sending", "communicationStateSendingText", "text-[#2B75B0] bg-[#F1F8FD] border-[#93C8EE]"], [CheckCircle2, "sent", "communicationStateSentText", "text-emerald-700 bg-emerald-50 border-emerald-200"], [AlertTriangle, "failed", "communicationStateFailedText", "text-red-700 bg-red-50 border-red-200"]].map(([Icon, label, text, color]) => <div key={label} className={`rounded-xl border p-3 ${color}`}><dt className="flex items-center gap-1.5 text-xs font-bold"><Icon className={`h-4 w-4 ${label === "sending" ? "animate-spin" : ""}`} aria-hidden="true" />{t(label)}</dt><dd className="mt-1 text-xs leading-5 text-slate-700">{t(text)}</dd></div>)}</dl></div>
        </div>}
      </section>

      {items.length === 0 ? (
        <EmptyState icon={MessageSquare} message={t("noData")} action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("add")}</Button> : null} />
      ) : (
        <div className="space-y-3">
          {sendError && <p className="text-sm font-semibold text-red-700" role="alert">{sendError}</p>}
          {items.map((i) => (
            <div key={i.id} data-testid={`comm-card-${i.id}`} className="surface-card interactive-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${i.canal==="telegram"?"bg-sky-100 text-sky-700":i.canal==="whatsapp"?"bg-slate-100 text-slate-600":"bg-sky-100 text-sky-700"}`}>
                    {i.canal === "email" ? <Mail className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{i.asunto || "(sin asunto)"}</p>
                    <p className="text-xs text-slate-500">{t(i.destinatario_tipo === "equipo" ? "byTeam" : i.destinatario_tipo === "categoria" ? "byCategory" : "individual")}: {i.destinatario_nombre_resuelto || i.destinatario_nombre || t("unresolvedRecipient")}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{i.mensaje}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {i.estado_envio === "sent" ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><Check className="h-4 w-4" />{t("sent")}</span> : i.estado_envio === "sending" ? <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />{t("sending")}</span> : i.estado_envio === "failed" ? <span className="text-xs font-bold text-red-600">{t("failed")}</span> : <span className="text-xs font-bold text-amber-600">{t("deliveryPending")}</span>}
                  {canCreate && canSendCommunication(i.estado_envio) && <Button variant="outline" size="sm" data-testid={`send-comm-${i.id}`} onClick={() => sendCommunication(i)} disabled={isCommunicationSending(i.id, sendingId)}>{isCommunicationSending(i.id, sendingId) ? <><Loader2 className="h-4 w-4 animate-spin" />{t("sending")}</> : <><Send className="h-4 w-4" />{t("send")}</>}</Button>}
                  <PermissionGate resource="communications" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${i.asunto || t("communications")}`} data-testid={`edit-comm-${i.id}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="communications" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${i.asunto || t("communications")}`} data-testid={`delete-comm-${i.id}`} onClick={() => remove(i)} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
              {i.estado_envio === "failed" && communicationFailureNeedsAuthorizationHelp(i.error_envio) && <aside className="mt-4 rounded-xl border border-[#93C8EE] bg-[#F1F8FD] p-3" aria-labelledby={`communication-failure-help-${i.id}`} data-testid={`communication-failure-help-${i.id}`}><div className="flex gap-2.5"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#2B75B0]" aria-hidden="true" /><div><h3 id={`communication-failure-help-${i.id}`} className="text-sm font-bold text-[#0E3554]">{t("communicationFailureHelpTitle")}</h3><p className="mt-1 text-sm leading-5 text-slate-700">{t("communicationFailureAuthorizationText")}</p><Button asChild variant="outline" size="sm" className="mt-3"><Link to="/autorizaciones">{t("reviewAuthorizations")}</Link></Button><p className="mt-3 text-xs leading-5 text-slate-600">{t("communicationFailureNextStep")}</p></div></div></aside>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{t("communications")}</DialogTitle><DialogDescription>{t("communicationDialogDescription")}</DialogDescription></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectField label={t("recipientType")} value={form.destinatario_tipo} onChange={(v)=>{set("destinatario_tipo")(v);set("destinatario_id")("");set("audience_mode")("all");set("selected_family_ids")([]);setScopeFamilies([]);}}
                options={[{value:"equipo",label:t("byTeam")},{value:"categoria",label:t("byCategory")},{value:"individual",label:t("individual")}]} testid="comm-tipo" />
              <SelectField label={t("recipientType")} value={form.destinatario_id} onChange={(v)=>{set("destinatario_id")(v);set("audience_mode")("all");set("selected_family_ids")([]);loadScopeFamilies(form.destinatario_tipo, v);}} options={destOptions} testid="comm-dest" />
              <SelectField label={t("channel")} value={form.canal} onChange={set("canal")} options={channelOptions} testid="comm-canal" />
            </div>
            {form.destinatario_id && <div className="rounded-xl border border-slate-200 p-4" data-testid="family-audience-selector"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{t("families")}</p><p className="text-sm text-slate-500">{(form.audience_mode === "all" ? scopeFamilies.length : (form.selected_family_ids || []).length) + " familias seleccionadas"}</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={()=>setForm(f=>({...f,audience_mode:"selected",selected_family_ids:scopeFamilies.map(x=>x.id)}))}>Seleccionar todas</Button><Button type="button" size="sm" variant="outline" onClick={()=>setForm(f=>({...f,audience_mode:"selected",selected_family_ids:[]}))}>Quitar selección</Button></div></div><div className="mt-3 flex gap-2"><Button type="button" size="sm" variant={form.audience_mode === "all" ? "default" : "outline"} onClick={()=>set("audience_mode")("all")}>Todas las familias</Button><Button type="button" size="sm" variant={form.audience_mode === "selected" ? "default" : "outline"} onClick={()=>set("audience_mode")("selected")}>Seleccionar familias</Button></div>{form.audience_mode === "selected" && <><input className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={familySearch} onChange={e=>setFamilySearch(e.target.value)} placeholder="Buscar familias" aria-label="Buscar familias" /><div className="mt-3 max-h-48 space-y-2 overflow-y-auto">{scopeFamilies.filter(f=>String(f.name + " " + (f.players || []).join(" ")).toLowerCase().includes(familySearch.toLowerCase())).map(f=>{const checked=(form.selected_family_ids || []).includes(f.id); return <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-50"><Checkbox checked={checked} onCheckedChange={(value)=>setForm(current=>({...current,audience_mode:"selected",selected_family_ids:value?[...(current.selected_family_ids || []),f.id].filter((id,index,list)=>list.indexOf(id)===index):(current.selected_family_ids || []).filter(id=>id!==f.id)}))}/><span className="text-sm"><span className="font-medium">{f.name}</span>{f.players?.length ? <span className="block text-xs text-slate-500">{f.players.join(", ")}</span> : null}</span></label>})}</div></>}</div>}
            <SelectField label={t("priority")} value={form.prioridad || "normal"} onChange={set("prioridad")} options={["low","normal","high","urgent"].map((value)=>({value,label:t(`priority_${value}`)}))} testid="comm-priority" />
            <Field label={t("subject")} value={form.asunto} onChange={set("asunto")} testid="comm-asunto" />
            <Area label={t("message")} value={form.mensaje} onChange={set("mensaje")} testid="comm-mensaje" rows={5} />
            {!providers[form.canal]?.configured && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t("providerNotConfiguredPending")}</p>}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{t("recipientPreview")}</p><p className="text-sm text-slate-500">{t("recipientPreviewHelp")}</p></div><Button type="button" variant="outline" onClick={previewRecipients} disabled={!form.destinatario_id}>{t("preview")}</Button></div>
              {previewError && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{previewError}</p>}
              {recipientPreview && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">{[["Equipos incluidos", "teams"], ["Jugadores relacionados", "players"], ["Familias encontradas", "families_found"], ["Familias seleccionadas", "families_selected"], ["Familias duplicadas eliminadas", "duplicate_families_removed"], ["Cuentas activas", "active_accounts"], ["Contactos autorizados", "authorized_contacts"], ["Correos disponibles", "available_emails"]].map(([label, key]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold">{recipientPreview.summary[key]}</p><p className="text-xs text-slate-500">{t(label)}</p></div>)}<div className="col-span-2 rounded-xl bg-amber-50 p-3 sm:col-span-1"><p className="text-xl font-bold">{recipientPreview.summary.excluded.reduce((sum, item) => sum + item.count, 0)}</p><p className="text-xs text-amber-800">{t("excludedRecipients")}</p></div></div>}
            </div>
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
