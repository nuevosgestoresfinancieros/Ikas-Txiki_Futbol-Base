import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, Check, ChevronRight, Download, Filter, LayoutGrid, List,
  PackageCheck, Pencil, RefreshCw, Ruler, Save, Search, Shirt, SlidersHorizontal, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader, initials } from "@/components/shared";

const TALLAS = ["", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL",
  "2", "4", "6", "8", "10", "12", "14", "16",
  "MINI", "INFANTIL", "JUNIOR", "SENIOR", "SR TAILA (41-46)", "NO APLICA"];

const TALLAS_MEDIAS = ["", "XS", "S", "M", "L", "XL", "XXL", "NO APLICA"];
const UNASSIGNED_TEAM = "__sin_equipo__";
const SIZE_FIELDS = [
  { key: "talla_camiseta", labelKey: "equipmentShirt", icon: Shirt },
  { key: "talla_pantalon", labelKey: "equipmentShorts", icon: Shirt },
  { key: "talla_chandal", labelKey: "equipmentTracksuit", icon: Shirt },
  { key: "talla_medias", labelKey: "equipmentSocks", icon: Ruler },
  { key: "talla_calzado", labelKey: "equipmentShoes", icon: Ruler },
];

const EMPTY_EDIT = {
  dorsal: "", nombre_camiseta: "", talla_camiseta: "", talla_pantalon: "", talla_chandal: "",
  talla_medias: "", talla_calzado: "", equipacion_entregada: false,
  fecha_entrega_equipacion: "", observaciones_material: "",
};

const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const seasonTestId = (season) => String(season || "all").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "all";

const missingSizes = (player) => SIZE_FIELDS
  .filter(({ key }) => !String(player?.[key] ?? "").trim())
  .map(({ key, labelKey }) => ({ key, label: labelKey }));

const hasSecondKit = (player) => Object.values(player?.segunda_equipacion || {})
  .some((value) => String(value ?? "").trim());

