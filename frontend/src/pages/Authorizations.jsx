import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, Plus, Pencil, Trash2, Printer, Download, Upload, FileCheck, X, ChevronDown, ChevronUp, Check, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { PermissionGate, usePermission } from "@/auth";
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
  general: {
    es: "Autorizo a mi hijo/a a participar en todas las actividades deportivas, entrenamientos y partidos organizados por el club durante la temporada, así como a recibir la atención necesaria en caso de accidente leve.",
    eu: "Nire seme-alabari klubak denboraldian antolatutako kirol-jarduera, entrenamendu eta partida guztietan parte hartzeko baimena ematen diot, baita istripu arin baten kasuan beharrezko arreta jasotzeko ere.",
  },
  imagen: {
    es: "Autorizo el uso de la imagen de mi hijo/a en fotografías y vídeos del club con fines informativos y de difusión de las actividades deportivas, sin contraprestación económica y respetando en todo momento la dignidad del menor.",
    eu: "Nire seme-alabaren irudia klubaren argazki eta bideoetan erabiltzeko baimena ematen dut, kirol-jardueren berri emateko eta zabaltzeko, ordain ekonomikorik gabe eta adingabearen duintasuna une oro errespetatuz.",
  },
  medica: {
    es: "Autorizo al club a tomar las medidas oportunas en caso de urgencia médica cuando no sea posible contactar con el/los tutor/es. Declaro estar informado/a del estado de salud de mi hijo/a y no tener conocimiento de impedimento médico para la práctica deportiva.",
    eu: "Klubari baimena ematen diot larrialdi mediko baten aurrean beharrezko neurriak har ditzan, tutoreekin harremanetan jartzea ezinezkoa denean. Adierazten dut nire seme-alabaren osasun-egoeraren berri dudala eta ez dudala kirola egiteko eragozpen medikorik ezagutzen.",
  },
  desplazamientos: {
    es: "Autorizo los desplazamientos de mi hijo/a en los vehículos del club o de otros progenitores/tutores a los distintos campos y localizaciones donde se disputen los partidos y actividades organizadas por el club.",
    eu: "Nire seme-alabak klubeko ibilgailuetan edo beste guraso edo tutore batzuen ibilgailuetan bidaiatzeko baimena ematen dut, partidak eta klubak antolatutako jarduerak egiten diren zelai eta lekuetara joateko.",
  },
  recogida: {
    es: "Autorizo a la persona indicada a continuación a recoger a mi hijo/a tras los entrenamientos y partidos del club, en los casos en que yo no pueda hacerlo personalmente.",
    eu: "Jarraian adierazitako pertsonari nire seme-alaba entrenamendu eta partiden ondoren jasotzeko baimena ematen diot, nik neuk jaso ezin dudanean.",
  },
  proteccion_datos: {
    es: "Doy mi consentimiento informado para el tratamiento de los datos personales de mi hijo/a conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). Los datos serán utilizados exclusivamente para la gestión de las actividades del club y no serán cedidos a terceros sin consentimiento expreso.",
    eu: "Nire seme-alabaren datu pertsonalak tratatzeko baimen informatua ematen dut, 2016/679 (EB) Erregelamenduaren (DBEO) eta 3/2018 Lege Organikoaren arabera. Datuak klubaren jarduerak kudeatzeko baino ez dira erabiliko, eta ez zaizkie hirugarrenei lagako berariazko baimenik gabe.",
  },
};

