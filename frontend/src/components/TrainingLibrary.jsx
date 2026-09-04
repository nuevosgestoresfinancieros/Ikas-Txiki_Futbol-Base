import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, FileText, RefreshCcw, Search } from "lucide-react";
import api, { API } from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectField } from "@/components/form";
import { EmptyState } from "@/components/shared";

const emptyFilters = { search: "", block: "all", subblock: "all" };

export default function TrainingLibrary({ onUse, canSync = false }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const selectedBlock = meta?.categories?.find((entry) => entry.value === filters.block);
  const subblockOptions = useMemo(() => [
    { value: "all", label: t("allTrainingSubblocks") },
    ...(selectedBlock?.subblocks || []).map((entry) => ({ value: entry.value, label: `${entry.label} (${entry.count})` })),
  ], [selectedBlock, t]);

  const loadMeta = async () => {
    const response = await api.get("/training-library/meta");
    setMeta(response.data);
  };

  const load = async (targetPage = page) => {
    setLoading(true); setError("");
    try {
      const response = await api.get("/training-library", {
        params: {
          page: targetPage, page_size: 24, search: filters.search,
          block: filters.block, subblock: filters.subblock,
        },
      });
      setItems(response.data.items || []); setPage(response.data.page || targetPage);
    } catch { setError(t("trainingLibraryLoadError")); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadMeta().catch(() => setError(t("trainingLibraryLoadError")));
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.block, filters.subblock]);

  const sync = async () => {
    setLoading(true);
    try { await api.post("/training-library/sync"); await loadMeta(); await load(1); }
    catch (syncError) { setError(syncError.response?.data?.detail || t("trainingLibrarySyncError")); setLoading(false); }
  };

  const updateFilter = (key, value) => setFilters((current) => ({
    ...current, [key]: value, ...(key === "block" ? { subblock: "all" } : {}),
  }));
  const totalPages = Math.max(1, Math.ceil((meta?.total || 0) / 24));

  return <section aria-labelledby="training-library-title">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="training-library-title" className="font-heading text-xl font-bold text-slate-900">{t("preparedTrainingLibrary")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("preparedTrainingLibraryDescription")}</p>
      </div>
      {canSync && <Button variant="outline" size="sm" onClick={sync} disabled={loading}>
        <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("refreshTrainingLibrary")}
      </Button>}
    </div>

    <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-3">
      <label className="relative block text-sm font-medium text-slate-700">{t("search")}
        <Search className="absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
        <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3" data-testid="training-library-search" />
      </label>
      <SelectField label={t("trainingBlock")} value={filters.block} onChange={(value) => updateFilter("block", value)}
        options={[{ value: "all", label: t("allTrainingBlocks") }, ...(meta?.categories || []).map((entry) => ({ value: entry.value, label: `${entry.label} (${entry.count})` }))]} />
      <SelectField label={t("trainingSubblock")} value={filters.subblock} onChange={(value) => updateFilter("subblock", value)} options={subblockOptions} />
    </div>

    {meta && <p className="mb-3 text-sm text-slate-500" aria-live="polite">
      {t("preparedTrainingCount")}: {meta.total}{meta.expected && meta.expected !== meta.total ? ` · ${t("catalogExpected")}: ${meta.expected}` : ""}
    </p>}
    {error ? <div className="surface-card flex items-center justify-between p-5 text-red-700"><span>{error}</span><Button variant="outline" onClick={() => { loadMeta().catch(() => {}); load(page); }}>{t("retry")}</Button></div>
      : loading && !items.length ? <div className="surface-card p-8 text-center text-slate-500">{t("loading")}</div>
        : !items.length ? <EmptyState icon={BookOpen} message={t("noPreparedTrainings")} />
          : <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => <article key={item.id} className="surface-card flex flex-col p-4" data-testid={`prepared-training-${item.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                  <div className="min-w-0"><h3 className="line-clamp-3 font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-xs font-medium text-primary">{item.block_label}{item.subblock_label ? ` · ${item.subblock_label}` : ""}</p></div>
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-slate-500">{item.filename}</p>
                <div className="mt-auto flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(item)}><Eye className="h-4 w-4" />{t("viewPdf")}</Button>
                  {onUse && <Button size="sm" onClick={() => onUse(item)}>{t("usePreparedTraining")}</Button>}
                </div>
              </article>)}
            </div>
            {totalPages > 1 && <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>{t("previous")}</Button>
              <span className="text-slate-500">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>{t("next")}</Button>
            </div>}
          </>}

    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-hidden">
        <DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>{preview?.block_label}{preview?.subblock_label ? ` · ${preview.subblock_label}` : ""}</DialogDescription></DialogHeader>
        {preview && <iframe title={`${t("viewPdf")}: ${preview.title}`} src={`${API}/training-library/${preview.id}/file`} className="h-[68vh] w-full rounded-lg border border-slate-200 bg-slate-100" />}
        <DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>{t("close")}</Button>{preview && onUse && <Button onClick={() => { onUse(preview); setPreview(null); }}>{t("usePreparedTraining")}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
