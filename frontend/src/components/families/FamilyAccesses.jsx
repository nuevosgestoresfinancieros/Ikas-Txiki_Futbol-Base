import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accessState, safeAccessError, stateClasses } from "@/pages/familyAccessView";

const iconFor = (state) => state === "active" ? CheckCircle2 : state === "pending_activation" ? Clock3 : ["blocked", "duplicate_email", "email_conflict", "ambiguous_existing_account"].includes(state) ? ShieldAlert : ShieldCheck;

function AccessCard({ slot, form, setField, card, reload }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const prefix = `progenitor${slot}`;
  const state = accessState(card?.state || "no_access");
  const Icon = iconFor(card?.state);
  const action = async (kind) => {
    const config = {
      generate_invitation: ["invitation", "ENVIAR INVITACIÓN"],
      resend_invitation: ["invitation/resend", "REENVIAR INVITACIÓN"],
      temporary_password: ["temporary-password", "GENERAR CONTRASEÑA TEMPORAL"],
      block: ["block", "BLOQUEAR ACCESO"],
    }[kind];
    if (!config) return;
    const confirmation = window.prompt(`Escribe exactamente: ${config[1]}`);
    if (confirmation !== config[1]) return;
    setBusy(true); setMessage(""); setSecret("");
    try {
      const { data } = await api.post(`/family-access/families/${form.id}/${slot}/${config[0]}`, { confirmation });
      if (data.temporary_password && data.show_once) setSecret(data.temporary_password);
      setMessage(kind === "block" ? "Acceso bloqueado correctamente." : kind === "temporary_password" ? "Contraseña temporal generada. Solo se muestra una vez." : "Invitación procesada correctamente.");
      await reload();
    } catch (error) { setMessage(safeAccessError(error)); }
    finally { setBusy(false); }
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`family-access-${slot}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Progenitor/a {slot}</p><h4 className="mt-1 font-heading font-bold text-slate-950">{form[`${prefix}_nombre`] || "Sin nombre"}</h4><p className="mt-1 break-all text-sm text-slate-600">{form[`${prefix}_email`] || "Sin correo electrónico"}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${stateClasses(state.tone)}`}><Icon className="h-4 w-4" />{state.label}</span></div>
    <div className="mt-4 space-y-3"><label className="flex min-h-11 items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold"><span>Crear acceso a la aplicación</span><Switch checked={Boolean(form[`${prefix}_crear_acceso`])} onCheckedChange={(value) => setField(`${prefix}_crear_acceso`, value)} aria-label={`Crear acceso para progenitor ${slot}`} /></label><label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(form[`${prefix}_email_confirmado`])} onChange={(event) => setField(`${prefix}_email_confirmado`, event.target.checked)} /><span>Correo revisado y confirmado</span></label></div>
    {card?.state === "duplicate_email" && <p className="mt-3 text-sm text-red-800">Cada progenitor necesita un correo individual para disponer de un acceso independiente.</p>}
    {card?.state === "email_conflict" && <p className="mt-3 text-sm text-red-800">El correo ya está asociado a otra cuenta. No se muestran datos de esa cuenta.</p>}
    {secret && <div role="alert" className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3"><strong>Se muestra una sola vez</strong><code className="mt-2 block break-all rounded bg-white p-2">{secret}</code><Button type="button" variant="outline" className="mt-2" onClick={() => setSecret("")}>Ocultar</Button></div>}
    {message && <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
    {form.id && <div className="mt-4 flex flex-wrap gap-2">{(card?.allowed_actions || []).includes("generate_invitation") && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => action("generate_invitation")}><Mail className="h-4 w-4" />Generar invitación</Button>}{(card?.allowed_actions || []).includes("resend_invitation") && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => action("resend_invitation")}><RefreshCw className="h-4 w-4" />Reenviar</Button>}{(card?.allowed_actions || []).includes("temporary_password") && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => action("temporary_password")}><KeyRound className="h-4 w-4" />Contraseña temporal</Button>}{(card?.allowed_actions || []).includes("block") && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => action("block")}><LockKeyhole className="h-4 w-4" />Bloquear</Button>}{card?.user_id && <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/usuarios?cuenta=${encodeURIComponent(card.user_id)}`)}><Eye className="h-4 w-4" />Ver cuenta</Button>}</div>}
  </article>;
}

export function FamilyAccesses({ form, setField, enabled }) {
  const [cards, setCards] = useState([]);
  const reload = async () => {
    if (!form.id || !enabled) return setCards([]);
    try { setCards((await api.get(`/family-access/families/${form.id}`)).data.accesses || []); }
    catch { setCards([]); }
  };
  useEffect(() => { reload(); }, [form.id, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) return null;
  return <section className="rounded-2xl border border-sky-100 bg-[#F5F8FC] p-4" aria-labelledby="family-access-title"><div className="mb-4 flex gap-3"><Users className="h-6 w-6 text-[#1B5C8F]" /><div><h3 id="family-access-title" className="font-heading text-lg font-extrabold text-[#0E3554]">Accesos familiares</h3><p className="text-sm text-slate-600">Cada progenitor dispone de credenciales, invitación y sesiones independientes.</p></div></div><div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((slot) => <AccessCard key={slot} slot={slot} form={form} setField={setField} card={cards.find((item) => item.slot === slot)} reload={reload} />)}</div><p className="mt-3 flex gap-2 text-xs text-slate-600"><AlertTriangle className="h-4 w-4 shrink-0" />Guardar con modo automático puede encolar invitaciones elegibles. Los conflictos pasan a revisión sin envío.</p></section>;
}

export function FamilyAccessAdministration() {
  const [mode, setMode] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => { const [m, c] = await Promise.all([api.get("/family-access/mode"), api.get("/family-access-campaigns")]); setMode(m.data); setCampaigns(c.data); };
  useEffect(() => { load().catch(() => setMessage("No se ha podido cargar la administración de accesos.")); }, []);
  const toggleMode = async () => { const target = mode?.mode === "automatic" ? "manual" : "automatic"; const confirmation = target === "automatic" ? "ACTIVAR APROVISIONAMIENTO AUTOMÁTICO" : "DESACTIVAR APROVISIONAMIENTO AUTOMÁTICO"; if (window.prompt(`Escribe exactamente: ${confirmation}`) !== confirmation) return; setBusy(true); try { setMode((await api.put("/family-access/mode", { mode: target, confirmation })).data); setMessage("Modo actualizado correctamente."); } catch (error) { setMessage(safeAccessError(error)); } finally { setBusy(false); } };
  const preflight = async () => { setBusy(true); try { const { data } = await api.post("/family-access-campaigns/preflight"); setCampaigns((rows) => [data, ...rows]); setMessage("Preflight completado sin enviar invitaciones."); } catch (error) { setMessage(safeAccessError(error)); } finally { setBusy(false); } };
  const confirm = async (campaign) => { if (window.prompt("Escribe exactamente: CONFIRMAR APROVISIONAMIENTO") !== "CONFIRMAR APROVISIONAMIENTO") return; setBusy(true); try { await api.post(`/family-access-campaigns/${campaign.id}/confirm`, { preflight_fingerprint: campaign.preflight_fingerprint, confirmation: "CONFIRMAR APROVISIONAMIENTO" }); await load(); setMessage("Campaña confirmada y encolada."); } catch (error) { setMessage(safeAccessError(error)); } finally { setBusy(false); } };
  return <section className="mb-6 space-y-4 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" data-testid="family-access-administration"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-sky-700">Administración</p><h2 className="font-heading text-xl font-extrabold text-[#0E3554]">Aprovisionamiento familiar</h2><p className="text-sm text-slate-600">Modo actual: <strong>{mode?.mode === "automatic" ? "Automático" : "Manual"}</strong>. Entrega técnica: <strong>{mode?.delivery_enabled ? "habilitada" : "desactivada"}</strong>.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || !mode} onClick={toggleMode}>{mode?.mode === "automatic" ? "Desactivar automático" : "Activar automático"}</Button><Button type="button" disabled={busy} onClick={preflight}><ShieldCheck className="h-4 w-4" />Crear preflight</Button></div></div>{message && <p role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-sm font-semibold">{message}</p>}<div className="space-y-3">{campaigns.slice(0, 5).map((campaign) => <article key={campaign.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>Campaña {campaign.id.slice(0, 8)}</strong><p className="text-xs text-slate-500">{campaign.status}</p></div>{campaign.status === "confirmation_required" && <Button type="button" size="sm" onClick={() => confirm(campaign)} disabled={busy}>Confirmar una vez</Button>}</div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{Object.entries(campaign.summary || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="font-bold">{value}</dd></div>)}</dl></article>)}</div></section>;
}