const buildAuthHTML = (auth, player, settings, lang) => {
  const clubNombre = settings.club_nombre || "Ikas-Txiki";
  const clubDireccion = settings.club_direccion || "";
  const clubEmail = settings.club_email || "";
  const clubTelefono = settings.club_telefono || "";
  const clubLogo = settings.club_logo || "/brand/ikas-txiki-logo.png";
  const tipoEs = AUTH_TYPES[auth.tipo]?.es || auth.tipo;
  const tipoEu = AUTH_TYPES[auth.tipo]?.eu || auth.tipo;
  const texto = TEMPLATE_TEXT[auth.tipo] || { es: "", eu: "" };
  const jugadorNombre = player ? `${player.nombre} ${player.apellidos || ""}`.trim() : "________________";
  const firmante = auth.firmante || "________________";
  const fecha = auth.fecha_firma || "____________";
  return `
    <div style="font-family:Georgia,serif;color:#1a1a1a;max-width:680px;margin:0 auto;padding:40px 48px;box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:20px;border-bottom:3px solid #1a1a1a;padding-bottom:16px;margin-bottom:28px;">
        <img src="${clubLogo}" alt="Ikas-Txiki Manager" style="height:72px;width:72px;object-fit:contain;" />
        <div>
          <div style="font-size:22px;font-weight:700;">${clubNombre}</div>
          ${clubDireccion ? `<div style="font-size:12px;color:#444;">${clubDireccion}</div>` : ""}
          ${clubEmail || clubTelefono ? `<div style="font-size:12px;color:#444;">${[clubEmail, clubTelefono].filter(Boolean).join(" · ")}</div>` : ""}
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ccc;padding-bottom:8px;display:inline-block;">${tipoEs}</div>
        <div style="font-size:14px;font-weight:700;text-transform:uppercase;margin-top:6px;">${tipoEu}</div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Temporada / Denboraldia ${settings.temporada_actual || "2025 – 2026"}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
        <tr><td style="padding:6px 0;color:#555;width:40%;">Padre/Madre/Tutor/a · Aita/Ama/Tutorea:</td><td style="padding:6px 0;font-weight:600;border-bottom:1px solid #999;">${firmante}</td></tr>
        <tr><td style="padding:6px 0;color:#555;">Jugador/a · Jokalaria:</td><td style="padding:6px 0;font-weight:600;border-bottom:1px solid #999;">${jugadorNombre}</td></tr>
        ${player?.fecha_nacimiento ? `<tr><td style="padding:6px 0;color:#555;">Fecha de nacimiento · Jaioteguna:</td><td style="padding:6px 0;border-bottom:1px solid #999;">${player.fecha_nacimiento.slice(0,10)}</td></tr>` : ""}
        ${player?.categoria ? `<tr><td style="padding:6px 0;color:#555;">Categoría · Kategoria:</td><td style="padding:6px 0;border-bottom:1px solid #999;">${player.categoria}</td></tr>` : ""}
      </table>
      <div style="background:#f8f8f8;border-left:4px solid #333;padding:16px 20px;margin-bottom:24px;font-size:14px;line-height:1.8;">
        <strong>AUTORIZO:</strong><br/>${texto.es}<br/><br/><strong>BAIMENA EMATEN DUT:</strong><br/>${texto.eu}
      </div>
      ${auth.tipo === "recogida" ? `
      <div style="margin-bottom:24px;font-size:13px;">
        <strong>Persona autorizada para la recogida · Jasotzeko baimendutako pertsona:</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <tr><td style="padding:6px 0;color:#555;width:40%;">Nombre y apellidos · Izen-abizenak:</td><td style="padding:6px 0;border-bottom:1px solid #999;font-weight:600;">${auth.persona_autorizada || "________________"}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">DNI / NIF · NAN / IFZ:</td><td style="padding:6px 0;border-bottom:1px solid #999;font-weight:600;">${auth.dni_autorizada || "________________"}</td></tr>
        </table>
      </div>` : ""}
      ${auth.observaciones ? `<div style="margin-bottom:24px;font-size:13px;font-style:italic;color:#555;"><strong>Observaciones · Oharrak:</strong> ${auth.observaciones}</div>` : ""}
      <div style="margin-top:56px;display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:11px;color:#555;">Firma del padre/madre/tutor/a<br/>Aita/ama/tutorearen sinadura</div></div>
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:11px;color:#555;">Fecha · Data: ${fecha}</div></div>
        <div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:11px;color:#555;">Sello del club · Klubaren zigilua</div></div>
      </div>
      <div style="margin-top:40px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#999;text-align:center;">
        ${clubNombre} · Documento generado / Sortutako dokumentua: ${new Date().toLocaleDateString("es-ES")} · RGPD/DBEO (UE/EB) 2016/679
      </div>
    </div>`;
};

