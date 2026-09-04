import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Plus, Search, Pencil, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { STATUS_LABELS, useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatusBadge, EmptyState, initials } from "@/components/shared";
import PlayerDialog from "@/pages/PlayerDialog";

const Players = () => {
  const canCreate = usePermission("players", "create");
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [fEstado, setFEstado] = useState(params.get("estado") || "all");
  const [fEquipo, setFEquipo] = useState(params.get("equipo_id") || "all");
  const [fCat, setFCat] = useState(params.get("categoria") || "all");
  const temporada = params.get("temporada") || "";
  const documentacionPendiente = params.get("documentacion_pendiente") === "true";
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const query = {};
    if (fEstado !== "all") query.estado = fEstado;
    if (fEquipo !== "all") query.equipo_id = fEquipo;
    if (fCat !== "all") query.categoria = fCat;
    if (temporada) query.temporada = temporada;
    if (documentacionPendiente) query.documentacion_pendiente = true;
    if (debouncedQ) query.q = debouncedQ;
    try {
      const res = await api.get("/players", { params: query });
      setPlayers(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, documentacionPendiente, fCat, fEquipo, fEstado, temporada]);

  const loadMeta = async () => {
    const [tm, cat] = await Promise.all([api.get("/teams"), api.get("/categories")]);
    setTeams(tm.data);
    setCategories(cat.data);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  useEffect(() => { setPage(1); load(); }, [load]);
  useEffect(() => {
    if (params.get("new") && canCreate) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const playerId = params.get("ficha");
    const player = players.find((item) => item.id === playerId);
    if (player && !dialog) openEdit(player);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, params]);

  const openNew = () => { setEditing(null); setDialog(true); };
  const openEdit = (p) => { setEditing(p); setDialog(true); };
  const remove = async (p) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/players/${p.id}`);
    toast.success(t("deleted"));
    load();
  };

  const teamName = (id) => teams.find((x) => x.id === id)?.nombre || "—";
  const statusLabel = (status) => STATUS_LABELS[lang]?.[status] || status;
  const bibLabel = (player) => {
    const mainBib = String(player.dorsal ?? "").trim();
    if (mainBib) return mainBib;
    const secondBib = String(player.segunda_equipacion?.number ?? "").trim();
    return secondBib ? `${t("equipmentSecondKitShort")}: ${secondBib}` : "—";
  };
  const totalPages = Math.max(1, Math.ceil(players.length / pageSize));
  const visiblePlayers = players.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div data-testid="players-page">
      <PageHeader title={t("players")} icon={Users}
        action={canCreate ? <Button data-testid="add-player-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newPlayer")}</Button> : null} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input data-testid="player-search" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-10" />
        </div>
        <Select value={fEstado} onValueChange={setFEstado}>
          <SelectTrigger className="h-11 sm:w-44" data-testid="filter-estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("status")}: {t("all")}</SelectItem>
            {["activo","baja","lesionado","pendiente_documentacion","en_prueba"].map(s=><SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fEquipo} onValueChange={setFEquipo}>
          <SelectTrigger className="h-11 sm:w-44" data-testid="filter-equipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("team")}: {t("all")}</SelectItem>
            {teams.filter((tm) => !temporada || tm.temporada === temporada).map(tm=><SelectItem key={tm.id} value={tm.id}>{tm.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fCat} onValueChange={setFCat}>
          <SelectTrigger className="h-11 sm:w-44" data-testid="filter-categoria"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("category")}: {t("all")}</SelectItem>
            {categories.map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {(temporada || documentacionPendiente) && (
        <p className="-mt-2 mb-5 text-xs font-semibold text-slate-500" data-testid="players-applied-context">
          {temporada && `${t("season")}: ${temporada}`}
          {temporada && documentacionPendiente && " · "}
          {documentacionPendiente && t("pendingDocs")}
        </p>
      )}

      {loading ? (
        <div className="surface-card space-y-3 p-5" role="status" aria-label={t("loading")}>
          {[0,1,2,3,4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : error ? (
        <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="font-semibold text-slate-800">{t("loadError")}</p>
          <Button onClick={load} variant="outline" className="mt-4">{t("retry")}</Button>
        </div>
      ) : players.length === 0 ? (
        <EmptyState icon={Users} message={t("quickStart")}
          action={canCreate ? <Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newPlayer")}</Button> : null} />
      ) : (
        <>
        <div className="surface-card hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("name")}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{t("category")}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{t("team")}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">{t("number")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiblePlayers.map((p) => (
                  <tr key={p.id} data-testid={`player-row-${p.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.foto ? (
                          <img src={p.foto} alt={`${p.nombre} ${p.apellidos || ""}`.trim()} className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {initials(p.nombre, p.apellidos)}
                          </div>
                        )}
                        <span className="font-semibold text-slate-800">{p.nombre} {p.apellidos}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">{p.categoria || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">{teamName(p.equipo_id)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{bibLabel(p)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <PermissionGate resource="players" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${p.nombre}`} data-testid={`edit-player-${p.id}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                        <PermissionGate resource="players" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${p.nombre}`} data-testid={`delete-player-${p.id}`} onClick={() => remove(p)} className="text-red-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          {visiblePlayers.map((p) => (
            <article key={p.id} className="surface-card p-4" data-testid={`player-card-${p.id}`}>
              <div className="flex items-start gap-3">
                {p.foto ? (
                  <img src={p.foto} alt={`${p.nombre} ${p.apellidos || ""}`.trim()} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">{initials(p.nombre, p.apellidos)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-heading text-lg font-bold text-slate-900">{p.nombre} {p.apellidos}</h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{p.categoria || "—"} · {teamName(p.equipo_id)}</p>
                </div>
                <StatusBadge status={p.estado} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-500">{t("number")}: {bibLabel(p)}</span>
                <div className="flex gap-1">
                  <PermissionGate resource="players" action="edit"><Button variant="ghost" size="icon" aria-label={`${t("edit")} ${p.nombre}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
                  <PermissionGate resource="players" action="delete"><Button variant="ghost" size="icon" aria-label={`${t("delete")} ${p.nombre}`} onClick={() => remove(p)} className="text-red-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button></PermissionGate>
                </div>
              </div>
            </article>
          ))}
        </div>
        {totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Paginación">
            <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label={t("previous")}><ChevronLeft className="h-4 w-4" />{t("previous")}</Button>
            <span className="px-3 text-xs font-bold text-slate-500">{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label={t("next")}>{t("next")}<ChevronRight className="h-4 w-4" /></Button>
          </nav>
        )}
        </>
      )}

      <PlayerDialog open={dialog} onClose={() => setDialog(false)} player={editing} teams={teams} season={temporada} onSaved={load} />
    </div>
  );
};

export default Players;
