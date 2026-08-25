import React, { useEffect, useState, useCallback } from "react";
import { Shirt, Check, X, Pencil, Save, Filter, Download } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared";

const TALLAS = ["", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL",
  "2", "4", "6", "8", "10", "12", "14", "16",
  "MINI", "INFANTIL", "JUNIOR", "SENIOR",
  "SR TAILA (41-46)", "NO APLICA"];

const TALLAS_MEDIAS = ["", "XS", "S", "M", "L", "XL", "XXL", "NO APLICA"];

const Cell = ({ value, editing, onChange, type = "text", options, label, yesLabel, noLabel }) => {
  if (!editing) {
    if (type === "bool") {
      return value
        ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><Check className="h-3.5 w-3.5" />{yesLabel}</span>
        : <span className="inline-flex items-center gap-1 text-slate-400 text-xs"><X className="h-3.5 w-3.5" />{noLabel}</span>;
    }
    return <span className="text-sm text-slate-700">{value || <span className="text-slate-300">—</span>}</span>;
  }
  if (type === "bool") {
    return (
      <input type="checkbox" aria-label={label} checked={!!value} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-primary cursor-pointer" />
    );
  }
  if (type === "date") {
    return (
      <input type="date" aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
    );
  }
  if (options) {
    return (
      <select aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white">
        {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    );
  }
  return (
    <input type="text" aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
  );
};

const Equipment = () => {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [teams, setTeams] = useState([]);
  const [filterTeam, setFilterTeam] = useState("");
  const [filterEntregada, setFilterEntregada] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [eRes, tRes] = await Promise.all([api.get("/equipment"), api.get("/teams")]);
    setData(eRes.data);
    setTeams(tRes.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter((p) => {
    if (filterTeam && p.equipo_id !== filterTeam) return false;
    if (filterEntregada === "si" && !p.equipacion_entregada) return false;
    if (filterEntregada === "no" && p.equipacion_entregada) return false;
    return true;
  });

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      dorsal: p.dorsal || "",
      talla_camiseta: p.talla_camiseta || "",
      talla_pantalon: p.talla_pantalon || "",
      talla_chandal: p.talla_chandal || "",
      talla_medias: p.talla_medias || "",
      talla_calzado: p.talla_calzado || "",
      equipacion_entregada: p.equipacion_entregada || false,
      fecha_entrega_equipacion: p.fecha_entrega_equipacion || "",
      observaciones_material: p.observaciones_material || "",
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async (playerId) => {
    setSaving(true);
    try {
      await api.put(`/equipment/${playerId}`, editForm);
      toast.success(t("equipmentUpdated"));
      setEditingId(null);
      load();
    } catch {
      toast.error(t("equipmentSaveError"));
    }
    setSaving(false);
  };

  const setField = (k) => (v) => setEditForm((f) => ({ ...f, [k]: v }));

  // Estadísticas resumen
  const total = data.length;
  const entregadas = data.filter((p) => p.equipacion_entregada).length;
  const pendientes = total - entregadas;
  const sinTalla = data.filter((p) => !p.talla_camiseta).length;

  // Exportar CSV equipamiento
  const exportCSV = () => {
    const headers = [t("name"), t("surname"), t("equipmentTeam"), t("category"), t("equipmentBib"),
      t("equipmentShirt"), t("equipmentShorts"), t("equipmentTracksuit"), t("equipmentSocks"), t("equipmentShoes"),
      "2ª equipación nombre", "2ª equipación dorsal", "2ª equipación camiseta", "2ª equipación medias",
      t("equipmentDelivered"), t("equipmentDeliveryDate"), t("equipmentNotes")];
    const rows = filtered.map((p) => [
      p.nombre, p.apellidos, p.equipo_nombre, p.categoria || "", p.dorsal || "",
      p.talla_camiseta || "", p.talla_pantalon || "", p.talla_chandal || "",
      p.talla_medias || "", p.talla_calzado || "",
      p.segunda_equipacion?.shirt_name || "", p.segunda_equipacion?.number || "",
      p.segunda_equipacion?.shirt_size || "", p.segunda_equipacion?.socks_size || "",
      p.equipacion_entregada ? t("yes") : t("no"),
      p.fecha_entrega_equipacion || "", p.observaciones_material || ""
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "equipamiento.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const teamOptions = teams.map((t) => ({ value: t.id, label: t.nombre }));

  return (
    <div data-testid="equipment-page">
      <PageHeader
        title={t("equipment")}
        icon={Shirt}
        action={
          <PermissionGate resource="equipment" action="export"><Button onClick={exportCSV} variant="outline" className="h-11 px-4 gap-2">
            <Download className="h-4 w-4" /> {t("equipmentExport")}
          </Button></PermissionGate>
        }
      />

      {/* Estadísticas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: t("equipmentTotalPlayers"), value: total, color: "text-slate-800" },
          { label: t("equipmentDelivered"), value: entregadas, color: "text-emerald-600" },
          { label: t("equipmentPending"), value: pendientes, color: "text-amber-600" },
          { label: t("equipmentMissingSize"), value: sinTalla, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-4 text-center">
            <p className={`text-2xl font-bold font-heading ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Filter className="h-4 w-4 text-slate-400" />
        <select aria-label={t("equipmentTeam")} value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">{t("equipmentAllTeams")}</option>
          {teamOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select aria-label={t("equipmentDelivered")} value={filterEntregada} onChange={(e) => setFilterEntregada(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">{t("equipmentAllDeliveries")}</option>
          <option value="si">{t("delivered")}</option>
          <option value="no">{t("pendingDelivery")}</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} {t("equipmentPlayerCount")}</span>
      </div>

      {/* Vista móvil */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="surface-card px-4 py-10 text-center text-sm text-slate-400">{t("equipmentNoResults")}</div>
        ) : filtered.map((p) => (
          <article key={`mobile-${p.id}`} className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-base font-bold text-slate-900">{p.nombre} {p.apellidos}</h2>
                <p className="mt-1 text-xs text-slate-500">{[p.equipo_nombre, p.categoria].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.equipacion_entregada ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {p.equipacion_entregada ? t("delivered") : t("pendingDelivery")}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentBib")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.dorsal || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentShirt")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.talla_camiseta || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentShorts")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.talla_pantalon || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentTracksuit")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.talla_chandal || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentSocks")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.talla_medias || "—"}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold uppercase text-slate-400">{t("equipmentShoes")}</dt><dd className="mt-1 font-semibold text-slate-800">{p.talla_calzado || "—"}</dd></div>
            </dl>
            {(p.segunda_equipacion?.shirt_name || p.segunda_equipacion?.number || p.segunda_equipacion?.shirt_size || p.segunda_equipacion?.socks_size) && (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sm">
                <p className="mb-2 text-xs font-bold uppercase text-sky-700">{t("equipmentSecondKit")}</p>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <span>{t("equipmentSecondKitName")}: <strong>{p.segunda_equipacion?.shirt_name || "—"}</strong></span>
                  <span>{t("equipmentSecondKitBib")}: <strong>{p.segunda_equipacion?.number || "—"}</strong></span>
                  <span>{t("equipmentSecondKitShirt")}: <strong>{p.segunda_equipacion?.shirt_size || "—"}</strong></span>
                  <span>{t("equipmentSecondKitSocks")}: <strong>{p.segunda_equipacion?.socks_size || "—"}</strong></span>
                </div>
              </div>
            )}
            {p.observaciones_material && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{p.observaciones_material}</p>}
          </article>
        ))}
      </div>

      {/* Tabla */}
      <div className="surface-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1250px]">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sticky top-0">
              <tr>
                <th rowSpan="2" className="px-4 py-3 min-w-[160px]">{t("equipmentPlayer")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentTeam")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentBib")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentShirt")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentShorts")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentTracksuit")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentSocks")}</th>
                <th colSpan="4" scope="colgroup" className="equipment-second-kit-group border-x border-sky-100 px-3 py-2 text-center">
                  {t("equipmentSecondKit")}
                </th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentShoes")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("delivered")}</th>
                <th rowSpan="2" className="px-3 py-3">{t("equipmentDeliveryDate")}</th>
                <th rowSpan="2" className="px-3 py-3 min-w-[140px]">{t("equipmentNotes")}</th>
                <th rowSpan="2" className="px-3 py-3 text-right">{t("equipmentActions")}</th>
              </tr>
              <tr>
                <th scope="col" className="equipment-second-kit-column border-l border-sky-100 px-3 py-2">{t("equipmentSecondKitName")}</th>
                <th scope="col" className="equipment-second-kit-column px-3 py-2">{t("equipmentSecondKitBib")}</th>
                <th scope="col" className="equipment-second-kit-column px-3 py-2">{t("equipmentSecondKitShirt")}</th>
                <th scope="col" className="equipment-second-kit-column border-r border-sky-100 px-3 py-2">{t("equipmentSecondKitSocks")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={16} className="px-4 py-10 text-center text-slate-400">{t("equipmentNoResults")}</td></tr>
              ) : filtered.map((p) => {
                const isEditing = editingId === p.id;
                const row = isEditing ? editForm : p;
                return (
                  <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isEditing ? "bg-primary/3 ring-1 ring-inset ring-primary/20" : ""}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-800 leading-tight">{p.nombre} {p.apellidos}</div>
                      {p.categoria && <div className="text-xs text-slate-400">{p.categoria}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{p.equipo_nombre}</td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentBib")} value={row.dorsal} editing={isEditing} onChange={setField("dorsal")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentShirt")} value={row.talla_camiseta} editing={isEditing} onChange={setField("talla_camiseta")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentShorts")} value={row.talla_pantalon} editing={isEditing} onChange={setField("talla_pantalon")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentTracksuit")} value={row.talla_chandal} editing={isEditing} onChange={setField("talla_chandal")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentSocks")} value={row.talla_medias} editing={isEditing} onChange={setField("talla_medias")} options={isEditing ? TALLAS_MEDIAS : undefined} />
                    </td>
                    <td className="bg-sky-50/40 px-3 py-2.5"><Cell value={p.segunda_equipacion?.shirt_name} editing={false} /></td>
                    <td className="bg-sky-50/40 px-3 py-2.5"><Cell value={p.segunda_equipacion?.number} editing={false} /></td>
                    <td className="bg-sky-50/40 px-3 py-2.5"><Cell value={p.segunda_equipacion?.shirt_size} editing={false} /></td>
                    <td className="bg-sky-50/40 px-3 py-2.5"><Cell value={p.segunda_equipacion?.socks_size} editing={false} /></td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentShoes")} value={row.talla_calzado} editing={isEditing} onChange={setField("talla_calzado")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentDelivered")} yesLabel={t("yes")} noLabel={t("no")} value={row.equipacion_entregada} editing={isEditing} onChange={setField("equipacion_entregada")} type="bool" />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell label={t("equipmentDeliveryDate")} value={row.fecha_entrega_equipacion} editing={isEditing} onChange={setField("fecha_entrega_equipacion")} type="date" />
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input value={editForm.observaciones_material} onChange={(e) => setField("observaciones_material")(e.target.value)}
                          aria-label={t("equipmentNotes")} placeholder={`${t("equipmentNotes")}…`}
                          className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                      ) : (
                        <span className="text-xs text-slate-500">{p.observaciones_material || <span className="text-slate-300">—</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label={t("cancel")} className="text-slate-400 hover:text-slate-600" onClick={cancelEdit} disabled={saving}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" aria-label={t("save")} className="bg-primary text-white" onClick={() => saveEdit(p.id)} disabled={saving}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <PermissionGate resource="equipment" action="edit"><Button size="icon" variant="ghost" aria-label={`${t("edit")} ${p.nombre}`} className="text-slate-400 hover:text-primary" onClick={() => startEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button></PermissionGate>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <p className="text-xs text-slate-400 mt-3 text-center">
        {t("equipmentEditHint")}
      </p>
    </div>
  );
};

export default Equipment;
