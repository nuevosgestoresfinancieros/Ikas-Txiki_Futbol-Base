import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { canConfirmImport, SUMMARY_ORDER, unresolvedConflictIds } from "./inscriptionImportView";

const COPY = {
  es: {
    title: "Importación segura de inscripciones", description: "Analiza el Excel antes de modificar datos y confirma únicamente cuando el resultado esté revisado.",
    template: "Descargar plantilla", file: "Archivo Excel", season: "Temporada", analyze: "Analizar sin importar",
    expected: "El resultado revisado esperado es de 323 inscripciones únicas.", october: "Los pendientes de octubre nunca se seleccionan automáticamente.",
    report: "Descargar informe de errores", confirmLabel: "He revisado el análisis y confirmo expresamente la importación.",
    confirm: "Confirmar importación", history: "Historial de importaciones", undo: "Deshacer", empty: "Todavía no hay análisis.",
    severe: "Hay errores graves. Corrígelos en Excel y vuelve a analizar.", conflict: "Requiere decisión humana", skip: "Omitir esta fila",
    created: "Altas", updated: "Actualizaciones", duplicate: "Duplicados", conflicts: "Conflictos", errors: "Errores", unchanged: "Sin cambios",
    applied: "Importación aplicada", undone: "Importación deshecha", confirmUndo: "¿Deshacer esta importación? Se comprobará que no existan cambios posteriores.",
    row: "Fila", status: "Estado", code: "Código", message: "Mensaje", decision: "Decisión",
  },
  eu: {
    title: "Izen-emateen inportazio segurua", description: "Aztertu Excel fitxategia datuak aldatu aurretik, eta baieztatu emaitza berrikusi ondoren.",
    template: "Txantiloia deskargatu", file: "Excel fitxategia", season: "Denboraldia", analyze: "Aztertu, inportatu gabe",
    expected: "Berrikusitako emaitzan 323 izen-emate bakar espero dira.", october: "Urriko zain daudenak ez dira inoiz automatikoki hautatzen.",
    report: "Erroreen txostena deskargatu", confirmLabel: "Azterketa berrikusi dut eta inportazioa espresuki baieztatzen dut.",
    confirm: "Inportazioa baieztatu", history: "Inportazioen historia", undo: "Desegin", empty: "Oraindik ez dago azterketarik.",
    severe: "Errore larriak daude. Zuzendu Excel fitxategia eta aztertu berriro.", conflict: "Giza erabakia behar da", skip: "Errenkada hau baztertu",
    created: "Altak", updated: "Eguneratzeak", duplicate: "Bikoiztuak", conflicts: "Gatazkak", errors: "Erroreak", unchanged: "Aldaketarik ez",
    applied: "Inportazioa aplikatu da", undone: "Inportazioa desegin da", confirmUndo: "Inportazio hau desegin? Geroagoko aldaketarik ez dagoela egiaztatuko da.",
    row: "Errenkada", status: "Egoera", code: "Kodea", message: "Mezua", decision: "Erabakia",
  },
};
const SUMMARY_LABEL = { create: "created", update: "updated", duplicate: "duplicate", conflict: "conflicts", error: "errors", unchanged: "unchanged" };
const ROW_STATUS = {
  es: { create: "Alta", update: "Actualización", duplicate: "Duplicado", conflict: "Conflicto", error: "Error", unchanged: "Sin cambios" },
  eu: { create: "Alta", update: "Eguneratzea", duplicate: "Bikoiztua", conflict: "Gatazka", error: "Errorea", unchanged: "Aldaketarik ez" },
};
const ROW_MESSAGES_EU = {
  formula_not_allowed: "Errenkadak formulak ditu; balioak bakarrik onartzen dira.",
  missing_required: "Nahitaezko eremuak falta dira.",
  invalid_birthdate: "Jaiotze-data ez da baliozkoa.",
  invalid_modality: "Modalitateak F7 edo F11 izan behar du.",
  invalid_type: "Motak alta edo berritzea izan behar du.",
  invalid_email: "Helbide elektroniko baten formatua ez da baliozkoa.",
  invalid_iban: "IBANak ez du baliozkotzea gainditu.",
  duplicate_in_file: "Erregistroa fitxategian bikoiztuta dago.",
  manual_decision: "Gatazka eskuz berrikusi behar da.",
  existing_updated: "Balioa duten gelaxkak bakarrik eguneratuko dira.",
  no_changes: "Ez dago aldaketarik egungo datu-basearekiko.",
  new_inscription: "Izen-emate berria.",
};

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};

