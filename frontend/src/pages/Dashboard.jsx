import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck,
  Dumbbell, Euro, FileSignature, FileWarning, RefreshCw, Shield,
  Trophy, UserPlus, Users,
} from "lucide-react";
import api from "@/api";
import { PermissionGate } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared";

const metricStyles = {
  teal: "bg-teal-50 text-teal-700 border-teal-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  rose: "bg-rose-50 text-rose-700 border-rose-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
};

const MetricCard = ({ icon: Icon, label, value, detail, tone, testid, onClick }) => (
  <button
    type="button"
    data-testid={`summary-${testid}`}
    onClick={onClick}
    className="surface-card interactive-card group min-h-40 p-5 text-left"
  >
    <div className="flex items-start justify-between gap-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${metricStyles[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <ArrowRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
    </div>
    <p className="mt-5 font-heading text-3xl font-bold tracking-tight text-slate-900">{value}</p>
    <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
    {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
  </button>
);

const CompactMetric = ({ icon: Icon, label, value, onClick }) => (
  <button type="button" onClick={onClick} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
    <div className="min-w-0">
      <p className="font-heading text-xl font-bold text-slate-900">{value}</p>
      <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
    </div>
  </button>
);

const QuickAction = ({ icon: Icon, label, onClick, testid }) => (
  <button
    type="button"
    data-testid={`quick-${testid}`}
    onClick={onClick}
    className="group flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:translate-y-0"
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#102a43] text-teal-200 shadow-sm transition-colors group-hover:bg-primary group-hover:text-white">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
    <span className="text-sm font-bold leading-5 text-slate-800">{label}</span>
  </button>
);

const DashboardSkeleton = () => (
  <div className="animate-pulse" role="status" aria-label="Cargando panel">
    <div className="mb-8 h-36 rounded-3xl bg-slate-200/70" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-40 rounded-2xl bg-slate-200/70" />)}
    </div>
  </div>
);

const Dashboard = () => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await api.get("/dashboard");
      setData(response.data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat(lang === "eu" ? "eu-ES" : "es-ES", {
    weekday: "long", day: "numeric", month: "long",
  }).format(new Date()), [lang]);

  const formatEventDate = (date) => {
    if (!date) return "—";
    const parsed = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat(lang === "eu" ? "eu-ES" : "es-ES", { day: "numeric", month: "short" }).format(parsed);
  };

  if (!data && !error) return <DashboardSkeleton />;
  if (error) return (
    <div className="surface-card flex min-h-[55vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle className="h-7 w-7" aria-hidden="true" /></div>
      <h1 className="font-heading text-2xl font-bold text-slate-900">{t("loadError")}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{t("connectionHint")}</p>
      <Button onClick={load} className="mt-6"><RefreshCw className="h-4 w-4" aria-hidden="true" />{t("retry")}</Button>
    </div>
  );

  const matches = data.proximos_partidos || [];
  const trainings = data.proximos_entrenamientos || [];
  const alerts = data.alertas || [];
  const alertRoutes = { pago: "/pagos", doc: "/jugadores", auth: "/autorizaciones", inscripcion: "/inscripciones" };

  return (
    <div data-testid="dashboard-page" className="animate-fade-up">
      <section className="relative mb-7 overflow-hidden rounded-3xl bg-[#102a43] p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
        <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold capitalize text-teal-200">{dateLabel}</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("dashboardWelcome")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{t("dashboardIntro")}</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-slate-400">{t("overview")}</p>
              <p className="text-sm font-bold text-white">{data.total_jugadores} {t("totalPlayers")}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="dashboard-summary-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="dashboard-summary-title" className="font-heading text-xl font-bold text-slate-900">{t("overview")}</h2>
          <span className="text-xs font-semibold text-slate-400">{t("needsAttention")}: {alerts.length}</span>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PermissionGate resource="players"><MetricCard testid="active" icon={Users} label={t("activePlayers")} value={data.jugadores_activos} tone="teal" onClick={() => navigate("/jugadores?estado=activo")} /></PermissionGate>
          <PermissionGate resource="players"><MetricCard testid="docs" icon={FileWarning} label={t("pendingDocs")} value={data.documentacion_pendiente} tone="amber" onClick={() => navigate("/jugadores")} /></PermissionGate>
          <PermissionGate resource="payments"><MetricCard testid="payments" icon={Euro} label={t("pendingPayments")} value={data.pagos_pendientes} detail={`${data.importe_pendiente} € ${t("pendingAmount")}`} tone="rose" onClick={() => navigate("/pagos")} /></PermissionGate>
          <PermissionGate resource="matches"><MetricCard testid="matches" icon={CalendarDays} label={t("upcomingMatches")} value={matches.length} tone="blue" onClick={() => navigate("/partidos")} /></PermissionGate>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PermissionGate resource="inscriptions"><CompactMetric icon={UserPlus} label={t("newInscriptions")} value={data.nuevas_inscripciones} onClick={() => navigate("/inscripciones")} /></PermissionGate>
          <PermissionGate resource="inscriptions"><CompactMetric icon={ClipboardCheck} label={t("pendingInscriptions")} value={data.inscripciones_pendientes} onClick={() => navigate("/inscripciones")} /></PermissionGate>
          <PermissionGate resource="authorizations"><CompactMetric icon={FileSignature} label={t("authorizations")} value={data.autorizaciones_pendientes} onClick={() => navigate("/autorizaciones")} /></PermissionGate>
          <PermissionGate resource="players"><CompactMetric icon={Trophy} label={t("totalPlayers")} value={data.total_jugadores} onClick={() => navigate("/jugadores")} /></PermissionGate>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 font-heading text-xl font-bold text-slate-900">{t("quickActions")}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <PermissionGate resource="players" action="create"><QuickAction testid="new-player" icon={UserPlus} label={t("newPlayer")} onClick={() => navigate("/jugadores?new=1")} /></PermissionGate>
          <PermissionGate resource="matches" action="create"><QuickAction testid="new-match" icon={CalendarDays} label={t("newMatch")} onClick={() => navigate("/partidos?new=1")} /></PermissionGate>
          <PermissionGate resource="callups" action="create"><QuickAction testid="new-callup" icon={ClipboardCheck} label={t("newCallup")} onClick={() => navigate("/convocatorias?new=1")} /></PermissionGate>
          <PermissionGate resource="trainings" action="create"><QuickAction testid="new-training" icon={Dumbbell} label={t("trainings")} onClick={() => navigate("/entrenamientos?new=1")} /></PermissionGate>
          <PermissionGate resource="payments" action="create"><QuickAction testid="new-payment" icon={Euro} label={t("newPayment")} onClick={() => navigate("/pagos?new=1")} /></PermissionGate>
          <PermissionGate resource="teams" action="create"><QuickAction testid="new-team" icon={Shield} label={t("newTeam")} onClick={() => navigate("/equipos?new=1")} /></PermissionGate>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section aria-labelledby="schedule-title">
          <h2 id="schedule-title" className="mb-3 font-heading text-xl font-bold text-slate-900">{t("schedule")}</h2>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="flex items-center gap-2 font-heading font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />{t("upcomingMatches")}</h3>
            </div>
            {matches.length === 0 ? (
              <p className="px-5 py-7 text-sm text-slate-500">{t("noUpcoming")}</p>
            ) : matches.slice(0, 3).map((match) => (
              <button key={match.id} type="button" data-testid={`upcoming-match-${match.id}`} onClick={() => navigate("/partidos")} className="group flex w-full items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-0 hover:bg-slate-50">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50 text-blue-700"><span className="text-[10px] font-bold uppercase">{formatEventDate(match.fecha).split(" ")[1]}</span><span className="font-heading text-lg font-bold leading-none">{formatEventDate(match.fecha).split(" ")[0]}</span></div>
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{match.equipo_nombre} vs {match.rival || "—"}</p><p className="mt-0.5 text-xs text-slate-500">{match.hora || "--:--"} · {match.condicion === "local" ? t("home") : t("away")}</p></div>
                </div>
                <StatusBadge status={match.estado} />
              </button>
            ))}

            <div className="border-y border-slate-100 bg-slate-50/70 px-5 py-4">
              <h3 className="flex items-center gap-2 font-heading font-bold text-slate-900"><Dumbbell className="h-5 w-5 text-emerald-600" aria-hidden="true" />{t("upcomingTrainings")}</h3>
            </div>
            {trainings.length === 0 ? (
              <p className="px-5 py-7 text-sm text-slate-500">{t("noUpcomingTrainings")}</p>
            ) : trainings.slice(0, 3).map((training) => (
              <button key={training.id} type="button" data-testid={`upcoming-training-${training.id}`} onClick={() => navigate("/entrenamientos")} className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-0 hover:bg-slate-50">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Dumbbell className="h-5 w-5" aria-hidden="true" /></div>
                <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{training.equipo_nombre}</p><p className="mt-0.5 text-xs text-slate-500">{formatEventDate(training.fecha)} · {training.hora || "--:--"} · {training.campo || "—"}</p></div>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="alerts-title">
          <h2 id="alerts-title" className="mb-3 font-heading text-xl font-bold text-slate-900">{t("importantAlerts")}</h2>
          <div className="surface-card p-4">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" aria-hidden="true" /></div><p className="font-semibold text-slate-700">{t("noAlerts")}</p></div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert, index) => (
                  <button key={`${alert.tipo}-${index}`} type="button" data-testid={`alert-${alert.tipo}`} onClick={() => navigate(alertRoutes[alert.tipo] || "/")} className="group flex w-full items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-left transition-colors hover:border-amber-200 hover:bg-amber-50">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium leading-5 text-amber-950">{alert.mensaje}</span>
                    <ArrowRight className="mt-0.5 h-4 w-4 text-amber-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
