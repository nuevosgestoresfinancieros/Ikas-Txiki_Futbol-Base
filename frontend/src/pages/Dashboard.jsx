import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, ClipboardCheck, FileWarning, Euro, CalendarDays,
  AlertTriangle, FileSignature, Shield, Trophy, ChevronRight, Dumbbell
} from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";
import { StatusBadge } from "@/components/shared";

const SummaryCard = ({ icon: Icon, label, value, sub, gradient, testid, onClick }) => (
  <button
    data-testid={`summary-${testid}`}
    onClick={onClick}
    className={`group relative overflow-hidden text-left rounded-3xl p-5 text-white shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl active:scale-95 ${gradient}`}
  >
    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 group-hover:scale-150 transition-transform duration-500" />
    <div className="relative flex items-start justify-between">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
        <Icon className="h-6 w-6" />
      </div>
      <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
    </div>
    <p className="relative mt-4 font-heading text-4xl font-extrabold drop-shadow-sm">{value}</p>
    <p className="relative text-sm font-semibold text-white/90">{label}</p>
    {sub && <p className="relative text-xs text-white/70 mt-0.5">{sub}</p>}
  </button>
);

const QuickAction = ({ icon: Icon, label, onClick, testid }) => (
  <button
    data-testid={`quick-${testid}`}
    onClick={onClick}
    className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl px-4 py-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-cyan-300 active:scale-95"
  >
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-md shadow-cyan-500/30">
      <Icon className="h-5 w-5" />
    </div>
    <span className="font-bold text-slate-800 text-sm">{label}</span>
  </button>
);

const Dashboard = () => {
  const { t } = useI18n();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  const load = async () => {
    const res = await api.get("/dashboard");
    setData(res.data);
  };
  useEffect(() => { load(); }, []);

  if (!data) return <div className="text-slate-400">…</div>;

  return (
    <div data-testid="dashboard-page">
      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          {t("dashboard")}
        </h1>
        <p className="text-slate-500 mt-1">{data.total_jugadores} {t("totalPlayers")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <SummaryCard testid="active" icon={Users} label={t("activePlayers")} value={data.jugadores_activos}
          gradient="bg-gradient-to-br from-emerald-400 to-teal-500" delay={0} onClick={() => nav("/jugadores?estado=activo")} />
        <SummaryCard testid="new" icon={UserPlus} label={t("newInscriptions")} value={data.nuevas_inscripciones}
          gradient="bg-gradient-to-br from-cyan-400 to-blue-500" delay={60} onClick={() => nav("/inscripciones")} />
        <SummaryCard testid="pending-ins" icon={ClipboardCheck} label={t("pendingInscriptions")} value={data.inscripciones_pendientes}
          gradient="bg-gradient-to-br from-amber-400 to-orange-500" delay={120} onClick={() => nav("/inscripciones")} />
        <SummaryCard testid="docs" icon={FileWarning} label={t("pendingDocs")} value={data.documentacion_pendiente}
          gradient="bg-gradient-to-br from-orange-400 to-rose-500" delay={180} onClick={() => nav("/jugadores")} />
        <SummaryCard testid="payments" icon={Euro} label={t("pendingPayments")} value={data.pagos_pendientes}
          sub={`${data.importe_pendiente} € ${t("pendingAmount")}`} gradient="bg-gradient-to-br from-fuchsia-400 to-purple-500" delay={240} onClick={() => nav("/pagos")} />
        <SummaryCard testid="auths" icon={FileSignature} label={t("authorizations")} value={data.autorizaciones_pendientes}
          gradient="bg-gradient-to-br from-violet-400 to-indigo-500" delay={300} onClick={() => nav("/autorizaciones")} />
        <SummaryCard testid="matches" icon={CalendarDays} label={t("upcomingMatches")} value={data.proximos_partidos.length}
          gradient="bg-gradient-to-br from-blue-400 to-indigo-500" delay={360} onClick={() => nav("/partidos")} />
        <SummaryCard testid="players-total" icon={Trophy} label={t("totalPlayers")} value={data.total_jugadores}
          gradient="bg-gradient-to-br from-slate-600 to-slate-800" delay={420} onClick={() => nav("/jugadores")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <div className="lg:col-span-2">
          <h2 className="font-heading text-lg font-bold text-slate-900 mb-3">{t("quickActions")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <QuickAction testid="new-player" icon={UserPlus} label={t("newPlayer")} onClick={() => nav("/jugadores?new=1")} />
            <QuickAction testid="new-match" icon={CalendarDays} label={t("newMatch")} onClick={() => nav("/partidos?new=1")} />
            <QuickAction testid="new-callup" icon={ClipboardCheck} label={t("newCallup")} onClick={() => nav("/convocatorias?new=1")} />
            <QuickAction testid="new-training" icon={Dumbbell} label={t("trainings")} onClick={() => nav("/entrenamientos?new=1")} />
            <QuickAction testid="new-auth" icon={FileSignature} label={t("newAuthorization")} onClick={() => nav("/autorizaciones?new=1")} />
            <QuickAction testid="new-payment" icon={Euro} label={t("newPayment")} onClick={() => nav("/pagos?new=1")} />
            <QuickAction testid="new-team" icon={Shield} label={t("newTeam")} onClick={() => nav("/equipos?new=1")} />
          </div>

          {/* Upcoming matches */}
          <h2 className="font-heading text-lg font-bold text-slate-900 mt-8 mb-3">{t("upcomingMatches")}</h2>
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl divide-y divide-slate-100/70 shadow-sm">
            {data.proximos_partidos.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">{t("noUpcoming")}</p>
            ) : data.proximos_partidos.map((m) => (
              <div key={m.id} data-testid={`upcoming-match-${m.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer" onClick={() => nav("/partidos")}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{m.equipo_nombre} vs {m.rival || "—"}</p>
                    <p className="text-xs text-slate-500">{m.fecha} · {m.hora || "--:--"} · {m.condicion === "local" ? t("home") : t("away")}</p>
                  </div>
                </div>
                <StatusBadge status={m.estado} />
              </div>
            ))}
          </div>

          {/* Upcoming trainings */}
          <h2 className="font-heading text-lg font-bold text-slate-900 mt-8 mb-3">{t("upcomingTrainings")}</h2>
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl divide-y divide-slate-100/70 shadow-sm">
            {(!data.proximos_entrenamientos || data.proximos_entrenamientos.length === 0) ? (
              <p className="p-6 text-sm text-slate-400">{t("noUpcomingTrainings")}</p>
            ) : data.proximos_entrenamientos.map((tr) => (
              <div key={tr.id} data-testid={`upcoming-training-${tr.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer" onClick={() => nav("/entrenamientos")}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{tr.equipo_nombre}</p>
                    <p className="text-xs text-slate-500">{tr.fecha} · {tr.hora || "--:--"} · {tr.campo || "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div>
          <h2 className="font-heading text-lg font-bold text-slate-900 mb-3">{t("importantAlerts")}</h2>
          <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl p-4 space-y-3 shadow-sm">
            {data.alertas.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noAlerts")}</p>
            ) : data.alertas.map((a, i) => (
              <div key={i} data-testid={`alert-${a.tipo}`} className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">{a.mensaje}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
