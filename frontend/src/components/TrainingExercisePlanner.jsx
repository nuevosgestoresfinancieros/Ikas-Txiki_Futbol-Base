import React, { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCheck, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Area, SelectField } from "@/components/form";
import {
  addPlannedExercises, exerciseFilters, markAllCompleted, movePlannedExercise,
  removePlannedExercise, templateApplication,
} from "@/pages/trainingExerciseView";

export default function TrainingExercisePlanner({
  planned = [], onChange, exercises = [], templates = [], previousTrainings = [],
  canManage, onCreateExercise, onTemplatesChange,
}) {
  const { t } = useI18n();
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "all", objective: "all", status: "active" });
  const [templateDialog, setTemplateDialog] = useState(false);
  const pickerButtonRef = useRef(null);
  const templateButtonRef = useRef(null);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", visibility: "private" });
  const visible = useMemo(() => exerciseFilters(exercises, filters), [exercises, filters]);
  const objectives = [...new Set(exercises.map((item) => item.objective).filter(Boolean))];
  const categories = [...new Set(exercises.map((item) => item.category).filter(Boolean))];

  const applySelected = () => {
    onChange(addPlannedExercises(planned, exercises.filter((item) => selected.includes(item.id))));
    setSelected([]); setPicker(false);
  };
  const update = (index, field, value) => onChange(planned.map((row, position) => position === index ? { ...row, [field]: value } : row));
  const saveTemplate = async () => {
    try {
      await api.post("/training-templates", { ...templateForm, planned_exercises: planned });
      const response = await api.get("/training-templates"); onTemplatesChange?.(response.data);
      toast.success(t("templateSaved")); setTemplateDialog(false);
    } catch (error) { toast.error(error.response?.data?.detail || t("saveError")); }
  };

  return <section className="space-y-4" aria-labelledby="planned-exercises-title">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 id="planned-exercises-title" className="font-semibold text-slate-900">{t("plannedExercises")}</h3>
        <p className="text-xs text-slate-500">{t("plannedExercisesHelp")}</p></div>
      {canManage && <div className="flex flex-wrap gap-2">
        <Button ref={pickerButtonRef} type="button" variant="outline" size="sm" onClick={() => setPicker(true)}><Plus className="h-4 w-4" />{t("addExercise")}</Button>
        <Button ref={templateButtonRef} type="button" variant="outline" size="sm" disabled={!planned.length} onClick={() => setTemplateDialog(true)}><Save className="h-4 w-4" />{t("saveAsTemplate")}</Button>
      </div>}
    </div>
    {canManage && <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label={t("loadTemplate")} value="" onChange={(id) => {
        const template = templates.find((item) => item.id === id);
        if (template && window.confirm(t("confirmApplyTemplate"))) onChange(templateApplication(template));
      }} options={templates.map((item) => ({ value: item.id, label: item.name }))} />
      <SelectField label={t("copyPreviousTraining")} value="" onChange={(id) => {
        const training = previousTrainings.find((item) => item.id === id);
        if (training && window.confirm(t("confirmCopyExercises"))) onChange(templateApplication({ planned_exercises: training.planned_exercises }));
      }} options={previousTrainings.filter((item) => item.planned_exercises?.length).map((item) => ({ value: item.id, label: `${item.fecha} · ${item.equipo_nombre || ""}` }))} />
    </div>}
    {!planned.length ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{t("noPlannedExercises")}</div>
      : <div className="space-y-3">{planned.map((row, index) => <article key={row.exercise_id} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{row.snapshot?.name || exercises.find((item) => item.id === row.exercise_id)?.name}</p>
            <p className="text-xs text-slate-500">{t(`exerciseCategory_${row.snapshot?.category}`)} · {row.snapshot?.objective}</p></div>
          {canManage && <div className="flex shrink-0">
            <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={t("moveUp")} onClick={() => onChange(movePlannedExercise(planned, index, -1))}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" disabled={index === planned.length - 1} aria-label={t("moveDown")} onClick={() => onChange(movePlannedExercise(planned, index, 1))}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("remove")} onClick={() => onChange(removePlannedExercise(planned, row.exercise_id))}><Trash2 className="h-4 w-4" /></Button>
          </div>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={t("plannedDuration")} type="number" value={row.planned_duration || ""} onChange={(value) => update(index, "planned_duration", Number(value) || null)} />
          <SelectField label={t("performed")} value={row.completed === null || row.completed === undefined ? "pending" : String(row.completed)}
            onChange={(value) => update(index, "completed", value === "pending" ? null : value === "true")}
            options={[{ value: "pending", label: t("pending") }, { value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
          <Field label={t("actualDuration")} type="number" value={row.actual_duration || ""} onChange={(value) => update(index, "actual_duration", Number(value) || null)} />
          <SelectField label={t("exerciseRating")} value={row.rating || "none"} onChange={(value) => update(index, "rating", value === "none" ? null : value)}
            options={[{ value: "none", label: "—" }, ...["very_good", "good", "needs_improvement", "poor"].map((value) => ({ value, label: t(`exerciseRating_${value}`) }))]} />
          <div className="sm:col-span-2"><Area label={t("exerciseObservation")} value={row.observation || ""} onChange={(value) => update(index, "observation", value)} /></div>
          {row.completed === false && <div className="sm:col-span-3"><Area label={t("notCompletedReason")} value={row.not_completed_reason || ""} onChange={(value) => update(index, "not_completed_reason", value)} /></div>}
        </div>
      </article>)}</div>}
    {canManage && planned.length > 0 && <Button type="button" variant="outline" onClick={() => onChange(markAllCompleted(planned))}><CheckCheck className="h-4 w-4" />{t("markAllPerformed")}</Button>}

    <Dialog open={picker} onOpenChange={setPicker}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); pickerButtonRef.current?.focus(); }} className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{t("addExercise")}</DialogTitle><DialogDescription>{t("exercisePickerDescription")}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("search")} value={filters.search} onChange={(value) => setFilters((current) => ({ ...current, search: value }))} />
        <SelectField label={t("category")} value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value }))}
          options={[{ value: "all", label: t("all") }, ...categories.map((value) => ({ value, label: t(`exerciseCategory_${value}`) }))]} />
        <SelectField label={t("objective")} value={filters.objective} onChange={(value) => setFilters((current) => ({ ...current, objective: value }))}
          options={[{ value: "all", label: t("all") }, ...objectives.map((value) => ({ value, label: value }))]} />
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto" role="group" aria-label={t("availableExercises")}>{visible.map((item) =>
        <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-slate-50">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />
          <span><span className="block font-medium">{item.name}</span><span className="text-xs text-slate-500">{t(`exerciseCategory_${item.category}`)} · {item.objective}</span></span>
        </label>)}</div>
      <DialogFooter className="gap-2"><Button variant="outline" onClick={onCreateExercise}><Plus className="h-4 w-4" />{t("createExercise")}</Button>
        <Button disabled={!selected.length} onClick={applySelected}>{t("addSelected")} ({selected.length})</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={templateDialog} onOpenChange={setTemplateDialog}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); templateButtonRef.current?.focus(); }}>
      <DialogHeader><DialogTitle>{t("saveAsTemplate")}</DialogTitle><DialogDescription>{t("templateFormDescription")}</DialogDescription></DialogHeader>
      <Field label={t("name")} value={templateForm.name} onChange={(value) => setTemplateForm((current) => ({ ...current, name: value }))} />
      <Area label={t("description")} value={templateForm.description} onChange={(value) => setTemplateForm((current) => ({ ...current, description: value }))} />
      <DialogFooter><Button variant="outline" onClick={() => setTemplateDialog(false)}>{t("cancel")}</Button><Button onClick={saveTemplate}>{t("save")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
