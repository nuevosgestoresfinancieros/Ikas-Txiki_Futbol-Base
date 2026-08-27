import React from "react";
import { Link } from "react-router-dom";

export default function PublicLegalLinks({ className = "" }) {
  return <nav aria-label="Información legal" className={"flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs font-semibold " + className}>
    <Link className="rounded-sm text-[#1B5C8F] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B75B0] focus-visible:ring-offset-2" to="/privacidad">Política de privacidad</Link>
    <span className="text-slate-400" aria-hidden="true">·</span>
    <Link className="rounded-sm text-[#1B5C8F] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B75B0] focus-visible:ring-offset-2" to="/condiciones-de-uso">Condiciones de uso</Link>
  </nav>;
}
