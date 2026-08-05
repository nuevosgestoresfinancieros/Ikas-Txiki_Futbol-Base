import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, Download, History, Lock, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared";

const ROLE_OPTIONS = [
  ["starter", "matchReportStarter"],
  ["substitute", "matchReportSubstitute"],
  ["did_not_play", "matchReportDidNotPlay"],
  ["absent", "matchReportAbsent"],
  ["late_withdrawal", "matchReportLateWithdrawal"],
  ["not_called", "matchReportNotCalled"],
];

const numberValue = (value) => Math.max(0, Number(value) || 0);
const participantName = (data, playerId) => data?.candidates?.find((row) => row.id === playerId)?.name || "—";

export const matchReportSummary = (participants = []) => participants.reduce((summary, row) => ({
  called: summary.called + Number(Boolean(row.called_up)),
  starters: summary.starters + Number(row.role === "starter"),
  played: summary.played + Number(Boolean(row.played)),
  minutes: summary.minutes + numberValue(row.minutes),
  goals: summary.goals + numberValue(row.goals),
}), { called: 0, starters: 0, played: 0, minutes: 0, goals: 0 });

const MatchReport = ({ match, open, onOpenChange }) => {
  const { t, lang } = useI18n();
  const canEdit = usePermission("match-reports", "edit");
  const canCreate = usePermission("match-reports", "create");
  const canReopen = usePermission("match-reports", "administer");
  const canExport = usePermission("match-reports", "export");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState(null);
  const [reopenReason, setReopenReason] = useState("");
  const [scoreReason, setScoreReason] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    if (!match?.id) return;
    setLoading(true); setError("");
    try {
      const response = await api.get(`/match-reports/match/${match.id}`);
      setData(response.data); setValidation(null); setDirty(false);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("matchReportLoadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && match?.id) load();
    if (!open) { setData(null); setError(""); setValidation(null); setReopenReason(""); setScoreReason(""); setDirty(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, match?.id]);

  const participants = useMemo(() => data?.participants || [], [data?.participants]);
  const summary = useMemo(() => matchReportSummary(participants), [participants]);
  const closed = data?.status === "closed";

  const updateParticipant = (playerId, field, value) => {
    setData((current) => ({
      ...current,
      participants: current.participants.map((row) => row.player_id === playerId ? { ...row, [field]: value } : row),
    }));
    setValidation(null); setDirty(true);
  };

  const togglePeriod = (playerId, periodId, checked) => {
    const row = participants.find((item) => item.player_id === playerId);
    const selected = new Set(row?.period_ids || []);
    if (checked) selected.add(periodId); else selected.delete(periodId);
    updateParticipant(playerId, "period_ids", [...selected]);
  };

  const addSubstitution = () => {
    const firstPeriod = data?.configuration?.periods?.[0]?.id || "";
    const starters = participants.filter((row) => row.role === "starter");
    const bench = participants.filter((row) => row.role === "substitute");
    setData((current) => ({ ...current, substitutions: [...(current.substitutions || []), {
      incoming_player_id: bench[0]?.player_id || "none",
      outgoing_player_id: starters[0]?.player_id || "none",
      period_id: firstPeriod, minute: 0, notes: "",
    }] }));
    setValidation(null); setDirty(true);
  };

  const updateSubstitution = (index, field, value) => {
    setData((current) => ({ ...current, substitutions: (current.substitutions || []).map((row, position) => (
      position === index ? { ...row, [field]: value } : row
    )) }));
    setValidation(null); setDirty(true);
  };

  const addGoal = () => {
    setData((current) => ({ ...current, goal_events: [...(current.goal_events || []), {
      kind: "player", scorer_player_id: participants.find((row) => row.played)?.player_id || "none",
      period_id: data?.configuration?.periods?.[0]?.id || "", minute: 0, notes: "",
    }] }));
    setValidation(null); setDirty(true);
  };

  const updateGoal = (index, field, value) => {
    setData((current) => ({ ...current, goal_events: (current.goal_events || []).map((row, position) => (
      position === index ? { ...row, [field]: value } : row
    )) }));
    setValidation(null); setDirty(true);
  };

  const initialize = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await api.post(`/match-reports/match/${match.id}`);
      setData(response.data); setDirty(false);
      toast.success(t("matchReportDraftCreated"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("matchReportSaveError"));
    } finally { busyRef.current = false; setSaving(false); }
  };

  const save = async () => {
    if (busyRef.current || !data?.report) return;
    busyRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await api.put(`/match-reports/match/${match.id}`, {
        version: data.version,
        participants,
        internal_notes: data.internal_notes || null,
        period_configuration: data.configuration,
        substitutions: data.substitutions || [],
        goal_events: data.goal_events || [],
      });
      setData(response.data); setValidation(response.data.validation || null); setDirty(false);
      toast.success(t("matchReportSaved"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail?.message || requestError.response?.data?.detail || t("matchReportSaveError"));
      if (requestError.response?.data?.detail?.errors) setValidation(requestError.response.data.detail);
    } finally { busyRef.current = false; setSaving(false); }
  };

  const validate = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await api.post(`/match-reports/match/${match.id}/validate`);
      setValidation(response.data);
      return response.data;
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("matchReportValidationError"));
      return null;
    } finally { busyRef.current = false; setSaving(false); }
  };

  const closeReport = async () => {
    if (busyRef.current) return;
    const result = await validate();
    const scoreOnly = result?.errors?.length && result.errors.every((message) => message.includes("marcador oficial"));
    if (!result || (result.errors?.length && !(canReopen && scoreOnly && scoreReason.trim().length >= 3))) return;
    const confirmWarnings = Boolean(result.warnings?.length || (scoreOnly && canReopen && scoreReason.trim()));
    if (confirmWarnings && !window.confirm(t("matchReportConfirmWarnings"))) return;
    if (!window.confirm(t("matchReportCloseConfirm"))) return;
    busyRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await api.post(`/match-reports/match/${match.id}/close`, {
        version: data.version, confirm_warnings: confirmWarnings,
        confirm_score_discrepancy: Boolean(canReopen && scoreReason.trim()),
        score_discrepancy_reason: canReopen ? scoreReason.trim() || null : null,
      });
      setData(response.data); setValidation(response.data.validation || result); setDirty(false);
      toast.success(t("matchReportClosedSuccess"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail?.message || requestError.response?.data?.detail || t("matchReportCloseError"));
    } finally { busyRef.current = false; setSaving(false); }
  };

  const exportPdf = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true); setError("");
    try {
      const response = await api.get(`/match-reports/match/${match.id}/export.pdf`, { params: { lang }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `acta_${match.id}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("matchReportExportError"));
    } finally { busyRef.current = false; setSaving(false); }
  };

  const changeOpen = (nextOpen) => {
    if (!nextOpen && dirty && !window.confirm(t("matchReportDiscardChanges"))) return;
    onOpenChange(nextOpen);
  };

  const reopen = async () => {
    if (busyRef.current || reopenReason.trim().length < 3) return;
    busyRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await api.post(`/match-reports/match/${match.id}/reopen`, {
        version: data.version, reason: reopenReason.trim(),
      });
      setData(response.data); setReopenReason(""); setDirty(false);
      toast.success(t("matchReportReopenedSuccess"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("matchReportReopenError"));
    } finally { busyRef.current = false; setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[95vh] max-w-7xl overflow-y-auto" data-testid="match-report-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />{t("matchReportTitle")}</DialogTitle>
          <DialogDescription>{t("matchReportInternalHint")}</DialogDescription>
        </DialogHeader>

        {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">{t("loading")}</p> : null}
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{String(error)}</span><Button variant="outline" size="sm" onClick={load}>{t("retry")}</Button></div>}

        {!loading && data ? <div className="space-y-4">
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("matchReportHeader")}>
            <div className="sm:col-span-2"><p className="text-xs font-semibold text-slate-500">{t("matches")}</p><p className="font-semibold text-slate-900">{data.header?.team_name} · {data.header?.rival || "—"}</p><p className="text-xs text-slate-500">{data.header?.fecha || "—"} · {data.header?.hora || "—"} · {data.header?.campo || "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("modality")}</p><p>{data.header?.modalidad || "—"} · {data.header?.jornada || "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("status")}</p><StatusBadge status={data.status || "draft"} /></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("result")}</p><p className="font-heading text-xl font-bold">{data.header?.result?.own ?? "—"} - {data.header?.result?.rival ?? "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("season")}</p><p>{data.header?.temporada || "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("category")}</p><p>{data.header?.categoria || "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">{t("matchReportVersion")}</p><p>{data.version || "—"}</p></div>
            {data.report && <><div><p className="text-xs font-semibold text-slate-500">{t("matchReportOrigin")}</p><p>{data.origin || "—"}</p></div><div><p className="text-xs font-semibold text-slate-500">{t("matchReportAuthor")}</p><p>{data.created_by || "—"}</p></div><div><p className="text-xs font-semibold text-slate-500">{t("matchReportCreatedAt")}</p><p>{data.created_at || "—"}</p></div><div><p className="text-xs font-semibold text-slate-500">{t("matchReportUpdatedAt")}</p><p>{data.updated_at || "—"}</p></div>{data.closed_at && <div><p className="text-xs font-semibold text-slate-500">{t("matchReportClosedAt")}</p><p>{data.closed_at} · {data.closed_by || "—"}</p></div>}{data.reopened_at && <div><p className="text-xs font-semibold text-slate-500">{t("matchReportReopenedAt")}</p><p>{data.reopened_at} · {data.reopened_by || "—"}</p></div>}</>}
          </section>

          <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4" aria-label={t("matchReportCallupSummary")}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">{t("matchReportCallupSummary")}</h3><span className="text-sm text-slate-600">{data.callup?.exists ? `${data.callup.count} · ${data.callup.responses?.confirmed || 0} ${t("confirmed")}` : t("matchReportNoCallup")}</span></div>
            {data.setup_warning && <p className="mt-2 flex gap-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{data.setup_warning}</p>}
          </section>

          {!data.report ? <section className="rounded-2xl border border-dashed border-slate-300 p-8 text-center"><p className="text-sm text-slate-600">{t("matchReportEmpty")}</p>{canCreate && <Button className="mt-4" onClick={initialize} disabled={saving}><ClipboardList className="h-4 w-4" />{t("matchReportCreateDraft")}</Button>}</section> : <>
            <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-5" aria-label={t("matchReportObjectiveSummary")}>
              {[["called","matchReportCalled"],["starters","matchReportStarters"],["played","matchReportPlayed"],["minutes","matchReportMinutes"],["goals","goals"]].map(([key,label]) => <div key={key}><p className="text-xs text-slate-500">{t(label)}</p><p className="text-xl font-bold text-slate-900">{summary[key]}</p></div>)}
            </section>

            {validation && <section className={`rounded-xl border p-3 text-sm ${validation.errors?.length ? "border-red-200 bg-red-50 text-red-800" : validation.warnings?.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"}`} aria-label={t("matchReportValidation")}>
              <p className="font-semibold">{t("matchReportValidation")}</p>
              {validation.errors?.map((message) => <p key={`e-${message}`}>• {message}</p>)}
              {validation.warnings?.map((message) => <p key={`w-${message}`}>• {message}</p>)}
              {!validation.errors?.length && !validation.warnings?.length && <p>{t("matchReportValid")}</p>}
            </section>}

            <section aria-label={t("matchReportParticipants")} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading text-lg font-bold text-slate-900">{t("matchReportParticipants")}</h3><p className="text-xs text-slate-500">{data.configuration?.code} · {data.configuration?.total_minutes} {t("minutes")}</p></div>
              {!participants.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{t("matchReportNoPlayers")}</p> : <div className="grid gap-4 xl:grid-cols-2">{participants.map((row) => <article key={row.player_id} data-testid={`match-report-player-${row.player_id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold text-slate-900">{participantName(data,row.player_id)}</h4><p className="text-xs text-slate-500">{row.called_up ? t("matchReportCalled") : t("matchReportNotCalled")}{row.callup_response ? ` · ${row.callup_response}` : ""}</p></div><StatusBadge status={row.role} /></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportParticipationRole")}<Select value={row.role || "did_not_play"} onValueChange={(value) => updateParticipant(row.player_id,"role",value)} disabled={closed}><SelectTrigger className="mt-1 h-10" data-testid={`match-report-role-${row.player_id}`} aria-label={`${t("matchReportParticipationRole")} ${participantName(data,row.player_id)}`}><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(([value,label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectContent></Select></label>
                  <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-slate-200 px-3 text-sm"><input type="checkbox" checked={!!row.played} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"played",event.target.checked)} />{t("matchReportParticipated")}</label>
                  <label className="text-xs font-semibold text-slate-600">{t("number")}<input value={row.shirt_number || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"shirt_number",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportInitialPosition")}<input value={row.initial_position || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"initial_position",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportMinutes")}<input type="number" min="0" max={canReopen ? 1000 : data.configuration?.total_minutes || 1000} value={row.minutes ?? 0} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"minutes",numberValue(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("goals")}<input type="number" min="0" value={row.goals ?? 0} disabled readOnly className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportOwnGoals")}<input type="number" min="0" value={row.own_goals ?? 0} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"own_goals",numberValue(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportEntries")}<input type="number" min="0" value={row.entries ?? 0} disabled readOnly className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportExits")}<input type="number" min="0" value={row.exits ?? 0} disabled readOnly className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm" /></label>
                  <div className="sm:col-span-2 lg:col-span-1"><p className="text-xs font-semibold text-slate-600">{t("matchReportPeriods")}</p><div className="mt-1 flex flex-wrap gap-2">{data.configuration?.periods?.map((period) => <label key={period.id} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"><input type="checkbox" disabled={closed} checked={row.period_ids?.includes(period.id) || false} onChange={(event) => togglePeriod(row.player_id,period.id,event.target.checked)} />{period.id}</label>)}</div></div>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportInitialPeriod")}<select value={row.initial_period || "none"} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"initial_period",event.target.value === "none" ? null : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"><option value="none">{t("matchReportNoPeriod")}</option>{data.configuration?.periods?.map((period) => <option key={period.id} value={period.id}>{period.id}</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-600">{t("matchReportFinalPeriod")}<select value={row.final_period || "none"} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"final_period",event.target.value === "none" ? null : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"><option value="none">{t("matchReportNoPeriod")}</option>{data.configuration?.periods?.map((period) => <option key={period.id} value={period.id}>{period.id}</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{t("matchReportIncidents")}<input value={(row.incidents || []).join(", ")} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"incidents",event.target.value.split(",").map((value)=>value.trim()).filter(Boolean))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>
                  {!row.played && row.role !== "not_called" && <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{t("matchReportNonParticipationReason")}<input value={row.non_participation_reason || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"non_participation_reason",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" /></label>}
                  {!row.called_up && row.role !== "not_called" && <label className="text-xs font-semibold text-amber-800 sm:col-span-2">{t("matchReportExceptionalReason")}<input value={row.exceptional_reason || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"exceptional_reason",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-amber-300 px-2 text-sm" /></label>}
                  {["declined","rechazada","rechazado","no_puede"].includes(String(row.callup_response || "").toLowerCase()) && row.played && <label className="text-xs font-semibold text-amber-800 sm:col-span-2">{t("matchReportAvailabilityOverrideReason")}<input value={row.availability_override_reason || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"availability_override_reason",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-amber-300 px-2 text-sm" /></label>}
                  {canReopen && row.minutes > (data.configuration?.total_minutes || 0) && <label className="text-xs font-semibold text-amber-800 sm:col-span-2">{t("matchReportMinutesOverrideReason")}<input value={row.minutes_override_reason || ""} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"minutes_override_reason",event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-amber-300 px-2 text-sm" /></label>}
                  {((!row.called_up && row.role !== "not_called") || (["declined","rechazada","rechazado","no_puede"].includes(String(row.callup_response || "").toLowerCase()) && row.played) || row.minutes > (data.configuration?.total_minutes || 0)) && <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 sm:col-span-2"><input type="checkbox" checked={!!row.warning_confirmed} disabled={closed} onChange={(event) => updateParticipant(row.player_id,"warning_confirmed",event.target.checked)} />{t("matchReportConfirmException")}</label>}
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{t("matchReportInternalNotes")}<textarea value={row.internal_notes || ""} disabled={closed} rows={2} onChange={(event) => updateParticipant(row.player_id,"internal_notes",event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
                </div>
              </article>)}</div>}
            </section>

            <section className="rounded-2xl border border-slate-200 p-4" aria-label={t("matchReportSubstitutions")}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">{t("matchReportSubstitutions")}</h3>{!closed && <Button type="button" variant="outline" size="sm" onClick={addSubstitution}><Plus className="h-4 w-4" />{t("matchReportAddSubstitution")}</Button>}</div>
              {!(data.substitutions || []).length ? <p className="mt-2 text-sm text-slate-500">{t("matchReportNoSubstitutions")}</p> : <div className="mt-3 space-y-3">{(data.substitutions || []).map((movement,index) => <div key={movement.id || `sub-${index}`} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_100px_1fr_auto]">
                <label className="text-xs font-semibold">{t("matchReportIncomingPlayer")}<select value={movement.incoming_player_id || "none"} disabled={closed} onChange={(event)=>updateSubstitution(index,"incoming_player_id",event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border px-2"><option value="none">—</option>{participants.map((row)=><option key={row.player_id} value={row.player_id}>{participantName(data,row.player_id)}</option>)}</select></label>
                <label className="text-xs font-semibold">{t("matchReportOutgoingPlayer")}<select value={movement.outgoing_player_id || "none"} disabled={closed} onChange={(event)=>updateSubstitution(index,"outgoing_player_id",event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border px-2"><option value="none">—</option>{participants.map((row)=><option key={row.player_id} value={row.player_id}>{participantName(data,row.player_id)}</option>)}</select></label>
                <label className="text-xs font-semibold">{t("matchReportPeriods")}<select value={movement.period_id || "none"} disabled={closed} onChange={(event)=>updateSubstitution(index,"period_id",event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2"><option value="none">—</option>{data.configuration?.periods?.map((period)=><option key={period.id} value={period.id}>{period.id}</option>)}</select></label>
                <label className="text-xs font-semibold">{t("matchReportMinute")}<input type="number" min="0" max={data.configuration?.total_minutes || 1000} value={movement.minute ?? 0} disabled={closed} onChange={(event)=>updateSubstitution(index,"minute",numberValue(event.target.value))} className="mt-1 h-10 w-full rounded-lg border px-2" /></label>
                <label className="text-xs font-semibold">{t("matchReportObjectiveNote")}<input value={movement.notes || ""} disabled={closed} onChange={(event)=>updateSubstitution(index,"notes",event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2" /></label>
                {!closed && <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`${t("matchReportRemoveSubstitution")} ${index + 1}`} onClick={()=>{setData((current)=>({...current,substitutions:(current.substitutions || []).filter((_,position)=>position!==index)}));setDirty(true);setValidation(null);}}><Trash2 className="h-4 w-4" /></Button>}
              </div>)}</div>}
            </section>

            <section className="rounded-2xl border border-slate-200 p-4" aria-label={t("matchReportGoalEvents")}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-800">{t("matchReportGoalEvents")}</h3><p className="text-xs text-slate-500">{(data.goal_events || []).length} / {data.header?.result?.own ?? "—"}</p></div>{!closed && <Button type="button" variant="outline" size="sm" onClick={addGoal}><Plus className="h-4 w-4" />{t("matchReportAddGoal")}</Button>}</div>
              {!(data.goal_events || []).length ? <p className="mt-2 text-sm text-slate-500">{t("matchReportNoGoals")}</p> : <div className="mt-3 space-y-3">{(data.goal_events || []).map((goal,index) => <div key={goal.id || `goal-${index}`} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[150px_1fr_120px_100px_1fr_auto]">
                <label className="text-xs font-semibold">{t("matchReportGoalType")}<select value={goal.kind || "player"} disabled={closed} onChange={(event)=>updateGoal(index,"kind",event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2"><option value="player">{t("matchReportGoalPlayer")}</option><option value="opponent_own_goal">{t("matchReportOpponentOwnGoal")}</option><option value="unidentified">{t("matchReportUnidentifiedGoal")}</option></select></label>
                <label className="text-xs font-semibold">{t("matchReportScorer")}<select value={goal.scorer_player_id || "none"} disabled={closed || goal.kind !== "player"} onChange={(event)=>updateGoal(index,"scorer_player_id",event.target.value === "none" ? null : event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border px-2"><option value="none">—</option>{participants.map((row)=><option key={row.player_id} value={row.player_id}>{participantName(data,row.player_id)}</option>)}</select></label>
                <label className="text-xs font-semibold">{t("matchReportPeriods")}<select value={goal.period_id || "none"} disabled={closed} onChange={(event)=>updateGoal(index,"period_id",event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2"><option value="none">—</option>{data.configuration?.periods?.map((period)=><option key={period.id} value={period.id}>{period.id}</option>)}</select></label>
                <label className="text-xs font-semibold">{t("matchReportMinute")}<input type="number" min="0" max={data.configuration?.total_minutes || 1000} value={goal.minute ?? 0} disabled={closed} onChange={(event)=>updateGoal(index,"minute",numberValue(event.target.value))} className="mt-1 h-10 w-full rounded-lg border px-2" /></label>
                <label className="text-xs font-semibold">{t("matchReportObjectiveNote")}<input value={goal.notes || ""} disabled={closed} onChange={(event)=>updateGoal(index,"notes",event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2" /></label>
                {!closed && <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`${t("matchReportRemoveGoal")} ${index + 1}`} onClick={()=>{setData((current)=>({...current,goal_events:(current.goal_events || []).filter((_,position)=>position!==index)}));setDirty(true);setValidation(null);}}><Trash2 className="h-4 w-4" /></Button>}
              </div>)}</div>}
              {!closed && canReopen && (data.goal_events || []).length !== Number(data.header?.result?.own ?? 0) && <label className="mt-3 block text-xs font-semibold text-amber-900">{t("matchReportScoreDiscrepancyReason")}<textarea value={scoreReason} onChange={(event)=>setScoreReason(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-amber-300 p-2" /></label>}
            </section>

            <section className="rounded-2xl border border-slate-200 p-4"><label className="text-sm font-semibold text-slate-700">{t("matchReportGeneralNotes")}<textarea data-testid="match-report-general-notes" value={data.internal_notes || ""} disabled={closed} rows={3} onChange={(event) => {setData((current)=>({...current,internal_notes:event.target.value}));setDirty(true);}} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label></section>

            <section className="rounded-2xl border border-slate-200 p-4" aria-label={t("matchReportHistory")}><h3 className="flex items-center gap-2 font-semibold text-slate-800"><History className="h-4 w-4" />{t("matchReportHistory")}</h3>{!data.history?.length ? <p className="mt-2 text-sm text-slate-500">{t("matchReportHistoryEmpty")}</p> : <ul className="mt-2 space-y-1 text-xs text-slate-600">{data.history.slice().reverse().slice(0,20).map((event) => <li key={event.id} className="rounded-lg bg-slate-50 p-2">{event.created_at || "—"} · {event.action} · {event.actor_role || "—"}</li>)}</ul>}</section>

            {closed && canReopen && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><label className="text-sm font-semibold text-amber-950">{t("matchReportReopenReason")}<textarea data-testid="match-report-reopen-reason" value={reopenReason} onChange={(event)=>setReopenReason(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-amber-300 bg-white p-2 text-sm" /></label><Button className="mt-3" variant="outline" onClick={reopen} disabled={saving || reopenReason.trim().length < 3}><RotateCcw className="h-4 w-4" />{t("matchReportReopen")}</Button></section>}
          </>}
        </div> : null}

        {dirty && <p role="status" className="text-xs font-semibold text-amber-700">{t("matchReportUnsavedChanges")}</p>}
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={() => changeOpen(false)}>{t("cancel")}</Button>
          {data?.report && closed && canExport && <Button variant="outline" onClick={exportPdf} disabled={saving}><Download className="h-4 w-4" />{t("matchReportExportPdf")}</Button>}
          {data?.report && !closed && canEdit && <><Button variant="outline" onClick={validate} disabled={saving}><ShieldCheck className="h-4 w-4" />{t("matchReportValidate")}</Button><Button variant="outline" data-testid="match-report-save" onClick={save} disabled={saving}><Save className="h-4 w-4" />{t("matchReportSaveDraft")}</Button><Button onClick={closeReport} disabled={saving}><Lock className="h-4 w-4" />{t("matchReportClose")}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MatchReport;
