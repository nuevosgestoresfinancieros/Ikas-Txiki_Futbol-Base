import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClubLogo from "@/components/ClubLogo";
import api from "@/api";
import PublicLegalLinks from "@/components/PublicLegalLinks";

export default function RequestPasswordRecovery() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!identifier.trim()) return setError("Indica tu usuario o correo electrónico.");
    setLoading(true); setError("");
    try { await api.post("/auth/recovery/request", { identifier: identifier.trim() }); setSent(true); }
    catch { setError("No se ha podido procesar la solicitud. Inténtalo de nuevo."); }
    finally { setLoading(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-xl"><div className="mb-6 flex items-center gap-3"><ClubLogo className="h-12 w-12" /><div><h1 className="font-heading text-xl font-bold">Recupera tu contraseña</h1><p className="text-sm text-slate-600">Te enviaremos un enlace seguro para crear una nueva.</p></div></div>{sent ? <div className="space-y-4"><p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Si la cuenta existe, recibirá instrucciones en su correo electrónico.</p><Button asChild className="w-full"><Link to="/login">Volver a iniciar sesión</Link></Button></div> : <form className="space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">Usuario o correo electrónico<Input className="mt-1" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<Button className="w-full" disabled={loading}>{loading ? "Enviando…" : "Enviar enlace de recuperación"}</Button><Link className="block text-center text-sm font-semibold text-primary hover:underline" to="/login">Volver a iniciar sesión</Link></form>}<PublicLegalLinks className="mt-6 border-t border-slate-100 pt-5" /></section></main>;
}