export default function InscriptionImportWizard({ open, onOpenChange, onImported }) {
  const { lang } = useI18n(); const c = COPY[lang] || COPY.es;
  const [file, setFile] = useState(null); const [analysis, setAnalysis] = useState(null);
  const [decisions, setDecisions] = useState({}); const [express, setExpress] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [history, setHistory] = useState([]);
  const pendingConflicts = useMemo(() => unresolvedConflictIds(analysis, decisions), [analysis, decisions]);
  const allowed = canConfirmImport(analysis, decisions, express);

  const loadHistory = async () => { try { setHistory((await api.get("/inscription-imports/history")).data); } catch (_) {} };
  useEffect(() => { if (open) loadHistory(); }, [open]);
  const template = async () => { const r = await api.get("/inscription-imports/template", { responseType: "blob" }); downloadBlob(r.data, "plantilla_inscripciones_2026-2027.xlsx"); };
  const analyze = async () => {
    if (!file) return; setBusy(true); setError(""); setAnalysis(null); setExpress(false); setDecisions({});
    try { const body = new FormData(); body.append("file", file); body.append("season", "2026-2027"); setAnalysis((await api.post("/inscription-imports/analyze", body)).data); }
    catch (e) { setError(e.response?.data?.detail || "No se ha podido analizar el archivo."); }
    finally { setBusy(false); }
  };
  const report = async () => { const r = await api.post("/inscription-imports/error-report", { plan_token: analysis.plan_token }, { responseType: "blob" }); downloadBlob(r.data, "informe_importacion.xlsx"); };
  const confirm = async () => {
    setBusy(true); setError("");
    try { await api.post("/inscription-imports/confirm", { plan_token: analysis.plan_token, decisions, confirmed: true }); toast.success(c.applied); setAnalysis(null); setFile(null); setExpress(false); await loadHistory(); onImported?.(); }
    catch (e) { setError(e.response?.data?.detail || "No se ha podido completar la importación."); }
    finally { setBusy(false); }
  };
  const undo = async (job) => {
    if (!window.confirm(c.confirmUndo)) return; setBusy(true);
    try { await api.post(`/inscription-imports/${job.id}/undo`); toast.success(c.undone); await loadHistory(); onImported?.(); }
    catch (e) { setError(e.response?.data?.detail || "No se ha podido deshacer."); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto overflow-x-hidden" data-testid="inscription-import-dialog">
      <DialogHeader><DialogTitle className="flex items-start gap-2 pr-8 font-heading"><FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span>{c.title}</span></DialogTitle><DialogDescription>{c.description}</DialogDescription></DialogHeader>
      <div className="grid min-w-0 gap-4 rounded-2xl border bg-slate-50 p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <label className="grid min-w-0 gap-2 text-sm font-semibold">{c.file}<input data-testid="import-file" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block min-h-11 w-full min-w-0 rounded-xl border bg-white p-2 text-sm" /></label>
        <label className="grid gap-2 text-sm font-semibold">{c.season}<input value="2026-2027" readOnly className="h-11 rounded-xl border bg-white px-3" /></label>
        <Button data-testid="analyze-import" onClick={analyze} disabled={!file || busy} className="h-11"><Upload className="h-4 w-4" />{c.analyze}</Button>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2 text-sm"><Button variant="outline" onClick={template}><Download className="h-4 w-4" />{c.template}</Button><span className="min-w-0 whitespace-normal rounded-xl bg-teal-50 px-3 py-2 text-teal-900">{c.expected}</span><span className="min-w-0 whitespace-normal rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{c.october}</span></div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {!analysis ? <div className="rounded-2xl border-2 border-dashed p-8 text-center text-slate-500">{busy ? "…" : c.empty}</div> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{SUMMARY_ORDER.map((key) => <div key={key} className="rounded-xl border bg-white p-3"><p className="text-xs text-slate-500">{c[SUMMARY_LABEL[key]]}</p><p className="text-2xl font-bold">{analysis.summary[key]}</p></div>)}</div>
        {analysis.blocking_errors > 0 && <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" />{c.severe}</div>}
        <div className="max-h-64 overflow-auto rounded-xl border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">{c.row}</th><th className="p-2">{c.status}</th><th className="p-2">{c.code}</th><th className="p-2">{c.message}</th><th className="p-2">{c.decision}</th></tr></thead><tbody>{analysis.rows.map((row, index) => <tr key={`${row.row}-${index}`} className="border-t"><td className="p-2">{row.row}</td><td className="p-2 font-semibold">{ROW_STATUS[lang]?.[row.status] || row.status}</td><td className="p-2">{row.code}</td><td className="p-2">{lang === "eu" ? ROW_MESSAGES_EU[row.code] || row.message : row.message}</td><td className="p-2">{row.status === "conflict" && <select aria-label={`${c.conflict} ${row.row}`} value={decisions[row.conflict_id] || ""} onChange={(e) => setDecisions((d) => ({...d, [row.conflict_id]: e.target.value}))} className="h-10 rounded-lg border px-2"><option value="">{c.conflict}</option><option value="skip">{c.skip}</option></select>}</td></tr>)}</tbody></table></div>
        <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="mt-1 h-4 w-4" /><span>{c.confirmLabel}</span></label><div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={report}><Download className="h-4 w-4" />{c.report}</Button><Button data-testid="confirm-import" disabled={!allowed || busy} onClick={confirm}><CheckCircle2 className="h-4 w-4" />{c.confirm}</Button></div></div>
        {pendingConflicts.length > 0 && <p className="text-sm text-amber-700">{pendingConflicts.length} · {c.conflict}</p>}
      </>}
      <section className="border-t pt-4"><h3 className="mb-3 flex items-center gap-2 font-heading font-bold"><History className="h-4 w-4" />{c.history}</h3><div className="space-y-2">{history.map((job) => <div key={job.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span><b>{job.season}</b> · {job.status} · {job.created_at?.slice(0, 16)} · {job.file_sha256}</span>{job.status === "applied" && <Button variant="outline" size="sm" onClick={() => undo(job)} disabled={busy}><RotateCcw className="h-4 w-4" />{c.undo}</Button>}</div>)}</div></section>
    </DialogContent>
  </Dialog>;
}
