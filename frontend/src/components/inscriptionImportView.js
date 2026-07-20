export const SUMMARY_ORDER = ["create", "update", "duplicate", "conflict", "error", "unchanged"];

export const unresolvedConflictIds = (analysis, decisions = {}) =>
  (analysis?.rows || [])
    .filter((row) => row.status === "conflict" && decisions[row.conflict_id] !== "skip")
    .map((row) => row.conflict_id);

export const canConfirmImport = (analysis, decisions, expresslyConfirmed) =>
  Boolean(
    analysis && expresslyConfirmed && analysis.blocking_errors === 0 &&
    unresolvedConflictIds(analysis, decisions).length === 0 && !analysis.duplicate_file
  );
