import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, History, Save, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared";

export const EVALUATION_SCORE_FIELDS = [
  ["participacion", "evaluationParticipation"],
  ["actitud", "evaluationAttitude"],
  ["esfuerzo", "evaluationEffort"],
  ["comprension_tactica", "evaluationTacticalUnderstanding"],
  ["tecnica", "evaluationTechnique"],
  ["condicion_fisica", "evaluationFitness"],
];

const FILTERS = ["all", "evaluated", "pending", "absent", "incomplete"];
const SCORE_OPTIONS = [
  { value: "unset", label: "—" },
  ...[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) })),
];

const editableEvaluation = (row) => {
  const evaluation = row.evaluation || {};
  return {
    training_id: evaluation.training_id || "",
    player_id: row.player_id,
    asistencia: row.asistencia || evaluation.asistencia || null,
    estado: evaluation.estado || "draft",
    fecha_evaluacion: evaluation.fecha_evaluacion || null,
    observaciones: evaluation.observaciones || "",
    incidencias: evaluation.incidencias || "",
    ...Object.fromEntries(EVALUATION_SCORE_FIELDS.map(([field]) => [field, evaluation[field] ?? "unset"])),
  };
};

const scoreValue = (value) => value === "unset" || value === "" || value == null ? null : Number(value);

export const evaluationPayload = (draft, trainingId, status = "draft") => ({
  training_id: trainingId,
  player_id: draft.player_id,
  asistencia: draft.asistencia,
  estado: status,
  fecha_evaluacion: draft.fecha_evaluacion || undefined,
  observaciones: draft.observaciones || undefined,
  incidencias: draft.incidencias || undefined,
  ...Object.fromEntries(EVALUATION_SCORE_FIELDS.map(([field]) => [field, scoreValue(draft[field])])),
});

