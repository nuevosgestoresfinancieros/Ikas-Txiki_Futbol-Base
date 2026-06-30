import React, { useEffect, useState, useRef } from "react";
import { Settings as SettingsIcon, Plus, X, Save, Camera, Download, Upload, Database, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api, { API } from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared";
import { Field } from "@/components/form";

const TagList = ({ label, items, onAdd, onRemove, testid }) => {
  const { t } = useI18n();
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-600">{label}</label>
      <div className="flex gap-2">
        <Input data-testid={`${testid}-input`} value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }}
          placeholder={t("addItem")} className="h-11" />
        <Button data-testid={`${testid}-add`} onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }} className="h-11"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(items || []).map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {it}
            <button data-testid={`${testid}-remove-${i}`} onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
      </div>
    </div>
  );
};

const Settings = () => {
  const { t } = useI18n();
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);
  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));
  const addTo = (k, v) => setS((p) => ({ ...p, [k]: [...(p[k] || []), v] }));
  const removeFrom = (k, i) => setS((p) => ({ ...p, [k]: p[k].filter((_, idx) => idx !== i) }));

  const handleLogo = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => set("club_logo")(reader.result); reader.readAsDataURL(file);
  };

  const save = async () => {
    const { categories, id, created_at, updated_at, ...payload } = s;
    await api.put("/settings", payload);
    toast.success(t("saved"));
  };

  const fileRef = useRef();
  const [busy, setBusy] = useState(false);

  const reloadSettings = () => api.get("/settings").then((r) => setS(r.data));

  const exportDB = async () => {
    setBusy(true);
    try {
      const res = await api.get("/export-excel", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ikastxiki_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Error al exportar"); }
    setBusy(false);
  };

  const importDB = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t("importWarning"))) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/import-excel", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(t("importDone"));
      await reloadSettings();
    } catch (e) { toast.error(e.response?.data?.detail || "Error al importar"); }
    setBusy(false);
  };

  const loadDemo = async () => {
    if (!window.confirm(t("demoWarning"))) return;
    setBusy(true);
    try { await api.post("/seed-demo"); toast.success(t("saved")); await reloadSettings(); }
    catch (e) { toast.error("Error"); }
    setBusy(false);
  };

  const clearAll = async () => {
    if (!window.confirm(t("clearWarning"))) return;
    setBusy(true);
    try { await api.post("/clear-all"); toast.success(t("deleted")); await reloadSettings(); }
    catch (e) { toast.error("Error"); }
    setBusy(false);
  };

  if (!s) return <div className="text-slate-400">…</div>;

  return (
    <div data-testid="settings-page">
      <PageHeader title={t("settings")} icon={SettingsIcon}
        action={<Button data-testid="save-settings-btn" onClick={save} className="h-11 px-5"><Save className="h-5 w-5" />{t("save")}</Button>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Club data */}
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 space-y-4">
          <h2 className="font-heading text-lg font-bold text-slate-900">{t("clubData")}</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              {s.club_logo ? <img src={s.club_logo} alt="" className="h-20 w-20 rounded-lg object-contain border border-slate-200" /> :
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">LOGO</div>}
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white cursor-pointer shadow">
                <Camera className="h-4 w-4" />
                <input data-testid="club-logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              </label>
            </div>
          </div>
          <Field label={t("clubName")} value={s.club_nombre} onChange={set("club_nombre")} testid="club-nombre" />
          <Field label={t("clubAddress")} value={s.club_direccion} onChange={set("club_direccion")} testid="club-direccion" />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("clubEmail")} value={s.club_email} onChange={set("club_email")} testid="club-email" />
            <Field label={t("clubPhone")} value={s.club_telefono} onChange={set("club_telefono")} testid="club-telefono" />
          </div>
          <Field label={t("currentSeason")} value={s.temporada_actual} onChange={set("temporada_actual")} testid="club-temporada" />
        </div>

        {/* Lists */}
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 space-y-5">
          <h2 className="font-heading text-lg font-bold text-slate-900">{t("settings")}</h2>
          <TagList label={t("seasons")} items={s.temporadas} onAdd={(v) => addTo("temporadas", v)} onRemove={(i) => removeFrom("temporadas", i)} testid="seasons" />
          <TagList label={t("fields")} items={s.campos} onAdd={(v) => addTo("campos", v)} onRemove={(i) => removeFrom("campos", i)} testid="fields" />
          <TagList label={t("coaches")} items={s.entrenadores} onAdd={(v) => addTo("entrenadores", v)} onRemove={(i) => removeFrom("entrenadores", i)} testid="coaches" />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("baseFee")} type="number" value={s.cuota_base} onChange={set("cuota_base")} testid="cuota-base" />
            <Field label={t("siblingDiscountCfg")} type="number" value={s.descuento_hermano} onChange={set("descuento_hermano")} testid="descuento-hermano" />
          </div>
        </div>

        {/* Categories */}
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 lg:col-span-2">
          <h2 className="font-heading text-lg font-bold text-slate-900 mb-4">{t("categoriesByAge")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(s.categories || []).map((c) => (
              <div key={c.name} className="rounded-lg border border-slate-200 p-3 text-center">
                <p className="font-heading font-bold text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-500">{c.min_age}–{c.max_age} años</p>
              </div>
            ))}
          </div>
        </div>

        {/* Data management */}
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 lg:col-span-2" data-testid="data-management">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-bold text-slate-900">{t("dataManagement")}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-800 flex items-center gap-2"><Download className="h-4 w-4 text-primary" />{t("exportDB")}</p>
              <p className="text-xs text-slate-500 mt-1 mb-3">{t("exportDBDesc")}</p>
              <Button data-testid="export-db-btn" onClick={exportDB} disabled={busy} className="h-11 w-full">
                <Download className="h-4 w-4" />{busy ? t("exporting") : t("exportDB")}
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-800 flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />{t("importDB")}</p>
              <p className="text-xs text-slate-500 mt-1 mb-3">{t("importDBDesc")}</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="import-db-input" onChange={importDB} />
              <Button data-testid="import-db-btn" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className="h-11 w-full">
                <Upload className="h-4 w-4" />{busy ? t("importing") : t("importDB")}
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-slate-100">
            <Button data-testid="load-demo-btn" variant="outline" onClick={loadDemo} disabled={busy} className="h-11">
              <Sparkles className="h-4 w-4" />{t("loadDemo")}
            </Button>
            <Button data-testid="clear-all-btn" variant="outline" onClick={clearAll} disabled={busy} className="h-11 text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />{t("clearAll")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
