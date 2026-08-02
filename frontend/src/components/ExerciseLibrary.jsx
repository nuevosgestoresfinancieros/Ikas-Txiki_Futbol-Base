import React, { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Copy, Dumbbell, Eye, Pencil, Plus, RefreshCcw, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Area, SelectField } from "@/components/form";
import { EmptyState } from "@/components/shared";
import { emptyExercise, exerciseFilters } from "@/pages/trainingExerciseView";

const CATEGORY_KEYS = [
  "warmup", "technique", "tactics", "fitness", "goalkeepers", "finishing",
  "possession", "small_sided_game", "set_pieces", "cooldown", "other",
];

const lines = (value) => Array.isArray(value) ? value.join("\n") : value || "";
const toList = (value) => String(value || "").split("\n").map((row) => row.trim()).filter(Boolean);

export default function ExerciseLibrary({ teams, canManage, onCatalogChange, createRequested, onCreateRequestHandled, onExerciseSaved }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    search: "", category: "all", objective: "all", status: "active",
    team_id: "all", author_id: "all", visibility: "all", sort: "name_asc",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyExercise);
  const createButtonRef = useRef(null);
  const openerRef = useRef(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [catalog, statistics] = await Promise.all([
        api.get("/exercises", { params: { status: "all", page_size: 100 } }),
        api.get("/exercises/statistics"),
      ]);
      setItems(catalog.data.items || []); setStats(statistics.data);
      onCatalogChange?.(catalog.data.items || []);
    } catch {
      setError(t("exerciseLibraryLoadError"));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const visible = useMemo(() => exerciseFilters(items, filters), [items, filters]);
  const categoryOptions = [{ value: "all", label: t("allCategories") }, ...CATEGORY_KEYS.map((value) => ({
    value, label: t(`exerciseCategory_${value}`),
  }))];
  const teamOptions = [{ value: "all", label: t("allTeams") }, ...teams.map((team) => ({ value: team.id, label: team.nombre }))];
  const objectiveOptions = [{ value: "all", label: t("allObjectives") }, ...[...new Set(items.map((item) => item.objective).filter(Boolean))]
    .sort().map((value) => ({ value, label: value }))];
  const authorOptions = [{ value: "all", label: t("allAuthors") }, ...[...new Map(items
    .filter((item) => item.author_id)
    .map((item) => [item.author_id, { value: item.author_id, label: item.author_name || t("exerciseAuthor") }])).values()]];
  const openCreate = () => { openerRef.current = createButtonRef.current; setForm({ ...emptyExercise }); setDialog(true); };
  useEffect(() => {
    if (createRequested && canManage) {
      openCreate();
      onCreateRequestHandled?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequested, canManage]);
  const openEdit = (item, opener) => { openerRef.current = opener; setForm({ ...emptyExercise, ...item }); setDialog(true); };
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async () => {
    try {
      const payload = {
        ...form,
        instructions: toList(form.instructions),
        materials: toList(form.materials),
        recommended_duration: Number(form.recommended_duration) || null,
        min_players: Number(form.min_players) || null,
        max_players: Number(form.max_players) || null,
      };
      if (form.id) await api.put(`/exercises/${form.id}`, payload);
      else await api.post("/exercises", payload);
      toast.success(t("exerciseSaved")); setDialog(false); await load(); onExerciseSaved?.();
    } catch (requestError) {
      toast.error(requestError.response?.data?.detail || t("saveError"));
    }
  };
  const duplicate = async (id) => {
    try { await api.post(`/exercises/${id}/duplicate`); toast.success(t("exerciseDuplicated")); await load(); }
    catch { toast.error(t("saveError")); }
  };
  const toggleArchive = async (item) => {
    if (!window.confirm(item.status === "active" ? t("confirmArchiveExercise") : t("confirmRestoreExercise"))) return;
    try {
      await api.post(`/exercises/${item.id}/${item.status === "active" ? "archive" : "restore"}`);
      toast.success(t("saved")); await load();
    } catch { toast.error(t("saveError")); }
  };

  return (
    <section aria-labelledby="exercise-library-title" data-testid="exercise-library">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="exercise-library-title" className="font-heading text-xl font-bold text-slate-900">{t("exerciseLibrary")}</h2>
          <p className="text-sm text-slate-500">{t("exerciseLibraryDescription")}</p></div>
        {canManage && <Button ref={createButtonRef} onClick={openCreate} data-testid="create-exercise"><Plus className="h-4 w-4" />{t("createExercise")}</Button>}
      </div>
      <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative block text-sm font-medium text-slate-700">{t("search")}
          <Search className="absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3" data-testid="exercise-search" /></label>
        <SelectField label={t("category")} value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} options={categoryOptions} />
        <SelectField label={t("team")} value={filters.team_id} onChange={(value) => setFilters((current) => ({ ...current, team_id: value }))} options={teamOptions} />
        <SelectField label={t("objective")} value={filters.objective} onChange={(value) => setFilters((current) => ({ ...current, objective: value }))} options={objectiveOptions} />
        <SelectField label={t("exerciseAuthor")} value={filters.author_id} onChange={(value) => setFilters((current) => ({ ...current, author_id: value }))} options={authorOptions} />
        <SelectField label={t("visibility")} value={filters.visibility} onChange={(value) => setFilters((current) => ({ ...current, visibility: value }))}
          options={[{ value: "all", label: t("all") }, ...["private", "teams", "club"].map((value) => ({ value, label: t(`exerciseVisibility_${value}`) }))]} />
        <SelectField label={t("status")} value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
          options={[{ value: "active", label: t("active") }, { value: "archived", label: t("archived") }, { value: "all", label: t("all") }]} />
        <SelectField label={t("sortBy")} value={filters.sort} onChange={(value) => setFilters((current) => ({ ...current, sort: value }))}
          options={[
            { value: "name_asc", label: t("sortNameAsc") }, { value: "name_desc", label: t("sortNameDesc") },
            { value: "duration_asc", label: t("sortDurationAsc") }, { value: "duration_desc", label: t("sortDurationDesc") },
          ]} />
      </div>
      {stats && <p className="mb-3 text-sm text-slate-500" aria-live="polite">{t("exerciseCount")}: {visible.length} · {t("plannedUses")}: {stats.exercises?.reduce((sum, row) => sum + row.planned_count, 0) || 0}</p>}
      {loading ? <div className="surface-card p-8 text-center text-slate-500">{t("loading")}</div>
        : error ? <div className="surface-card flex items-center justify-between p-5 text-red-700"><span>{error}</span><Button variant="outline" onClick={load}><RefreshCcw className="h-4 w-4" />{t("retry")}</Button></div>
          : visible.length === 0 ? <EmptyState icon={Dumbbell} message={t("noExercises")} />
            : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => {
              const use = stats?.exercises?.find((row) => row.exercise_id === item.id);
              return <article key={item.id} className="surface-card p-4" data-testid={`exercise-${item.id}`}>
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{item.name}</h3>
                  <p className="text-xs font-medium text-primary">{t(`exerciseCategory_${item.category}`)} · {item.objective}</p></div>
                  <span className={`rounded-full px-2 py-1 text-xs ${item.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{t(item.status)}</span></div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-600">{item.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><div><dt>{t("duration")}</dt><dd className="font-semibold">{item.recommended_duration || "—"} min</dd></div>
                  <div><dt>{t("plannedUses")}</dt><dd className="font-semibold">{use?.planned_count || 0}</dd></div></dl>
                <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-3">
                  <Button variant="ghost" size="icon" aria-label={t("viewDetails")} onClick={() => setDetail(item)}><Eye className="h-4 w-4" /></Button>
                {canManage && <>
                  <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={(event) => openEdit(item, event.currentTarget)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={t("duplicate")} onClick={() => duplicate(item.id)}><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={item.status === "active" ? t("archive") : t("restore")} onClick={() => toggleArchive(item)}>
                    {item.status === "active" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
                </>}</div>
              </article>;
            })}</div>}

      <Dialog open={dialog} onOpenChange={setDialog}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); openerRef.current?.focus(); }} className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? t("editExercise") : t("createExercise")}</DialogTitle>
          <DialogDescription>{t("exerciseFormDescription")}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} value={form.name} onChange={set("name")} />
          <SelectField label={t("category")} value={form.category} onChange={set("category")} options={categoryOptions.slice(1)} />
          <Field label={t("objective")} value={form.objective} onChange={set("objective")} />
          <Field label={t("recommendedDuration")} type="number" value={form.recommended_duration} onChange={set("recommended_duration")} />
          <Area label={t("description")} value={form.description} onChange={set("description")} />
          <Area label={t("exerciseInstructions")} value={lines(form.instructions)} onChange={set("instructions")} />
          <Area label={t("materials")} value={lines(form.materials)} onChange={set("materials")} />
          <Area label={t("safetyNotes")} value={form.safety_notes} onChange={set("safety_notes")} />
          <SelectField label={t("intensity")} value={form.intensity} onChange={set("intensity")} options={["low", "medium", "high"].map((value) => ({ value, label: t(`intensity_${value}`) }))} />
          <Field label={t("recommendedSpace")} value={form.recommended_space} onChange={set("recommended_space")} />
          <Field label={t("exerciseImageUrl")} value={form.image_url} onChange={set("image_url")} />
          <Field label={t("minPlayers")} type="number" value={form.min_players} onChange={set("min_players")} />
          <Field label={t("exerciseMaxPlayers")} type="number" value={form.max_players} onChange={set("max_players")} />
          <SelectField label={t("visibility")} value={form.visibility} onChange={set("visibility")} options={["private", "teams", "club"].map((value) => ({ value, label: t(`exerciseVisibility_${value}`) }))} />
          {form.visibility === "teams" && <div><p className="mb-1 text-sm font-medium">{t("authorizedTeams")}</p><div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">{teams.map((team) =>
            <label key={team.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.team_ids || []).includes(team.id)}
              onChange={() => setForm((current) => ({ ...current, team_ids: current.team_ids.includes(team.id) ? current.team_ids.filter((id) => id !== team.id) : [...current.team_ids, team.id] }))} />{team.nombre}</label>)}</div></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button><Button onClick={save}>{t("save")}</Button></DialogFooter>
      </DialogContent></Dialog>
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{detail?.description || t("noDescription")}</DialogDescription></DialogHeader>
        {detail && <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">{t("category")}</dt><dd>{t(`exerciseCategory_${detail.category}`)}</dd></div>
          <div><dt className="font-semibold">{t("objective")}</dt><dd>{detail.objective || "—"}</dd></div>
          <div><dt className="font-semibold">{t("recommendedDuration")}</dt><dd>{detail.recommended_duration || "—"} min</dd></div>
          <div><dt className="font-semibold">{t("intensity")}</dt><dd>{t(`intensity_${detail.intensity}`)}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">{t("exerciseInstructions")}</dt><dd className="whitespace-pre-line">{lines(detail.instructions) || "—"}</dd></div>
          <div><dt className="font-semibold">{t("materials")}</dt><dd className="whitespace-pre-line">{lines(detail.materials) || "—"}</dd></div>
          <div><dt className="font-semibold">{t("safetyNotes")}</dt><dd>{detail.safety_notes || "—"}</dd></div>
        </dl>}
        <DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>{t("close")}</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}
