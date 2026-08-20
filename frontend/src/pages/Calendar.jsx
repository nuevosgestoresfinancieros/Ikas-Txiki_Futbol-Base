import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, ExternalLink, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Area, Field, SelectField } from "@/components/form";
import { PageHeader } from "@/components/shared";
import { googleCalendarUrl, groupEventsByDate, isoDay, monthDays, viewRange, weekDays } from "./calendarView";
import GoogleMapsLinks from "@/components/GoogleMapsLinks";

const TYPE_STYLES = {
  match: "border-blue-200 bg-blue-50 text-blue-800",
  training: "border-emerald-200 bg-emerald-50 text-emerald-800",
  meeting: "border-violet-200 bg-violet-50 text-violet-800",
  club_event: "border-amber-200 bg-amber-50 text-amber-900",
};

const EMPTY_FORM = { titulo: "", tipo: "meeting", fecha: "", hora: "", fecha_fin: "", hora_fin: "", equipo_id: "global", lugar: "", descripcion: "" };
const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
const Datalist = ({ id, values }) => <datalist id={id}>{unique(values).map((value) => <option key={value} value={value} />)}</datalist>;

const CalendarEventButton = ({ event, onOpen }) => (
  <button type="button" onClick={() => onOpen(event)}
    className={`w-full truncate rounded-lg border px-2 py-1 text-left text-xs font-semibold transition-opacity hover:opacity-80 ${TYPE_STYLES[event.tipo] || TYPE_STYLES.club_event}`}
    title={event.titulo}>
    {event.hora ? `${event.hora} ` : ""}{event.titulo}
  </button>
);

