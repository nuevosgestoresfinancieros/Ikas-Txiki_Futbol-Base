import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Link2, LockKeyhole, LogOut, Plus, RefreshCw, Search, ShieldCheck, UnlockKeyhole, UserCog } from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import {
  USER_STATUSES, allPasswordChecksPass, filterUsers, normalizedStatus, passwordChecks,
  userCounters, userDisplayName,
} from "./userAdministrationView";

const emptyForm = {
  first_name: "", last_name: "", username: "", email: "", password: "",
  password_confirmation: "", role: "coach", account_status: "active",
  assigned_team_ids: [], assigned_category_ids: [], player_id: "", family_id: "", language: "es",
  notification_preferences: { in_app: true, email: true, callups: true, schedule_changes: true, payments: true, documents: true },
};

const Select = ({ label, value, onChange, children, testid }) => (
  <label className="block text-sm font-semibold text-slate-700">
    {label}
    <select data-testid={testid} className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  </label>
);

export default function Users() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [security, setSecurity] = useState(null);
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ search: "", role: "", status: "", teamId: "" });
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const [u, tm, pl, fm] = await Promise.all([api.get("/users"), api.get("/teams"), api.get("/players"), api.get("/families")]);
      setUsers(u.data); setTeams(tm.data); setPlayers(pl.data); setFamilies(fm.data);
    } catch (requestError) {
      setError(true);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visibleUsers = useMemo(() => filterUsers(users, filters), [users, filters]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const paginatedUsers = visibleUsers.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [filters]);
  const counters = useMemo(() => userCounters(users), [users]);
  const categories = useMemo(() => [...new Set(teams.map((team) => team.categoria).filter(Boolean))].sort(), [teams]);
  const checks = passwordChecks(form.password);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const close = () => { setDialog(false); setEditingId(null); setForm(emptyForm); setShowPassword(false); };
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialog(true); };
  const openEdit = (user) => {
    if (user.read_only) return;
    setEditingId(user.id);
    setForm({ ...emptyForm, ...user, password: "", password_confirmation: "", player_id: user.player_id || "", family_id: user.family_id || "" });
    setDialog(true);
  };
  const toggleTeam = (teamId) => update("assigned_team_ids", form.assigned_team_ids.includes(teamId)
    ? form.assigned_team_ids.filter((id) => id !== teamId) : [...form.assigned_team_ids, teamId]);
  const toggleCategory = (category) => update("assigned_category_ids", form.assigned_category_ids.includes(category)
    ? form.assigned_category_ids.filter((value) => value !== category) : [...form.assigned_category_ids, category]);

  const save = async (event) => {
    event.preventDefault();
    if (!editingId && (!allPasswordChecksPass(form.password) || form.password !== form.password_confirmation)) return;
    try {
      const payload = { ...form, player_id: form.player_id || null, family_id: form.family_id || null };
      if (editingId) {
        delete payload.username; delete payload.password; delete payload.password_confirmation;
        await api.put(`/users/${editingId}`, payload);
      } else await api.post("/users", payload);
      toast({ title: t("userSaved") }); close(); await load();
    } catch (requestError) {
      toast({ title: requestError.response?.data?.detail || t("saveError"), variant: "destructive" });
    }
  };

  const showEffectivePermissions = async (user) => {
    try { setPermissions({ user, ...(await api.get(`/users/${user.id}/effective-permissions`)).data }); }
    catch { toast({ title: t("loadError"), variant: "destructive" }); }
  };

  const showSecurity = async (user) => {
    try { setSecurity({ user, ...(await api.get(`/users/${user.id}/security`)).data }); }
    catch { toast({ title: t("loadError"), variant: "destructive" }); }
  };
  const securityAction = async (path, method = "post", confirmation = "confirmSensitiveAction") => {
    if (!security || !window.confirm(t(confirmation))) return;
    setSecurityBusy(true); setRevealedSecret(null);
    try {
      const response = await api[method](`/users/${security.user.id}/security/${path}`);
      const secret = response.data.temporary_password || response.data.invitation_token;
      if (secret) setRevealedSecret({ value: secret, kind: response.data.temporary_password ? "password" : "invitation" });
      toast({ title: t("securityActionCompleted") });
      const refreshed = await api.get(`/users/${security.user.id}/security`);
      setSecurity((current) => ({ ...current, ...refreshed.data })); await load();
    } catch (requestError) { toast({ title: requestError.response?.data?.detail || t("saveError"), variant: "destructive" }); }
    finally { setSecurityBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></div><div><h1 className="page-title">{t("usersAndPermissions")}</h1><p className="page-subtitle">{t("usersIntro")}</p></div></div>
        <Button onClick={openCreate} className="min-h-11" data-testid="create-user"><Plus className="h-4 w-4" />{t("createUser")}</Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label={t("accountCounters")}>
        {[["total", counters.total], ["active", counters.active], ["pendingActivation", counters.pending], ["suspended", counters.suspended], ["deactivated", counters.deactivated], ["incompleteLink", counters.incomplete]].map(([key, value]) => (
          <div key={key} className="surface-card p-4"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{t(key)}</p></div>
        ))}
      </section>

      <section className="surface-card space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-1"><span className="sr-only">{t("searchUsers")}</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder={t("searchUsers")} value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} /></label>
          <Select label={t("role")} value={filters.role} onChange={(role) => setFilters((f) => ({ ...f, role }))}><option value="">{t("all")}</option>{["admin", "coordinator", "coach", "family", "player"].map((role) => <option key={role} value={role}>{t(`role_${role}`)}</option>)}</Select>
          <Select label={t("status")} value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))}><option value="">{t("all")}</option>{USER_STATUSES.map((status) => <option key={status} value={status}>{t(`accountStatus_${status}`)}</option>)}</Select>
          <Select label={t("team")} value={filters.teamId} onChange={(teamId) => setFilters((f) => ({ ...f, teamId }))}><option value="">{t("all")}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.nombre}</option>)}</Select>
        </div>

        {loading ? <div className="py-12 text-center text-slate-500" role="status">{t("loading")}</div>
          : error ? <div className="flex flex-col items-center gap-3 py-12 text-center"><p className="text-slate-600">{t("loadError")}</p><Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t("retry")}</Button></div>
          : visibleUsers.length === 0 ? <div className="py-12 text-center text-slate-500">{t("noUsersFiltered")}</div>
          : <><div className="grid gap-3" data-testid="users-list">{paginatedUsers.map((user) => (
            <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{userDisplayName(user)}</h2><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">{t(`role_${user.role}`)}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{t(`accountStatus_${normalizedStatus(user)}`)}</span></div><p className="mt-1 break-all text-sm text-slate-500">{user.system_account ? `${t("systemAdministrator")} · ${t("configuredOnServer")}` : [user.username, user.email].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs text-slate-500">{t("lastAccess")}: {user.last_access_at ? new Date(user.last_access_at).toLocaleString() : t("never")}</p></div>
                <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => showEffectivePermissions(user)}><ShieldCheck className="h-4 w-4" />{t("effectivePermissions")}</Button><Button variant="outline" onClick={() => showSecurity(user)}><LockKeyhole className="h-4 w-4" />{t("security")}</Button>{!user.read_only && <Button variant="outline" onClick={() => openEdit(user)}><UserCog className="h-4 w-4" />{t("edit")}</Button>}</div>
              </div>
            </article>
          ))}</div>{pageCount > 1 && <nav className="mt-4 flex items-center justify-between" aria-label={t("pagination")}><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t("previous")}</Button><span className="text-sm text-slate-500">{page} / {pageCount}</span><Button variant="outline" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>{t("next")}</Button></nav>}</>}
      </section>

      <Dialog open={dialog} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? t("editUser") : t("createUser")}</DialogTitle><DialogDescription>{t("userDialogDescription")}</DialogDescription></DialogHeader>
          <form className="space-y-5" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">{t("firstName")}<Input className="mt-1.5" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required /></label><label className="text-sm font-semibold">{t("lastName")}<Input className="mt-1.5" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required /></label><label className="text-sm font-semibold">{t("username")}<Input className="mt-1.5" disabled={Boolean(editingId)} value={form.username} onChange={(e) => update("username", e.target.value)} required /></label><label className="text-sm font-semibold">{t("email")}<Input className="mt-1.5" type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} /></label></div>
            <div className="grid gap-4 sm:grid-cols-3"><Select label={t("role")} value={form.role} onChange={(role) => update("role", role)}>{["admin", "coordinator", "coach", "family", "player"].map((role) => <option key={role} value={role}>{t(`role_${role}`)}</option>)}</Select><Select label={t("status")} value={form.account_status} onChange={(status) => update("account_status", status)}>{USER_STATUSES.filter((status) => status !== "incomplete_link").map((status) => <option key={status} value={status}>{t(`accountStatus_${status}`)}</option>)}</Select><Select label={t("language")} value={form.language} onChange={(language) => update("language", language)}><option value="es">Castellano</option><option value="eu">Euskara</option></Select></div>
            {(form.role === "coordinator" || form.role === "coach") && <fieldset><legend className="text-sm font-semibold">{t("assignedTeams")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{teams.filter((team) => String(team.nombre).toLocaleUpperCase() !== "NO APLICA").map((team) => <label key={team.id} className="flex min-h-11 items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.assigned_team_ids.includes(team.id)} onChange={() => toggleTeam(team.id)} />{team.nombre}</label>)}</div></fieldset>}
            {form.role === "coordinator" && <fieldset><legend className="text-sm font-semibold">{t("assignedCategories")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{categories.filter((category) => String(category).toLocaleUpperCase() !== "NO APLICA").map((category) => <label key={category} className="flex min-h-11 items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.assigned_category_ids.includes(category)} onChange={() => toggleCategory(category)} />{category}</label>)}</div></fieldset>}
            {form.role === "player" && <Select label={t("linkedPlayer")} value={form.player_id} onChange={(playerId) => update("player_id", playerId)}><option value="">—</option>{players.map((player) => <option key={player.id} value={player.id}>{player.nombre} {player.apellidos}</option>)}</Select>}
            {form.role === "family" && <Select label={t("linkedFamily")} value={form.family_id} onChange={(familyId) => update("family_id", familyId)}><option value="">—</option>{families.map((family) => <option key={family.id} value={family.id}>{family.progenitor1_nombre || family.contacto_principal || t("family")}</option>)}</Select>}
            {!editingId && <section className="rounded-2xl bg-slate-50 p-4"><div className="grid gap-4 sm:grid-cols-2">{["password", "password_confirmation"].map((field) => <label key={field} className="text-sm font-semibold">{t(field === "password" ? "password" : "confirmPassword")}<span className="relative mt-1.5 block"><Input type={showPassword ? "text" : "password"} value={form[field]} onChange={(e) => update(field, e.target.value)} required /><button type="button" className="absolute right-2 top-2 rounded-lg p-1 text-slate-600" onClick={() => setShowPassword((value) => !value)} aria-label={t(showPassword ? "hidePassword" : "showPassword")}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></label>)}</div><div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">{Object.entries(checks).map(([key, valid]) => <span key={key} className={valid ? "text-emerald-700" : "text-slate-500"}>• {t(`password_${key}`)}</span>)}</div>{form.password_confirmation && form.password !== form.password_confirmation && <p className="mt-2 text-sm font-semibold text-red-700">{t("passwordMismatch")}</p>}</section>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={close}>{t("cancel")}</Button><Button type="submit" disabled={!editingId && (!allPasswordChecksPass(form.password) || form.password !== form.password_confirmation)}><KeyRound className="h-4 w-4" />{t("save")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(permissions)} onOpenChange={(open) => { if (!open) setPermissions(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t("effectivePermissions")}</DialogTitle><DialogDescription>{t("effectivePermissionsDescription")}</DialogDescription></DialogHeader>{permissions && <div className="space-y-5"><div className="rounded-xl bg-sky-50 p-4"><p className="font-bold text-sky-950">{userDisplayName(permissions.user)}</p><p className="text-sm text-sky-800">{t("roleDefinesFunctionsScopeDefinesData")}</p></div><div><h3 className="mb-2 font-bold">{t("allowedFunctions")}</h3><div className="grid gap-2 sm:grid-cols-2">{Object.entries(permissions.permissions).map(([resource, actions]) => <div key={resource} className="rounded-xl border p-3"><p className="font-semibold">{t(`permissionResource_${resource}`)}</p><p className="text-xs text-slate-500">{actions.map((action) => t(`permissionAction_${action}`)).join(" · ")}</p></div>)}</div></div><div><h3 className="font-bold">{t("appliedScope")}</h3><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-white">{JSON.stringify(permissions.scope, null, 2)}</pre></div></div>}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(security)} onOpenChange={(open) => { if (!open) { setSecurity(null); setRevealedSecret(null); } }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("accessSecurity")}</DialogTitle><DialogDescription>{t("accessSecurityDescription")}</DialogDescription></DialogHeader>{security && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t("securityStatus")}</p><p className="mt-1 font-bold">{security.locked ? t("temporarilyLocked") : t("accessAvailable")}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t("invitation")}</p><p className="mt-1 font-bold">{t(`invitationStatus_${security.invitation_status || "none"}`)}</p></div></div>
          {revealedSecret && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" role="alert"><p className="font-bold text-amber-950">{t("shownOnlyOnce")}</p><code className="mt-2 block break-all rounded-lg bg-white p-3 text-sm">{revealedSecret.value}</code><Button className="mt-3" variant="outline" onClick={() => setRevealedSecret(null)}>{t("understoodHideSecret")}</Button></div>}
          {security.read_only ? <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">{t("systemSecurityReadOnly")}</p> : <div className="grid gap-3 sm:grid-cols-2">
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("temporary-password")}><KeyRound className="h-4 w-4" />{t("generateTemporaryPassword")}</Button>
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("invitation")}><Link2 className="h-4 w-4" />{t("generateInvitation")}</Button>
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("revoke-sessions")}><LogOut className="h-4 w-4" />{t("closeSessions")}</Button>
            {security.locked ? <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("unlock")}><UnlockKeyhole className="h-4 w-4" />{t("unlockAccess")}</Button> : <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("lock")}><LockKeyhole className="h-4 w-4" />{t("lockAccess")}</Button>}
          </div>}
        </div>}</DialogContent>
      </Dialog>
    </div>
  );
}