const Authorizations = () => {
  const canCreate = usePermission("authorizations", "create");
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [auths, setAuths] = useState([]);
  const [players, setPlayers] = useState([]);
  const [settings, setSettings] = useState({});
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ tipo: "general", estado: "pendiente" });
  const [bulkForm, setBulkForm] = useState({ player_id: "", firmante: "" });
  const [bulkDialog, setBulkDialog] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [expanded, setExpanded] = useState({}); // { player_id: true/false }
  const uploadRefs = useRef({});

  const load = async () => setAuths((await api.get("/authorizations")).data);
  useEffect(() => {
    load();
    api.get("/players").then((r) => setPlayers(r.data));
    api.get("/settings").then((r) => setSettings(r.data));
    if (params.get("new") && canCreate) { setBulkDialog(true); params.delete("new"); setParams(params); }
    // eslint-disable-next-line
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
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

  const saveBulk = async () => {
    if (!bulkForm.player_id) { toast.error("Selecciona un jugador"); return; }
    const existing = auths.filter((a) => a.player_id === bulkForm.player_id).map((a) => a.tipo);
    const toCreate = Object.keys(AUTH_TYPES).filter((t) => !existing.includes(t));
    if (toCreate.length === 0) { toast.error("Este jugador ya tiene las 6 autorizaciones"); return; }
    await Promise.all(toCreate.map((tipo) =>
      api.post("/authorizations", { player_id: bulkForm.player_id, firmante: bulkForm.firmante, tipo, estado: "pendiente" })
    ));
    toast.success(`${toCreate.length} autorizaciones creadas`);
    setBulkDialog(false);
    // Expandir automáticamente al jugador recién creado
    setExpanded((e) => ({ ...e, [bulkForm.player_id]: true }));
    load();
  };

  const ensureAllPlayers = async () => {
    if (!window.confirm(`Se crearán las autorizaciones pendientes para los ${players.length} jugadores. ¿Continuar?`)) return;
    setSyncingAll(true);
    try {
      const { data } = await api.post("/authorizations/ensure-all");
      toast.success(data.created
        ? `${data.created} autorizaciones creadas para ${data.players} jugadores`
        : `Los ${data.players} jugadores ya tienen todas sus autorizaciones`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudieron integrar todos los jugadores");
    } finally {
      setSyncingAll(false);
    }
  };

  const getPlayer = (id) => players.find((p) => p.id === id);
  const doPrint = (a) => {
    const printRoot = document.createElement("div");
    printRoot.id = "authorization-print-root";
    printRoot.innerHTML = buildAuthHTML(a, getPlayer(a.player_id), settings, lang);

    const printStyle = document.createElement("style");
    printStyle.id = "authorization-print-style";
    printStyle.textContent = `
      #authorization-print-root { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body > *:not(#authorization-print-root) { display: none !important; }
        #authorization-print-root { display: block !important; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;

    document.head.appendChild(printStyle);
    document.body.appendChild(printRoot);

    const cleanup = () => {
      printRoot.remove();
      printStyle.remove();
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    try {
      window.focus();
      window.print();
    } catch (error) {
      console.error("Error al preparar la impresión", error);
      cleanup();
      toast.error("No se pudo preparar la impresión");
    }
  };

  const doDownloadPdf = async (a) => {
    const player = getPlayer(a.player_id);
    const tipoSlug = (AUTH_TYPES[a.tipo]?.[lang] || a.tipo).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const jugadorSlug = player ? `${player.nombre}_${player.apellidos || ""}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") : "jugador";
    try {
      const response = await api.get(`/authorizations/${a.id}/pdf`, { params: { lang }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autorizacion_${tipoSlug}_${jugadorSlug}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Autorización descargada correctamente");
    } catch (error) {
      console.error("Error al generar la autorización PDF", error);
      toast.error("No se pudo generar el PDF. Prueba la opción Imprimir / PDF.");
    }
  };

  const doUploadSigned = async (authId, file) => {
    const fd = new FormData(); fd.append("file", file);
    try {
      await api.post(`/authorizations/${authId}/upload-signed`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("PDF firmado subido"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error al subir"); }
  };

  const doViewSigned = (a) => {
    const url = `${process.env.REACT_APP_BACKEND_URL || ""}/api/authorizations/${a.id}/signed-file`;
    window.open(url, "_blank");
  };

  const doDeleteSigned = async (a) => {
    if (!window.confirm("¿Eliminar el PDF firmado?")) return;
    await api.delete(`/authorizations/${a.id}/signed-file`);
    toast.success("PDF firmado eliminado"); load();
  };

  // Todos los jugadores deben aparecer, incluso cuando todavía tienen 0 autorizaciones.
  const byPlayer = players.reduce((acc, player) => {
    acc[player.id] = {
      player_id: player.id,
      player_nombre: `${player.nombre || ""} ${player.apellidos || ""}`.trim(),
      equipo_id: player.equipo_id,
      categoria: player.categoria,
      items: [],
    };
    return acc;
  }, {});
  auths.forEach((a) => {
    const key = a.player_id || "sin-jugador";
    if (!byPlayer[key]) byPlayer[key] = { player_id: a.player_id, player_nombre: a.player_nombre, items: [] };
    byPlayer[key].items.push(a);
  });

  const playerGroups = Object.values(byPlayer).sort((a, b) =>
    (a.player_nombre || "").localeCompare(b.player_nombre || "")
  );

  const playerOptions = players.map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellidos || ""}`.trim() }));
  const typeOptions = Object.entries(AUTH_TYPES).map(([k, v]) => ({ value: k, label: v[lang] }));

  const toggleExpand = (pid) => setExpanded((e) => ({ ...e, [pid]: !e[pid] }));

  const AuthRow = ({ a }) => (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 bg-white hover:bg-slate-50/60 text-sm">
      <div className="w-48 flex-shrink-0 text-slate-600">{AUTH_TYPES[a.tipo]?.[lang] || a.tipo}</div>
      <div className="w-24 flex-shrink-0"><StatusBadge status={a.estado} /></div>
      <div className="w-28 flex-shrink-0 text-xs text-slate-400">{a.archivo_firmado_subido_at?.slice(0, 10) || a.fecha_firma || "—"}</div>
      <div className="w-32 flex-shrink-0 text-xs text-slate-500">{a.firma_modalidad === "upload" ? t("authorizationModeUpload") : a.firma_modalidad === "simple_electronic" ? t("authorizationModeElectronic") : "—"}</div>
      <div className="w-32 flex-shrink-0 truncate text-xs text-slate-400" title={a.archivo_firmado_subido_por || ""}>{a.archivo_firmado_subido_por || "—"}</div>
      <div className="flex-shrink-0">
        {a.archivo_firmado
          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><FileCheck className="h-3 w-3" />PDF subido</span>
          : <span className="text-xs text-slate-300">Sin subir</span>}
      </div>
      <div className="flex-1" />
      <div className="flex gap-1">
        <PermissionGate resource="authorizations" action="export"><Button variant="ghost" size="icon" className="text-blue-600" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => doDownloadPdf(a)}><Download className="h-4 w-4" /></Button></PermissionGate>
        <PermissionGate resource="authorizations" action="export"><Button variant="ghost" size="icon" className="text-primary" aria-label={t("print")} title={t("print")} onClick={() => doPrint(a)}><Printer className="h-4 w-4" /></Button></PermissionGate>
        <PermissionGate resource="authorizations" action="edit"><Button variant="ghost" size="icon" className="text-orange-500" aria-label="Subir autorización firmada" title="Subir firmada" onClick={() => uploadRefs.current[a.id]?.click()}><Upload className="h-4 w-4" /></Button></PermissionGate>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" ref={(el) => (uploadRefs.current[a.id] = el)} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doUploadSigned(a.id, f); }} />
        {a.archivo_firmado && (
          <>
            <PermissionGate resource="authorizations" action="export"><Button variant="ghost" size="icon" className="text-emerald-600" aria-label="Ver autorización firmada" title="Ver firmada" onClick={() => doViewSigned(a)}><FileCheck className="h-4 w-4" /></Button></PermissionGate>
            <PermissionGate resource="authorizations" action="edit"><Button variant="ghost" size="icon" className="text-red-400" aria-label="Eliminar archivo firmado" title="Eliminar firmada" onClick={() => doDeleteSigned(a)}><X className="h-4 w-4" /></Button></PermissionGate>
          </>
        )}
        <PermissionGate resource="authorizations" action="edit"><Button variant="ghost" size="icon" aria-label={t("edit")} onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button></PermissionGate>
        <PermissionGate resource="authorizations" action="delete"><Button variant="ghost" size="icon" aria-label={t("delete")} className="text-red-500 hover:bg-red-50" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button></PermissionGate>
      </div>
    </div>
  );

  return (
    <div data-testid="authorizations-page">
      <PageHeader title={t("authorizations")} icon={FileSignature}
        action={canCreate ?
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" data-testid="ensure-all-authorizations" onClick={ensureAllPlayers} disabled={syncingAll || !players.length} className="h-11 px-5">
              <Users className="h-5 w-5" />{syncingAll ? "Integrando…" : "Integrar todos los jugadores"}
            </Button>
            <Button data-testid="add-auth-btn" onClick={() => { setBulkForm({ player_id: "", firmante: "" }); setBulkDialog(true); }} className="h-11 px-5">
              <Plus className="h-5 w-5" />{t("newAuthorization")}
            </Button>
          </div> : null
        }
      />

      {playerGroups.length === 0 ? (
        <EmptyState icon={FileSignature} message={t("noData")}
          action={canCreate ? <Button onClick={() => setBulkDialog(true)} className="h-11"><Plus className="h-5 w-5" />{t("newAuthorization")}</Button> : null} />
      ) : (
        <div className="space-y-2 no-print">
          {playerGroups.map((group) => {
            const isOpen = !!expanded[group.player_id];
            const firmadas = group.items.filter((a) => a.estado === "firmada").length;
            const pendientes = group.items.filter((a) => a.estado === "pendiente").length;
            const total = group.items.length;
            return (
              <div key={group.player_id} className="surface-card overflow-hidden">
                {/* Cabecera del grupo — fila del jugador */}
                <button
                  onClick={() => toggleExpand(group.player_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors text-left"
                >
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                  <span className="font-semibold text-slate-800 flex-1">{group.player_nombre || "—"}</span>
                  {/* Contadores */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">{total}/6</span>
                    {firmadas > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <Check className="h-3 w-3" />{firmadas} firmada{firmadas !== 1 ? "s" : ""}
                      </span>
                    )}
                    {pendientes > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                        <Clock className="h-3 w-3" />{pendientes} pendiente{pendientes !== 1 ? "s" : ""}
                      </span>
                    )}
                    {total < 6 && (
                      <span className="text-red-400 font-medium">{6 - total} sin crear</span>
                    )}
                  </div>
                </button>

                {/* Detalle de las 6 autorizaciones — desplegable */}
                {isOpen && (
                  <div>
                    {/* Cabecera columnas */}
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100">
                      <div className="w-48">Tipo</div>
                      <div className="w-24">Estado</div>
                      <div className="w-28">{t("authorizationReceivedAt")}</div>
                      <div className="w-32">{t("authorizationMode")}</div>
                      <div className="w-32">{t("authorizationReceivedBy")}</div>
                      <div className="flex-shrink-0">PDF firmado</div>
                      <div className="flex-1" />
                      <div>Acciones</div>
                    </div>
                    {/* Filas de autorizaciones existentes */}
                    {group.items
                      .sort((a, b) => Object.keys(AUTH_TYPES).indexOf(a.tipo) - Object.keys(AUTH_TYPES).indexOf(b.tipo))
                      .map((a) => <AuthRow key={a.id} a={a} />)}
                    {/* Tipos que faltan por crear */}
                    {Object.keys(AUTH_TYPES)
                      .filter((tipo) => !group.items.some((a) => a.tipo === tipo))
                      .map((tipo) => (
                        <div key={tipo} className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 bg-slate-50/40 text-sm opacity-60">
                          <div className="w-48 text-slate-400 italic">{AUTH_TYPES[tipo]?.[lang]}</div>
                          <div className="w-24 text-xs text-slate-300">Sin crear</div>
                          <div className="flex-1" />
                          <PermissionGate resource="authorizations" action="create"><Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-primary"
                            onClick={() => { setForm({ player_id: group.player_id, tipo, estado: "pendiente" }); setDialog(true); }}>
                            + Crear
                          </Button></PermissionGate>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog creación masiva */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Nueva autorización — jugador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-500">
              Se crearán las <strong>6 autorizaciones</strong> para el jugador seleccionado
              (solo las que no existan todavía).
            </p>
            <SelectField label={t("name")} value={bulkForm.player_id}
              onChange={(v) => setBulkForm((f) => ({ ...f, player_id: v }))} options={playerOptions} testid="bulk-auth-player" />
            <Field label={t("signer")} value={bulkForm.firmante}
              onChange={(v) => setBulkForm((f) => ({ ...f, firmante: v }))} testid="bulk-auth-firmante" />
            {bulkForm.player_id && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Autorizaciones</p>
                <div className="space-y-1.5">
                  {Object.entries(AUTH_TYPES).map(([key, labels]) => {
                    const yaExiste = auths.some((a) => a.player_id === bulkForm.player_id && a.tipo === key);
                    return (
                      <div key={key} className={`flex items-center gap-2 text-sm ${yaExiste ? "text-slate-300" : "text-slate-700"}`}>
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${yaExiste ? "bg-slate-200" : "bg-emerald-400"}`} />
                        <span className={yaExiste ? "line-through" : ""}>{labels[lang]}</span>
                        {yaExiste && <span className="text-xs text-slate-300 ml-1">ya existe</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(false)}>{t("cancel")}</Button>
            <Button onClick={saveBulk} className="h-11 px-6">Crear autorizaciones</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar individual */}
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
            <div className="sm:col-span-2"><Area label={t("notes")} value={form.observaciones} onChange={set("observaciones")} testid="auth-obs" /></div>
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
