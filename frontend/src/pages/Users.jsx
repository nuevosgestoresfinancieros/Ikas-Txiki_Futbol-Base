import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Link2, LockKeyhole, LogOut, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, UnlockKeyhole, UserCog, UserRoundPlus, UserX } from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import BulkAccountProvisioning from "./BulkAccountProvisioning";
import {
  USER_STATUSES, accessState, allPasswordChecksPass, normalizedStatus, normalizedTeamOptions, passwordChecks,
  safeUsernameSuggestion, userCounters, userDisplayName, userFeedbackStep, userRoleLabelKey, userSaveFeedback,
  userSaveSuccessFeedback, wizardLinkComplete,
} from "./userAdministrationView";

const emptyForm = {
  first_name: "", last_name: "", username: "", email: "", phone: "", password: "",
  password_confirmation: "", role: "coach", account_status: "active",
  assigned_team_ids: [], assigned_category_ids: [], player_id: "", family_id: "", language: "es",
  access_method: "password", notification_preferences: { in_app: true, email: true, telegram: true, callups: true, schedule_changes: true, payments: true, documents: true },
};

const Select = ({ label, value, onChange, children, testid }) => (
  <label className="block text-sm font-semibold text-slate-700">
    {label}
    <select data-testid={testid} className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  </label>
);

export function UsersPermissionsGuide() {
  const { t } = useI18n();
  const [guideOpen, setGuideOpen] = useState(true);
  const steps = ["usersPermissionsGuideStepOne", "usersPermissionsGuideStepTwo", "usersPermissionsGuideStepThree", "usersPermissionsGuideStepFour"];
  return <aside className="rounded-xl border border-sky-200 bg-sky-50 text-slate-800" aria-labelledby="users-permissions-guide-title" data-testid="users-permissions-guide">
    <Button type="button" variant="ghost" className="flex min-h-11 w-full justify-between rounded-xl px-4 text-left font-bold text-[#0E3554] focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2" aria-expanded={guideOpen} aria-controls="users-permissions-guide-content" onClick={() => setGuideOpen((open) => !open)}>
      <span id="users-permissions-guide-title">{t("usersPermissionsGuideTitle")}</span><span aria-hidden="true">{guideOpen ? "−" : "+"}</span>
    </Button>
    {guideOpen && <div id="users-permissions-guide-content" className="space-y-4 border-t border-sky-200 p-4 text-sm">
      <ul className="list-disc space-y-2 pl-5">{["usersPermissionsGuideAccount", "usersPermissionsGuideSecrets", "usersPermissionsGuideStatuses", "usersPermissionsGuidePending", "usersPermissionsGuideManagement", "usersPermissionsGuideFamilies", "usersPermissionsGuideDistinctEmails", "usersPermissionsGuidePlayerEmail"].map((key) => <li key={key}>{t(key)}</li>)}</ul>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("usersPermissionsGuideFlowLabel")}>{steps.map((key, index) => <li key={key} className="flex gap-2 rounded-lg bg-white p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-700 text-xs font-bold text-white">{index + 1}</span><span>{t(key)}</span></li>)}</ol>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950"><ShieldAlert className="mr-2 inline h-4 w-4" />{t("usersPermissionsGuideSafetyNotice")}</p>
    </div>}
  </aside>;
}

