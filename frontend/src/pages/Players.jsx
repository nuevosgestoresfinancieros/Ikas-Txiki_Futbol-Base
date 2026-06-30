import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatusBadge, EmptyState, initials } from "@/components/shared";
import PlayerDialog from "@/pages/PlayerDialog";

const Players = () => {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState(params.get("estado") || "all");
  const [fEquipo, setFEquipo] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const query = {};
    if (fEstado !== "all") query.estado = fEstado;
    if (fEquipo !== "all") query.equipo_id = fEquipo;
    if (fCat !== "all") query.categoria = fCat;
    if (q) query.q = q;
    const res = await api.get("/players", { params: query });
    setPlayers(res.data);
  };

  const loadMeta = async () => {
    const [tm, cat] = await Promise.all([api.get("/teams"), api.get("/categories")]);
    setTeams(tm.data);
    setCategories(cat.data);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fEstado, fEquipo, fCat, q]);
  useEffect(() => {
    if (params.get("new")) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const openNew = () => { setEditing(null); setDialog(true); };
  const openEdit = (p) => { setEditing(p); setDialog(true); };
  const remove = async (p) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/players/${p.id}`);
    toast.success(t("deleted"));
    load();
  };

  const teamName = (id) => teams.find((x) => x.id === id)?.nombre || "—";

  return (
    <div data-testid="players-page">
      <PageHeader title={t("players")} icon={Users}
        action={<Button data-testid="add-player-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newPlayer")}</Button>} />

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
            {["activo","baja","lesionado","pendiente_documentacion","en_prueba"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fEquipo} onValueChange={setFEquipo}>
          <SelectTrigger className="h-11 sm:w-44" data-testid="filter-equipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("team")}: {t("all")}</SelectItem>
            {teams.map(tm=><SelectItem key={tm.id} value={tm.id}>{tm.nombre}</SelectItem>)}
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

      {players.length === 0 ? (
        <EmptyState icon={Users} message={t("quickStart")}
          action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newPlayer")}</Button>} />
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden">
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
                {players.map((p) => (
                  <tr key={p.id} data-testid={`player-row-${p.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.foto ? (
                          <img src={p.foto} alt="" className="h-9 w-9 rounded-full object-cover" />
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
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{p.dorsal || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" data-testid={`edit-player-${p.id}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" data-testid={`delete-player-${p.id}`} onClick={() => remove(p)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PlayerDialog open={dialog} onClose={() => setDialog(false)} player={editing} teams={teams} onSaved={load} />
    </div>
  );
};

export default Players;