const StatusPill = ({ delivered, t }) => (
  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-extrabold ${delivered ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}`}>
    {delivered ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
    {delivered ? t("delivered") : t("pendingDelivery")}
  </span>
);

const MetricCard = ({ icon: Icon, label, value, detail, tone = "blue" }) => {
  const tones = {
    blue: "border-[#CFE9FA] bg-[#F4FAFE] text-[#1B5C8F]",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-800",
    red: "border-red-100 bg-red-50/70 text-red-700",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
          <p className="mt-2 font-heading text-3xl font-extrabold tracking-tight">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {detail && <p className="mt-2 text-xs font-semibold opacity-75">{detail}</p>}
    </div>
  );
};

const EquipmentValue = ({ value }) => (
  <span className={value ? "font-bold text-slate-800" : "font-semibold text-slate-300"}>{value || "-"}</span>
);

const EquipmentCard = ({ player, onEdit, t }) => {
  const missing = missingSizes(player);
  const complete = SIZE_FIELDS.length - missing.length;
  return (
    <article
      data-testid={`equipment-card-${player.id}`}
      className={`surface-card flex min-w-0 flex-col overflow-hidden p-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-[#93C8EE] hover:shadow-[0_16px_34px_rgba(14,53,84,0.13)] ${player.equipacion_entregada ? "border-l-4 border-l-emerald-400" : "border-l-4 border-l-amber-400"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF6FD] to-[#CFE9FA] font-heading text-sm font-extrabold text-[#1B5C8F]">
            {initials(player.nombre, player.apellidos)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-base font-extrabold text-[#0E3554]">{player.nombre} {player.apellidos}</h3>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
              <span className="truncate">{player.equipo_nombre || t("equipmentNoTeam")}</span>
              {player.categoria && <><span aria-hidden="true">·</span><span>{player.categoria}</span></>}
              {player.dorsal && <><span aria-hidden="true">·</span><span>#{player.dorsal}</span></>}
            </div>
          </div>
        </div>
        <StatusPill delivered={player.equipacion_entregada} t={t} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("equipmentKitOverview")}</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{complete}/{SIZE_FIELDS.length} {t("equipmentItemsReady")}</p>
        </div>
        {missing.length > 0 ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-extrabold text-red-700 ring-1 ring-inset ring-red-100">
            {missing.length} {t("equipmentMissingItems")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700 ring-1 ring-inset ring-emerald-100">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />{t("equipmentComplete")}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {SIZE_FIELDS.map(({ key, labelKey, icon: Icon }) => (
          <div key={key} className={`rounded-xl p-2.5 ${player[key] ? "bg-slate-50" : "bg-red-50/70"}`}>
            <dt className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              <Icon className="h-3 w-3" aria-hidden="true" />{t(labelKey)}
            </dt>
            <dd className="mt-1 text-sm"><EquipmentValue value={player[key]} /></dd>
          </div>
        ))}
      </dl>

      {hasSecondKit(player) && (
        <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-sky-800">{t("equipmentSecondKit")}</p>
            <span className="text-[10px] font-bold text-sky-600">{t("equipmentAvailable")}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
            <span>{t("equipmentSecondKitName")}: <strong>{player.segunda_equipacion?.shirt_name || "-"}</strong></span>
            <span>{t("equipmentSecondKitBib")}: <strong>{player.segunda_equipacion?.number || "-"}</strong></span>
            <span>{t("equipmentSecondKitShirt")}: <strong>{player.segunda_equipacion?.shirt_size || "-"}</strong></span>
            <span>{t("equipmentSecondKitSocks")}: <strong>{player.segunda_equipacion?.socks_size || "-"}</strong></span>
          </div>
        </div>
      )}

      {player.observaciones_material && (
        <p className="mt-3 line-clamp-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{player.observaciones_material}</p>
      )}

      <PermissionGate resource="equipment" action="edit">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 w-full border-[#CFE9FA] bg-white text-[#1B5C8F] hover:border-[#93C8EE] hover:bg-[#F5FAFE]"
          onClick={() => onEdit(player)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />{t("equipmentEditCard")}
        </Button>
      </PermissionGate>
    </article>
  );
};

const TeamSummaryCard = ({ summary, selected, onSelect, t }) => {
  const percentage = summary.total ? Math.round((summary.delivered / summary.total) * 100) : 0;
  return (
    <button
      type="button"
      data-testid={`equipment-team-card-${seasonTestId(summary.id)}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`surface-card group min-w-0 p-4 text-left transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-[#2B75B0] bg-[#F5FAFE] shadow-[0_14px_30px_rgba(43,117,176,0.15)]" : "hover:border-[#93C8EE]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-[#1B5C8F] text-white" : "bg-[#EAF6FD] text-[#2B75B0]"}`}>
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-extrabold text-[#0E3554]">{summary.name}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{summary.total} {t("equipmentTeamPlayers")}</p>
          </div>
        </div>
        <ChevronRight className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1 ${selected ? "text-[#1B5C8F]" : "text-slate-300"}`} aria-hidden="true" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-emerald-700">{summary.delivered} {t("delivered").toLowerCase()}</span>
        <span className="text-amber-700">{summary.pending} {t("pendingDelivery").toLowerCase()}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${summary.name} ${t("equipmentDeliveryProgress")}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
        <span>{percentage}% {t("equipmentDeliveryProgress")}</span>
        {summary.missing > 0 && <span className="text-red-600">{summary.missing} {t("equipmentMissingSize").toLowerCase()}</span>}
      </div>
    </button>
  );
};

const EditorField = ({ label, value, onChange, type = "text", options }) => (
  <label className="space-y-1.5">
    <span className="block text-sm font-semibold text-slate-700">{label}</span>
    {type === "select" ? (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
        {(options || []).map((option) => <option key={option} value={option}>{option || "-"}</option>)}
      </select>
    ) : (
      <input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
    )}
  </label>
);

const Cell = ({ value, editing, onChange, type = "text", options, label, yesLabel, noLabel }) => {
  if (!editing) {
    if (type === "bool") {
      return value
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" />{yesLabel}</span>
        : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><X className="h-3.5 w-3.5" />{noLabel}</span>;
    }
    return <span className="text-sm text-slate-700">{value || <span className="text-slate-300">-</span>}</span>;
  }
  if (type === "bool") {
    return <input type="checkbox" aria-label={label} checked={!!value} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary" />;
  }
  if (type === "date") {
    return <input type="date" aria-label={label} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-32 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />;
  }
  if (options) {
    return <select aria-label={label} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-28 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary">{options.map((option) => <option key={option} value={option}>{option || "-"}</option>)}</select>;
  }
  return <input type="text" aria-label={label} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />;
};

const Equipment = () => {
  const { t } = useI18n();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [params, setParams] = useState(initialParams);
  const [data, setData] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasonOptions, setSeasonOptions] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(() => initialParams.get("temporada") || "");
  const [metadataReady, setMetadataReady] = useState(false);
  const [metadataError, setMetadataError] = useState(false);
  const [filterTeam, setFilterTeam] = useState("");
  const [filterEntregada, setFilterEntregada] = useState("");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [view, setView] = useState("cards");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [dialogPlayer, setDialogPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get("/equipment", { params: selectedSeason ? { temporada: selectedSeason } : {} });
      setData(response.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedSeason]);

  useEffect(() => {
    let active = true;
    const loadMetadata = async () => {
      try {
        const [teamResult, catalogResult] = await Promise.allSettled([api.get("/teams"), api.get("/catalog-options")]);
        if (teamResult.status !== "fulfilled") throw teamResult.reason;
        const loadedTeams = teamResult.value.data || [];
        const catalog = catalogResult.status === "fulfilled" ? (catalogResult.value.data || {}) : {};
        const seasons = unique([
          ...(catalog.temporadas || []), catalog.temporada_actual,
          ...loadedTeams.map((team) => team.temporada),
        ]);
        const requested = new URLSearchParams(window.location.search).get("temporada");
        const preferred = requested && seasons.includes(requested)
          ? requested
          : catalog.temporada_actual && seasons.includes(catalog.temporada_actual)
            ? catalog.temporada_actual
            : seasons[seasons.length - 1] || "";
        if (!active) return;
        setTeams(loadedTeams);
        setSeasonOptions(seasons);
        setSelectedSeason(preferred);
        setMetadataError(false);
      } catch {
        if (active) setMetadataError(true);
      } finally {
        if (active) setMetadataReady(true);
      }
    };
    loadMetadata();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (metadataReady) loadEquipment();
  }, [loadEquipment, metadataReady]);

  const selectSeason = (season) => {
    setSelectedSeason(season);
    setFilterTeam("");
    const next = new URLSearchParams(params);
    if (season) next.set("temporada", season);
    else next.delete("temporada");
    setParams(next);
    window.history.replaceState({}, "", `${window.location.pathname}${next.toString() ? `?${next.toString()}` : ""}`);
  };

  const teamOptions = useMemo(() => {
    const scopedTeams = teams.filter((team) => !selectedSeason || team.temporada === selectedSeason);
    const options = scopedTeams.map((team) => ({ value: team.id, label: team.nombre }));
    if (data.some((player) => !player.equipo_id)) options.push({ value: UNASSIGNED_TEAM, label: t("equipmentNoTeam") });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [data, selectedSeason, t, teams]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return data.filter((player) => {
      if (filterTeam === UNASSIGNED_TEAM ? player.equipo_id : filterTeam && player.equipo_id !== filterTeam) return false;
      if (filterEntregada === "si" && !player.equipacion_entregada) return false;
      if (filterEntregada === "no" && player.equipacion_entregada) return false;
      if (missingOnly && missingSizes(player).length === 0) return false;
      if (normalizedQuery && !`${player.nombre || ""} ${player.apellidos || ""} ${player.equipo_nombre || ""}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [data, filterEntregada, filterTeam, missingOnly, query]);

  const teamSummaries = useMemo(() => {
    const scopedTeams = teams.filter((team) => !selectedSeason || team.temporada === selectedSeason);
    const summaries = scopedTeams.map((team) => {
      const players = data.filter((player) => player.equipo_id === team.id);
      const delivered = players.filter((player) => player.equipacion_entregada).length;
      return {
        id: team.id, name: team.nombre, total: players.length,
        delivered, pending: players.length - delivered,
        missing: players.filter((player) => missingSizes(player).length > 0).length,
      };
    });
    const unassigned = data.filter((player) => !player.equipo_id);
    if (unassigned.length) {
      const delivered = unassigned.filter((player) => player.equipacion_entregada).length;
      summaries.push({ id: UNASSIGNED_TEAM, name: t("equipmentNoTeam"), total: unassigned.length, delivered, pending: unassigned.length - delivered, missing: unassigned.filter((player) => missingSizes(player).length > 0).length });
    }
    return summaries.filter((summary) => summary.total > 0 || scopedTeams.length < 1);
  }, [data, selectedSeason, t, teams]);

  const total = data.length;
  const delivered = data.filter((player) => player.equipacion_entregada).length;
  const pending = total - delivered;
  const missing = data.filter((player) => missingSizes(player).length > 0).length;
  const deliveryPercent = total ? Math.round((delivered / total) * 100) : 0;
  const activeFilters = Boolean(query.trim() || filterTeam || filterEntregada || missingOnly);
  const seasonLabel = selectedSeason || t("equipmentAllSeasons");

  const updateEditField = (field) => (value) => setEditForm((current) => ({ ...current, [field]: value }));
  const formFromPlayer = (player) => ({
    ...EMPTY_EDIT,
    dorsal: player.dorsal || "",
    nombre_camiseta: player.nombre_camiseta || "",
    talla_camiseta: player.talla_camiseta || "",
    talla_pantalon: player.talla_pantalon || "",
    talla_chandal: player.talla_chandal || "",
    talla_medias: player.talla_medias || "",
    talla_calzado: player.talla_calzado || "",
    equipacion_entregada: !!player.equipacion_entregada,
    fecha_entrega_equipacion: player.fecha_entrega_equipacion || "",
    observaciones_material: player.observaciones_material || "",
  });
  const startEdit = (player) => { setEditingId(player.id); setEditForm(formFromPlayer(player)); };
  const openDialog = (player) => { setDialogPlayer(player); setEditForm(formFromPlayer(player)); setEditingId(null); };
  const closeDialog = () => { if (!saving) { setDialogPlayer(null); setEditForm(EMPTY_EDIT); } };
  const cancelEdit = () => { setEditingId(null); setEditForm(EMPTY_EDIT); };

  const saveEdit = async (playerId, fromDialog = false) => {
    setSaving(true);
    try {
      await api.put(`/equipment/${playerId}`, editForm, { params: selectedSeason ? { temporada: selectedSeason } : {} });
      toast.success(t("equipmentUpdated"));
      if (fromDialog) setDialogPlayer(null);
      setEditingId(null);
      setEditForm(EMPTY_EDIT);
      await loadEquipment();
    } catch {
      toast.error(t("equipmentSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => { setQuery(""); setFilterTeam(""); setFilterEntregada(""); setMissingOnly(false); };

  const exportCSV = () => {
    const headers = [t("name"), t("surname"), t("equipmentTeam"), t("category"), t("equipmentBib"),
      t("equipmentShirt"), t("equipmentShorts"), t("equipmentTracksuit"), t("equipmentSocks"), t("equipmentShoes"),
      t("equipmentSecondKitName"), t("equipmentSecondKitBib"), t("equipmentSecondKitShirt"), t("equipmentSecondKitSocks"),
      t("equipmentDelivered"), t("equipmentDeliveryDate"), t("equipmentNotes")];
    const rows = filtered.map((player) => [
      player.nombre, player.apellidos, player.equipo_nombre, player.categoria || "", player.dorsal || "",
      player.talla_camiseta || "", player.talla_pantalon || "", player.talla_chandal || "",
      player.talla_medias || "", player.talla_calzado || "", player.segunda_equipacion?.shirt_name || "",
      player.segunda_equipacion?.number || "", player.segunda_equipacion?.shirt_size || "",
      player.segunda_equipacion?.socks_size || "", player.equipacion_entregada ? t("yes") : t("no"),
      player.fecha_entrega_equipacion || "", player.observaciones_material || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `equipamiento${selectedSeason ? `-${selectedSeason}` : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="equipment-page" className="min-w-0">
      <PageHeader
        title={t("equipment")}
        subtitle={`${seasonLabel} · ${total} ${t("equipmentPlayerCount")}`}
        icon={Shirt}
        action={(
          <PermissionGate resource="equipment" action="export">
            <Button onClick={exportCSV} variant="outline" className="h-11 px-4">
              <Download className="h-4 w-4" aria-hidden="true" />{t("equipmentExport")}
            </Button>
          </PermissionGate>
        )}
      />

      {metadataError && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{t("equipmentMetadataWarning")}
        </div>
      )}

      {loading ? (
        <div className="space-y-5" role="status" aria-label={t("loading")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" /></div>
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-72 animate-pulse rounded-2xl bg-slate-200/70" /></div>
        </div>
      ) : loadError ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center" role="alert">
          <RefreshCw className="h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="font-semibold text-slate-700">{t("loadError")}</p>
          <Button onClick={loadEquipment} variant="outline"><RefreshCw className="h-4 w-4" />{t("retry")}</Button>
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-3xl border border-[#1B5C8F]/20 bg-gradient-to-br from-[#0E3554] via-[#1B5C8F] to-[#2B75B0] p-5 text-white shadow-[0_18px_42px_rgba(14,53,84,0.16)] sm:p-6" aria-labelledby="equipment-overview-title">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-bold text-[#CFE9FA]"><CalendarDays className="h-4 w-4" aria-hidden="true" />{seasonLabel}</div>
                <h2 id="equipment-overview-title" className="mt-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{t("equipmentOverviewTitle")}</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-sky-50/80">{t("equipmentOverviewDescription")}</p>
              </div>
              <div className="min-w-48 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-xs font-bold text-sky-100/80"><span>{t("equipmentDeliveryProgress")}</span><span>{deliveryPercent}%</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label={t("equipmentDeliveryProgress")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={deliveryPercent}><div className="h-full rounded-full bg-emerald-300 transition-[width] duration-300" style={{ width: `${deliveryPercent}%` }} /></div>
                <p className="mt-2 text-xs font-semibold text-sky-50/75">{delivered} / {total} {t("equipmentDelivered").toLowerCase()}</p>
              </div>
            </div>
          </section>

          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t("summary")}>
            <MetricCard icon={Users} label={t("equipmentTotalPlayers")} value={total} detail={`${filtered.length} ${t("equipmentPlayerCount")} ${t("equipmentVisibleSuffix")}`} />
            <MetricCard icon={PackageCheck} label={t("equipmentDelivered")} value={delivered} detail={`${deliveryPercent}% ${t("equipmentDeliveryProgress")}`} tone="green" />
            <MetricCard icon={AlertTriangle} label={t("equipmentPending")} value={pending} detail={t("equipmentPendingHint")} tone="amber" />
            <MetricCard icon={Ruler} label={t("equipmentMissingSize")} value={missing} detail={t("equipmentMissingSizeHint")} tone="red" />
          </section>

          {teamSummaries.length > 0 && (
            <section className="mb-6" aria-labelledby="equipment-teams-title">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="equipment-teams-title" className="font-heading text-xl font-extrabold text-[#0E3554]">{t("equipmentTeamsSummary")}</h2>
                  <p className="mt-1 text-sm text-slate-500">{t("equipmentTeamsSummaryDescription")}</p>
                </div>
                {filterTeam && <Button type="button" variant="ghost" size="sm" onClick={() => setFilterTeam("")}>{t("clearFilters")}</Button>}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {teamSummaries.map((summary) => <TeamSummaryCard key={summary.id} summary={summary} selected={filterTeam === summary.id} onSelect={() => setFilterTeam(filterTeam === summary.id ? "" : summary.id)} t={t} />)}
              </div>
            </section>
          )}

          <section className="sticky top-16 z-10 mb-6 rounded-2xl border border-[#CFE9FA] bg-white/95 p-3 shadow-[0_10px_28px_rgba(14,53,84,0.10)] backdrop-blur-xl lg:top-[4.5rem]" aria-labelledby="equipment-filters-title">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="equipment-search" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("searchPlayer")}</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input id="equipment-search" data-testid="equipment-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("equipmentSearchPlaceholder")} className="h-11 pl-9" />
                </div>
              </div>
              <label className="min-w-0 xl:w-52"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("season")}</span><select data-testid="equipment-season" value={selectedSeason} onChange={(event) => selectSeason(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"><option value="">{t("equipmentAllSeasons")}</option>{seasonOptions.map((season) => <option key={season} value={season}>{season}</option>)}</select></label>
              <label className="min-w-0 xl:w-52"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("equipmentTeam")}</span><select data-testid="equipment-team-filter" value={filterTeam} onChange={(event) => setFilterTeam(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"><option value="">{t("equipmentAllTeams")}</option>{teamOptions.map((team) => <option key={team.value} value={team.value}>{team.label}</option>)}</select></label>
              <label className="min-w-0 xl:w-48"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("equipmentDelivered")}</span><select data-testid="equipment-delivery-filter" value={filterEntregada} onChange={(event) => setFilterEntregada(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"><option value="">{t("equipmentAllDeliveries")}</option><option value="si">{t("delivered")}</option><option value="no">{t("pendingDelivery")}</option></select></label>
              <button type="button" data-testid="equipment-missing-filter" aria-pressed={missingOnly} onClick={() => setMissingOnly((current) => !current)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${missingOnly ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:border-[#93C8EE] hover:text-[#1B5C8F]"}`}><Filter className="h-4 w-4" aria-hidden="true" />{t("equipmentOnlyMissingSizes")}</button>
              <div className="flex items-center gap-2" aria-label={t("equipmentViewMode")}>
                <button type="button" data-testid="equipment-cards-view" aria-label={t("equipmentCardsView")} aria-pressed={view === "cards"} onClick={() => setView("cards")} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${view === "cards" ? "border-[#1B5C8F] bg-[#1B5C8F] text-white" : "border-slate-200 bg-white text-slate-500 hover:border-[#93C8EE]"}`} title={t("equipmentCardsView")}><LayoutGrid className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" data-testid="equipment-table-view" aria-label={t("equipmentTableView")} aria-pressed={view === "table"} onClick={() => setView("table")} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${view === "table" ? "border-[#1B5C8F] bg-[#1B5C8F] text-white" : "border-slate-200 bg-white text-slate-500 hover:border-[#93C8EE]"}`} title={t("equipmentTableView")}><List className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><SlidersHorizontal className="h-4 w-4 text-[#2F7EBE]" aria-hidden="true" /><span id="equipment-filters-title">{filtered.length} {t("equipmentPlayerCount")}</span>{activeFilters && <span className="rounded-full bg-[#EAF6FD] px-2.5 py-1 text-[#1B5C8F]">{t("equipmentFiltersActive")}</span>}</div>
              {activeFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>{t("clearFilters")}</Button>}
            </div>
          </section>

          {view === "cards" ? (
            <section aria-labelledby="equipment-cards-title">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 id="equipment-cards-title" className="font-heading text-xl font-extrabold text-[#0E3554]">{t("equipmentCardsView")}</h2><span className="text-xs font-semibold text-slate-400">{t("equipmentEditHint")}</span></div>
              {filtered.length === 0 ? <div className="surface-card px-5 py-14 text-center text-sm text-slate-500">{t("equipmentNoResults")}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((player) => <EquipmentCard key={player.id} player={player} onEdit={openDialog} t={t} />)}</div>}
            </section>
          ) : (
            <section className="surface-card min-w-0 overflow-hidden" aria-labelledby="equipment-table-title" data-testid="equipment-table">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 id="equipment-table-title" className="font-heading text-xl font-extrabold text-[#0E3554]">{t("equipmentTableView")}</h2><p className="mt-1 text-sm text-slate-500">{t("equipmentTableHint")}</p></div><span className="rounded-full bg-[#EAF6FD] px-3 py-1.5 text-xs font-bold text-[#1B5C8F]">{filtered.length} {t("equipmentPlayerCount")}</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th rowSpan="2" className="min-w-[160px] px-4 py-3">{t("equipmentPlayer")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentTeam")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentShirtName")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentBib")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentShirt")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentShorts")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentTracksuit")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentSocks")}</th>
                      <th colSpan="4" scope="colgroup" className="equipment-second-kit-group border-x border-sky-100 px-3 py-2 text-center">{t("equipmentSecondKit")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentShoes")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("delivered")}</th>
                      <th rowSpan="2" className="px-3 py-3">{t("equipmentDeliveryDate")}</th>
                      <th rowSpan="2" className="min-w-[140px] px-3 py-3">{t("equipmentNotes")}</th>
                      <th rowSpan="2" className="px-3 py-3 text-right">{t("equipmentActions")}</th>
                    </tr>
                    <tr><th className="equipment-second-kit-column border-l border-sky-100 px-3 py-2">{t("equipmentSecondKitName")}</th><th className="equipment-second-kit-column px-3 py-2">{t("equipmentSecondKitBib")}</th><th className="equipment-second-kit-column px-3 py-2">{t("equipmentSecondKitShirt")}</th><th className="equipment-second-kit-column border-r border-sky-100 px-3 py-2">{t("equipmentSecondKitSocks")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.length === 0 ? <tr><td colSpan={17} className="px-4 py-10 text-center text-slate-400">{t("equipmentNoResults")}</td></tr> : filtered.map((player) => {
                      const isEditing = editingId === player.id;
                      const row = isEditing ? editForm : player;
                      return (
                        <tr key={player.id} className={`transition-colors hover:bg-slate-50 ${isEditing ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}>
                          <td className="px-4 py-2.5"><div className="font-semibold leading-tight text-slate-800">{player.nombre} {player.apellidos}</div>{player.categoria && <div className="text-xs text-slate-400">{player.categoria}</div>}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">{player.equipo_nombre || t("equipmentNoTeam")}</td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentShirtName")} value={row.nombre_camiseta} editing={isEditing} onChange={updateEditField("nombre_camiseta")} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentBib")} value={row.dorsal} editing={isEditing} onChange={updateEditField("dorsal")} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentShirt")} value={row.talla_camiseta} editing={isEditing} onChange={updateEditField("talla_camiseta")} options={isEditing ? TALLAS : undefined} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentShorts")} value={row.talla_pantalon} editing={isEditing} onChange={updateEditField("talla_pantalon")} options={isEditing ? TALLAS : undefined} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentTracksuit")} value={row.talla_chandal} editing={isEditing} onChange={updateEditField("talla_chandal")} options={isEditing ? TALLAS : undefined} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentSocks")} value={row.talla_medias} editing={isEditing} onChange={updateEditField("talla_medias")} options={isEditing ? TALLAS_MEDIAS : undefined} /></td>
                          <td className="bg-sky-50/40 px-3 py-2.5"><Cell value={player.segunda_equipacion?.shirt_name} editing={false} /></td><td className="bg-sky-50/40 px-3 py-2.5"><Cell value={player.segunda_equipacion?.number} editing={false} /></td><td className="bg-sky-50/40 px-3 py-2.5"><Cell value={player.segunda_equipacion?.shirt_size} editing={false} /></td><td className="bg-sky-50/40 px-3 py-2.5"><Cell value={player.segunda_equipacion?.socks_size} editing={false} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentShoes")} value={row.talla_calzado} editing={isEditing} onChange={updateEditField("talla_calzado")} /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentDelivered")} yesLabel={t("yes")} noLabel={t("no")} value={row.equipacion_entregada} editing={isEditing} onChange={updateEditField("equipacion_entregada")} type="bool" /></td>
                          <td className="px-3 py-2.5"><Cell label={t("equipmentDeliveryDate")} value={row.fecha_entrega_equipacion} editing={isEditing} onChange={updateEditField("fecha_entrega_equipacion")} type="date" /></td>
                          <td className="px-3 py-2.5">{isEditing ? <input value={editForm.observaciones_material} onChange={(event) => updateEditField("observaciones_material")(event.target.value)} aria-label={t("equipmentNotes")} className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" /> : <span className="text-xs text-slate-500">{player.observaciones_material || <span className="text-slate-300">-</span>}</span>}</td>
                          <td className="px-3 py-2.5 text-right">{isEditing ? <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={t("cancel")} className="text-slate-400 hover:text-slate-600" onClick={cancelEdit} disabled={saving}><X className="h-3.5 w-3.5" /></Button><Button size="icon" aria-label={t("save")} className="bg-primary text-white" onClick={() => saveEdit(player.id)} disabled={saving}><Save className="h-3.5 w-3.5" /></Button></div> : <PermissionGate resource="equipment" action="edit"><Button size="icon" variant="ghost" aria-label={`${t("edit")} ${player.nombre}`} className="text-slate-400 hover:text-primary" onClick={() => startEdit(player)}><Pencil className="h-3.5 w-3.5" /></Button></PermissionGate>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={!!dialogPlayer} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogPlayer ? `${dialogPlayer.nombre} ${dialogPlayer.apellidos || ""}` : t("equipmentEditCard")}</DialogTitle>
            <DialogDescription>{selectedSeason ? `${t("equipmentSeasonNotice")} ${selectedSeason}.` : t("equipmentEditHint")}</DialogDescription>
          </DialogHeader>
          {dialogPlayer && (
            <div className="space-y-5">
              <section className="rounded-2xl border border-[#CFE9FA] bg-[#F5FAFE] p-4">
                <h3 className="font-heading text-base font-extrabold text-[#0E3554]">{t("equipmentMainKit")}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditorField label={t("equipmentShirtName")} value={editForm.nombre_camiseta} onChange={updateEditField("nombre_camiseta")} />
                  <EditorField label={t("equipmentBib")} value={editForm.dorsal} onChange={updateEditField("dorsal")} />
                  <EditorField label={t("equipmentShirt")} value={editForm.talla_camiseta} onChange={updateEditField("talla_camiseta")} type="select" options={TALLAS} />
                  <EditorField label={t("equipmentShorts")} value={editForm.talla_pantalon} onChange={updateEditField("talla_pantalon")} type="select" options={TALLAS} />
                  <EditorField label={t("equipmentTracksuit")} value={editForm.talla_chandal} onChange={updateEditField("talla_chandal")} type="select" options={TALLAS} />
                  <EditorField label={t("equipmentSocks")} value={editForm.talla_medias} onChange={updateEditField("talla_medias")} type="select" options={TALLAS_MEDIAS} />
                  <EditorField label={t("equipmentShoes")} value={editForm.talla_calzado} onChange={updateEditField("talla_calzado")} />
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4">
                <h3 className="font-heading text-base font-extrabold text-[#0E3554]">{t("equipmentDelivery")}</h3>
                <label className="mt-4 flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"><span className="text-sm font-semibold text-slate-700">{t("equipmentDelivered")}</span><input type="checkbox" checked={!!editForm.equipacion_entregada} onChange={(event) => updateEditField("equipacion_entregada")(event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-primary" /></label>
                <div className="mt-3"><EditorField label={t("equipmentDeliveryDate")} value={editForm.fecha_entrega_equipacion} onChange={updateEditField("fecha_entrega_equipacion")} type="date" /></div>
                <label className="mt-3 block space-y-1.5"><span className="block text-sm font-semibold text-slate-700">{t("equipmentNotes")}</span><textarea value={editForm.observaciones_material} onChange={(event) => updateEditField("observaciones_material")(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" /></label>
              </section>
              {hasSecondKit(dialogPlayer) && <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-slate-700"><p className="font-bold text-sky-800">{t("equipmentSecondKit")}</p><p className="mt-1 text-xs text-slate-500">{t("equipmentSecondKitReadOnly")}</p></div>}
            </div>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>{t("cancel")}</Button><Button type="button" onClick={() => saveEdit(dialogPlayer.id, true)} disabled={saving}>{saving ? t("loading") : t("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Equipment;
