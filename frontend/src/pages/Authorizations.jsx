import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, Plus, Pencil, Trash2, Printer, Download, Upload, FileCheck, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const AUTH_TYPES = {
  general:          { es: "Autorización general de participación",  eu: "Parte hartzeko baimen orokorra" },
  imagen:           { es: "Autorización de uso de imagen",          eu: "Irudia erabiltzeko baimena" },
  medica:           { es: "Autorización médica básica",             eu: "Oinarrizko mediku-baimena" },
  desplazamientos:  { es: "Autorización de desplazamientos",        eu: "Lekualdaketa baimena" },
  recogida:         { es: "Autorización para recogida por terceros",eu: "Hirugarrenek jasotzeko baimena" },
  proteccion_datos: { es: "Protección de datos",                    eu: "Datuen babesa" },
};

const TEMPLATE_TEXT = {
  general:
    "Autorizo a mi hijo/a a participar en todas las actividades deportivas, entrenamientos y " +
    "partidos organizados por el club durante la temporada, así como a recibir la atención " +
    "necesaria en caso de accidente leve.",
  imagen:
    "Autorizo el uso de la imagen de mi hijo/a en fotografías y vídeos del club con fines " +
    "informativos y de difusión de las actividades deportivas, sin contraprestación económica " +
    "y respetando en todo momento la dignidad del menor.",
  medica:
    "Autorizo al club a tomar las medidas oportunas en caso de urgencia médica cuando no sea " +
    "posible contactar con el/los tutor/es. Declaro estar informado/a del estado de salud de " +
    "mi hijo/a y no tener conocimiento de impedimento médico para la práctica deportiva.",
  desplazamientos:
    "Autorizo los desplazamientos de mi hijo/a en los vehículos del club o de otros " +
    "progenitores/tutores a los distintos campos y localizaciones donde se disputen los " +
    "partidos y actividades organizadas por el club.",
  recogida:
    "Autorizo a la persona indicada a continuación a recoger a mi hijo/a tras los " +
    "entrenamientos y partidos del club, en los casos en que yo no pueda hacerlo personalmente.",
  proteccion_datos:
    "Doy mi consentimiento informado para el tratamiento de los datos personales de mi " +
    "hijo/a conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). " +
    "Los datos serán utilizados exclusivamente para la gestión de las actividades del club y " +
    "no serán cedidos a terceros sin consentimiento expreso.",
};

const buildAuthHTML = (auth, player, settings, lang) => {
  const clubNombre = settings.club_nombre || "Ikas-Txiki";
  const clubDireccion = settings.club_direccion || "";
  const clubEmail = settings.club_email || "";
  const clubTelefono = settings.club_telefono || "";
  const clubLogo = settings.club_logo || "";
  const tipoLabel = AUTH_TYPES[auth.tipo]?.[lang] || auth.tipo;
  const texto = TEMPLATE_TEXT[auth.tipo] || "";
  const jugadorNombre = player ? `${player.nombre} ${player.apellidos || ""}`.trim() : "________________";
  const firmante = auth.firmante || "________________";
  const fecha = auth.fecha_firma || "____________";

  return `
    <div style="font-family:Georgia,serif;color:#1a1a1a;max-width:680px;margin:0 auto;padding:40px 48px;box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:16px;margin-bottom:28px;">
        ${clubLogo ? `<img src="${clubLogo}" alt="" style="height:72px;width:72px;object-fit:contain;" />` : ""}
        <div>
          <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">${clubNombre}</div>
          ${clubDireccion ? `<div style="font-size:12px;color:#444;margin-top:2px;">${clubDireccion}</div>` : ""}
          ${clubEmail || clubTelefono ? `<div style="font-size:12px;color:#444;">${[clubEmail, clubTelefono].filter(Boolean).join(" · ")}</div>` : ""}
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1px solid #ccc;padding-bottom:8px;display:inline-block;">${tipoLabel}</div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Temporada 2025 – 2026</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
        <tr><td style="padding:6px 0;color:#555;width:40%;">Padre/Madre/Tutor/a:</td><td style="padding:6px 0;font-weight:600;border-bottom:1px solid #999;">${firmante}</td></tr>
        <tr><td style="padding:6px 0;color:#555;">Jugador/a:</td><td style="padding:6px 0;font-weight:600;border-bottom:1px solid #999;">${jugadorNombre}</td></tr>
        ${player?.fecha_nacimiento ? `<tr><td style="padding:6px 0;color:#555;">Fecha de nacimiento:</td><td style="padding:6px 0;border-bottom:1px solid #999;">${player.fecha_nacimiento.slice(0,10)}</td></tr>` : ""}
        ${player?.categoria ? `<tr><td style="padding:6px 0;color:#555;">Categoría:</td><td style="padding:6px 0;border-bottom:1px solid #999;">${player.categoria}</td></tr>` : ""}
      </table>
      <div style="background:#f8f8f8;border-left:4px solid #333;padding:16px 20px;margin-bottom:24px;font-size:14px;line-height:1.8;">
        <strong>AUTORIZO / BAIMENA EMATEN DUT:</strong><br/>${texto}
      </div>
      ${auth.tipo === "recogida" ? `
      <div style="margin-bottom:24px;font-size:13px;">
        <strong>Persona autorizada para la recogida:</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <tr><td style="padding:6px 0;color:#555;width:40%;">Nombre y apellidos:</td><td style="padding:6px 0;border-bottom:1px solid #999;font-weight:600;">${auth.persona_autorizada || "________________"}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">DNI / NIF:</td><td style="padding:6px 0;border-bottom:1px solid #999;font-weight:600;">${auth.dni_autorizada || "________________"}</td></tr>
        </table>
      </div>` : ""}
      ${auth.observaciones ? `<div style="margin-bottom:24px;font-size:13px;font-style:italic;color:#555;"><strong>Observaciones:</strong> ${auth.observaciones}</div>` : ""}
      <div style="margin-top:56px;display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:12px;color:#555;">Firma del padre/madre/tutor/a</div></div>
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:12px;color:#555;">Fecha: ${fecha}</div></div>
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:12px;color:#555;">Sello del club</div></div>
      </div>
      <div style="margin-top:40px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#999;text-align:center;">
        ${clubNombre} · Documento generado el ${new Date().toLocaleDateString("es-ES")} · Protección de datos: conforme al RGPD (UE) 2016/679
      </div>
    </div>
  `;
};

