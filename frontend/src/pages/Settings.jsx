import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarDays, Camera, Database, Download, Euro, Flag,
  MapPin, Save, Settings as SettingsIcon, ShieldCheck, Tags, Trash2,
  Upload, UserCog, X, Plus, FileSpreadsheet, FileArchive,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared";
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

const Settings = () => {
  const { t } = useI18n();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState("");
  const fileRef = useRef();
  const canAdminSettings = usePermission("settings", "administer");
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (canAdminSettings) api.get("/settings").then((r) => setS(r.data));
  }, [canAdminSettings]);

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));
  const addTo = (k, v) => setS((p) => ({ ...p, [k]: [...(p[k] || []), v] }));
  const removeFrom = (k, i) => setS((p) => ({ ...p, [k]: (p[k] || []).filter((_, idx) => idx !== i) }));
  const reloadSettings = () => api.get("/settings").then((r) => setS(r.data));

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
    const { categories, id, created_at, updated_at, ...payload } = s;
    setBusy("save");
    try {
      await api.put("/settings", payload);
      toast.success(t("saved"));
      await reloadSettings();
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

  const nav = [
    ["club", "Datos del club"],
    ["temporadas", "Temporadas"],
    ["campos", "Campos"],
    ["entrenadores", "Entrenadores"],
    ["cuotas", "Cuotas"],
    ["alertas", "Alertas"],
    ["categorias", "Categorías"],
    ["datos", "Base de datos"],
  ];

  return (
    <div data-testid="settings-page" className="space-y-6">
      <PageHeader
        title="Configuración del sistema"
        icon={SettingsIcon}
        action={<Button data-testid="save-settings-btn" onClick={save} disabled={!!busy} className="h-11 px-5"><Save className="h-5 w-5" />{busy === "save" ? "Guardando..." : t("save")}</Button>}
      />

      <div className="rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Panel administrativo</p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-slate-950">Centro de configuración y mantenimiento</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Esta zona controla los datos que reutiliza toda la app: documentos, filtros, equipos, cuotas, alertas, exportaciones y copias de seguridad.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-2xl font-bold text-slate-950">{configuredCount}</p><p className="text-xs text-slate-500">bloques activos</p></div>
            <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-2xl font-bold text-slate-950">{(s.temporadas || []).length}</p><p className="text-xs text-slate-500">temporadas</p></div>
            <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-2xl font-bold text-slate-950">{(s.campos || []).length}</p><p className="text-xs text-slate-500">campos</p></div>
            <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-2xl font-bold text-slate-950">{(s.entrenadores || []).length}</p><p className="text-xs text-slate-500">entrenadores</p></div>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-slate-50/90 px-1 py-2 backdrop-blur">
        <div className="flex gap-2">
          {nav.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-primary/30 hover:text-primary">
              {label}
            </a>
          ))}
        </div>
      </div>

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

      <SectionCard id="temporadas" icon={CalendarDays} title="Temporadas" description="Temporadas disponibles para filtrar jugadores, equipos, pagos, inscripciones, reportes, partidos y entrenamientos.">
        <TagList label={t("seasons")} help="Añade una temporada cuando el club abra un nuevo curso deportivo." items={s.temporadas} onAdd={(v) => addTo("temporadas", v)} onRemove={(i) => removeFrom("temporadas", i)} testid="seasons" placeholder="2026-2027" />
      </SectionCard>

      <SectionCard id="campos" icon={MapPin} title="Campos de juego" description="Campos reutilizables en partidos, entrenamientos y convocatorias para evitar escribir direcciones cada vez.">
        <TagList label={t("fields")} help="Usa nombres reconocibles para coordinación y familias." items={s.campos} onAdd={(v) => addTo("campos", v)} onRemove={(i) => removeFrom("campos", i)} testid="fields" placeholder="Campo municipal" />
      </SectionCard>

      <SectionCard id="entrenadores" icon={UserCog} title="Entrenadores" description="Listado base para asignar responsables a equipos, entrenamientos y comunicaciones.">
        <TagList label={t("coaches")} help="Mantén aquí el catálogo de responsables deportivos." items={s.entrenadores} onAdd={(v) => addTo("entrenadores", v)} onRemove={(i) => removeFrom("entrenadores", i)} testid="coaches" placeholder="Nombre y apellidos" />
      </SectionCard>

      <SectionCard id="cuotas" icon={Euro} title="Cuotas y descuentos" description="Importes base para pagos, inscripciones, referencias de cuota y descuentos por hermanos.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("baseFee")} type="number" value={s.cuota_base} onChange={set("cuota_base")} testid="cuota-base" />
          <Field label={t("siblingDiscountCfg")} type="number" value={s.descuento_hermano} onChange={set("descuento_hermano")} testid="descuento-hermano" />
        </div>
      </SectionCard>

      <SectionCard id="alertas" icon={AlertTriangle} title="Alertas y asistencia" description="Reglas para avisar de ausencias o incidencias en entrenamientos y seguimiento deportivo.">
        <div className="max-w-md">
          <Field label={t("attendanceAlertThreshold")} type="number" value={s.attendance_alert_threshold ?? 3} onChange={set("attendance_alert_threshold")} testid="attendance-alert-threshold" min={1} max={20} />
          <p className="mt-2 text-xs leading-5 text-slate-500">Cuando un jugador alcance este número de ausencias, aparecerá como incidencia para revisar.</p>
        </div>
      </SectionCard>

      <SectionCard id="categorias" icon={Tags} title="Categorías por edad" description="Reglas de clasificación automática para jugadores según edad. Sirven como referencia para altas, equipos y reportes.">
        <CategoryEditor categories={s.categories} />
      </SectionCard>

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
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 font-bold text-slate-900"><Upload className="h-4 w-4 text-primary" />Restaurar Excel</p>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">Reemplaza la base de datos con un Excel de backup compatible.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="import-db-input" onChange={importDB} />
            <Button data-testid="import-db-btn" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy} className="mt-4 h-11 w-full">
              <Upload className="h-4 w-4" />{busy === "import" ? t("importing") : t("importDB")}
            </Button>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="font-bold text-red-900">Zona peligrosa</p>
          <p className="mt-1 text-sm text-red-700">Vaciar todo elimina los datos operativos. Haz una exportación antes de usarlo.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Button data-testid="load-demo-btn" variant="outline" onClick={loadDemo} disabled={!!busy} className="h-11 border-amber-200 text-amber-800 hover:bg-amber-100">
              <Database className="h-4 w-4" />{busy === "demo" ? t("importing") : t("loadDemo")}
            </Button>
            <Button data-testid="clear-all-btn" variant="outline" onClick={clearAll} disabled={!!busy} className="h-11 border-red-200 text-red-700 hover:bg-red-100">
              <Trash2 className="h-4 w-4" />{t("clearAll")}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default Settings;
