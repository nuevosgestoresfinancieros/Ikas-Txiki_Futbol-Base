import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarDays, Camera, CheckCircle2, ChevronDown, Database, Download, Euro, Flag,
  MapPin, Save, ShieldCheck, Tags, Trash2, Upload, UserCog, X, Plus, FileSpreadsheet, FileArchive, Users,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form";
import { optimizeImage } from "@/lib/image";
import { usePermission } from "@/auth";

const SectionCard = ({ id, icon: Icon, title, description, children, action }) => (
  <section id={id} className="surface-card scroll-mt-24 p-6">
    <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const TagList = ({ label, help, items, onAdd, onRemove, testid, placeholder = "Añadir" }) => {
  const { t } = useI18n();
  const [val, setVal] = useState("");
  const add = () => {
    const next = val.trim();
    if (!next) return;
    if ((items || []).some((item) => String(item).toLowerCase() === next.toLowerCase())) {
      toast.warning("Ya existe en la lista");
      return;
    }
    onAdd(next);
    setVal("");
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <label className="text-sm font-bold text-slate-800">{label}</label>
        {help && <p className="mt-1 text-xs leading-5 text-slate-500">{help}</p>}
      </div>
      <div className="flex gap-2">
        <Input
          data-testid={`${testid}-input`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={placeholder || t("addItem")}
          className="h-11"
        />
        <Button type="button" data-testid={`${testid}-add`} onClick={add} className="h-11 w-12 px-0" aria-label={`Añadir ${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(items || []).length ? (items || []).map((it, i) => (
          <span key={`${it}-${i}`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
            {it}
            <button type="button" aria-label={`${t("delete")} ${it}`} data-testid={`${testid}-remove-${i}`} onClick={() => onRemove(i)} className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )) : <p className="text-sm text-amber-700">Sin datos configurados todavía.</p>}
      </div>
    </div>
  );
};

const CategoryEditor = ({ categories = [] }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
    {categories.map((c) => (
      <div key={c.name} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <p className="font-heading text-lg font-bold text-slate-950">{c.name}</p>
        <p className="mt-1 text-sm text-slate-500">{c.min_age} a {c.max_age} años</p>
      </div>
    ))}
  </div>
);

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const settingsPayload = (settings) => { const { categories, id, created_at, updated_at, ...payload } = settings || {}; return payload; };

const Settings = () => {
  const { t } = useI18n();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [maintenanceVisible, setMaintenanceVisible] = useState(false);
  const fileRef = useRef();
  const savedSettingsRef = useRef(null);
  const canAdminSettings = usePermission("settings", "administer");
  const today = new Date().toISOString().slice(0, 10);

  const applyLoadedSettings = (settings) => { savedSettingsRef.current = JSON.stringify(settingsPayload(settings)); setS(settings); setHasUnsavedChanges(false); };
  useEffect(() => { if (canAdminSettings) api.get("/settings").then((r) => applyLoadedSettings(r.data)); }, [canAdminSettings]);

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));
  const addTo = (k, v) => setS((p) => ({ ...p, [k]: [...(p[k] || []), v] }));
  const removeFrom = (k, i) => setS((p) => ({ ...p, [k]: (p[k] || []).filter((_, idx) => idx !== i) }));
  const reloadSettings = () => api.get("/settings").then((r) => applyLoadedSettings(r.data));
  useEffect(() => { if (s && savedSettingsRef.current !== null) setHasUnsavedChanges(JSON.stringify(settingsPayload(s)) !== savedSettingsRef.current); }, [s]);
  useEffect(() => { if (!hasUnsavedChanges) return undefined; const handler = (event) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [hasUnsavedChanges]);
  useEffect(() => { if (!s || !window.location.hash) return undefined; const scroll = () => { const hash = decodeURIComponent(window.location.hash.slice(1)); const id = hash === "categorías" ? "categorias" : hash === "base-de-datos" ? "datos" : hash; const target = document.getElementById(id); target?.closest("details")?.setAttribute("open", ""); target?.scrollIntoView({ behavior: "smooth", block: "start" }); }; const timer = window.setTimeout(scroll, 0); window.addEventListener("hashchange", scroll); return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", scroll); }; }, [s]);

  const configuredCount = useMemo(() => {
    if (!s) return 0;
    return [
      s.club_nombre, s.temporada_actual, (s.temporadas || []).length,
      (s.campos || []).length, (s.entrenadores || []).length,
      s.cuota_base !== undefined, s.attendance_alert_threshold,
    ].filter(Boolean).length;
  }, [s]);

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set("club_logo")(await optimizeImage(file, { maxSize: 512, quality: 0.86 }));
    } catch {
      toast.error("No se ha podido procesar el logotipo");
    }
  };

  const save = async () => {
    const payload = settingsPayload(s);
    setBusy("save");
    setSaveMessage("");
    try {
      await api.put("/settings", payload);
      toast.success(t("saved"));
      await reloadSettings();
      setSaveMessage("Configuración actualizada");
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo guardar la configuración");
    } finally {
      setBusy("");
    }
  };

  const exportDB = async () => {
    setBusy("excel");
    try {
      const res = await api.get("/export-excel", { responseType: "blob" });
      downloadBlob(res.data, `ikastxiki_backup_${today}.xlsx`);
    } catch (e) {
      toast.error("Error al exportar Excel");
    } finally {
      setBusy("");
    }
  };

  const exportCSV = async () => {
    setBusy("csv");
    try {
      const res = await api.get("/export-csv", { responseType: "blob" });
      downloadBlob(res.data, `ikastxiki_csv_${today}.zip`);
    } catch (e) {
      toast.error("Error al exportar CSV");
    } finally {
      setBusy("");
    }
  };

  const importDB = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t("importWarning"))) return;
    setBusy("import");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/import-excel", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(t("importDone"));
      await reloadSettings();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al importar");
    } finally {
      setBusy("");
    }
  };

  const loadDemo = async () => {
    if (!window.confirm(t("demoWarning"))) return;
    setBusy("demo");
    try {
      await api.post("/seed-demo");
      toast.success(t("saved"));
      await reloadSettings();
    } catch (e) {
      toast.error("Error");
    } finally {
      setBusy("");
    }
  };

  const clearAll = async () => {
    if (!window.confirm(t("clearWarning"))) return;
    setBusy("clear");
    try {
      await api.post("/clear-all");
      toast.success(t("deleted"));
      await reloadSettings();
    } catch (e) {
      toast.error("Error");
    } finally {
      setBusy("");
    }
  };

  if (!canAdminSettings) {
    return (
      <div data-testid="settings-page" className="surface-card p-8">
        <div className="flex items-center gap-3 text-amber-800">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="font-heading text-2xl font-bold">Zona restringida</h1>
        </div>
        <p className="mt-3 text-slate-600">Solo los administradores pueden acceder a la configuración del sistema.</p>
      </div>
    );
  }

  if (!s) return <div className="text-slate-400">…</div>;

  const sportCounts = { seasons: (s.temporadas || []).length, fields: (s.campos || []).length, coaches: (s.entrenadores || []).length };
  const clubReady = Boolean(s.club_nombre && s.temporada_actual && sportCounts.seasons && sportCounts.fields && sportCounts.coaches);
  const statusText = busy === "save" ? "Guardando cambios…" : saveMessage || (hasUnsavedChanges ? "Tienes cambios pendientes de guardar" : "Todo está guardado");
  const goToSection = (id) => { window.history.replaceState(null, "", `#`); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div data-testid="settings-page" className="space-y-6 pb-24">
      <header className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-slate-950 via-slate-900 to-primary p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">Administración del club</p><h1 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">Centro de control del club</h1><p className="mt-3 text-sm leading-6 text-slate-200 sm:text-base">Gestiona la información que Ikastxiki utiliza en equipos, actividad deportiva, documentos y comunicaciones.</p><div className="mt-5 flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-white/10 px-3 py-1.5 font-semibold">{s.club_nombre || "Club sin nombre"}</span><span className="rounded-full bg-white/10 px-3 py-1.5">Temporada: {s.temporada_actual || "Pendiente"}</span><span className="rounded-full bg-white/10 px-3 py-1.5 font-semibold">{clubReady ? "Club preparado" : "Configuración pendiente"}</span></div></div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm xl:min-w-80"><p role="status" aria-live="polite" className="text-sm font-semibold text-sky-50">{statusText}</p><Button data-testid="save-settings-header-btn" onClick={save} disabled={!!busy || !hasUnsavedChanges} className="mt-3 h-11 w-full bg-white text-slate-950 hover:bg-sky-50"><Save className="h-4 w-4" />{busy === "save" ? "Guardando cambios…" : "Guardar cambios"}</Button></div>
        </div>
      </header>

      <section aria-label="Resumen de situación" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["temporadas", CalendarDays, "Temporada activa", s.temporada_actual || "Pendiente"], ["campos", MapPin, "Campos de juego", sportCounts.fields], ["entrenadores", Users, "Equipo técnico", sportCounts.coaches], ["alertas", AlertTriangle, "Alertas de asistencia", s.attendance_alert_threshold ?? "Pendiente"]].map(([id, Icon, title, value]) => <button type="button" key={id} onClick={() => goToSection(id)} className="surface-card min-h-32 p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Icon className="h-5 w-5 text-primary" /><p className="mt-4 text-sm font-semibold text-slate-600">{title}</p><p className="mt-1 font-heading text-2xl font-bold text-slate-950">{value}</p></button>)}
      </section>

      {!clubReady ? <section className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm"><p className="font-heading text-xl font-bold text-slate-950">Prepara tu club en 4 pasos</p><p className="mt-1 text-sm text-slate-600">Completa lo esencial para que la actividad deportiva pueda usar los datos del club.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[["club", "Datos del club", !!s.club_nombre], ["temporadas", "Temporada deportiva", !!(s.temporada_actual && sportCounts.seasons)], ["campos", "Campos de juego", !!sportCounts.fields], ["entrenadores", "Equipo técnico", !!sportCounts.coaches]].map(([id, title, ready], index) => <button type="button" key={id} onClick={() => goToSection(id)} className="rounded-2xl border border-amber-100 bg-white p-4 text-left hover:border-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span className="flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{index + 1}. {title}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">{ready ? "Completado" : "Pendiente"}</span></span></button>)}</div></section> : <section className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" /><div><p className="font-bold">Tu club está preparado</p><p className="text-sm">Los datos básicos y deportivos están configurados.</p></div></section>}

      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Identidad del club</p>
      <SectionCard id="club" icon={Flag} title="Datos del club" description="Identidad utilizada en documentos, PDFs, comunicaciones, exportaciones y cabecera de la aplicación.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-bold text-slate-800">Logotipo</p>
            <div className="relative mx-auto h-28 w-28">
              {s.club_logo ? <img src={s.club_logo} alt="Logotipo del club" className="h-28 w-28 rounded-2xl border border-slate-200 object-contain" /> :
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">LOGO</div>}
              <label title={t("photo")} className="absolute -bottom-2 -right-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-primary text-white shadow-md hover:bg-primary/90">
                <Camera className="h-4 w-4" />
                <input data-testid="club-logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Se usa en autorizaciones, PDFs, informes y cabeceras.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("clubName")} value={s.club_nombre} onChange={set("club_nombre")} testid="club-nombre" />
            <Field label={t("currentSeason")} value={s.temporada_actual} onChange={set("temporada_actual")} testid="club-temporada" />
            <div className="md:col-span-2"><Field label={t("clubAddress")} value={s.club_direccion} onChange={set("club_direccion")} testid="club-direccion" /></div>
            <Field label={t("clubEmail")} value={s.club_email} onChange={set("club_email")} testid="club-email" />
            <Field label={t("clubPhone")} value={s.club_telefono} onChange={set("club_telefono")} testid="club-telefono" />
          </div>
        </div>
      </SectionCard>

      <section aria-labelledby="actividad-title" className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Actividad deportiva</p><h2 id="actividad-title" className="mt-1 font-heading text-2xl font-bold text-slate-950">Planifica con datos reutilizables</h2><p className="mt-1 text-sm text-slate-600">Temporadas, campos y equipo técnico para toda la actividad del club.</p></div>
      <SectionCard id="temporadas" icon={CalendarDays} title="Temporadas" description="Temporadas disponibles para filtrar jugadores, equipos, pagos, inscripciones, reportes, partidos y entrenamientos.">
        <TagList label={t("seasons")} help="Añade una temporada cuando el club abra un nuevo curso deportivo." items={s.temporadas} onAdd={(v) => addTo("temporadas", v)} onRemove={(i) => removeFrom("temporadas", i)} testid="seasons" placeholder="2026-2027" />
        <p className="mt-3 text-xs font-medium text-amber-800">Los elementos añadidos se guardan definitivamente al pulsar “Guardar cambios”.</p>
      </SectionCard>

      <SectionCard id="campos" icon={MapPin} title="Campos de juego" description="Campos reutilizables en partidos, entrenamientos y convocatorias para evitar escribir direcciones cada vez.">
        <TagList label={t("fields")} help="Usa nombres reconocibles para coordinación y familias." items={s.campos} onAdd={(v) => addTo("campos", v)} onRemove={(i) => removeFrom("campos", i)} testid="fields" placeholder="Campo municipal" />
        <p className="mt-3 text-xs font-medium text-amber-800">Los elementos añadidos se guardan definitivamente al pulsar “Guardar cambios”.</p>
      </SectionCard>

      <SectionCard id="entrenadores" icon={UserCog} title="Entrenadores" description="Listado base para asignar responsables a equipos, entrenamientos y comunicaciones.">
        <TagList label={t("coaches")} help="Mantén aquí el catálogo de responsables deportivos." items={s.entrenadores} onAdd={(v) => addTo("entrenadores", v)} onRemove={(i) => removeFrom("entrenadores", i)} testid="coaches" placeholder="Nombre y apellidos" />
        <p className="mt-3 text-xs font-medium text-amber-800">Los elementos añadidos se guardan definitivamente al pulsar “Guardar cambios”.</p>
      </SectionCard>

      <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-950">Los cambios se guardan al pulsar Guardar cambios.</p></section>
      <section aria-labelledby="gestion-title" className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Gestión y seguimiento</p><h2 id="gestion-title" className="mt-1 font-heading text-2xl font-bold text-slate-950">Referencias y alertas operativas</h2></div>
      <SectionCard id="cuotas" icon={Euro} title="Cuotas y descuentos" description="Importes base para pagos, inscripciones, referencias de cuota y descuentos por hermanos.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("baseFee")} type="number" value={s.cuota_base} onChange={set("cuota_base")} testid="cuota-base" />
          <Field label={t("siblingDiscountCfg")} type="number" value={s.descuento_hermano} onChange={set("descuento_hermano")} testid="descuento-hermano" />
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Estos importes se guardan como referencia, pero actualmente no se aplican automáticamente en Pagos.</p>
      </SectionCard>

      <SectionCard id="alertas" icon={AlertTriangle} title="Alertas y asistencia" description="Reglas para avisar de ausencias o incidencias en entrenamientos y seguimiento deportivo.">
        <div className="max-w-md">
          <Field label={t("attendanceAlertThreshold")} type="number" value={s.attendance_alert_threshold ?? 3} onChange={set("attendance_alert_threshold")} testid="attendance-alert-threshold" min={1} max={20} />
          <p className="mt-2 text-xs leading-5 text-slate-500">Cuando un jugador alcance este número de ausencias, aparecerá como incidencia para revisar.</p>
        </div>
      </SectionCard>

      </section>
      <section aria-labelledby="clasificacion-title" className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Clasificación y mantenimiento</p><h2 id="clasificacion-title" className="mt-1 font-heading text-2xl font-bold text-slate-950">Automatización, copias y control</h2></div>
      <SectionCard id="categorias" icon={Tags} title="Categorías automáticas por edad" description="Reglas de clasificación automática para jugadores según edad. Sirven como referencia para altas, equipos y reportes.">
        <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-950">Información de solo lectura. Estas categorías están definidas actualmente por el sistema.</p>
        <CategoryEditor categories={s.categories} />
      </SectionCard>

      <div className="border-t-4 border-slate-300 pt-8">
      <SectionCard id="datos" icon={Database} title="Base de datos" description="Copias de seguridad, exportaciones para gestión, importación y mantenimiento. Los IBAN completos solo salen en exportaciones de administrador.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 font-bold text-slate-900"><FileSpreadsheet className="h-4 w-4 text-primary" />Excel operativo</p>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">Incluye hojas visuales, backup técnico oculto e IBAN completo para administración.</p>
            <Button data-testid="export-db-btn" onClick={exportDB} disabled={!!busy} className="mt-4 h-11 w-full">
              <Download className="h-4 w-4" />{busy === "excel" ? t("exporting") : t("exportDB")}
            </Button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 font-bold text-slate-900"><FileArchive className="h-4 w-4 text-primary" />CSV por módulos</p>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">Descarga un ZIP con CSV operativos y CSV técnicos separados para análisis externo.</p>
            <Button data-testid="export-csv-btn" variant="outline" onClick={exportCSV} disabled={!!busy} className="mt-4 h-11 w-full">
              <Download className="h-4 w-4" />{busy === "csv" ? t("exporting") : "Exportar CSV"}
            </Button>
          </div>
        </div>
        <details className="mt-5 rounded-2xl border-2 border-red-300 bg-red-50 p-5" aria-label="Zona de peligro de base de datos">
          <summary className="cursor-pointer font-heading font-bold text-red-950">Zona de peligro: operaciones que pueden reemplazar o eliminar datos</summary>
          <p className="mt-1 text-sm text-red-700">Importar, cargar datos de ejemplo y vaciar todo modifican datos operativos. Exporta una copia antes de continuar.</p>
          {!maintenanceVisible && <Button type="button" variant="outline" className="mt-4 border-red-300 bg-white text-red-800 hover:bg-red-100" onClick={() => setMaintenanceVisible(true)}>Mostrar acciones de mantenimiento</Button>}
          <div className={maintenanceVisible ? "mt-4 rounded-xl border border-red-200 bg-white p-4" : "hidden"}>
            <p className="flex items-center gap-2 font-bold text-slate-900"><Upload className="h-4 w-4 text-red-700" />Restaurar Excel</p>
            <p className="mt-1 text-sm text-slate-600">Reemplaza la base de datos con un Excel de backup compatible.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="import-db-input" onChange={importDB} />
            <Button data-testid="import-db-btn" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy} className="mt-3 h-11"><Upload className="h-4 w-4" />{busy === "import" ? t("importing") : t("importDB")}</Button>
          </div>
          <div className={maintenanceVisible ? "mt-3 flex flex-col gap-3 sm:flex-row" : "hidden"}>
            <Button data-testid="load-demo-btn" variant="outline" onClick={loadDemo} disabled={!!busy} className="h-11 border-amber-200 text-amber-800 hover:bg-amber-100">
              <Database className="h-4 w-4" />{busy === "demo" ? t("importing") : t("loadDemo")}
            </Button>
            <Button data-testid="clear-all-btn" variant="outline" onClick={clearAll} disabled={!!busy} className="h-11 border-red-200 text-red-700 hover:bg-red-100">
              <Trash2 className="h-4 w-4" />{t("clearAll")}
            </Button>
          </div>
        </details>
      </SectionCard>
      </div>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sky-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur" role="region" aria-label="Guardar cambios"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className={`text-sm font-semibold `} role="status" aria-live="polite">{statusText}</p><Button data-testid="save-settings-btn" onClick={save} disabled={!!busy || !hasUnsavedChanges} className="h-11 px-6"><Save className="h-5 w-5" />{busy === "save" ? "Guardando cambios…" : "Guardar cambios"}</Button></div></div>
    </div>
  );
};

export default Settings;
