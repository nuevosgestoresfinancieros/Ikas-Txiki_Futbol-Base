import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CalendarDays, Plus, Pencil, Trash2, MapPin, Users, Check, X, Clock, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const empty = { condicion: "local", tipo: "liga", estado: "programado" };

const Matches = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [matches, setMatches] = useState([]);
  const [callups, setCallups] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [expanded, setExpanded] = useState(null); // match_id expandido

  const load = async () => {
    const [mRes, cRes, pRes, tRes] = await Promise.all([
      api.get("/matches"),
      api.get("/callups"),
      api.get("/players"),
      api.get("/teams"),
    ]);
    setMatches(mRes.data);
    setCallups(cRes.data);
    setPlayers(pRes.data);
    setTeams(tRes.data);
  };

  useEffect(() => {
    load();
    if (params.get("new")) { setForm(empty); setDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setDialog(true); };
  const openEdit = (m) => { setForm(m); setDialog(true); };
  const save = async () => {
    if (form.id) await api.put(`/matches/${form.id}`, form);
    else await api.post("/matches", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (m) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/matches/${m.id}`);
    toast.success(t("deleted")); load();
  };

  // Ir a convocatoria del partido (crea nueva si no existe)
  const goToCallup = (m) => {
    const existing = callups.find((c) => c.match_id === m.id);
    if (existing) {
      navigate(`/callups?edit=${existing.id}`);
    } else {
      navigate(`/callups?new=1&match_id=${m.id}`);
    }
  };

  // Datos de convocatoria para un partido
  const getCallup = (matchId) => callups.find((c) => c.match_id === matchId);
  const getPlayerName = (pid) => {
    const p = players.find((x) => x.id === pid);
    return p ? `${p.nombre} ${p.apellidos || ""}`.trim() : "—";
  };

  const teamOptions = teams.map((tm) => ({ value: tm.id, label: tm.nombre }));

  return (
    <div data-testid="matches-page">
      <PageHeader title={t("matches")} icon={CalendarDays}
        action={<Button data-testid="add-match-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newMatch")}</Button>} />

      {matches.length === 0 ? (
        <EmptyState icon={CalendarDays} message={t("noData")}
          action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newMatch")}</Button>} />
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const callup = getCallup(m.id);
            const convocados = callup?.convocados || [];
            const confirmados = convocados.filter((c) => c.estado === "confirmado").length;
            const noPueden = convocados.filter((c) => c.estado === "no_puede").length;
            const pendientes = convocados.filter((c) => c.estado === "pendiente").length;
            const isExpanded = expanded === m.id;

            return (
              <div key={m.id} data-testid={`match-card-${m.id}`}
                className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden hover:shadow-md transition-all">

                {/* Fila principal */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className="font-heading text-lg font-bold text-slate-900">{m.fecha?.slice(5) || "--"}</p>
                      <p className="text-xs text-slate-500">{m.hora || "--:--"}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {m.condicion === "local"
                          ? `${m.equipo_nombre} vs ${m.rival || "—"}`
                          : `${m.rival || "—"} vs ${m.equipo_nombre}`}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">
                        {m.tipo} · {t(m.condicion === "local" ? "home" : "away")}
                        {m.jornada ? ` · J${m.jornada}` : ""}
                      </p>
                      {m.campo && (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{m.campo}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Resultado */}
                    {m.estado === "jugado" && m.resultado_propio != null && (
                      <span className="font-heading text-lg font-bold text-slate-900">
                        {m.condicion === "local"
                          ? `${m.resultado_propio}-${m.resultado_rival}`
                          : `${m.resultado_rival}-${m.resultado_propio}`}
                      </span>
                    )}
                    <StatusBadge status={m.estado} />

                    {/* Resumen convocatoria */}
                    {convocados.length > 0 && (
                      <div className="flex items-center gap-1 text-xs rounded-full bg-slate-100 px-2 py-1">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-slate-600 font-medium">{convocados.length}</span>
                        {confirmados > 0 && <span className="text-green-600 flex items-center gap-0.5"><Check className="h-3 w-3" />{confirmados}</span>}
                        {noPueden > 0 && <span className="text-red-500 flex items-center gap-0.5"><X className="h-3 w-3" />{noPueden}</span>}
                        {pendientes > 0 && <span className="text-amber-500 flex items-center gap-0.5"><Clock className="h-3 w-3" />{pendientes}</span>}
                      </div>
                    )}

                    {/* Botón convocatoria */}
                    <Button variant="outline" size="sm" onClick={() => goToCallup(m)}
                      className="h-8 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
                      <ClipboardList className="h-3.5 w-3.5" />
                      {callup ? "Ver convocatoria" : "Crear convocatoria"}
                    </Button>

                    {/* Expandir jugadores */}
                    {convocados.length > 0 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setExpanded(isExpanded ? null : m.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    )}

                    <Button variant="ghost" size="icon" data-testid={`edit-match-${m.id}`} onClick={() => openEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`delete-match-${m.id}`} onClick={() => remove(m)} className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Panel expandible de jugadores convocados */}
                {isExpanded && convocados.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Jugadores convocados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {convocados.map((cv) => (
                        <span key={cv.player_id}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
                            ${cv.estado === "confirmado" ? "bg-green-100 text-green-800"
                            : cv.estado === "no_puede" ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"}`}>
                          {cv.estado === "confirmado" ? <Check className="h-3 w-3" />
                            : cv.estado === "no_puede" ? <X className="h-3 w-3" />
                            : <Clock className="h-3 w-3" />}
                          {getPlayerName(cv.player_id)}
                        </span>
                      ))}
                    </div>
                    {callup?.hora_quedada && (
                      <p className="text-xs text-slate-500 mt-2">
                        📍 Quedada: {callup.hora_quedada}{callup.lugar_quedada ? ` · ${callup.lugar_quedada}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("matches") : t("newMatch")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("ownTeam")} value={form.equipo_id} onChange={set("equipo_id")} options={teamOptions} testid="match-equipo" />
            <Field label={t("rival")} value={form.rival} onChange={set("rival")} testid="match-rival" />
            <Field label={t("date")} type="date" value={form.fecha} onChange={set("fecha")} testid="match-fecha" />
            <Field label={t("time")} type="time" value={form.hora} onChange={set("hora")} testid="match-hora" />
            <Field label={t("season")} value={form.temporada} onChange={set("temporada")} testid="match-temporada" />
            <Field label={t("matchday")} value={form.jornada} onChange={set("jornada")} testid="match-jornada" />
            <SelectField label={t("homeAway")} value={form.condicion} onChange={set("condicion")} options={[{value:"local",label:t("home")},{value:"visitante",label:t("away")}]} testid="match-condicion" />
            <SelectField label={t("matchType")} value={form.tipo} onChange={set("tipo")} options={["liga","copa","amistoso","torneo"].map(s=>({value:s,label:s}))} testid="match-tipo" />
            <Field label={t("field")} value={form.campo} onChange={set("campo")} testid="match-campo" />
            <Field label={t("fieldAddress")} value={form.direccion_campo} onChange={set("direccion_campo")} testid="match-direccion" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["programado","jugado","aplazado","suspendido","cancelado"].map(s=>({value:s,label:s}))} testid="match-estado" />
            <div />
            <Field label={t("ownResult")} type="number" value={form.resultado_propio} onChange={set("resultado_propio")} testid="match-res-propio" />
            <Field label={t("rivalResult")} type="number" value={form.resultado_rival} onChange={set("resultado_rival")} testid="match-res-rival" />
            <div className="sm:col-span-2"><Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="match-obs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="match-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Matches;
