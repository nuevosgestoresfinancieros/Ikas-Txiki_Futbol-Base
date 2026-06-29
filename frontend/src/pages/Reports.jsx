import React, { useEffect, useState } from "react";
import { FileText, Download, Printer } from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared";

const Reports = () => {
  const { t } = useI18n();
  const [report, setReport] = useState("playersList");
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fTeam, setFTeam] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [data, setData] = useState({ headers: [], rows: [], title: "" });

  useEffect(() => {
    Promise.all([api.get("/teams"), api.get("/categories")]).then(([tm, c]) => { setTeams(tm.data); setCategories(c.data); });
  }, []);

  const teamName = (id) => teams.find((x) => x.id === id)?.nombre || "—";

  const build = async () => {
    let headers = [], rows = [], title = t(report);
    if (report === "playersList") {
      let players = (await api.get("/players")).data;
      if (fTeam !== "all") players = players.filter(p => p.equipo_id === fTeam);
      if (fCat !== "all") players = players.filter(p => p.categoria === fCat);
      headers = [t("name"), t("category"), t("team"), t("number"), t("status")];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.categoria||"—", teamName(p.equipo_id), p.dorsal||"—", p.estado]);
    } else if (report === "familyPhones") {
      const players = (await api.get("/players")).data;
      headers = [t("name"), `${t("parent1")}`, `${t("phone")} 1`, `${t("phone")} 2`];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.progenitor1_nombre||"—", p.progenitor1_telefono||"—", p.progenitor2_telefono||"—"]);
    } else if (report === "familyEmails") {
      const players = (await api.get("/players")).data;
      headers = [t("name"), `${t("email")} 1`, `${t("email")} 2`];
      rows = players.map(p => [`${p.nombre} ${p.apellidos||""}`.trim(), p.progenitor1_email||"—", p.progenitor2_email||"—"]);
    } else if (report === "pendingPaymentsReport") {
      let pays = (await api.get("/payments")).data.filter(p => ["pendiente","parcial"].includes(p.estado));
      headers = [t("name"), t("concept"), t("finalAmount"), t("status")];
      rows = pays.map(p => [p.player_nombre, p.concepto, `${(p.importe_final||0).toFixed(2)} €`, p.estado]);
    } else if (report === "pendingAuthsReport") {
      let auths = (await api.get("/authorizations")).data.filter(a => a.estado !== "firmada");
      headers = [t("name"), t("authType"), t("status")];
      rows = auths.map(a => [a.player_nombre, a.tipo, a.estado]);
    } else if (report === "statsReport") {
      const stats = (await api.get("/stats")).data;
      headers = [t("name"), t("season"), t("playedMatches"), t("goals"), t("assists"), t("rating")];
      rows = stats.map(s => [s.player_nombre, s.temporada||"—", s.partidos_jugados??0, s.goles??0, s.asistencias??0, s.valoracion??"—"]);
    }
    setData({ headers, rows, title });
  };

  useEffect(() => { build(); /* eslint-disable-next-line */ }, [report, fTeam, fCat, teams]);

  const exportCSV = () => {
    const csv = [data.headers.join(";"), ...data.rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${report}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const reportOptions = ["playersList","familyPhones","familyEmails","pendingPaymentsReport","pendingAuthsReport","statsReport"];

  return (
    <div data-testid="reports-page">
      <PageHeader title={t("reports")} icon={FileText} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5 no-print">
        <Select value={report} onValueChange={setReport}>
          <SelectTrigger className="h-11 sm:w-72" data-testid="report-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {reportOptions.map(r => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        {report === "playersList" && <>
          <Select value={fTeam} onValueChange={setFTeam}>
            <SelectTrigger className="h-11 sm:w-44" data-testid="report-filter-team"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("team")}: {t("all")}</SelectItem>
              {teams.map(tm=><SelectItem key={tm.id} value={tm.id}>{tm.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="h-11 sm:w-44" data-testid="report-filter-cat"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("category")}: {t("all")}</SelectItem>
              {categories.map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </>}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={exportCSV} data-testid="export-csv-btn" className="h-11"><Download className="h-4 w-4" />{t("exportCSV")}</Button>
          <Button onClick={() => window.print()} data-testid="export-pdf-btn" className="h-11"><Printer className="h-4 w-4" />{t("exportPDF")}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden print-area">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-heading font-bold text-slate-900">{data.title}</h2>
          <span className="text-xs text-slate-400 no-print">{data.rows.length} {t("rows")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>{data.headers.map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.length === 0 ? (
                <tr><td colSpan={data.headers.length} className="px-4 py-8 text-center text-slate-400">{t("noData")}</td></tr>
              ) : data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {r.map((c, j) => <td key={j} className="px-4 py-2.5 text-slate-700">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
