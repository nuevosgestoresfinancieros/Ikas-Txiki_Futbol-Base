import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/api";
import FamilyDuplicateReview from "./FamilyDuplicateReview";
jest.mock("@/api", () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; api.get.mockResolvedValue({ data: { candidates: [{ candidate_id: "a:b", confidence: "high", reasons: ["Coinciden ambos progenitores"], proposed_primary_family_id: "a", merge_allowed: true, left: { family_id: "a", progenitor1: { nombre: "Ana" }, progenitor2: {}, jugadores: [], cuentas: [] }, right: { family_id: "b", progenitor1: { nombre: "Ana" }, progenitor2: {}, jugadores: [], cuentas: [] } }] } }); });
afterEach(() => { global.IS_REACT_ACT_ENVIRONMENT = false; });
test("renders comparison without secret material", async () => { const host = document.createElement("div"); const root = createRoot(host); await act(async () => root.render(<FamilyDuplicateReview />)); await act(async () => { await Promise.resolve(); }); expect(host.textContent).toContain("Revisar duplicados"); expect(host.textContent).toContain("Alta confianza"); expect(host.textContent).not.toMatch(/password|token|https?:\/\//i); await act(async () => root.unmount()); });


test("filters historical partial matches and reports the strong candidate count", async () => { api.get.mockResolvedValueOnce({ data: { candidates: [{ candidate_id: "partial", confidence: "partial", merge_allowed: false }, { candidate_id: "strong", confidence: "high", merge_allowed: true, reasons: ["Coinciden ambos progenitores"], proposed_primary_family_id: "a", left: { family_id: "a", jugadores: [], cuentas: [] }, right: { family_id: "b", jugadores: [], cuentas: [] } }] } }); const host = document.createElement("div"); const root = createRoot(host); await act(async () => root.render(<FamilyDuplicateReview />)); await act(async () => { await Promise.resolve(); }); expect(host.textContent).toContain("Candidatos de alta confianza: 1"); expect(host.querySelector('[data-testid="duplicate-partial"]')).toBeNull(); await act(async () => root.unmount()); });

test("shows the required empty state when no strong candidates remain", async () => { api.get.mockResolvedValueOnce({ data: { candidates: [{ candidate_id: "partial", confidence: "partial", merge_allowed: false }] } }); const host = document.createElement("div"); const root = createRoot(host); await act(async () => root.render(<FamilyDuplicateReview />)); await act(async () => { await Promise.resolve(); }); expect(host.textContent).toContain("No hay duplicados familiares para revisar."); await act(async () => root.unmount()); });
