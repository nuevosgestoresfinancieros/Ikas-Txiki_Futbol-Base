import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { STATUS_LABELS, useI18n } from "@/i18n";
import { Field, Area, SelectField, SwitchField } from "@/components/form";
import { initials } from "@/components/shared";
import { optimizeImage } from "@/lib/image";

const empty = {
  nombre: "", apellidos: "", estado: "pendiente_documentacion", estado_documental: "pendiente",
  nueva_incorporacion: false, segundo_hermano: false, equipacion_entregada: false, descuento: 0,
};

const PlayerDialog = ({ open, onClose, player, teams, onSaved }) => {
  const { t, lang } = useI18n();
  const [form, setForm] = useState(empty);
  const [tab, setTab] = useState("personal");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(player ? { ...empty, ...player } : empty);
    setTab("personal");
    setNameError("");
    setDirty(false);
  }, [player, open]);

  const set = (k) => (v) => {
    setDirty(true);
    if (k === "nombre") setNameError("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set("foto")(await optimizeImage(file, { maxSize: 900, quality: 0.82 }));
    } catch {
      toast.error(lang === "eu" ? "Ezin izan da irudia prozesatu" : "No se ha podido procesar la imagen");
    }
  };

  const save = async () => {
    if (!form.nombre?.trim()) {
      setNameError(lang === "eu" ? "Izena nahitaezkoa da." : "El nombre es obligatorio.");
      setTab("personal");
      return;
    }
    setSaving(true);
    try {
      if (player?.id) await api.put(`/players/${player.id}`, form);
      else await api.post("/players", form);
      toast.success(t("saved"));
      setDirty(false);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(lang === "eu" ? "Errorea gordetzean" : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty && !window.confirm(lang === "eu" ? "Gorde gabeko aldaketak galdu nahi dituzu?" : "¿Quieres descartar los cambios sin guardar?")) return;
    onClose();
  };

  const teamOptions = [{ value: "none", label: t("none") }, ...teams.map((tm) => ({ value: tm.id, label: tm.nombre }))];
  const statusLabel = (status) => STATUS_LABELS[lang]?.[status] || status;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {player?.id ? `${form.nombre} ${form.apellidos || ""}` : t("newPlayer")}
            {form.categoria && <span className="ml-2 text-sm font-normal text-primary">· {form.categoria}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("playerDialogDescription")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid h-auto grid-cols-3 gap-1 sm:grid-cols-7">
            <TabsTrigger value="personal" data-testid="tab-personal">{t("tabPersonal")}</TabsTrigger>
            <TabsTrigger value="sport" data-testid="tab-sport">{t("tabSport")}</TabsTrigger>
            <TabsTrigger value="family" data-testid="tab-family">{t("tabFamily")}</TabsTrigger>
            <TabsTrigger value="health" data-testid="tab-health">{t("tabHealth")}</TabsTrigger>
            <TabsTrigger value="kit" data-testid="tab-kit">{t("tabKit")}</TabsTrigger>
            <TabsTrigger value="docs" data-testid="tab-docs">{t("tabDocs")}</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4 pt-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {form.foto ? (
                  <img src={form.foto} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
                    {initials(form.nombre, form.apellidos)}
                  </div>
                )}
                <label title={t("photo")} className="absolute -bottom-2 -right-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-primary text-white shadow-md transition-colors hover:bg-primary/90">
                  <Camera className="h-4 w-4" />
                  <input data-testid="player-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-600">{t("photo")}</Label>
                <p className="text-xs text-slate-400">JPG / PNG</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("name")} value={form.nombre} onChange={set("nombre")} testid="player-nombre" required error={nameError} />
              <Field label={t("surname")} value={form.apellidos} onChange={set("apellidos")} testid="player-apellidos" />
              <Field label={t("birthdate")} type="date" value={form.fecha_nacimiento} onChange={set("fecha_nacimiento")} testid="player-fecha-nacimiento" />
              <Field label={t("school")} value={form.centro_escolar} onChange={set("centro_escolar")} testid="player-centro" />
              <Field label={t("enrollDate")} type="date" value={form.fecha_inscripcion?.slice(0,10)} onChange={set("fecha_inscripcion")} testid="player-fecha-inscripcion" />
              <Field label={t("formEmail")} type="email" value={form.email_formulario} onChange={set("email_formulario")} testid="player-email-form" />
              <div className="sm:col-span-2">
                <Field label={t("address")} value={form.domicilio} onChange={set("domicilio")} testid="player-domicilio" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sport" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField label={t("team")} value={form.equipo_id || "none"} onChange={(v) => set("equipo_id")(v === "none" ? "" : v)} options={teamOptions} testid="player-equipo" />
              <SelectField label={t("status")} value={form.estado} onChange={set("estado")}
                options={["activo","baja","lesionado","pendiente_documentacion","en_prueba"].map(s=>({value:s,label:statusLabel(s)}))} testid="player-estado" />
              <Field label={t("number")} value={form.dorsal} onChange={set("dorsal")} testid="player-dorsal" />
              <Field label={t("position")} value={form.posicion} onChange={set("posicion")} testid="player-posicion" />
              <Field label={t("license")} value={form.numero_licencia} onChange={set("numero_licencia")} testid="player-licencia" />
              <Field label={t("altaDate")} type="date" value={form.fecha_alta} onChange={set("fecha_alta")} testid="player-alta" />
              <Field label={t("bajaDate")} type="date" value={form.fecha_baja} onChange={set("fecha_baja")} testid="player-baja" />
              <Field label={t("discount")} type="number" value={form.descuento} onChange={set("descuento")} testid="player-descuento" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SwitchField label={t("newPlayerFlag")} checked={form.nueva_incorporacion} onChange={set("nueva_incorporacion")} testid="player-nueva" />
              <SwitchField label={t("secondSibling")} checked={form.segundo_hermano} onChange={set("segundo_hermano")} testid="player-hermano" />
            </div>
            <Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="player-observaciones" />
          </TabsContent>

          <TabsContent value="family" className="space-y-4 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("parent1")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("name")} value={form.progenitor1_nombre} onChange={set("progenitor1_nombre")} testid="p1-nombre" />
              <Field label={t("phone")} value={form.progenitor1_telefono} onChange={set("progenitor1_telefono")} testid="p1-tel" />
              <Field label={t("email")} value={form.progenitor1_email} onChange={set("progenitor1_email")} testid="p1-email" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 pt-2">{t("parent2")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("name")} value={form.progenitor2_nombre} onChange={set("progenitor2_nombre")} testid="p2-nombre" />
              <Field label={t("phone")} value={form.progenitor2_telefono} onChange={set("progenitor2_telefono")} testid="p2-tel" />
              <Field label={t("email")} value={form.progenitor2_email} onChange={set("progenitor2_email")} testid="p2-email" />
            </div>
          </TabsContent>

          <TabsContent value="health" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("allergies")} value={form.alergias} onChange={set("alergias")} testid="player-alergias" />
              <Field label={t("diseases")} value={form.enfermedades} onChange={set("enfermedades")} testid="player-enfermedades" />
              <Field label={t("medication")} value={form.medicacion} onChange={set("medicacion")} testid="player-medicacion" />
              <Field label={t("medicalInsurance")} value={form.seguro_medico} onChange={set("seguro_medico")} testid="player-seguro" />
              <Field label={t("emergencyContact")} value={form.contacto_emergencia} onChange={set("contacto_emergencia")} testid="player-emergencia" />
              <Field label={t("emergencyPhone")} value={form.telefono_emergencia} onChange={set("telefono_emergencia")} testid="player-tel-emergencia" />
            </div>
            <Area label={t("medicalNotes")} value={form.observaciones_medicas} onChange={set("observaciones_medicas")} testid="player-obs-medicas" />
          </TabsContent>

          <TabsContent value="kit" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 sm:grid-cols-3">
              <Field label={t("shirtSize")} value={form.talla_camiseta} onChange={set("talla_camiseta")} testid="kit-camiseta" />
              <Field label={t("pantsSize")} value={form.talla_pantalon} onChange={set("talla_pantalon")} testid="kit-pantalon" />
              <Field label={t("tracksuitSize")} value={form.talla_chandal} onChange={set("talla_chandal")} testid="kit-chandal" />
              <Field label={t("socksSize")} value={form.talla_medias} onChange={set("talla_medias")} testid="kit-medias" />
              <Field label={t("shoeSize")} value={form.talla_calzado} onChange={set("talla_calzado")} testid="kit-calzado" />
              <Field label={t("deliveryDate")} type="date" value={form.fecha_entrega_equipacion} onChange={set("fecha_entrega_equipacion")} testid="kit-fecha" />
            </div>
            <SwitchField label={t("kitDelivered")} checked={form.equipacion_entregada} onChange={set("equipacion_entregada")} testid="kit-entregada" />
            <Area label={t("kitNotes")} value={form.observaciones_material} onChange={set("observaciones_material")} testid="kit-obs" />
          </TabsContent>

          <TabsContent value="docs" className="space-y-3 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SwitchField label="DNI/NIE jugador" checked={form.doc_dni_jugador} onChange={set("doc_dni_jugador")} testid="doc-dni-jugador" />
              <SwitchField label="DNI/NIE tutor" checked={form.doc_dni_tutor} onChange={set("doc_dni_tutor")} testid="doc-dni-tutor" />
              <SwitchField label={t("photo")} checked={form.doc_foto} onChange={set("doc_foto")} testid="doc-foto" />
              <SwitchField label={t("authorizations")} checked={form.doc_autorizacion} onChange={set("doc_autorizacion")} testid="doc-auth" />
              <SwitchField label="Justificante de pago" checked={form.doc_justificante_pago} onChange={set("doc_justificante_pago")} testid="doc-pago" />
              <SwitchField label="Ficha federativa" checked={form.doc_ficha_federativa} onChange={set("doc_ficha_federativa")} testid="doc-federativa" />
            </div>
            <SelectField label={t("docStatus")} value={form.estado_documental} onChange={set("estado_documental")}
              options={["completo","pendiente","incompleto"].map(s=>({value:s,label:statusLabel(s)}))} testid="doc-estado" />
            <Area label={t("notes")} value={form.observaciones_doc} onChange={set("observaciones_doc")} testid="doc-obs" />
          </TabsContent>

          <TabsContent value="history" className="space-y-4 pt-4">
            {!Object.keys(form.historial_equipacion || {}).length && !Object.keys(form.historial_equipos || {}).length ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay datos históricos importados.</p>
            ) : <>
              <HistoryBlock title="Segunda equipación 2026-2027" value={form.segunda_equipacion} />
              <HistoryBlock title="Historial de equipaciones" value={form.historial_equipacion} />
              <HistoryBlock title="Historial de equipos" value={form.historial_equipos} />
              <HistoryBlock title="Historial federativo" value={form.historial_federacion} />
              <HistoryBlock title="Datos deportivos" value={form.historial_deportivo} />
              <HistoryBlock title="Entrenamientos 2025-2026" value={form.historial_entrenamientos} />
              <HistoryBlock title="Cuotas (referencia, no deuda)" value={form.referencias_cuotas} />
              <HistoryBlock title="Permisos (referencia, no firma)" value={form.referencias_permisos} />
            </>}
          </TabsContent>
        </Tabs>

        <DialogFooter className="sticky -bottom-5 z-10 -mx-5 -mb-5 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button variant="outline" onClick={requestClose} disabled={saving} data-testid="player-cancel-btn">{t("cancel")}</Button>
          <Button onClick={save} disabled={saving} data-testid="player-save-btn" className="px-6">{saving ? t("loading") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const HistoryBlock = ({ title, value }) => {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item])
    : Object.entries(value || {});
  if (!entries.length) return null;
  return <section className="rounded-xl border border-slate-200 p-3"><h3 className="mb-2 font-bold text-slate-700">{title}</h3><div className="grid gap-2 sm:grid-cols-2">{entries.map(([key, item]) => <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold text-slate-500">{key}: </span><span>{Array.isArray(item) ? item.filter(Boolean).join(" · ") : typeof item === "object" ? Object.entries(item || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}: ${v}`).join(" · ") : String(item || "—")}</span></div>)}</div></section>;
};

export default PlayerDialog;
