import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History, Pencil, RotateCcw, Save, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { activeModalitiesFromApi, activeTeamsFromApi, applyPreparationFilterChange, canApplyPreparationBulk, canFinalizeDraft, clearPreparationSelection, existingCategoriesFromApi, filterPreparationRecords, isUnresolvedFuzzyMatch, MODALITY_CONTROL_COPY, modalityAssignmentDisabledReason, modalityOptionLabel, officialModalityCode, selectedOctoberIds, selectVisiblePreparationRecords, teamsForCategory } from "./importPreparationView";

const IMPORT_PREPARATION_COPY = {
  es: {
    title: "Preparar importación", description: "Corrige el borrador sin crear jugadores, familias, equipos, pagos ni inscripciones oficiales.",
    upload: "Cargar como borrador", file: "Excel privado", season: "Temporada", template: "Descargar plantilla",
    drafts: "Borradores guardados", empty: "Carga un Excel incompleto o abre un borrador para continuar otro día.",
    rows: "Filas", unique: "Únicos previstos", duplicates: "Duplicados pendientes", noTeam: "Sin equipo", noCategory: "Sin categoría", noMode: "Sin modalidad",
    incidents: "Incidencias", october: "Pendientes de octubre", capacity: "Equipos sobre capacidad", preparation: "Preparación",
    filter: "Buscar jugador", allCategories: "Todas las categorías", allTeams: "Todos los equipos", selected: "seleccionados", selectVisible: "Seleccionar todos los visibles", clearSelection: "Deseleccionar todos", age: "Edad", previousTeam: "Equipo anterior", allStates: "Todos los estados", withIncidents: "Con incidencias", ready: "Sin incidencias",
    ...MODALITY_CONTROL_COPY.es,
    bulk: "Asignación masiva", team: "Equipo", category: "Categoría", modality: "Modalidad", apply: "Aplicar",
    suggestion: "Sugerencia provisional según la categoría; requiere confirmación administrativa", acceptSuggestion: "Aceptar sugerencia para la selección",
    chooseModality: "Selecciona una modalidad", chooseCategory: "Selecciona una categoría", chooseTeamCategory: "Filtra por categoría", chooseTeam: "Selecciona un equipo", confirmAssignment: "¿Confirmas aplicar {value} a {count} registros seleccionados?", assignmentApplied: "Asignación aplicada a {count} registros.", assignmentError: "No se pudo aplicar la asignación.", importedSuggestion: "Valor importado provisional; requiere confirmación administrativa",
    octoberHelp: "Selecciona exactamente 54 históricos. El sistema nunca los elige automáticamente.",
    bankPending: "Datos bancarios pendientes", bankValid: "IBAN validado y cifrado", edit: "Corregir", delete: "Eliminar borrador",
    confirmDelete: "¿Eliminar este borrador temporal? Los datos oficiales no se modificarán.",
    saveContinue: "Los cambios se guardan automáticamente", final: "Importación final", finalConfirm: "Confirmo expresamente la importación final.",
    blocked: "La importación final permanece bloqueada mientras haya decisiones obligatorias.",
    duplicateTitle: "Resolver duplicados", keepFirst: "Conservar primera", keepSecond: "Conservar segunda", merge: "Fusionar", different: "Personas diferentes",
    incidentTitle: "Incidencias pendientes", corrected: "Corregida", notApplicable: "No aplica", history: "Historial de importaciones", undo: "Deshacer",
    noOriginal: "El Excel original no se guarda. Los IBAN válidos se cifran y nunca se muestran completos.",
    historicalMode: "Base histórica: preparación segura", historicalHelp: "Las reglas automáticas solo completan la modalidad desde la categoría. Equipos, correos y familias pendientes se conservan para revisión sin bloquear la base inicial.", readiness: "Aplicar reglas seguras al borrador", readinessApplied: "Reglas seguras aplicadas: modalidades completadas y avisos conservados.",
    importableNow: "Importables ahora", teamPendingImportable: "Con equipo pendiente", emailPendingImportable: "Con correo pendiente", familyReview: "Familias para revisión", fuzzyBlocked: "Bloqueados por coincidencia difusa", leavePending: "Dejar pendiente", traceability: "Trazabilidad automática",
    fuzzy: "Coincidencias difusas", families: "Familias candidatas", auxiliary: "Filas auxiliares", formulas: "Fórmulas materializadas",
    quality: "Calidad y simulación", creates: "Altas propuestas", officialWrites: "Escrituras oficiales", reviewSame: "Misma persona", reviewDifferent: "Personas distintas", reviewShared: "Familia compartida", reviewSeparate: "Mantener separadas",
  },
  eu: {
    title: "Inportazioa prestatu", description: "Zuzendu zirriborroa jokalari, familia, talde, ordainketa edo izen-emate ofizialik sortu gabe.",
    upload: "Zirriborro gisa kargatu", file: "Excel pribatua", season: "Denboraldia", template: "Txantiloia deskargatu",
    drafts: "Gordetako zirriborroak", empty: "Kargatu osatu gabeko Excel bat edo ireki zirriborro bat beste egun batean jarraitzeko.",
    rows: "Errenkadak", unique: "Aurreikusitako bakarrak", duplicates: "Ebatzi gabeko bikoiztuak", noTeam: "Talderik gabe", noCategory: "Kategorarik gabe", noMode: "Modalitaterik gabe",
    incidents: "Gorabeherak", october: "Urrirako zain", capacity: "Edukiera gaindituta", preparation: "Prestaketa",
    filter: "Jokalaria bilatu", allCategories: "Kategoria guztiak", allTeams: "Talde guztiak", selected: "hautatuta", selectVisible: "Hautatu ikusgai dauden guztiak", clearSelection: "Hautaketa guztia kendu", age: "Adina", previousTeam: "Aurreko taldea", allStates: "Egoera guztiak", withIncidents: "Gorabeherekin", ready: "Gorabeherarik gabe",
    ...MODALITY_CONTROL_COPY.eu,
    bulk: "Esleipen masiboa", team: "Taldea", category: "Kategoria", modality: "Modalitatea", apply: "Aplikatu",
    suggestion: "Kategoriaren araberako behin-behineko iradokizuna; administratzaileak baieztatu behar du", acceptSuggestion: "Onartu iradokizuna hautatutakoentzat",
    chooseModality: "Hautatu modalitate bat", chooseCategory: "Hautatu kategoria bat", chooseTeamCategory: "Iragazi kategoriaren arabera", chooseTeam: "Hautatu talde bat", confirmAssignment: "{value} hautatutako {count} erregistrori aplikatzea baieztatzen duzu?", assignmentApplied: "Esleipena {count} erregistrori aplikatu zaie.", assignmentError: "Ezin izan da esleipena aplikatu.", importedSuggestion: "Inportatutako behin-behineko balioa; administratzaileak baieztatu behar du",
    octoberHelp: "Hautatu zehazki 54 historiko. Sistemak ez ditu automatikoki aukeratzen.",
    bankPending: "Banku-datuak osatu gabe", bankValid: "IBAN balioztatua eta zifratua", edit: "Zuzendu", delete: "Zirriborroa ezabatu",
    confirmDelete: "Aldi baterako zirriborro hau ezabatu? Datu ofizialak ez dira aldatuko.",
    saveContinue: "Aldaketak automatikoki gordetzen dira", final: "Azken inportazioa", finalConfirm: "Azken inportazioa espresuki baieztatzen dut.",
    blocked: "Azken inportazioa blokeatuta dago nahitaezko erabakiak geratzen diren bitartean.",
    duplicateTitle: "Bikoiztuak ebatzi", keepFirst: "Lehena gorde", keepSecond: "Bigarrena gorde", merge: "Batu", different: "Pertsona desberdinak",
    incidentTitle: "Ebatzi gabeko gorabeherak", corrected: "Zuzenduta", notApplicable: "Ez dagokio", history: "Inportazioen historia", undo: "Desegin",
    noOriginal: "Jatorrizko Excel fitxategia ez da gordetzen. Baliozko IBANak zifratu egiten dira eta ez dira inoiz osorik erakusten.",
    historicalMode: "Datu-base historikoa: prestaketa segurua", historicalHelp: "Arau automatikoek modalitatea bakarrik osatzen dute kategoriatik. Talde, posta eta familia pendienteak berrikusteko gordetzen dira, hasierako oinarria blokeatu gabe.", readiness: "Aplikatu arau seguruak zirriborroan", readinessApplied: "Arau seguruak aplikatu dira: modalitateak osatu eta abisuak gorde dira.",
    importableNow: "Orain inportagarriak", teamPendingImportable: "Taldea pendiente", emailPendingImportable: "Posta pendiente", familyReview: "Berrikusteko familiak", fuzzyBlocked: "Bat-etortze lausoagatik blokeatuak", leavePending: "Utzi pendiente", traceability: "Trazabilitate automatikoa",
    fuzzy: "Antzeko bat-etortzeak", families: "Familia hautagaiak", auxiliary: "Errenkada osagarriak", formulas: "Materializatutako formulak",
    quality: "Kalitatea eta simulazioa", creates: "Proposatutako altak", officialWrites: "Idazketa ofizialak", reviewSame: "Pertsona bera", reviewDifferent: "Pertsona desberdinak", reviewShared: "Familia partekatua", reviewSeparate: "Bereizita mantendu",
  },
};

