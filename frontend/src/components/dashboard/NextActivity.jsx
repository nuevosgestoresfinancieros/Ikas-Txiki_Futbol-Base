import { CalendarDays, Dumbbell } from "lucide-react";
import { useI18n } from "../../i18n";

export default function NextActivity({ activity, onOpen }) {
  const { t, lang } = useI18n();
  if (!activity) {
    return (
      <section className="surface-card p-5" aria-labelledby="next-activity-title">
        <h2 id="next-activity-title" className="font-heading text-xl font-bold text-slate-900">{t("nextActivity")}</h2>
        <p className="mt-3 text-sm text-slate-500">{t("noNextActivity")}</p>
      </section>
    );
  }

  const isMatch = activity.tipo === "partido";
  const Icon = isMatch ? CalendarDays : Dumbbell;
  const dateTime = new Intl.DateTimeFormat(lang === "eu" ? "eu-ES" : "es-ES", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(activity.fecha_hora));
  const title = isMatch
    ? `${activity.equipo_nombre || "—"} vs ${activity.rival || "—"}`
    : activity.equipo_nombre || t("trainings");

  return (
    <section className="surface-card overflow-hidden" aria-labelledby="next-activity-title">
      <button
        type="button"
        onClick={() => onOpen?.(isMatch ? "/partidos" : "/entrenamientos")}
        className="flex min-h-32 w-full items-center gap-4 p-5 text-left transition-colors hover:bg-slate-50"
      >
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${isMatch ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="next-activity-title" className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("nextActivity")}</h2>
          <p className="mt-1 truncate font-heading text-xl font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{dateTime} · {activity.campo || "—"}</p>
        </div>
      </button>
    </section>
  );
}