const Authorizations = () => {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [auths, setAuths] = useState([]);
  const [players, setPlayers] = useState([]);
  const [settings, setSettings] = useState({});
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ tipo: "general", estado: "pendiente" });
  const [printItem, setPrintItem] = useState(null);
  const [viewSigned, setViewSigned] = useState(null); // auth cuyo PDF firmado se previsualiza
  const uploadRefs = useRef({});

  const load = async () => setAuths((await api.get("/authorizations")).data);
  useEffect(() => {
    load();
    api.get("/players").then((r) => setPlayers(r.data));
    api.get("/settings").then((r) => setSettings(r.data));
    if (params.get("new")) { openNew(); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm({ tipo: "general", estado: "pendiente" }); setDialog(true); };
  const openEdit = (a) => { setForm(a); setDialog(true); };
  const save = async () => {
    if (form.id) await api.put(`/authorizations/${form.id}`, form);
    else await api.post("/authorizations", form);
    toast.success(t("saved")); setDialog(false); load();
  };
  const remove = async (a) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await api.delete(`/authorizations/${a.id}`);
    toast.success(t("deleted")); load();
  };

  const getPlayer = (id) => players.find((p) => p.id === id);

  // Imprimir
  const doPrint = (a) => {
    setPrintItem(a);
    setTimeout(() => window.print(), 300);
  };

  // Descargar PDF en blanco (para imprimir y firmar a mano)
  const doDownloadPdf = async (a) => {
    const player = getPlayer(a.player_id);
    const html = buildAuthHTML(a, player, settings, lang);
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    document.body.appendChild(container);
    const tipoSlug = (AUTH_TYPES[a.tipo]?.[lang] || a.tipo).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const jugadorSlug = player ? `${player.nombre}_${player.apellidos || ""}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") : "jugador";
    const filename = `autorizacion_${tipoSlug}_${jugadorSlug}.pdf`;
    if (window.html2pdf) {
      await window.html2pdf().set({
        margin: [10, 10, 10, 10], filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(container).save();
    } else {
      toast.error("Error al generar PDF. Usa el botón de imprimir.");
    }
    document.body.removeChild(container);
  };

  // Subir PDF firmado
  const doUploadSigned = async (authId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/authorizations/${authId}/upload-signed`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Autorización firmada subida correctamente");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al subir el archivo");
    }
  };

  // Ver PDF firmado
  const doViewSigned = (a) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    const url = `${backendUrl}/api/authorizations/${a.id}/signed-file`;
    window.open(url, "_blank");
  };

  // Descargar PDF firmado
  const doDownloadSigned = (a) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    const url = `${backendUrl}/api/authorizations/${a.id}/signed-file`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `autorizacion_firmada_${a.id}.pdf`;
    link.click();
  };

  // Eliminar PDF firmado
  const doDeleteSigned = async (a) => {
    if (!window.confirm("¿Eliminar el PDF firmado? La autorización volverá a estado pendiente.")) return;
    await api.delete(`/authorizations/${a.id}/signed-file`);
    toast.success("PDF firmado eliminado");
    load();
  };

  const playerOptions = players.map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellidos || ""}`.trim() }));
  const typeOptions = Object.entries(AUTH_TYPES).map(([k, v]) => ({ value: k, label: v[lang] }));

  return (
    <div data-testid="authorizations-page">
      <PageHeader
        title={t("authorizations")}
        icon={FileSignature}
        action={
          <Button data-testid="add-auth-btn" onClick={openNew} className="h-11 px-5">
            <Plus className="h-5 w-5" />{t("newAuthorization")}
          </Button>
        }
      />

      {auths.length === 0 ? (
        <EmptyState icon={FileSignature} message={t("noData")}
          action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newAuthorization")}</Button>} />
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("name")}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">{t("authType")}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{t("signDate")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Firmada</th>
                  <th className="px-4 py-3 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auths.map((a) => (
                  <tr key={a.id} data-testid={`auth-row-${a.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{a.player_nombre}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600">{AUTH_TYPES[a.tipo]?.[lang] || a.tipo}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">{a.fecha_firma || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.estado} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {a.archivo_firmado ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <FileCheck className="h-3.5 w-3.5" /> PDF subido
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sin subir</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {/* Descargar PDF en blanco */}
                        <Button variant="ghost" size="icon" title="Descargar PDF (para imprimir y firmar)" onClick={() => doDownloadPdf(a)} className="text-blue-600">
                          <Download className="h-4 w-4" />
                        </Button>
                        {/* Imprimir */}
                        <Button variant="ghost" size="icon" title="Imprimir" onClick={() => doPrint(a)} className="text-primary">
                          <Printer className="h-4 w-4" />
                        </Button>
                        {/* Subir firmada */}
                        <Button variant="ghost" size="icon" title="Subir PDF firmado" onClick={() => uploadRefs.current[a.id]?.click()} className="text-orange-500">
                          <Upload className="h-4 w-4" />
                        </Button>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          ref={(el) => (uploadRefs.current[a.id] = el)}
                          style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doUploadSigned(a.id, f); }}
                        />
                        {/* Ver/descargar firmada (solo si existe) */}
                        {a.archivo_firmado && (
                          <>
                            <Button variant="ghost" size="icon" title="Ver PDF firmado" onClick={() => doViewSigned(a)} className="text-emerald-600">
                              <FileCheck className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Eliminar PDF firmado" onClick={() => doDeleteSigned(a)} className="text-red-400">
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {/* Editar */}
                        <Button variant="ghost" size="icon" data-testid={`edit-auth-${a.id}`} onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {/* Eliminar */}
                        <Button variant="ghost" size="icon" data-testid={`delete-auth-${a.id}`} onClick={() => remove(a)} className="text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Área imprimible */}
      {printItem && (
        <div
          className="hidden print-area"
          dangerouslySetInnerHTML={{ __html: buildAuthHTML(printItem, getPlayer(printItem.player_id), settings, lang) }}
        />
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{form.id ? t("authorizations") : t("newAuthorization")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("name")} value={form.player_id} onChange={set("player_id")} options={playerOptions} testid="auth-player" />
            <SelectField label={t("authType")} value={form.tipo} onChange={set("tipo")} options={typeOptions} testid="auth-tipo" />
            <Field label={t("signer")} value={form.firmante} onChange={set("firmante")} testid="auth-firmante" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["pendiente","firmada","caducada"].map((s)=>({value:s,label:s}))} testid="auth-estado" />
            <Field label={t("signDate")} type="date" value={form.fecha_firma} onChange={set("fecha_firma")} testid="auth-fecha" />
            <Field label={t("expiryDate")} type="date" value={form.fecha_caducidad} onChange={set("fecha_caducidad")} testid="auth-caducidad" />
            {form.tipo === "recogida" && (
              <>
                <Field label={t("authorizedPerson")} value={form.persona_autorizada} onChange={set("persona_autorizada")} testid="auth-persona" />
                <Field label={t("authorizedDni")} value={form.dni_autorizada} onChange={set("dni_autorizada")} testid="auth-dni" />
              </>
            )}
            <div className="sm:col-span-2">
              <Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="auth-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="auth-save-btn" className="h-11 px-6">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Authorizations;