export default function Calendar() {
  const { t, lang } = useI18n();
  const canCreate = usePermission("calendar", "create");
  const canEdit = usePermission("calendar", "edit");
  const canDelete = usePermission("calendar", "delete");
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [options, setOptions] = useState({ teams: [], categories: [], seasons: [], types: [] });
  const [settings, setSettings] = useState({ temporadas: [], campos: [] });
  const [filters, setFilters] = useState({ equipo_id: "all", categoria: "all", temporada: "all", tipo: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const grouped = useMemo(() => groupEventsByDate(events), [events]);
  const locale = lang === "eu" ? "eu-ES" : "es-ES";

  const requestParams = useCallback(() => ({
    start: range.start, end: range.end,
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "all")),
  }), [range, filters]);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [response, settingsResponse] = await Promise.all([
        api.get("/calendar/events", { params: requestParams() }),
        api.get("/catalog-options"),
      ]);
      setEvents(response.data.events || []); setOptions(response.data.filter_options || {});
      setSettings(settingsResponse.data || {});
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [requestParams]);

  useEffect(() => { load(); }, [load]);

  const move = (direction) => setAnchor((current) => {
    const next = new Date(current);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 30));
    return next;
  });
  const openNew = () => { setSelected(null); setForm({ ...EMPTY_FORM, fecha: isoDay(anchor) }); setEditorOpen(true); };
  const openEdit = () => {
    setForm({ ...EMPTY_FORM, ...selected, id: selected.source_id, equipo_id: selected.equipo_id || "global" });
    setEditorOpen(true);
  };
  const save = async () => {
    const payload = { ...form, equipo_id: form.equipo_id === "global" ? null : form.equipo_id };
    delete payload.id; delete payload.source; delete payload.source_id; delete payload.detail_path;
    try {
      if (form.id) await api.put(`/calendar/club-events/${form.id}`, payload);
      else await api.post("/calendar/club-events", payload);
      toast.success(t("saved")); setEditorOpen(false); setSelected(null); await load();
    } catch (requestError) { toast.error(requestError.response?.data?.detail || t("calendarSaveError")); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(t("confirmDelete"))) return;
    await api.delete(`/calendar/club-events/${selected.source_id}`);
    toast.success(t("deleted")); setSelected(null); await load();
  };
  const exportIcal = async () => {
    try {
      const response = await api.get("/calendar/export.ics", { params: requestParams(), responseType: "blob" });
      const url = URL.createObjectURL(response.data); const link = document.createElement("a");
      link.href = url; link.download = "ikas-txiki-calendario.ics"; link.click(); URL.revokeObjectURL(url);
    } catch { toast.error(t("calendarExportError")); }
  };
  const heading = new Intl.DateTimeFormat(locale, view === "month" ? { month: "long", year: "numeric" } : { dateStyle: "medium" }).format(anchor);
  const typeOptions = ["match", "training", "meeting", "club_event"].map((value) => ({ value, label: t(`calendarType_${value}`) }));
  const filterOptions = (values) => [{ value: "all", label: t("all") }, ...values];
  const seasonOptions = unique([...(settings.temporadas || []), ...(options.seasons || [])]);
  const locationOptions = unique([...(settings.campos || []), ...events.flatMap((event) => [event.lugar, event.campo])]);

  return (
    <div data-testid="calendar-page">
      <PageHeader title={t("calendar")} icon={CalendarDays} action={canCreate ? <Button onClick={openNew}><Plus className="h-4 w-4" />{t("newCalendarEvent")}</Button> : null} />

      <section className="surface-card mb-4 space-y-4 p-4" aria-label={t("calendarFilters")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField label={t("season")} value={filters.temporada} onChange={(value) => setFilters((current) => ({ ...current, temporada: value }))} options={filterOptions(seasonOptions.map((value) => ({ value, label: value })))} testid="calendar-season" />
          <SelectField label={t("category")} value={filters.categoria} onChange={(value) => setFilters((current) => ({ ...current, categoria: value }))} options={filterOptions((options.categories || []).map((value) => ({ value, label: value })))} testid="calendar-category" />
          <SelectField label={t("team")} value={filters.equipo_id} onChange={(value) => setFilters((current) => ({ ...current, equipo_id: value }))} options={filterOptions((options.teams || []).map((team) => ({ value: team.id, label: team.name })))} testid="calendar-team" />
          <SelectField label={t("eventType")} value={filters.tipo} onChange={(value) => setFilters((current) => ({ ...current, tipo: value }))} options={filterOptions(typeOptions)} testid="calendar-type" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1" aria-label={t("calendarView")}>
            {["month", "week", "agenda"].map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === item ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>{t(`calendarView_${item}`)}</button>)}
          </div>
          <PermissionGate resource="calendar" action="export"><Button variant="outline" onClick={exportIcal}><Download className="h-4 w-4" />iCal</Button></PermissionGate>
        </div>
      </section>

      <section className="surface-card overflow-hidden" aria-busy={loading}>
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label={t("previousPeriod")}><ChevronLeft /></Button>
          <div className="text-center"><h2 className="font-heading text-lg font-bold capitalize text-slate-900">{heading}</h2><button type="button" className="text-xs font-semibold text-primary" onClick={() => setAnchor(new Date())}>{t("today")}</button></div>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label={t("nextPeriod")}><ChevronRight /></Button>
        </div>
        {loading ? <div className="p-12 text-center text-sm text-slate-500" role="status">{t("loading")}</div>
          : error ? <div className="flex flex-col items-center gap-3 p-12 text-center text-red-600" role="alert"><p>{t("calendarLoadError")}</p><Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t("retry")}</Button></div>
          : events.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">{t("noCalendarEvents")}</div>
          : view === "agenda" ? <Agenda events={events} locale={locale} onOpen={setSelected} t={t} />
          : <Grid view={view} anchor={anchor} grouped={grouped} locale={locale} onOpen={setSelected} />}
      </section>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent><DialogHeader><DialogTitle>{selected?.titulo}</DialogTitle><DialogDescription>{t("calendarDetailDescription")}</DialogDescription></DialogHeader>{selected && <div className="space-y-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date(`${selected.fecha}T12:00:00`))}{selected.hora ? ` · ${selected.hora}` : ""}</p>
          {selected.equipo_nombre && <p>{selected.equipo_nombre}</p>}{selected.lugar && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" aria-hidden="true" />{selected.lugar}</p>}<GoogleMapsLinks sources={selected} />{selected.descripcion && <p>{selected.descripcion}</p>}
          <a href={googleCalendarUrl(selected)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"><ExternalLink className="h-4 w-4" />{t("addGoogleCalendar")}</a>
        </div>}<DialogFooter>{selected?.source === "club_event" && canDelete && <Button variant="outline" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" />{t("delete")}</Button>}{selected?.source === "club_event" && canEdit && <Button onClick={openEdit}><Pencil className="h-4 w-4" />{t("edit")}</Button>}</DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? t("editCalendarEvent") : t("newCalendarEvent")}</DialogTitle><DialogDescription>{t("calendarEditorDescription")}</DialogDescription></DialogHeader>
        <Datalist id="calendar-locations-list" values={locationOptions} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label={t("title")} value={form.titulo} onChange={(value) => setForm((current) => ({ ...current, titulo: value }))} required /></div>
          <SelectField label={t("eventType")} value={form.tipo} onChange={(value) => setForm((current) => ({ ...current, tipo: value }))} options={typeOptions.filter((item) => ["meeting", "club_event"].includes(item.value))} />
          <SelectField label={t("team")} value={form.equipo_id} onChange={(value) => setForm((current) => ({ ...current, equipo_id: value }))} options={[{ value: "global", label: t("wholeClub") }, ...(options.teams || []).map((team) => ({ value: team.id, label: team.name }))]} />
          <Field label={t("date")} type="date" value={form.fecha} onChange={(value) => setForm((current) => ({ ...current, fecha: value }))} required />
          <Field label={t("time")} type="time" value={form.hora} onChange={(value) => setForm((current) => ({ ...current, hora: value }))} />
          <Field label={t("endDate")} type="date" value={form.fecha_fin} onChange={(value) => setForm((current) => ({ ...current, fecha_fin: value }))} />
          <Field label={t("endTime")} type="time" value={form.hora_fin} onChange={(value) => setForm((current) => ({ ...current, hora_fin: value }))} />
          <div className="sm:col-span-2"><Field label={t("location")} value={form.lugar} onChange={(value) => setForm((current) => ({ ...current, lugar: value }))} list="calendar-locations-list" /></div>
          <div className="sm:col-span-2"><GoogleMapsLinks preview sources={form} /></div>
          <div className="sm:col-span-2"><Area label={t("description")} value={form.descripcion} onChange={(value) => setForm((current) => ({ ...current, descripcion: value }))} /></div>
        </div><DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>{t("cancel")}</Button><Button onClick={save}>{t("save")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Grid({ view, anchor, grouped, locale, onOpen }) {
  const days = view === "month" ? monthDays(anchor) : weekDays(anchor);
  const labels = weekDays(anchor).map((day) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day));
  return <div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{labels.map((label) => <div key={label} className="p-2 text-center text-xs font-bold uppercase text-slate-500">{label}</div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => { const key = isoDay(day); const items = grouped[key] || []; const outside = view === "month" && day.getMonth() !== anchor.getMonth(); return <div key={key} className={`min-h-28 border-b border-r border-slate-100 p-2 ${outside ? "bg-slate-50/70" : "bg-white"}`}><div className="mb-1 text-xs font-bold text-slate-500">{day.getDate()}</div><div className="space-y-1">{items.slice(0, 4).map((event) => <CalendarEventButton key={event.id} event={event} onOpen={onOpen} />)}{items.length > 4 && <p className="text-xs font-semibold text-slate-400">+{items.length - 4}</p>}</div></div>; })}</div></div></div>;
}

function Agenda({ events, locale, onOpen, t }) {
  return <div className="divide-y divide-slate-100">{events.map((event) => <button type="button" key={event.id} onClick={() => onOpen(event)} className="flex min-h-20 w-full items-center gap-3 p-4 text-left hover:bg-slate-50"><div className={`h-12 w-1 rounded-full border ${TYPE_STYLES[event.tipo] || TYPE_STYLES.club_event}`} /><div className="w-24 shrink-0 text-xs font-semibold text-slate-500">{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(`${event.fecha}T12:00:00`))}<br />{event.hora || t("allDay")}</div><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{event.titulo}</p><p className="truncate text-xs text-slate-500">{event.equipo_nombre || t("wholeClub")}{event.lugar ? ` · ${event.lugar}` : ""}</p></div></button>)}</div>;
}