export default function Users() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const openedAccount = useRef("");
  const { lang, t } = useI18n();
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
  const [permanentDeletionCapability, setPermanentDeletionCapability] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [creationType, setCreationType] = useState(null);
  const [teamFilters, setTeamFilters] = useState({ search: "", season: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ view: "active", search: "", role: "", status: "", teamId: "" });
  const [page, setPage] = useState(1);
  const [serverMeta, setServerMeta] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [saveProcessing, setSaveProcessing] = useState(false);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const [u, options] = await Promise.all([api.get("/users", { params: {
        page, page_size: 20, search: filters.search, role: filters.role,
        status: filters.status, team_id: filters.teamId, view: filters.view,
      } }), api.get("/users/options")]);
      setUsers(u.data.items); setServerMeta(u.data); setTeams(options.data.teams); setPlayers(options.data.players); setFamilies(options.data.families);
    } catch (requestError) {
      setError(true);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleUsers = users;
  const pageCount = serverMeta?.pages || 1;
  const paginatedUsers = users;
  useEffect(() => { setPage(1); }, [filters]);
  const counters = serverMeta?.counters || userCounters(users);
  const categories = useMemo(() => [...new Set(teams.map((team) => team.categoria).filter(Boolean))].sort(), [teams]);
  const visibleTeams = useMemo(() => normalizedTeamOptions(teams, teamFilters), [teams, teamFilters]);
  const seasons = useMemo(() => [...new Set(teams.map((team) => team.temporada).filter(Boolean))].sort(), [teams]);
  const checks = passwordChecks(form.password);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const manualSteps = [1, 3, 4];
  const close = () => { setDialog(false); setEditingId(null); setCreationType(null); setForm(emptyForm); setShowPassword(false); setWizardStep(1); setSaveFeedback(null); };
  const openCreate = () => { setEditingId(null); setCreationType(null); setForm(emptyForm); setWizardStep(1); setSaveFeedback(null); setDialog(true); };
  const chooseCreationType = (role) => {
    setCreationType(role);
    setForm({ ...emptyForm, role });
    setWizardStep(1); setSaveFeedback(null);
  };
  const openEdit = (user) => {
    if (user.read_only) return;
    setEditingId(user.id);
    setCreationType(user.role);
    setForm({ ...emptyForm, ...user, password: "", password_confirmation: "", player_id: user.player_id || "", family_id: user.family_id || "" });
    setWizardStep(1); setSaveFeedback(null); setDialog(true);
  };
  const toggleTeam = (teamId) => update("assigned_team_ids", form.assigned_team_ids.includes(teamId)
    ? form.assigned_team_ids.filter((id) => id !== teamId) : [...form.assigned_team_ids, teamId]);
  const toggleCategory = (category) => update("assigned_category_ids", form.assigned_category_ids.includes(category)
    ? form.assigned_category_ids.filter((value) => value !== category) : [...form.assigned_category_ids, category]);

  const save = async (event) => {
    event.preventDefault();
    if (saveProcessing) return;
    if (!wizardLinkComplete(form) && form.account_status === "active") return;
    if (!editingId && form.access_method === "password" && (!allPasswordChecksPass(form.password) || form.password !== form.password_confirmation)) return;
    setSaveProcessing(true); setSaveFeedback(null);
    try {
      const payload = { ...form, player_id: form.player_id || null, family_id: form.family_id || null };
      if (!editingId && form.access_method !== "password") { payload.password = null; payload.password_confirmation = null; }
      if (editingId) {
        delete payload.username; delete payload.password; delete payload.password_confirmation; delete payload.access_method;
        await api.put(`/users/${editingId}`, payload);
      } else {
        const response = await api.post("/users", payload);
        setSaveFeedback(userSaveSuccessFeedback(response.data));
      }
      if (editingId) setSaveFeedback(userSaveSuccessFeedback());
      toast({ title: t("userSaved") }); await load();
    } catch (requestError) {
      const feedback = userSaveFeedback(requestError);
      setSaveFeedback(feedback);
      const step = userFeedbackStep(feedback.field);
      if (step) setWizardStep(step);
      toast({ title: feedback.message, variant: "destructive" });
    } finally { setSaveProcessing(false); }
  };

  const showEffectivePermissions = async (user) => {
    try { setPermissions({ user, ...(await api.get(`/users/${user.id}/effective-permissions`)).data }); }
    catch { toast({ title: t("loadError"), variant: "destructive" }); }
  };

  const showProfile = async (user) => {
    try { setProfile(await api.get(`/users/${user.id}/administration-profile`).then((response) => response.data)); }
    catch { toast({ title: t("loadError"), variant: "destructive" }); }
  };

  const showSecurity = async (user) => {

    try {
      const [securityResponse, capabilityResponse] = await Promise.all([
        api.get(`/users/${user.id}/security`), api.get("/users/permanent-deletion-capability"),
      ]);
      setSecurity({ user, ...securityResponse.data });
      setPermanentDeletionCapability(capabilityResponse.data);
    } catch { toast({ title: t("loadError"), variant: "destructive" }); }
  };
  useEffect(() => {
    const userId = searchParams.get("cuenta");
    if (!userId || openedAccount.current === userId) return;
    openedAccount.current = userId;
    api.get(`/users/${encodeURIComponent(userId)}`).then(({ data }) => showProfile(data))
      .catch(() => toast({ title: t("loadError"), variant: "destructive" }));
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestPasswordReset = async (user) => {
    if (user.read_only || !user.username) return;
    try {
      await api.post("/auth/recovery/request", { identifier: user.username });
      toast({ title: t("passwordResetRequested") });
    } catch {
      toast({ title: t("saveError"), variant: "destructive" });
    }
  };
  const formatLastAccess = (value) => new Intl.DateTimeFormat(lang === "eu" ? "eu-ES" : "es-ES", {
    dateStyle: "long", timeStyle: "short",
  }).format(new Date(value));
  const securityAction = async (path, method = "post", confirmation = "confirmSensitiveAction") => {
    // Reenviar una invitación es idempotente para el administrador: mantiene
    // auditoría y rota el enlace, pero no necesita un diálogo bloqueante.
    if (!security || securityBusy || (confirmation && !window.confirm(t(confirmation)))) return;
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
  const deactivateAccess = async () => {
    if (!security || !window.confirm(t("confirmDeactivateAccess"))) return;
    setSecurityBusy(true); setRevealedSecret(null);
    try {
      await api.delete(`/users/${security.user.id}`);
      toast({ title: t("accessDeactivated") });
      setSecurity(null); await load();
    } catch (requestError) { toast({ title: requestError.response?.data?.detail || t("saveError"), variant: "destructive" }); }
    finally { setSecurityBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></div><div><h1 className="page-title">{t("usersAndPermissions")}</h1><p className="page-subtitle">{t("usersIntro")}</p></div></div>
      </header>

      <UsersPermissionsGuide />

      <div><Button onClick={openCreate} className="min-h-11" data-testid="create-user"><Plus className="h-4 w-4" />{t("createUser")}</Button></div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label={t("accountCounters")}>
        {[["total", counters.total], ["active", counters.active], ["pendingActivation", counters.pending], ["blocked", counters.blocked], ["deactivated", counters.deactivated], ["incompleteLink", counters.incomplete]].map(([key, value]) => (
          <div key={key} className="surface-card p-4"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{t(key)}</p></div>
        ))}
      </section>

      <section className="surface-card space-y-4 p-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4" role="tablist" aria-label={t("userViews")}>
          {["active", "archived"].map((view) => <Button key={view} type="button" role="tab" aria-selected={filters.view === view} variant={filters.view === view ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, view }))}>{t(view === "active" ? "activeAndPendingUsers" : "archivedUsers")}</Button>)}
        </div>
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
            <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900">{userDisplayName(user)}</h2>
                  <div className="mt-2 flex flex-wrap gap-2" aria-label={t("roleAndAccess")}>
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">{t(userRoleLabelKey(user))}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${accessState(user) === "active" ? "bg-emerald-100 text-emerald-800" : accessState(user) === "pending_activation" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{t(`accessState_${accessState(user)}`)}</span>
                    {normalizedStatus(user) !== accessState(user) && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{t("accountStatusLabel")}: {t(`accountStatus_${normalizedStatus(user)}`)}</span>}
                  </div>
                  <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0"><dt className="font-semibold text-slate-500">{t("username")}:</dt><dd className="mt-1 break-all text-slate-900">{user.username || t("notAvailable")}</dd></div>
                    <div className="min-w-0"><dt className="font-semibold text-slate-500">{t("emailAddress")}:</dt><dd className="mt-1 break-all text-slate-900">{user.email || t("notAvailable")}</dd></div>
                    <div className="min-w-0"><dt className="font-semibold text-slate-500">{t("password")}:</dt><dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-900"><span aria-label={t("passwordHidden")}>••••••••••••</span><Button variant="link" size="sm" className="h-auto px-0 py-0" disabled={user.read_only || !user.username} title={user.read_only ? t("systemSecurityReadOnly") : undefined} onClick={() => requestPasswordReset(user)}>{t("resetPassword")}</Button></dd></div>
                    {user.last_access_at && <div className="min-w-0"><dt className="font-semibold text-slate-500">{t("lastAccess")}:</dt><dd className="mt-1 text-slate-900"><time dateTime={user.last_access_at}>{formatLastAccess(user.last_access_at)}</time></dd></div>}
                  </dl>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">{user.role === "family" && user.family_id && <Button variant="outline" onClick={() => navigate(`/familias?ficha=${encodeURIComponent(user.family_id)}`)}><UserRoundPlus className="h-4 w-4" />{t("createFamilyAccesses")}</Button>}<Button variant="outline" onClick={() => showProfile(user)}><UserCog className="h-4 w-4" />{t("viewProfile")}</Button><Button variant="outline" onClick={() => showEffectivePermissions(user)}><ShieldCheck className="h-4 w-4" />{t("effectivePermissions")}</Button><Button variant="outline" onClick={() => showSecurity(user)}><LockKeyhole className="h-4 w-4" />{t("security")}</Button>{!user.read_only && <Button variant="outline" onClick={() => openEdit(user)}><UserCog className="h-4 w-4" />{t("edit")}</Button>}</div>
              </div>
            </article>
          ))}</div>{pageCount > 1 && <nav className="mt-4 flex items-center justify-between" aria-label={t("pagination")}><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t("previous")}</Button><span className="text-sm text-slate-500">{page} / {pageCount}</span><Button variant="outline" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>{t("next")}</Button></nav>}</>}
      </section>

      <Dialog open={dialog} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? t("editUser") : t("createUser")}</DialogTitle><DialogDescription>{t("userDialogDescription")}</DialogDescription></DialogHeader>
          {!editingId && !creationType ? <section className="space-y-4" data-testid="account-type-selector">
            <p className="text-sm font-semibold text-slate-700">{t("chooseUserType")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {["admin", "coordinator", "coach", "family", "player"].map((role) => <button key={role} type="button" onClick={() => chooseCreationType(role)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <strong className="block text-slate-900">{t(`role_${role}`)}</strong>
                <span className="mt-1 block text-sm text-slate-600">{t(`roleHelp_${role}`)}</span>
              </button>)}
            </div>
            <Button type="button" variant="outline" onClick={close}>{t("cancel")}</Button>
          </section> : !editingId && ["family", "player"].includes(creationType) ? <BulkAccountProvisioning type={creationType} onCancel={close} onCompleted={load} /> : <form className="space-y-5" onSubmit={save} noValidate>
            {saveFeedback && <div role="alert" aria-live="assertive" className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm font-semibold ${saveFeedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
              <p>{saveFeedback.message}</p><button type="button" onClick={() => setSaveFeedback(null)} className="shrink-0 rounded p-1 text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="Cerrar mensaje">×</button>
            </div>}
            <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{t("userType")}</p>
              {editingId ? <Select label={t("role")} value={form.role} onChange={(role) => update("role", role)}>{["admin", "coordinator", "coach", "family", "player"].map((role) => <option key={role} value={role}>{t(`role_${role}`)}</option>)}</Select> : <p className="mt-1 font-bold text-sky-950">{t(`role_${form.role}`)}</p>}
            </section>
            <ol className="grid grid-cols-3 gap-2" aria-label={t("wizardProgress")}>{manualSteps.map((step, index) => <li key={step} className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${wizardStep === step ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{index + 1}. {t(`userStep_${step}`)}</li>)}</ol>
            {wizardStep === 1 && <section className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">{t("firstName")}<Input className={`mt-1.5 ${saveFeedback?.field === "first_name" ? "border-red-500" : ""}`} aria-invalid={saveFeedback?.field === "first_name"} value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required /></label><label className="text-sm font-semibold">{t("lastName")}<Input className={`mt-1.5 ${saveFeedback?.field === "last_name" ? "border-red-500" : ""}`} aria-invalid={saveFeedback?.field === "last_name"} value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required /></label><label className="text-sm font-semibold">{t("username")}<div className="mt-1.5 flex gap-2"><Input className={saveFeedback?.field === "username" ? "border-red-500" : ""} aria-invalid={saveFeedback?.field === "username"} disabled={Boolean(editingId)} value={form.username} onChange={(e) => update("username", e.target.value)} required /><Button type="button" variant="outline" disabled={Boolean(editingId)} onClick={() => update("username", safeUsernameSuggestion(form.first_name, form.last_name))}>{t("suggest")}</Button></div></label><label className="text-sm font-semibold">{t("email")}<Input className={`mt-1.5 ${saveFeedback?.field === "email" ? "border-red-500" : ""}`} aria-invalid={saveFeedback?.field === "email"} type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} /></label><label className="text-sm font-semibold">{t("phone")}<Input className={`mt-1.5 ${saveFeedback?.field === "phone" ? "border-red-500" : ""}`} aria-invalid={saveFeedback?.field === "phone"} value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} /></label><Select label={t("language")} value={form.language} onChange={(language) => update("language", language)}><option value="es">Castellano</option><option value="eu">Euskara</option></Select></section>}
            {wizardStep === 3 && <section className="space-y-4">{(form.role === "coordinator" || form.role === "coach") && <fieldset className={saveFeedback?.field === "assigned_team_ids" ? "rounded-xl border-2 border-red-500 p-3" : ""} aria-invalid={saveFeedback?.field === "assigned_team_ids"}><legend className="text-sm font-semibold">{t("assignedTeams")} · {form.assigned_team_ids.length}</legend><div className="mt-2 grid gap-3 sm:grid-cols-2"><Input placeholder={t("searchTeams")} value={teamFilters.search} onChange={(event) => setTeamFilters((value) => ({ ...value, search: event.target.value }))} /><Select label={t("season")} value={teamFilters.season} onChange={(season) => setTeamFilters((value) => ({ ...value, season }))}><option value="">{t("all")}</option>{seasons.map((season) => <option key={season} value={season}>{season}</option>)}</Select></div><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => update("assigned_team_ids", [...new Set([...form.assigned_team_ids, ...visibleTeams.map((team) => team.id)])])}>{t("selectVisible")}</Button><Button type="button" variant="outline" onClick={() => update("assigned_team_ids", [])}>{t("clearSelection")}</Button></div><div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{visibleTeams.map((team) => <label key={team.id} className="flex min-h-11 items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.assigned_team_ids.includes(team.id)} onChange={() => toggleTeam(team.id)} /><span>{team.nombre}<small className="block text-slate-500">{[team.categoria, team.modalidad, team.temporada].filter(Boolean).join(" · ")}</small></span></label>)}</div></fieldset>}{form.role === "coordinator" && <fieldset><legend className="text-sm font-semibold">{t("assignedCategories")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{categories.filter((category) => String(category).toLocaleUpperCase() !== "NO APLICA").map((category) => <label key={category} className="flex min-h-11 items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={form.assigned_category_ids.includes(category)} onChange={() => toggleCategory(category)} />{category}</label>)}</div></fieldset>}{form.role === "player" && <Select label={t("linkedPlayer")} value={form.player_id} onChange={(playerId) => update("player_id", playerId)}><option value="">—</option>{players.map((player) => <option key={player.id} value={player.id}>{player.nombre} {player.apellidos}</option>)}</Select>}{form.role === "family" && <Select label={t("linkedFamily")} value={form.family_id} onChange={(familyId) => update("family_id", familyId)}><option value="">—</option>{families.map((family) => <option key={family.id} value={family.id}>{family.progenitor1_nombre || family.contacto_principal || t("family")}</option>)}</Select>}{!wizardLinkComplete(form) && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t("incompleteLinkWarning")}</p>}</section>}
            {wizardStep === 4 && <section className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Select label={t("status")} value={form.account_status} onChange={(status) => update("account_status", status)}>{USER_STATUSES.filter((status) => status !== "incomplete_link").map((status) => <option key={status} value={status}>{t(`accountStatus_${status}`)}</option>)}</Select>{!editingId && <Select label={t("accessMethod")} value={form.access_method} onChange={(access_method) => update("access_method", access_method)}><option value="password">{t("accessPassword")}</option><option value="temporary_password">{t("accessTemporary")}</option><option value="invitation">{t("accessInvitation")}</option><option value="pending">{t("accessPending")}</option></Select>}</div>{!editingId && form.access_method === "password" && <section className="rounded-2xl bg-slate-50 p-4"><div className="grid gap-4 sm:grid-cols-2">{["password", "password_confirmation"].map((field) => <label key={field} className="text-sm font-semibold">{t(field === "password" ? "password" : "confirmPassword")}<span className="relative mt-1.5 block"><Input type={showPassword ? "text" : "password"} value={form[field]} onChange={(e) => update(field, e.target.value)} required /><button type="button" className="absolute right-2 top-2 rounded-lg p-1 text-slate-600" onClick={() => setShowPassword((value) => !value)} aria-label={t(showPassword ? "hidePassword" : "showPassword")}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></label>)}</div><div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">{Object.entries(checks).map(([key, valid]) => <span key={key} className={valid ? "text-emerald-700" : "text-slate-500"}>• {t(`password_${key}`)}</span>)}</div></section>}<div className="rounded-2xl border p-4 text-sm"><strong>{t("summary")}</strong><p>{userDisplayName(form)} · {t(`role_${form.role}`)} · {t(`accountStatus_${form.account_status}`)}</p><p>{t("selectedTeams")}: {form.assigned_team_ids.length}</p></div></section>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" disabled={saveProcessing} onClick={wizardStep === manualSteps[0] ? close : () => setWizardStep(manualSteps[manualSteps.indexOf(wizardStep) - 1])}>{wizardStep === manualSteps[0] ? t("cancel") : t("previous")}</Button>{wizardStep !== manualSteps[manualSteps.length - 1] ? <Button type="button" disabled={saveProcessing} onClick={() => setWizardStep(manualSteps[manualSteps.indexOf(wizardStep) + 1])}>{t("next")}</Button> : <Button type="submit" disabled={saveProcessing || (!wizardLinkComplete(form) && form.account_status === "active") || (!editingId && form.access_method === "password" && (!allPasswordChecksPass(form.password) || form.password !== form.password_confirmation))}><KeyRound className="h-4 w-4" />{saveProcessing ? "Guardando…" : t("save")}</Button>}</div>
          </form>
          }
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(profile)} onOpenChange={(open) => { if (!open) setProfile(null); }}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{t("userProfile")}</DialogTitle><DialogDescription>{t("userProfileDescription")}</DialogDescription></DialogHeader>{profile && <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4 sm:col-span-2"><p className="text-xs font-bold text-slate-500">{t("identityAndAccess")}</p><p className="mt-1 font-bold">{userDisplayName(profile.user)}</p><p className="text-sm text-slate-600">{profile.user.system_account ? t("configuredOnServer") : [profile.user.username, profile.user.email, profile.user.phone].filter(Boolean).join(" · ")}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{t("security")}</p><p className="mt-1 font-bold">{t(`securityState_${profile.user.security_state || "verified"}`)}</p></div></section><section><h3 className="font-bold">{t("roleAndScope")}</h3><p className="text-sm text-slate-600">{t(`role_${profile.user.role}`)} · {profile.user.link_complete ? t("linkComplete") : t("incompleteLink")}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(profile.permissions).map(([resource, actions]) => <div key={resource} className="rounded-xl border p-3"><strong>{t(`permissionResource_${resource}`)}</strong><p className="text-xs text-slate-500">{actions.map((action) => t(`permissionAction_${action}`)).join(" · ")}</p></div>)}</div></section><section><h3 className="font-bold">{t("recentActivity")}</h3>{profile.activity.length ? <ul className="mt-2 space-y-2">{profile.activity.map((event) => <li key={event.id} className="rounded-xl border p-3 text-sm"><strong>{event.type}</strong><span className="ml-2 text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString() : t("notAvailable")}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{t("notAvailable")}</p>}</section><section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><strong>{t("sessions")}</strong><p className="text-sm text-slate-600">{profile.sessions.individual_tracking ? t("available") : t("individualSessionsUnavailable")}</p></div><div className="rounded-xl bg-slate-50 p-4"><strong>{t("communications")}</strong><p className="text-sm text-slate-600">{profile.communications.count}</p></div></section></div>}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(permissions)} onOpenChange={(open) => { if (!open) setPermissions(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t("effectivePermissions")}</DialogTitle><DialogDescription>{t("effectivePermissionsDescription")}</DialogDescription></DialogHeader>{permissions && <div className="space-y-5"><div className="rounded-xl bg-sky-50 p-4"><p className="font-bold text-sky-950">{userDisplayName(permissions.user)}</p><p className="text-sm text-sky-800">{t("roleDefinesFunctionsScopeDefinesData")}</p></div><div><h3 className="mb-2 font-bold">{t("allowedFunctions")}</h3><div className="grid gap-2 sm:grid-cols-2">{Object.entries(permissions.permissions).map(([resource, actions]) => <div key={resource} className="rounded-xl border p-3"><p className="font-semibold">{t(`permissionResource_${resource}`)}</p><p className="text-xs text-slate-500">{actions.map((action) => t(`permissionAction_${action}`)).join(" · ")}</p></div>)}</div></div><div><h3 className="font-bold">{t("appliedScope")}</h3><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-white">{JSON.stringify(permissions.scope, null, 2)}</pre></div></div>}</DialogContent>
      </Dialog>

      <Dialog open={Boolean(security)} onOpenChange={(open) => { if (!open) { setSecurity(null); setRevealedSecret(null); setPermanentDeletionCapability(null); } }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("accessSecurity")}</DialogTitle><DialogDescription>{t("accessSecurityDescription")}</DialogDescription></DialogHeader>{security && <div className="space-y-5">
          <section className="rounded-xl border border-sky-100 bg-sky-50 p-4" aria-label={t("accessStatus")}><h3 className="font-bold text-sky-950">{t("accessStatus")}</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-slate-500">{t("username")}</dt><dd className="mt-1 font-bold text-slate-900">{security.user.system_account ? t("configuredOnServer") : security.user.username}</dd></div><div><dt className="font-semibold text-slate-500">{t("currentStatus")}</dt><dd className="mt-1 font-bold text-slate-900">{t(`accessState_${accessState(security)}`)}</dd></div>{security.last_access_at ? <div><dt className="font-semibold text-slate-500">{t("lastAccess")}</dt><dd className="mt-1 text-slate-900">{new Date(security.last_access_at).toLocaleString()}</dd></div> : security.last_activation_at ? <div><dt className="font-semibold text-slate-500">{t("lastActivation")}</dt><dd className="mt-1 text-slate-900">{new Date(security.last_activation_at).toLocaleString()}</dd></div> : null}</dl></section>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t("securityStatus")}</p><p className="mt-1 font-bold">{security.locked ? t("temporarilyLocked") : t("accessAvailable")}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t("invitation")}</p><p className="mt-1 font-bold">{t(`invitationStatus_${security.invitation_status || "none"}`)}</p></div></div>
          {revealedSecret && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" role="alert"><p className="font-bold text-amber-950">{t("shownOnlyOnce")}</p><code className="mt-2 block break-all rounded-lg bg-white p-3 text-sm">{revealedSecret.value}</code><Button className="mt-3" variant="outline" onClick={() => setRevealedSecret(null)}>{t("understoodHideSecret")}</Button></div>}
          {security.read_only ? <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">{t("systemSecurityReadOnly")}</p> : <div className="grid gap-3 sm:grid-cols-2">
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("temporary-password")}><KeyRound className="h-4 w-4" />{t("generateTemporaryPassword")}</Button>
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("invitation", "post", "")}><Link2 className="h-4 w-4" />{t("generateInvitation")}</Button>
            <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("revoke-sessions")}><LogOut className="h-4 w-4" />{t("closeSessions")}</Button>
            {security.locked ? <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("unlock")}><UnlockKeyhole className="h-4 w-4" />{t("unlockAccess")}</Button> : <Button disabled={securityBusy} variant="outline" onClick={() => securityAction("lock")}><LockKeyhole className="h-4 w-4" />{t("lockAccess")}</Button>}
            <Button disabled={securityBusy} variant="destructive" onClick={deactivateAccess}><UserX className="h-4 w-4" />{t("deactivateAccess")}</Button>
            <Button disabled variant="destructive" title={permanentDeletionCapability?.reason || t("permanentDeletionChecking")} data-testid="permanent-delete-user">
              <UserX className="h-4 w-4" />{t("permanentDeleteUser")}
            </Button>
          </div>}
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status" data-testid="permanent-delete-unavailable">
            {permanentDeletionCapability?.reason || t("permanentDeletionChecking")}
          </p>
        </div>}</DialogContent>
      </Dialog>
    </div>
  );
}