const TrainingEvaluations = ({ training, open, onOpenChange }) => {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    if (!training?.id) return;
    setLoading(true); setError(false);
    try {
      const response = await api.get(`/training-evaluations/training/${training.id}`);
      setData(response.data);
      setDrafts(Object.fromEntries((response.data.players || []).map((row) => [row.player_id, editableEvaluation(row)])));
      setDirty(new Set());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { load(); setHistory(null); setFilter("all"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, training?.id]);

  const rows = useMemo(() => {
    if (!data?.players) return [];
    return data.players.filter((row) => {
      if (filter === "evaluated") return Boolean(row.evaluation);
      if (filter === "pending") return !row.evaluation;
      if (filter === "absent") return ["justificada", "injustificada", "lesion"].includes(row.asistencia);
      if (filter === "incomplete") return row.evaluation_status === "draft";
      return true;
    });
  }, [data, filter]);

  const setDraftValue = (playerId, field, value) => {
    setDrafts((current) => ({ ...current, [playerId]: { ...current[playerId], [field]: value } }));
    setDirty((current) => new Set([...current, playerId]));
  };

  const saveEvaluation = async (row, status = "draft") => {
    const draft = drafts[row.player_id];
    if (!draft) return;
    try {
      const payload = evaluationPayload(draft, training.id, status);
      if (row.evaluation?.id) await api.put(`/training-evaluations/${row.evaluation.id}`, payload);
      else await api.post("/training-evaluations", payload);
      toast.success(status === "closed" ? t("evaluationClosedSuccess") : t("evaluationSaved"));
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.detail || t("evaluationSaveError"));
    }
  };

  const saveAll = async () => {
    const selected = rows.filter((row) => dirty.has(row.player_id));
    if (!selected.length) return;
    try {
      await api.post("/training-evaluations/bulk", {
        training_id: training.id,
        evaluations: selected.map((row) => evaluationPayload(drafts[row.player_id], training.id)),
      });
      toast.success(t("evaluationSaved"));
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.detail || t("evaluationSaveError"));
    }
  };

  const closeEvaluation = async (row) => {
    if (!row.evaluation?.id || !window.confirm(t("evaluationCloseConfirm"))) return;
    try {
      await api.post(`/training-evaluations/${row.evaluation.id}/close`);
      toast.success(t("evaluationClosedSuccess"));
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.detail || t("evaluationSaveError"));
    }
  };

  const loadHistory = async (row) => {
    try {
      const response = await api.get(`/training-evaluations/player/${row.player_id}`);
      setHistory(response.data);
    } catch {
      toast.error(t("evaluationLoadError"));
    }
  };

  const scoreDisabled = (row) => row.asistencia !== "presente" || row.evaluation_status === "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] max-w-6xl overflow-y-auto" data-testid="training-evaluations-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{t("trainingEvaluations")}</DialogTitle>
          <DialogDescription>
            {data?.team?.nombre || training?.equipo_nombre || "—"} · {training?.fecha || "—"}. {t("evaluationInternalHint")}
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="py-10 text-center text-sm text-slate-500">{t("loading")}</p> : error ? (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <span>{t("evaluationLoadError")}</span><Button variant="outline" onClick={load}>{t("retry")}</Button>
          </div>
        ) : data ? <>
          <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5" aria-label={t("evaluationSummary")}>
            <div><p className="text-xs text-slate-500">{t("evaluationEvaluated")}</p><p className="text-xl font-bold">{data.summary.evaluated}</p></div>
            <div><p className="text-xs text-slate-500">{t("evaluationPending")}</p><p className="text-xl font-bold">{data.summary.pending}</p></div>
            <div><p className="text-xs text-slate-500">{t("evaluationIncomplete")}</p><p className="text-xl font-bold">{data.summary.incomplete}</p></div>
            <div><p className="text-xs text-slate-500">{t("evaluationAbsent")}</p><p className="text-xl font-bold">{data.summary.absent}</p></div>
            <div className="col-span-2 sm:col-span-1"><label className="text-xs font-semibold text-slate-600" htmlFor="evaluation-filter">{t("evaluationFilter")}</label><select id="evaluation-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="all">{t("evaluationFilterAll")}</option><option value="evaluated">{t("evaluationFilterEvaluated")}</option><option value="pending">{t("evaluationFilterPending")}</option><option value="absent">{t("evaluationFilterAbsent")}</option><option value="incomplete">{t("evaluationFilterIncomplete")}</option></select></div>
          </section>
          <p className="text-xs text-slate-500">{t("evaluationScale")}</p>

          {!rows.length ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{t("evaluationNoPlayers")}</p> :
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((row) => {
                const draft = drafts[row.player_id] || editableEvaluation(row);
                const disabled = scoreDisabled(row);
                return <article key={row.player_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`evaluation-row-${row.player_id}`}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="font-semibold text-slate-800">{row.player_name}</h3><p className="text-xs text-slate-500">{t("evaluationAttendance")}: {row.asistencia ? <StatusBadge status={row.asistencia} /> : t("evaluationNoAttendance")}</p></div>
                    <div className="flex items-center gap-2"><StatusBadge status={row.evaluation_status} /><Button variant="ghost" size="icon" aria-label={`${t("evaluationHistory")} ${row.player_name}`} onClick={() => loadHistory(row)}><History className="h-4 w-4" /></Button></div>
                  </div>
                  {disabled && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{row.evaluation_status === "closed" ? t("evaluationClosed") : t("evaluationNoScoresAbsent")}</div>}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {EVALUATION_SCORE_FIELDS.map(([field, label]) => <label key={field} className="text-xs font-semibold text-slate-600">{t(label)}<Select value={String(draft[field] ?? "unset")} onValueChange={(value) => setDraftValue(row.player_id, field, value)} disabled={disabled}><SelectTrigger className="mt-1 h-10 text-sm" aria-label={`${t(label)} ${row.player_name}`}><SelectValue /></SelectTrigger><SelectContent>{SCORE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>)}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600">{t("evaluationObservations")}<textarea value={draft.observaciones || ""} onChange={(event) => setDraftValue(row.player_id, "observaciones", event.target.value)} disabled={row.evaluation_status === "closed"} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
                    <label className="text-xs font-semibold text-slate-600">{t("evaluationIncidents")}<textarea value={draft.incidencias || ""} onChange={(event) => setDraftValue(row.player_id, "incidencias", event.target.value)} disabled={row.evaluation_status === "closed"} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" disabled={row.evaluation_status === "closed" || !dirty.has(row.player_id)} onClick={() => saveEvaluation(row)}><Save className="h-4 w-4" />{t("evaluationSave")}</Button>
                    {row.evaluation && row.evaluation_status !== "closed" && <Button variant="outline" size="sm" disabled={dirty.has(row.player_id)} onClick={() => closeEvaluation(row)}><Lock className="h-4 w-4" />{t("evaluationClose")}</Button>}
                  </div>
                </article>;
              })}
            </div>}

          {history && <section className="rounded-xl border border-primary/20 bg-primary/5 p-4" aria-label={t("evaluationHistory")}>
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">{t("evaluationHistory")}: {history.player?.nombre}</h3><Button variant="ghost" size="sm" onClick={() => setHistory(null)}>{t("cancel")}</Button></div>
            {!history.evaluations?.length ? <p className="mt-2 text-sm text-slate-500">{t("evaluationHistoryEmpty")}</p> : <ul className="mt-2 space-y-2 text-sm">{history.evaluations.slice(0, 10).map((evaluation) => <li key={evaluation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"><span>{evaluation.fecha_evaluacion || "—"}</span><StatusBadge status={evaluation.estado} /><span className="text-xs text-slate-500">{evaluation.evaluador_role || "—"}</span></li>)}</ul>}
          </section>}
        </> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={saveAll} disabled={!dirty.size || loading}><Save className="h-4 w-4" />{t("evaluationSaveAll")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TrainingEvaluations;
