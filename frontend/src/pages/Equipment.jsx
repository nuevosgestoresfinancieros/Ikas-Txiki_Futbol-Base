import React, { useEffect, useState, useCallback } from "react";
import { Shirt, Check, X, Pencil, Save, Filter, Download } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared";

const TALLAS = ["", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL",
  "2", "4", "6", "8", "10", "12", "14", "16",
  "MINI", "INFANTIL", "JUNIOR", "SENIOR",
  "SR TAILA (41-46)", "NO APLICA"];

const TALLAS_MEDIAS = ["", "XS", "S", "M", "L", "XL", "XXL", "NO APLICA"];

const Cell = ({ value, editing, onChange, type = "text", options }) => {
  if (!editing) {
    if (type === "bool") {
      return value
        ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><Check className="h-3.5 w-3.5" />Sí</span>
        : <span className="inline-flex items-center gap-1 text-slate-400 text-xs"><X className="h-3.5 w-3.5" />No</span>;
    }
    return <span className="text-sm text-slate-700">{value || <span className="text-slate-300">—</span>}</span>;
  }
  if (type === "bool") {
    return (
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-primary cursor-pointer" />
    );
  }
  if (type === "date") {
    return (
      <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
    );
  }
  if (options) {
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white">
        {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    );
  }
  return (
    <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)}
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
      toast.success("Equipación actualizada");
      setEditingId(null);
      load();
    } catch {
      toast.error("Error al guardar");
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
    const headers = ["Nombre","Apellidos","Equipo","Categoría","Dorsal",
      "Talla Camiseta","Talla Pantalón","Talla Chándal","Talla Medias","Talla Calzado",
      "Equipación Entregada","Fecha Entrega","Observaciones"];
    const rows = filtered.map((p) => [
      p.nombre, p.apellidos, p.equipo_nombre, p.categoria || "", p.dorsal || "",
      p.talla_camiseta || "", p.talla_pantalon || "", p.talla_chandal || "",
      p.talla_medias || "", p.talla_calzado || "",
      p.equipacion_entregada ? "Sí" : "No",
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
        title="Equipamiento"
        icon={Shirt}
        action={
          <Button onClick={exportCSV} variant="outline" className="h-11 px-4 gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      {/* Estadísticas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total jugadores", value: total, color: "text-slate-800" },
          { label: "Equipación entregada", value: entregadas, color: "text-emerald-600" },
          { label: "Pendiente de entregar", value: pendientes, color: "text-amber-600" },
          { label: "Sin talla registrada", value: sinTalla, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-4 text-center">
            <p className={`text-2xl font-bold font-heading ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Todos los equipos</option>
          {teamOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterEntregada} onChange={(e) => setFilterEntregada(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Todas las entregas</option>
          <option value="si">Entregada</option>
          <option value="no">Pendiente</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} jugadores</span>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sticky top-0">
              <tr>
                <th className="px-4 py-3 min-w-[160px]">Jugador</th>
                <th className="px-3 py-3">Equipo</th>
                <th className="px-3 py-3">Dorsal</th>
                <th className="px-3 py-3">Camiseta</th>
                <th className="px-3 py-3">Pantalón</th>
                <th className="px-3 py-3">Chándal</th>
                <th className="px-3 py-3">Medias</th>
                <th className="px-3 py-3">Calzado</th>
                <th className="px-3 py-3">Entregada</th>
                <th className="px-3 py-3">Fecha entrega</th>
                <th className="px-3 py-3 min-w-[140px]">Observaciones</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400">No hay jugadores con los filtros seleccionados</td></tr>
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
                      <Cell value={row.dorsal} editing={isEditing} onChange={setField("dorsal")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.talla_camiseta} editing={isEditing} onChange={setField("talla_camiseta")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.talla_pantalon} editing={isEditing} onChange={setField("talla_pantalon")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.talla_chandal} editing={isEditing} onChange={setField("talla_chandal")} options={isEditing ? TALLAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.talla_medias} editing={isEditing} onChange={setField("talla_medias")} options={isEditing ? TALLAS_MEDIAS : undefined} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.talla_calzado} editing={isEditing} onChange={setField("talla_calzado")} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.equipacion_entregada} editing={isEditing} onChange={setField("equipacion_entregada")} type="bool" />
                    </td>
                    <td className="px-3 py-2.5">
                      <Cell value={row.fecha_entrega_equipacion} editing={isEditing} onChange={setField("fecha_entrega_equipacion")} type="date" />
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <input value={editForm.observaciones_material} onChange={(e) => setField("observaciones_material")(e.target.value)}
                          placeholder="Observaciones…"
                          className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                      ) : (
                        <span className="text-xs text-slate-500">{p.observaciones_material || <span className="text-slate-300">—</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={cancelEdit} disabled={saving}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" className="h-7 w-7 bg-primary text-white" onClick={() => saveEdit(p.id)} disabled={saving}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => startEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
        Clic en ✏️ para editar la equipación de un jugador. Los cambios se guardan en la ficha del jugador.
      </p>
    </div>
  );
};

export default Equipment;
