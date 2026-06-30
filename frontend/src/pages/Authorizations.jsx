import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, Plus, Pencil, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Field, Area, SelectField } from "@/components/form";

const AUTH_TYPES = {
  general: { es: "Autorización general de participación", eu: "Parte hartzeko baimen orokorra" },
  imagen: { es: "Autorización de uso de imagen", eu: "Irudia erabiltzeko baimena" },
  medica: { es: "Autorización médica básica", eu: "Oinarrizko mediku-baimena" },
  desplazamientos: { es: "Autorización de desplazamientos", eu: "Lekualdaketa baimena" },
  recogida: { es: "Autorización para recogida por terceros", eu: "Hirugarrenek jasotzeko baimena" },
  proteccion_datos: { es: "Protección de datos", eu: "Datuen babesa" },
};

const TEMPLATE_TEXT = {
  general: "Autorizo a mi hijo/a a participar en todas las actividades deportivas, entrenamientos y partidos organizados por el club durante la temporada.",
  imagen: "Autorizo el uso de la imagen de mi hijo/a en fotografías y vídeos del club con fines informativos y de difusión de las actividades deportivas.",
  medica: "Autorizo al club a tomar las medidas oportunas en caso de urgencia médica y declaro estar informado/a del estado de salud de mi hijo/a.",
  desplazamientos: "Autorizo los desplazamientos de mi hijo/a a los distintos campos donde se disputen los partidos y actividades del club.",
  recogida: "Autorizo a la persona indicada a recoger a mi hijo/a tras los entrenamientos y partidos del club.",
  proteccion_datos: "Doy mi consentimiento para el tratamiento de los datos personales conforme a la normativa de protección de datos vigente.",
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
  const printRef = useRef();

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
  const remove = async (a) => { if (!window.confirm(t("confirmDelete"))) return; await api.delete(`/authorizations/${a.id}`); toast.success(t("deleted")); load(); };

  const playerOptions = players.map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellidos || ""}`.trim() }));
  const typeOptions = Object.entries(AUTH_TYPES).map(([k, v]) => ({ value: k, label: v[lang] }));

  const doPrint = (a) => {
    setPrintItem(a);
    setTimeout(() => window.print(), 200);
  };

  return (
    <div data-testid="authorizations-page">
      <PageHeader title={t("authorizations")} icon={FileSignature}
        action={<Button data-testid="add-auth-btn" onClick={openNew} className="h-11 px-5"><Plus className="h-5 w-5" />{t("newAuthorization")}</Button>} />

      {auths.length === 0 ? (
        <EmptyState icon={FileSignature} message={t("noData")} action={<Button onClick={openNew} className="h-11"><Plus className="h-5 w-5" />{t("newAuthorization")}</Button>} />
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
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" data-testid={`print-auth-${a.id}`} onClick={() => doPrint(a)} className="text-primary"><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" data-testid={`edit-auth-${a.id}`} onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" data-testid={`delete-auth-${a.id}`} onClick={() => remove(a)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable area */}
      {printItem && (
        <div ref={printRef} className="hidden print-area p-10 max-w-2xl mx-auto text-slate-900">
          <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 mb-6">
            {settings.club_logo && <img src={settings.club_logo} alt="" className="h-16 w-16 object-contain" />}
            <div>
              <h1 className="font-heading text-2xl font-bold">{settings.club_nombre || "Ikas-Txiki"}</h1>
              <p className="text-sm">{settings.club_direccion}</p>
              <p className="text-sm">{settings.club_email} · {settings.club_telefono}</p>
            </div>
          </div>
          <h2 className="font-heading text-xl font-bold uppercase mb-6 text-center">{AUTH_TYPES[printItem.tipo]?.[lang]}</h2>
          <p className="leading-loose mb-6">
            D./Dña. <strong>{printItem.firmante || "________________"}</strong>, como padre/madre/tutor de
            <strong> {players.find(p=>p.id===printItem.player_id)?.nombre || "________________"} {players.find(p=>p.id===printItem.player_id)?.apellidos || ""}</strong>:
          </p>
          <p className="leading-loose mb-8">{TEMPLATE_TEXT[printItem.tipo]}</p>
          {printItem.tipo === "recogida" && (
            <p className="leading-loose mb-8">Persona autorizada: <strong>{printItem.persona_autorizada}</strong> — DNI: <strong>{printItem.dni_autorizada}</strong></p>
          )}
          {printItem.observaciones && <p className="leading-loose mb-8 italic">{printItem.observaciones}</p>}
          <div className="mt-16 flex justify-between">
            <div className="text-center">
              <div className="border-t border-slate-900 w-48 pt-2">Firma</div>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-900 w-48 pt-2">Fecha: {printItem.fecha_firma || "____________"}</div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">{form.id ? t("authorizations") : t("newAuthorization")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <SelectField label={t("name")} value={form.player_id} onChange={set("player_id")} options={playerOptions} testid="auth-player" />
            <SelectField label={t("authType")} value={form.tipo} onChange={set("tipo")} options={typeOptions} testid="auth-tipo" />
            <Field label={t("signer")} value={form.firmante} onChange={set("firmante")} testid="auth-firmante" />
            <SelectField label={t("status")} value={form.estado} onChange={set("estado")} options={["pendiente","firmada","caducada"].map(s=>({value:s,label:s}))} testid="auth-estado" />
            <Field label={t("signDate")} type="date" value={form.fecha_firma} onChange={set("fecha_firma")} testid="auth-fecha" />
            <Field label={t("expiryDate")} type="date" value={form.fecha_caducidad} onChange={set("fecha_caducidad")} testid="auth-caducidad" />
            {form.tipo === "recogida" && <>
              <Field label={t("authorizedPerson")} value={form.persona_autorizada} onChange={set("persona_autorizada")} testid="auth-persona" />
              <Field label={t("authorizedDni")} value={form.dni_autorizada} onChange={set("dni_autorizada")} testid="auth-dni" />
            </>}
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
