import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { Button } from "@/components/ui/button";

const Family = ({ family }) => <div className="rounded border border-slate-200 p-3 text-sm">
  <p className="font-semibold">{family.family_id}</p>
  <p>{family.progenitor1?.nombre || "—"} · {family.progenitor1?.correo || "sin correo"}</p>
  <p>{family.progenitor2?.nombre || "—"} · {family.progenitor2?.correo || "sin correo"}</p>
  <p className="mt-2 text-xs text-slate-600">Jugadores: {family.jugadores?.map((p) => `${p.nombre} (${p.id})`).join(", ") || "ninguno"}</p>
  <p className="text-xs text-slate-600">Cuentas: {family.cuentas?.map((u) => `${u.usuario} (${u.estado})`).join(", ") || "ninguna"}</p>
</div>;

export default function FamilyDuplicateReview() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const load = async () => { setLoading(true); try { const rows = (await api.get("/families/duplicates/candidates")).data.candidates || []; setCandidates(rows.filter((item) => item.confidence === "high" && item.merge_allowed === true)); } catch { toast.error("No se han podido analizar las familias"); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const merge = async (candidate, primary) => {
    const duplicate = primary === candidate.left.family_id ? candidate.right.family_id : candidate.left.family_id;
    if (!window.confirm(`Confirmar fusión de ${duplicate} en ${primary}. Esta acción queda archivada y puede revertirse desde el historial.`)) return;
    setBusy(candidate.candidate_id);
    try { await api.post("/families/duplicates/merge", { primary_family_id: primary, duplicate_family_id: duplicate, reason: candidate.reasons.join("; ") }); toast.success("Fusión registrada"); await load(); }
    catch { toast.error("No se ha podido completar la fusión"); } finally { setBusy(""); }
  };
  return <section data-testid="family-duplicate-review" className="surface-card mb-6 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Revisar duplicados</h2><p className="text-sm text-slate-600">Candidatos de alta confianza: {candidates.length}.</p></div><Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Actualizar análisis</Button></div>
    {loading ? <p className="mt-4 text-sm">Analizando…</p> : candidates.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay duplicados familiares para revisar.</p> : <div className="mt-4 space-y-4">{candidates.map((item) => <article key={item.candidate_id} data-testid={`duplicate-${item.candidate_id}`} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /><div><p className="font-semibold">Alta confianza</p><p className="text-sm">{item.reasons.join(". ")}</p></div></div><div className="mt-3 grid gap-3 md:grid-cols-2"><Family family={item.left} /><Family family={item.right} /></div><p className="mt-3 text-sm">Principal propuesta: <strong>{item.proposed_primary_family_id}</strong></p><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy === item.candidate_id} onClick={() => merge(item, item.left.family_id)}>Conservar ficha izquierda</Button><Button variant="outline" disabled={busy === item.candidate_id} onClick={() => merge(item, item.right.family_id)}>Conservar ficha derecha</Button></div></article>)}</div>}
  </section>;
}
