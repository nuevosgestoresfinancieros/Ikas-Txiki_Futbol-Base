import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ClipboardList, Clock, Download, Pencil, Plus, RotateCw, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, initials } from "@/components/shared";
import { Area, Field, SelectField } from "@/components/form";
import { filterCallups } from "./callupView";
import GoogleMapsLinks from "@/components/GoogleMapsLinks";

const EMPTY = { match_id: "", equipo_id: "", convocados: [], response_deadline: "" };
const STATUS_ICON = { pending: Clock, confirmed: Check, declined: X };
const STATUS_CLASS = { pending: "bg-amber-100 text-amber-800", confirmed: "bg-green-100 text-green-800", declined: "bg-red-100 text-red-700" };

const Callups = () => {
  const canCreate = usePermission("callups", "create");
  const canEdit = usePermission("callups", "edit");
  const canRespond = usePermission("callups", "respond");
  const canExport = usePermission("callups", "export");
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [callups, setCallups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [dialog, setDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [calls, games, roster] = await Promise.all([api.get("/callups"), api.get("/matches"), api.get("/players")]);
      setCallups(calls.data); setMatches(games.data); setPlayers(roster.data);
      return { calls: calls.data, games: games.data };
    } catch (err) {
      setError(err.response?.data?.detail || t("loadError"));
      return { calls: [], games: [] };
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load().then(({ calls, games }) => {
      if (params.get("new") && canCreate) {
        const matchId = params.get("match_id") || "";
        const match = games.find((item) => item.id === matchId);
        setForm({ ...EMPTY, match_id: matchId, equipo_id: match?.equipo_id || "" }); setDialog(true);
      } else if (params.get("edit") && canEdit) {
        const found = calls.find((item) => item.id === params.get("edit"));
        if (found) { setForm(found); setDialog(true); }
      }
      if (params.get("new") || params.get("edit")) setParams({});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pName = (id) => {
    const player = players.find((item) => item.id === id);
    return player ? `${player.nombre} ${player.apellidos || ""}`.trim() : "—";
  };
  const searchableCallups = useMemo(() => callups.map((callup) => ({ ...callup, convocados: (callup.convocados || []).map((item) => ({ ...item, nombre: item.nombre || pName(item.player_id) })) })), [callups, players]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => filterCallups(searchableCallups, statusFilter, search), [searchableCallups, statusFilter, search]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const matchOptions = matches.map((match) => ({ value: match.id, label: `${match.equipo_nombre || ""} vs ${match.rival || "—"} · ${match.fecha || ""}` }));
  const teamPlayers = players.filter((player) => player.equipo_id === form.equipo_id && player.estado === "activo");
  const otherPlayers = players.filter((player) => player.equipo_id !== form.equipo_id && player.estado === "activo");
  const selected = (id) => form.convocados.some((item) => item.player_id === id);
  const toggle = (id) => setForm((current) => ({ ...current, convocados: selected(id) ? current.convocados.filter((item) => item.player_id !== id) : [...current.convocados, { player_id: id, estado: "pending" }] }));
  const setStatus = (id, estado) => setForm((current) => ({ ...current, convocados: current.convocados.map((item) => item.player_id === id ? { ...item, estado } : item) }));

  const save = async () => {
    if (!form.match_id) return toast.error(t("selectMatch"));
    if (form.id) await api.put(`/callups/${form.id}`, form); else await api.post("/callups", form);
    toast.success(t("saved")); setDialog(false); await load();
  };
  const remove = async (callup) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/callups/${callup.id}`); toast.success(t("deleted")); await load();
  };
  const respond = async (callup, playerId, status) => {
    if (!window.confirm(t("confirmSave"))) return;
    const reason = status === "declined" ? window.prompt(t("declineReasonOptional")) : null;
    try {
      await api.patch(`/callups/${callup.id}/respond`, { player_id: playerId, status, reason });
      toast.success(t("responseSaved")); await load();
    } catch (err) { toast.error(err.response?.data?.detail || t("saveError")); }
  };
  const downloadPdf = async (callup) => {
    const response = await api.get(`/callups/${callup.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `convocatoria_${callup.id}.pdf`; anchor.click(); URL.revokeObjectURL(url);
  };

  const PlayerRow = ({ player }) => {
    const item = form.convocados.find((entry) => entry.player_id === player.id);
    return <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
      <Checkbox checked={selected(player.id)} onCheckedChange={() => toggle(player.id)} aria-label={`${t("calledPlayers")}: ${player.nombre}`} />
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(player.nombre, player.apellidos)}</div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.nombre} {player.apellidos}</span>
      {item && <div className="flex gap-1">{Object.entries(STATUS_ICON).map(([status, Icon]) => <button type="button" key={status} onClick={() => setStatus(player.id, status)} aria-label={t(status)} className={`flex h-8 w-8 items-center justify-center rounded ${item.estado === status ? STATUS_CLASS[status] : "text-slate-400"}`}><Icon className="h-4 w-4" /></button>)}</div>}
    </div>;
  };

  return <div data-testid="callups-page">
    <PageHeader title={t("callups")} icon={ClipboardList} action={canCreate ? <Button onClick={() => { setForm(EMPTY); setDialog(true); }}><Plus className="h-5 w-5" />{t("newCallup")}</Button> : null} />
    <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_220px]">
      <label className="relative"><span className="sr-only">{t("searchPlayer")}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlayer")} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={t("filterByStatus")} className="h-10 rounded-lg border border-slate-200 px-3 text-sm"><option value="all">{t("allStatuses")}</option><option value="pending">{t("pending")}</option><option value="confirmed">{t("confirmed")}</option><option value="declined">{t("declined")}</option></select>
    </div>
    {loading ? <div className="surface-card p-8 text-center text-slate-500" role="status">{t("loading")}</div> : error ? <div className="surface-card p-8 text-center" role="alert"><p className="text-red-600">{error}</p><Button onClick={load} className="mt-4"><RotateCw className="h-4 w-4" />{t("retry")}</Button></div> : filtered.length === 0 ? <EmptyState icon={ClipboardList} message={t("noData")} /> : <div className="space-y-4">
      {filtered.map((callup) => <article key={callup.id} className="surface-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-heading font-bold text-slate-900">{callup.equipo_nombre} vs {callup.match?.rival || "—"}</h2><p className="text-xs text-slate-500"><CalendarDays className="mr-1 inline h-3 w-3" />{callup.match?.fecha || "—"} · {callup.match?.hora || "--:--"} · {callup.lugar_quedada || callup.match?.direccion_campo || callup.match?.campo || "—"}</p><GoogleMapsLinks sources={[callup, callup.match]} className="mt-2" /></div><div className="flex"><PermissionGate resource="callups" action="export"><Button variant="ghost" size="icon" onClick={() => downloadPdf(callup)} aria-label={t("downloadPdf")}><Download className="h-4 w-4" /></Button></PermissionGate><PermissionGate resource="callups" action="edit"><Button variant="ghost" size="icon" onClick={() => { setForm(callup); setDialog(true); }} aria-label={t("edit")}><Pencil className="h-4 w-4" /></Button></PermissionGate><PermissionGate resource="callups" action="delete"><Button variant="ghost" size="icon" onClick={() => remove(callup)} aria-label={t("delete")} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></PermissionGate></div></div>
        {callup.mensaje_familias && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{callup.mensaje_familias}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-sm"><span><Users className="mr-1 inline h-4 w-4" />{callup.convocados.length}</span>{Object.entries(STATUS_ICON).map(([status, Icon]) => <span key={status} className={STATUS_CLASS[status].split(" ")[1]}><Icon className="mr-1 inline h-4 w-4" />{callup.response_counts?.[status] || 0} {t(status)}</span>)}</div>
        {callup.response_deadline && <p className={`mt-3 text-xs ${callup.deadline_expired ? "font-semibold text-red-600" : "text-slate-500"}`}>{t("responseDeadline")}: {new Date(callup.response_deadline).toLocaleString(lang === "eu" ? "eu-ES" : "es-ES")}{callup.deadline_expired ? ` · ${t("deadlineExpired")}` : ""}</p>}
        <div className="mt-3 flex flex-wrap gap-2">{callup.convocados.map((item) => { const Icon = STATUS_ICON[item.estado] || Clock; return <span key={item.player_id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${STATUS_CLASS[item.estado]}`}><Icon className="h-3 w-3" />{item.nombre || pName(item.player_id)}</span>; })}</div>
        {canRespond && callup.convocados.map((item) => <div key={`respond-${item.player_id}`} className="mt-3 rounded-xl border border-slate-200 p-3 sm:flex sm:items-center sm:justify-between"><div><p className="font-medium">{item.nombre || pName(item.player_id)}</p>{item.motivo && <p className="text-xs text-red-600">{t("reason")}: {item.motivo}</p>}</div><div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0"><Button className="min-h-11" disabled={callup.deadline_expired} onClick={() => respond(callup, item.player_id, "confirmed")}><Check className="h-4 w-4" />{t("confirmAttendance")}</Button><Button variant="outline" className="min-h-11 text-red-600" disabled={callup.deadline_expired} onClick={() => respond(callup, item.player_id, "declined")}><X className="h-4 w-4" />{t("declineAttendance")}</Button></div></div>)}
      </article>)}
    </div>}

    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? t("editCallup") : t("newCallup")}</DialogTitle></DialogHeader><div className="space-y-4">
      <SelectField label={t("match")} value={form.match_id} options={matchOptions} onChange={(id) => { const match = matches.find((item) => item.id === id); setForm((current) => ({ ...current, match_id: id, equipo_id: match?.equipo_id || "" })); }} />
      <div className="grid gap-4 sm:grid-cols-2"><Field label={t("meetTime")} type="time" value={form.hora_quedada} onChange={set("hora_quedada")} /><Field label={t("meetPlace")} value={form.lugar_quedada} onChange={set("lugar_quedada")} /></div>
      <Field label={t("responseDeadline")} type="datetime-local" value={form.response_deadline?.slice(0, 16) || ""} onChange={set("response_deadline")} /><Field label={t("material")} value={form.material} onChange={set("material")} /><Area label={t("messageFamilies")} value={form.mensaje_familias} onChange={set("mensaje_familias")} />
      <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><Checkbox checked={Boolean(form.player_self_response_allowed)} onCheckedChange={(checked) => set("player_self_response_allowed")(Boolean(checked))} />{t("allowPlayerResponse")}</label>
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{t("teamPlayers")} ({teamPlayers.length})</p><div className="max-h-48 overflow-y-auto rounded-lg border p-2">{teamPlayers.map((player) => <PlayerRow key={player.id} player={player} />)}</div></div>
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{t("reinforcements")}</p><div className="max-h-40 overflow-y-auto rounded-lg border border-dashed p-2">{otherPlayers.map((player) => <PlayerRow key={player.id} player={player} />)}</div></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button><Button onClick={save}>{t("save")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
};

export default Callups;