const SUMMARY_CARDS = [
  ["rows_received", "rows"], ["unique_expected", "unique"], ["duplicates_pending", "duplicates"],
  ["missing_team", "noTeam"], ["missing_category", "noCategory"], ["missing_modality", "noMode"], ["incidents_pending", "incidents"],
  ["october_selected", "october"], ["teams_over_capacity", "capacity"], ["preparation_percent", "preparation"],
];
const HISTORICAL_SUMMARY_CARDS = [
  ["rows_received", "rows"], ["unique_expected", "unique"], ["duplicates_pending", "duplicates"],
  ["missing_team", "noTeam"], ["missing_category", "noCategory"], ["missing_modality", "noMode"], ["incidents_pending", "incidents"],
  ["fuzzy_matches_pending", "fuzzy"], ["family_candidates_pending", "families"], ["preparation_percent", "preparation"],
];

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};

export default function InscriptionImportWizard({ open, onOpenChange, onImported }) {
  const { lang } = useI18n(); const c = IMPORT_PREPARATION_COPY[lang] || IMPORT_PREPARATION_COPY.es;
  const [file, setFile] = useState(null); const [drafts, setDrafts] = useState([]); const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [status, setStatus] = useState(""); const [modalities, setModalities] = useState([]); const [existingCategories, setExistingCategories] = useState([]); const [existingTeams, setExistingTeams] = useState([]);
  const [selected, setSelected] = useState([]); const [filters, setFilters] = useState({ query: "", category: "", team: "" });
  const [bulk, setBulk] = useState({ field: "equipo", value: "", category: "" }); const [express, setExpress] = useState(false);
  const records = (draft?.records || []).filter((record) => record.active !== false);
  const historical = draft?.source_format === "historical_bbdd_v1";
  const summaryCards = historical ? HISTORICAL_SUMMARY_CARDS : SUMMARY_CARDS;
  const visible = useMemo(() => filterPreparationRecords(records, filters, modalities), [records, filters, modalities]);
  const categories = useMemo(() => [...new Set(records.map((r) => r.categoria).filter(Boolean))].sort(), [records]);
  const teams = useMemo(() => [...new Set(records.map((r) => r.equipo).filter(Boolean))].sort(), [records]);
  const previousTeams = useMemo(() => [...new Set(records.map((r) => r.equipo_anterior).filter(Boolean))].sort(), [records]);
  const availableBulkTeams = useMemo(() => teamsForCategory(existingTeams, bulk.category), [existingTeams, bulk.category]);
  const modalityDisabledReason = bulk.field === "modalidad" ? modalityAssignmentDisabledReason(selected, bulk.value, modalities) : "";
  const changeFilters = (patch) => {
    const next = applyPreparationFilterChange(filters, patch);
    setFilters(next.filters); setSelected(next.selected);
  };

  const loadLists = async () => {
    const [draftResponse, historyResponse, modalityResponse, categoryResponse, teamResponse] = await Promise.all([api.get("/inscription-imports/staging"), api.get("/inscription-imports/history"), api.get("/modalities"), api.get("/categories"), api.get("/teams")]);
    setDrafts(draftResponse.data); setHistory(historyResponse.data); setModalities(activeModalitiesFromApi(modalityResponse.data)); setExistingCategories(existingCategoriesFromApi(categoryResponse.data)); setExistingTeams(activeTeamsFromApi(teamResponse.data));
  };
  useEffect(() => { if (open) loadLists().catch(() => setError("No se pudieron cargar los borradores.")); }, [open]);
  const openDraft = async (id) => { setBusy(true); setError(""); try { setDraft((await api.get(`/inscription-imports/staging/${id}`)).data); setSelected([]); } catch (e) { setError(e.response?.data?.detail || "Error"); } finally { setBusy(false); } };
  const upload = async () => {
    if (!file) return; setBusy(true); setError("");
    try { const body = new FormData(); body.append("file", file); body.append("season", "2026-2027"); const response = await api.post("/inscription-imports/staging", body); setDraft(response.data); setFile(null); await loadLists(); }
    catch (e) { setError(e.response?.data?.detail || "No se pudo preparar el archivo."); } finally { setBusy(false); }
  };
  const template = async () => { const response = await api.get("/inscription-imports/template", { responseType: "blob" }); downloadBlob(response.data, "plantilla_inscripciones_2026-2027.xlsx"); };
  const refresh = (response) => { setDraft(response.data); setExpress(false); };
  const updateField = async (record, field) => {
    if (["modalidad", "categoria", "equipo"].includes(field)) {
      const team = existingTeams.find((item) => item.id === record.equipo_id || (item.nombre === record.equipo && item.categoria === record.categoria));
      const value = field === "modalidad" ? (modalities.some((item) => item.code === record.modalidad) ? record.modalidad : "") : field === "categoria" ? (existingCategories.includes(record.categoria) ? record.categoria : "") : (team?.id || "");
      setSelected([record.id]); setBulk({ field, value, category: field === "equipo" ? (record.categoria || "") : "" });
      return;
    }
    const value = window.prompt(`${c.edit}: ${field}`, field === "iban" ? "" : (record[field] || ""));
    if (value === null) return;
    try { refresh(await api.patch(`/inscription-imports/staging/${draft.id}/records/${record.id}`, { field, value })); }
    catch (e) { setError(e.response?.data?.detail || "No se pudo guardar."); }
  };
  const applyBulk = async (field = bulk.field, value = bulk.value, ids = selected) => {
    if (!ids.length || !value) return;
    const officialValue = field === "modalidad" ? officialModalityCode(value, modalities) : value;
    if (field === "modalidad" && !officialValue) { setError(c.assignmentError); return; }
    const modality = modalities.find((item) => item.code === officialValue); const team = existingTeams.find((item) => item.id === officialValue);
    const displayValue = field === "modalidad" ? modalityOptionLabel(modality, lang) : field === "equipo" ? team?.nombre : value;
    const confirmation = c.confirmAssignment.replace("{value}", displayValue || "").replace("{count}", ids.length);
    const needsConfirmation = field === "modalidad" || (historical && ["categoria", "equipo"].includes(field));
    const confirmSuggestion = !needsConfirmation || (Boolean(displayValue) && window.confirm(confirmation));
    if (!confirmSuggestion) return;
    setError(""); setStatus("");
    try { refresh(await api.post(`/inscription-imports/staging/${draft.id}/bulk`, { record_ids: ids, field, value: officialValue, confirm_suggestion: confirmSuggestion })); setSelected([]); setStatus(c.assignmentApplied.replace("{count}", ids.length)); }
    catch (e) { setError(e.response?.data?.detail || c.assignmentError); }
  };
  const resolveDuplicate = async (group, decision) => { refresh(await api.post(`/inscription-imports/staging/${draft.id}/duplicates/${group.id}`, { decision })); };
  const resolveHistorical = async (kind, group, decision) => { refresh(await api.post(`/inscription-imports/staging/${draft.id}/reviews/${kind}/${group.id}`, { decision })); };
  const toggleOctober = async (id) => {
    const current = new Set(selectedOctoberIds(records)); current.has(id) ? current.delete(id) : current.add(id);
    try { refresh(await api.post(`/inscription-imports/staging/${draft.id}/october`, { record_ids: [...current] })); }
    catch (e) { setError(e.response?.data?.detail || "No se pudo guardar la selección."); }
  };
  const resolveIncident = async (incident, resolution) => { refresh(await api.patch(`/inscription-imports/staging/${draft.id}/incidents/${incident.id}`, { resolution })); };
  const applyHistoricalReadiness = async () => {
    setBusy(true); setError("");
    try { refresh(await api.post(`/inscription-imports/staging/${draft.id}/historical-readiness`)); setSelected([]); setStatus(c.readinessApplied); }
    catch (e) { setError(e.response?.data?.detail || c.assignmentError); } finally { setBusy(false); }
  };
  const removeDraft = async () => { if (!window.confirm(c.confirmDelete)) return; await api.delete(`/inscription-imports/staging/${draft.id}`); setDraft(null); await loadLists(); };
  const finalize = async () => {
    if (!canFinalizeDraft(draft, express)) return; setBusy(true);
    try { await api.post(`/inscription-imports/staging/${draft.id}/confirm`, { confirmed: true }); toast.success(c.final); setDraft(null); await loadLists(); onImported?.(); }
    catch (e) { setError(e.response?.data?.detail || "No se pudo completar la importación."); } finally { setBusy(false); }
  };
  const undo = async (job) => { if (!window.confirm(c.undo)) return; await api.post(`/inscription-imports/${job.id}/undo`); await loadLists(); onImported?.(); };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[96vh] w-[calc(100vw-0.75rem)] max-w-7xl overflow-y-auto overflow-x-hidden" data-testid="import-preparation-dialog">
      <DialogHeader><DialogTitle className="flex items-center gap-2 pr-8 font-heading"><FileSpreadsheet className="h-5 w-5 text-primary" />{c.title}</DialogTitle><DialogDescription>{c.description}</DialogDescription></DialogHeader>
      <div className="grid gap-3 rounded-2xl border bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_160px_220px] lg:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-semibold">{c.file}<input data-testid="staging-file" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="min-h-11 w-full min-w-0 max-w-full rounded-xl border bg-white p-2" /></label>
        <label className="grid gap-1 text-sm font-semibold">{c.season}<input value="2026-2027" readOnly className="h-11 rounded-xl border bg-white px-3" /></label>
        <Button data-testid="create-staging" onClick={upload} disabled={!file || busy} className="h-11 w-full"><Upload className="h-4 w-4" />{c.upload}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={template}><Download className="h-4 w-4" />{c.template}</Button><span className="rounded-xl bg-[#EAF6FD] px-3 py-2 text-xs text-[#0E3554]">{c.noOriginal}</span></div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {status && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{status}</div>}
      <section aria-labelledby="drafts-title"><h3 id="drafts-title" className="mb-2 font-heading font-bold">{c.drafts}</h3><div className="flex gap-2 overflow-x-auto pb-1">{drafts.map((item) => <Button key={item.id} variant={draft?.id === item.id ? "default" : "outline"} onClick={() => openDraft(item.id)} className="shrink-0">{item.season} · {item.summary.rows_received} · {item.summary.preparation_percent}%</Button>)}</div></section>
      {!draft ? <div className="rounded-2xl border-2 border-dashed p-8 text-center text-slate-500">{busy ? "…" : c.empty}</div> : <>
        {historical && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"><p className="font-bold">{c.historicalMode}</p><p className="mt-1">{c.historicalHelp}</p><Button className="mt-3" onClick={applyHistoricalReadiness} disabled={busy}>{c.readiness}</Button></div>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">{summaryCards.map(([key, label]) => <div key={key} className={`rounded-xl border p-3 ${key === "preparation_percent" ? "bg-[#EAF6FD]" : "bg-white"}`}><p className="text-xs text-slate-500">{c[label]}</p><p className="text-xl font-bold">{draft.summary[key]}{key === "october_selected" ? "/54" : key === "preparation_percent" ? "%" : ""}</p></div>)}</div>
        {historical && <section className="rounded-2xl border p-4" aria-label={c.quality}><h3 className="mb-3 font-heading font-bold">{c.quality}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{[
          [c.creates, draft.simulation?.proposed_creates], [c.fuzzy, draft.quality?.fuzzy_match_pairs], [c.families, draft.quality?.family_candidate_groups],
          [c.auxiliary, draft.quality?.auxiliary_rows_excluded], [c.formulas, draft.quality?.materialized_formula_cells], [c.officialWrites, draft.simulation?.official_writes],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value ?? 0}</p></div>)}</div></section>}
        {historical && <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4" aria-label={c.traceability}><h3 className="mb-3 font-heading font-bold">{c.traceability}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{[
          [c.importableNow, draft.summary.importable_now], [c.teamPendingImportable, draft.summary.importable_with_team_pending],
          [c.emailPendingImportable, draft.summary.importable_with_email_pending], [c.familyReview, draft.summary.families_suggested_for_review],
          [c.fuzzyBlocked, draft.summary.blocked_fuzzy_groups],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-white p-3"><p className="text-xs text-slate-600">{label}</p><p className="text-xl font-bold">{value ?? 0}</p></div>)}</div></section>}
        {historical && draft.fuzzy_matches?.some(isUnresolvedFuzzyMatch) && <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" aria-labelledby="fuzzy-review-title">
          <h3 id="fuzzy-review-title" className="mb-2 font-heading font-bold">{c.fuzzy}</h3>
          <p className="mb-3 text-sm text-amber-900">{c.blocked}</p>
          <div className="grid gap-2">{draft.fuzzy_matches.filter(isUnresolvedFuzzyMatch).map((group) => <div key={group.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm"><span>{group.record_ids.length} · {Math.round((group.score || 0) * 100)}%</span><span className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => resolveHistorical("fuzzy", group, "same_person")}>{c.reviewSame}</Button><Button size="sm" variant="outline" onClick={() => resolveHistorical("fuzzy", group, "different_people")}>{c.reviewDifferent}</Button><Button size="sm" variant="ghost" onClick={() => resolveHistorical("fuzzy", group, "leave_pending")}>{c.leavePending}</Button></span></div>)}</div>
        </section>}
        {draft.summary.teams_over_capacity > 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{draft.summary.capacities.filter((x) => x.over_capacity).map((x) => `${x.team}: ${x.count}/${x.limit}`).join(" · ")}</div>}
        <section className="rounded-2xl border bg-slate-50 p-3" aria-labelledby="preparation-filters-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 id="preparation-filters-title" className="font-heading font-bold">{c.filtersTitle}</h3><p role="status" aria-live="polite" className="rounded-full bg-white px-3 py-1 text-sm font-semibold">{visible.length} {c.results}</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7"><input aria-label={c.filter} placeholder={c.filter} value={filters.query} onChange={(e) => changeFilters({query: e.target.value})} className="h-11 rounded-xl border px-3" /><select aria-label={c.category} value={filters.category} onChange={(e) => changeFilters({category: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.allCategories}</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label={c.team} value={filters.team} onChange={(e) => changeFilters({team: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.allTeams}</option><option value="__missing__">{c.noTeam}</option>{teams.map((value) => <option key={value}>{value}</option>)}</select><select aria-label={c.modalityFilter} value={filters.modality || ""} onChange={(e) => changeFilters({modality: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.allModalities}</option>{modalities.map((item) => <option key={item.code} value={item.code}>{modalityOptionLabel(item, lang)}</option>)}<option value="__missing__">{c.withoutModality}</option></select><input aria-label={c.age} type="number" min="4" max="30" placeholder={c.age} value={filters.age || ""} onChange={(e) => changeFilters({age: e.target.value})} className="h-11 rounded-xl border px-3" /><select aria-label={c.previousTeam} value={filters.previousTeam || ""} onChange={(e) => changeFilters({previousTeam: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.previousTeam}</option>{previousTeams.map((value) => <option key={value}>{value}</option>)}</select><select aria-label={c.allStates} value={filters.status || ""} onChange={(e) => changeFilters({status: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.allStates}</option><option value="incidents">{c.withIncidents}</option><option value="ready">{c.ready}</option></select></div></section>
        <section className="rounded-2xl border border-[#93C8EE] bg-[#EAF6FD]/50 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading font-bold" aria-live="polite">{c.bulk} · {selected.length} {c.selected}</h3><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSelected(selectVisiblePreparationRecords(visible))} disabled={!visible.length}>{c.selectVisible}</Button><Button type="button" variant="outline" onClick={() => setSelected(clearPreparationSelection())} disabled={!selected.length}>{c.clearSelection}</Button></div></div><div className="grid gap-2 sm:grid-cols-[180px_repeat(2,minmax(0,1fr))_auto]"><select aria-label={c.bulk} value={bulk.field} onChange={(e) => setBulk({field: e.target.value, value: "", category: ""})} className="h-11 rounded-xl border px-3"><option value="equipo">{c.team}</option><option value="categoria">{c.category}</option><option value="modalidad">{c.assignModality}</option></select>{bulk.field === "modalidad" ? <label className="grid gap-1 text-xs font-semibold sm:col-span-2"><span>{c.assignModality}</span><select aria-label={c.assignModality} value={bulk.value} onChange={(e) => setBulk({...bulk, value: e.target.value})} className="h-11 rounded-xl border bg-white px-3"><option value="">{c.chooseModality}</option>{modalities.map((item) => <option key={item.code} value={item.code}>{modalityOptionLabel(item, lang)}</option>)}</select></label> : historical && bulk.field === "categoria" ? <select aria-label={c.category} value={bulk.value} onChange={(e) => setBulk({...bulk, value: e.target.value})} className="h-11 rounded-xl border px-3 sm:col-span-2"><option value="">{c.chooseCategory}</option>{existingCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select> : historical && bulk.field === "equipo" ? <><select aria-label={c.chooseTeamCategory} value={bulk.category} onChange={(e) => setBulk({...bulk, category: e.target.value, value: ""})} className="h-11 rounded-xl border px-3"><option value="">{c.chooseTeamCategory}</option>{existingCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select><select aria-label={c.team} value={bulk.value} onChange={(e) => setBulk({...bulk, value: e.target.value})} className="h-11 rounded-xl border px-3"><option value="">{c.chooseTeam}</option>{availableBulkTeams.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></> : <input value={bulk.value} onChange={(e) => setBulk({...bulk, value: e.target.value})} className="h-11 rounded-xl border px-3 sm:col-span-2" />}<Button onClick={() => applyBulk()} disabled={!canApplyPreparationBulk(selected, bulk, modalities, existingCategories, existingTeams, records, historical)}>{c.apply}</Button></div>{modalityDisabledReason && <p className="mt-2 text-sm text-amber-800" role="status">{modalityDisabledReason === "selection" ? c.selectRecordsReason : c.selectModalityReason}</p>}</section>
        <div className="grid max-h-[38vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">{visible.map((record) => { const suggested = modalities.find((item) => item.code === record.modality_suggestion); return <article key={record.id} className="rounded-2xl border bg-white p-3" data-testid="staging-record"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`${c.selected} ${record.source_row}`} checked={selected.includes(record.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} className="mt-1 h-5 w-5" /><div className="min-w-0 flex-1"><p className="truncate font-bold">{record.nombre} {record.apellidos}</p><p className="text-xs text-slate-500">#{record.source_row} · {record.categoria || c.noMode} · {record.equipo || c.noTeam} · {record.modalidad || "—"}</p>{!record.modalidad && suggested && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-900"><span>{c.suggestion}: <b>{modalityOptionLabel(suggested, lang)}</b></span><Button size="sm" variant="outline" onClick={() => applyBulk("modalidad", suggested.code, [record.id])}>{c.acceptSuggestion}</Button></div>}<div className="mt-2 flex flex-wrap gap-1">{(record.equipamiento_items || []).map((item) => <span key={item} className="rounded-full bg-violet-50 px-2 py-1 text-xs">{item}</span>)}</div><p className={`mt-2 text-xs ${record.bank_status === "valid" ? "text-emerald-700" : "text-amber-700"}`}>{record.bank_status === "valid" ? `${c.bankValid}: ${record.iban_masked}` : c.bankPending}</p><div className="mt-2 flex flex-wrap gap-1">{["equipo", "categoria", "modalidad", "progenitor1_telefono", "progenitor1_email", "talla_camiseta", "iban"].map((field) => <Button key={field} size="sm" variant="ghost" onClick={() => updateField(record, field)}><Pencil className="h-3 w-3" />{field}</Button>)}</div></div>{!historical && <label className="flex shrink-0 flex-col items-center gap-1 text-[10px]"><input type="checkbox" checked={record.selected_october} disabled={!record.october_eligible} onChange={() => toggleOctober(record.id)} className="h-5 w-5" />Oct.</label>}</div></article>; })}</div>
        {!historical && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{c.octoberHelp}</p>}
        {historical && <section><h3 className="mb-2 font-heading font-bold">{c.families}</h3>{draft.family_candidates?.filter((item) => !item.decision).slice(0, 20).map((group) => <div key={group.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span>{group.record_ids.length} · {group.signals?.length || 0}</span><span className="flex gap-1"><Button size="sm" variant="outline" onClick={() => resolveHistorical("family", group, "confirm_shared")}>{c.reviewShared}</Button><Button size="sm" variant="ghost" onClick={() => resolveHistorical("family", group, "keep_separate")}>{c.reviewSeparate}</Button></span></div>)}</section>}
        {draft.duplicates?.some((item) => !item.decision) && <section><h3 className="mb-2 flex items-center gap-2 font-heading font-bold"><Users className="h-4 w-4" />{c.duplicateTitle}</h3><div className="space-y-2">{draft.duplicates.filter((item) => !item.decision).map((group) => <div key={group.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><span>{group.record_ids.length} · #{group.record_ids.map((id) => records.find((r) => r.id === id)?.source_row).join(", #")}</span><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => resolveDuplicate(group, "keep_first")}>{c.keepFirst}</Button><Button size="sm" variant="outline" onClick={() => resolveDuplicate(group, "keep_second")}>{c.keepSecond}</Button><Button size="sm" variant="outline" onClick={() => resolveDuplicate(group, "merge")}>{c.merge}</Button><Button size="sm" variant="outline" onClick={() => resolveDuplicate(group, "different_people")}>{c.different}</Button></div></div>)}</div></section>}
        <section><h3 className="mb-2 flex items-center gap-2 font-heading font-bold"><AlertTriangle className="h-4 w-4" />{c.incidentTitle}</h3><div className="grid gap-2 sm:grid-cols-2">{draft.incidents?.filter((item) => item.resolution === "pending").slice(0, 100).map((incident) => <div key={incident.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span>#{incident.source_row} · {incident.field} · {incident.code}</span><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => resolveIncident(incident, "corrected")}>{c.corrected}</Button>{!incident.blocking && <Button size="sm" variant="ghost" onClick={() => resolveIncident(incident, "not_applicable")}>{c.notApplicable}</Button>}</div></div>)}</div></section>
        <div className="rounded-2xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 font-semibold"><Save className="h-4 w-4" />{c.saveContinue}</p>{!draft.summary.can_import && <p className="mt-1 text-sm text-amber-700">{c.blocked} ({draft.summary.blocking_count})</p>}</div><Button variant="destructive" onClick={removeDraft}><Trash2 className="h-4 w-4" />{c.delete}</Button></div><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="mt-1 h-4 w-4" />{c.finalConfirm}</label><Button data-testid="finalize-staging" className="mt-3 w-full sm:w-auto" disabled={!canFinalizeDraft(draft, express) || busy} onClick={finalize}><CheckCircle2 className="h-4 w-4" />{c.final}</Button></div>
      </>}
      <section className="border-t pt-4"><h3 className="mb-2 flex items-center gap-2 font-heading font-bold"><History className="h-4 w-4" />{c.history}</h3>{history.map((job) => <div key={job.id} className="mb-2 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>{job.season} · {job.status} · {job.created_at?.slice(0, 16)}</span>{job.status === "applied" && <Button size="sm" variant="outline" onClick={() => undo(job)}><RotateCcw className="h-4 w-4" />{c.undo}</Button>}</div>)}</section>
    </DialogContent>
  </Dialog>;
}
