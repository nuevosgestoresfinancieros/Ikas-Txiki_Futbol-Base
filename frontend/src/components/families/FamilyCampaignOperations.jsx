import { useEffect, useState } from "react";
import { Pause, Play, XCircle } from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { safeAccessError } from "@/pages/familyAccessView";

export default function FamilyCampaignOperations() {
  const [campaigns, setCampaigns] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const load = () => api.get("/family-access-campaigns").then(({ data }) => setCampaigns(data || []));
  useEffect(() => { load().catch(() => setMessage("No se han podido cargar las campañas.")); }, []);
  const change = async (campaign, action) => {
    const labels = { pause: "PAUSAR CAMPAÑA", resume: "REANUDAR CAMPAÑA", cancel: "CANCELAR CAMPAÑA" };
    if (window.prompt(`Escribe exactamente: ${labels[action]}`) !== labels[action]) return;
    setBusy(campaign.id); setMessage("");
    try {
      await api.post(`/family-access-campaigns/${campaign.id}/action`, { action });
      await load();
      setMessage("Estado de campaña actualizado.");
    } catch (error) { setMessage(safeAccessError(error)); }
    finally { setBusy(""); }
  };
  const actionable = campaigns.filter((item) => ["queued", "running", "paused", "failed"].includes(item.status));
  if (!actionable.length && !message) return null;
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="campaign-operations-title"><h2 id="campaign-operations-title" className="font-heading text-lg font-extrabold text-[#0E3554]">Control de campañas</h2>{message && <p className="mt-2 text-sm font-semibold" role="status">{message}</p>}<div className="mt-3 space-y-2">{actionable.map((campaign) => <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><strong>Campaña {campaign.id.slice(0, 8)}</strong><p className="text-xs text-slate-500">{campaign.status} · {campaign.progress?.completed || 0}/{campaign.progress?.total_jobs || 0}</p></div><div className="flex flex-wrap gap-2">{["queued", "running"].includes(campaign.status) && <Button type="button" size="sm" variant="outline" disabled={busy === campaign.id} onClick={() => change(campaign, "pause")}><Pause className="h-4 w-4" />Pausar</Button>}{["paused", "failed"].includes(campaign.status) && <Button type="button" size="sm" variant="outline" disabled={busy === campaign.id} onClick={() => change(campaign, "resume")}><Play className="h-4 w-4" />Reanudar</Button>}{["queued", "paused"].includes(campaign.status) && <Button type="button" size="sm" variant="outline" disabled={busy === campaign.id} onClick={() => change(campaign, "cancel")}><XCircle className="h-4 w-4" />Cancelar</Button>}</div></div>)}</div></section>;
}

