import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ClipboardCheck, Download, Euro, FileCheck, MessageSquare, RefreshCw, ShieldCheck, Trophy, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/shared";
import { attendancePercentage, filterPortalByPlayer, nextPortalActivity } from "./portalView";

const Card = ({ title, icon: Icon, children, testid }) => <section className="surface-card p-4 sm:p-5" data-testid={testid}>
  <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-slate-900"><Icon className="h-5 w-5 text-primary" />{title}</h2>{children}
</section>;
const Empty = ({ children }) => <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;

export default function Portal({ user }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await api.get("/portal");
      setData(response.data);
      setSelectedId((current) => current || response.data.players?.[0]?.id || "");
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => filterPortalByPlayer(data || {}, selectedId), [data, selectedId]);
  const next = useMemo(() => nextPortalActivity(view.schedule), [view.schedule]);
  const formatDate = (value, options = { dateStyle: "medium" }) => {
    if (!value) return "—";
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(lang === "eu" ? "eu-ES" : "es-ES", options).format(parsed);
  };

  const respond = async (callup, status) => {
    if (!window.confirm(t(status === "confirmed" ? "confirmCallupQuestion" : "declineCallupQuestion"))) return;
    const reason = status === "declined" ? window.prompt(t("declineReasonOptional")) : null;
    try {
      await api.patch(`/callups/${callup.id}/respond`, { player_id: view.player.id, status, reason });
      toast.success(t("responseSaved")); await load();
    } catch (requestError) { toast.error(requestError.response?.data?.detail || t("portalLoadError")); }
  };
  const download = async (path, filename) => {
    try {
      const response = await api.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(response.data); const link = document.createElement("a");
      link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    } catch { toast.error(t("downloadError")); }
  };

  if (loading) return <div className="py-20 text-center text-sm text-slate-500" role="status">{t("loading")}</div>;
  if (error) return <div className="surface-card flex flex-col items-center gap-4 p-12 text-center" role="alert"><p className="text-red-600">{t("portalLoadError")}</p><Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t("retry")}</Button></div>;
  if (!view.player) return <div><PageHeader title={t("familyPlayerPortal")} icon={ShieldCheck} /><Empty>{t("portalNoAssociation")}</Empty></div>;

  return <div data-testid="portal-page">
    <PageHeader title={user?.role === "family" ? t("familyPortal") : t("playerPortal")} subtitle={t("portalSubtitle")} icon={ShieldCheck} />
    {user?.role === "family" && <Card title={t("associatedChildren")} icon={UserRound} testid="portal-linked-children">
      {(data.players || []).length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.players.map((player) => <button key={player.id} type="button" onClick={() => setSelectedId(player.id)} aria-pressed={selectedId === player.id} className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedId === player.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-primary/40"}`}><p className="font-bold text-slate-900">{player.nombre} {player.apellidos}</p><p className="mt-1 text-sm text-slate-600">{player.team_name || t("noTeam")} · {player.categoria || "—"}</p><div className="mt-2"><StatusBadge status={player.estado} /></div></button>)}</div> : <Empty>{t("portalNoAssociation")}</Empty>}
    </Card>}
    {(data.players || []).length > 1 && <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label={t("selectChild")}>
      {data.players.map((player) => <button key={player.id} type="button" aria-pressed={selectedId === player.id} onClick={() => setSelectedId(player.id)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold ${selectedId === player.id ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700"}`}>{player.nombre} {player.apellidos}</button>)}
    </div>}

    <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card title={t("sportProfile")} icon={UserRound} testid="portal-profile"><div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-xl font-bold text-primary">{view.player.foto ? <img src={view.player.foto} alt="" className="h-full w-full object-cover" /> : view.player.nombre?.[0]}</div>
        <div><p className="font-heading text-xl font-bold text-slate-900">{view.player.nombre} {view.player.apellidos}</p><p className="text-sm text-slate-500">{view.player.team_name || t("noTeam")} · {view.player.categoria || "—"}</p><div className="mt-2"><StatusBadge status={view.player.estado} /></div></div>
      </div></Card>
      <Card title={t("nextActivity")} icon={Trophy} testid="portal-next-activity">{next ? <div className="rounded-2xl bg-gradient-to-r from-[#0E3554] to-[#1B5C8F] p-5 text-white"><p className="text-xs font-bold uppercase tracking-widest text-[#CFE9FA]">{t(`calendarType_${next.tipo}`)}</p><p className="mt-1 font-heading text-2xl font-bold">{next.titulo}</p><p className="mt-2 text-sm text-slate-200">{formatDate(next.fecha, { weekday: "long", day: "numeric", month: "long" })}{next.hora ? ` · ${next.hora}` : ""}{next.lugar ? ` · ${next.lugar}` : ""}</p></div> : <Empty>{t("noUpcomingActivities")}</Empty>}</Card>
    </div>

    <Card title={t("callups")} icon={ClipboardCheck} testid="portal-callups">{view.callups.length ? <div className="space-y-3">{view.callups.map((callup) => { const response = callup.responses.find((row) => row.player_id === view.player.id); const canRespond = response?.estado === "pending" && !callup.deadline_expired && (user?.role !== "player" || callup.player_self_response_allowed); return <div key={callup.id} className={`rounded-2xl border p-4 ${response?.estado === "pending" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{callup.match?.rival || t("match")} · {formatDate(callup.match?.fecha)}</p><p className="mt-1 text-sm text-slate-600">{callup.team_name}{callup.instrucciones ? ` · ${callup.instrucciones}` : ""}</p></div><StatusBadge status={response?.estado} /></div>{canRespond && <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => respond(callup, "confirmed")}><Check className="h-4 w-4" />{t("confirmAttendance")}</Button><Button variant="outline" onClick={() => respond(callup, "declined")}><X className="h-4 w-4" />{t("declineAttendance")}</Button></div>}{response?.estado === "pending" && user?.role === "player" && !callup.player_self_response_allowed && <p className="mt-3 text-xs text-amber-800">{t("playerResponseNotAllowed")}</p>}{callup.deadline_expired && <p className="mt-3 text-xs text-red-600">{t("deadlineExpired")}</p>}</div>; })}</div> : <Empty>{t("noCallups")}</Empty>}</Card>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Card title={t("schedule")} icon={CalendarDays} testid="portal-schedule">{view.schedule.length ? <div className="space-y-2">{view.schedule.slice(0, 8).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><div className="w-14 text-center text-xs font-bold text-primary">{formatDate(item.fecha, { day: "2-digit", month: "short" })}<br />{item.hora || ""}</div><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.titulo}</p><p className="truncate text-xs text-slate-500">{item.equipo_nombre || t("wholeClub")}{item.lugar ? ` · ${item.lugar}` : ""}</p></div></div>)}</div> : <Empty>{t("noUpcomingActivities")}</Empty>}</Card>
      <Card title={t("attendance")} icon={ClipboardCheck} testid="portal-attendance"><div className="mb-4 rounded-2xl bg-[#EAF6FD] p-4"><p className="text-sm text-slate-600">{t("attendancePercentage")}</p><p className="font-heading text-3xl font-bold text-primary">{attendancePercentage(view.attendance)}%</p></div>{view.attendance.length ? <div className="space-y-2">{view.attendance.slice(0, 6).map((row) => <div key={`${row.training_id}-${row.player_id}`} className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><span className="text-sm">{formatDate(row.date)}</span><StatusBadge status={row.status} /></div>)}</div> : <Empty>{t("noAttendanceRecords")}</Empty>}</Card>
      {user?.role === "family" && <Card title={t("payments")} icon={Euro} testid="portal-payments">{view.payments.length ? <div className="space-y-2">{view.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><div><p className="font-semibold">{payment.concepto}</p><p className="text-xs text-slate-500">{payment.importe_final || 0} €</p></div><StatusBadge status={payment.estado} /></div>)}</div> : <Empty>{t("noPendingPayments")}</Empty>}</Card>}
      <Card title={t("documentsAndAuthorizations")} icon={FileCheck} testid="portal-documents"><div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="text-sm font-semibold">{t("documentationStatus")}</span><StatusBadge status={view.documents?.status} /></div>{view.authorizations.length ? <div className="space-y-2">{view.authorizations.map((authorization) => <div key={authorization.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate font-semibold">{t(`authType_${authorization.tipo}`)}</p><StatusBadge status={authorization.estado} /></div><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t("downloadPdf")} onClick={() => download(`/authorizations/${authorization.id}/pdf?lang=${lang}`, `autorizacion_${authorization.id}.pdf`)}><Download className="h-4 w-4" /></Button>{authorization.has_signed_file && <Button size="icon" variant="ghost" aria-label={t("signedPdf")} onClick={() => download(`/authorizations/${authorization.id}/signed-file`, `autorizacion_firmada_${authorization.id}.pdf`)}><FileCheck className="h-4 w-4" /></Button>}</div></div>)}</div> : <Empty>{t("noAuthorizations")}</Empty>}</Card>
      <Card title={t("communications")} icon={MessageSquare} testid="portal-communications">{data.communications?.length ? <div className="space-y-2">{data.communications.slice(0, 8).map((item) => <article key={item.id} className="rounded-xl border border-slate-100 p-3"><p className="font-semibold text-slate-900">{item.asunto || t("communication")}</p><p className="mt-1 line-clamp-3 text-sm text-slate-600">{item.mensaje}</p></article>)}</div> : <Empty>{t("noCommunications")}</Empty>}</Card>
    </div>
  </div>;
}
