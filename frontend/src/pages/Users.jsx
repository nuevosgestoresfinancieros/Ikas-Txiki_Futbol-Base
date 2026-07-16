import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";

const emptyForm = {
  username: "", password: "", role: "coach", active: true,
  assigned_team_ids: [], player_id: "", family_id: "", language: "es",
  notification_preferences: { in_app: true, email: true, callups: true, schedule_changes: true, payments: true, documents: true },
};

export default function Users() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [u, tm, pl, fm] = await Promise.all([
        api.get("/users"), api.get("/teams"), api.get("/players"), api.get("/families"),
      ]);
      setUsers(u.data); setTeams(tm.data); setPlayers(pl.data); setFamilies(fm.data);
    } catch (error) {
      toast({ title: t("loadError"), variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectUser = (user) => {
    setEditingId(user.id);
    setForm({ ...emptyForm, ...user, password: "", player_id: user.player_id || "", family_id: user.family_id || "" });
  };
  const reset = () => { setEditingId(null); setForm(emptyForm); };

  const save = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        const { active, assigned_team_ids, player_id, family_id, language, notification_preferences } = form;
        await api.put(`/users/${editingId}`, {
          active, assigned_team_ids, player_id: player_id || null, family_id: family_id || null,
          language, notification_preferences,
        });
      } else {
        await api.post("/users", { ...form, player_id: form.player_id || null, family_id: form.family_id || null });
      }
      toast({ title: t("userSaved") }); reset(); await load();
    } catch (error) {
      toast({ title: error.response?.data?.detail || t("saveError"), variant: "destructive" });
    }
  };

  const toggleTeam = (teamId) => update(
    "assigned_team_ids",
    form.assigned_team_ids.includes(teamId)
      ? form.assigned_team_ids.filter((id) => id !== teamId)
      : [...form.assigned_team_ids, teamId],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <div><h1 className="page-title">{t("usersAndPermissions")}</h1><p className="page-subtitle">{t("usersIntro")}</p></div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]">
        <section className="surface-card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 font-bold">{t("users")}</div>
          {loading ? <div className="p-6 text-slate-500">{t("loading")}</div> : users.length === 0 ? <div className="p-6 text-slate-500">{t("noUsers")}</div> : (
            <div className="divide-y divide-slate-100">
              {users.map((user) => (
                <button key={user.id} type="button" onClick={() => selectUser(user)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-slate-50">
                  <div className="min-w-0"><p className="truncate font-bold text-slate-900">{user.username}</p><p className="text-sm text-slate-500">{t(`role_${user.role}`)} · {user.language.toUpperCase()}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? t("active") : t("inactive")}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={save} className="surface-card space-y-5 p-5">
          <div className="flex items-center gap-2 font-bold"><UserPlus className="h-5 w-5 text-primary" />{editingId ? t("editUser") : t("newUser")}</div>
          <label className="block text-sm font-semibold">{t("username")}<Input className="mt-1.5" disabled={Boolean(editingId)} value={form.username} onChange={(e) => update("username", e.target.value)} required /></label>
          {!editingId && <label className="block text-sm font-semibold">{t("password")}<Input className="mt-1.5" type="password" minLength={12} value={form.password} onChange={(e) => update("password", e.target.value)} required /></label>}
          <label className="block text-sm font-semibold">{t("role")}<select className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-white px-3" disabled={Boolean(editingId)} value={form.role} onChange={(e) => update("role", e.target.value)}>{["admin", "coordinator", "coach", "family", "player"].map((role) => <option key={role} value={role}>{t(`role_${role}`)}</option>)}</select></label>
          {(form.role === "coordinator" || form.role === "coach") && <fieldset><legend className="text-sm font-semibold">{t("assignedTeams")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{teams.map((team) => <label key={team.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.assigned_team_ids.includes(team.id)} onChange={() => toggleTeam(team.id)} />{team.nombre}</label>)}</div></fieldset>}
          {form.role === "player" && <label className="block text-sm font-semibold">{t("linkedPlayer")}<select className="mt-1.5 min-h-11 w-full rounded-xl border px-3" value={form.player_id} onChange={(e) => update("player_id", e.target.value)}><option value="">—</option>{players.map((player) => <option key={player.id} value={player.id}>{player.nombre} {player.apellidos}</option>)}</select></label>}
          {form.role === "family" && <label className="block text-sm font-semibold">{t("linkedFamily")}<select className="mt-1.5 min-h-11 w-full rounded-xl border px-3" value={form.family_id} onChange={(e) => update("family_id", e.target.value)}><option value="">—</option>{families.map((family) => <option key={family.id} value={family.id}>{family.progenitor1_nombre || family.contacto_principal || family.id}</option>)}</select></label>}
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">{t("language")}<select className="mt-1.5 min-h-11 w-full rounded-xl border px-3" value={form.language} onChange={(e) => update("language", e.target.value)}><option value="es">Castellano</option><option value="eu">Euskara</option></select></label><label className="flex items-end gap-2 pb-3 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />{t("active")}</label></div>
          <div className="flex gap-3"><Button type="submit" className="flex-1">{t("save")}</Button>{editingId && <Button type="button" variant="outline" onClick={reset}>{t("cancel")}</Button>}</div>
        </form>
      </div>
    </div>
  );
}
