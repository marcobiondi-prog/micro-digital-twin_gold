import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, Plus, Building2, Grape, Copy, Printer, Activity, Trash2, Share2, Mail, ChevronDown, LineChart as LineChartIcon, Leaf, NotebookPen, Droplets, Waves } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Pills, Ring, StatusBadge, levelColor } from "@/views/health";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { scenarioCsv, scenarioGeoJson } from "@/models/scenario-export";
import { useLabMedia } from "@/models/lab-media-store";
import { scanReportRows, useArScans } from "@/models/ar-scan-log";
import { noise } from "@/models/data";
import { splitLocation } from "@/views/SimulationGrid";
import { MapPin } from "lucide-react";
import { setVineyard, splitLabel, urbanMetrics, useLab, vineMetrics } from "@/models/lab-store";
import { LabSyncIndicator } from "@/views/LabSyncIndicator";
import { FieldAI } from "@/views/FieldAI";
import climateTwinLogo from "@/assets/climate-twin-logo-final.png";
import climateTwinLogoCompact from "@/assets/climate-twin-logo-compact.png";

export const Route = createFileRoute("/dashboard")({
  validateSearch: z.object({ tab: z.enum(["Piazza", "Vigneto"]).catch("Piazza") }).parse,
  head: () => ({
    meta: [
      { title: "Dashboard operative — MICRO DIGITAL TWIN" },
      { name: "description", content: "Dashboard della piazza (calore, rifugi, intervento) e del vigneto (stress, irrigazione, quaderno), con report esportabile." },
      { property: "og:title", content: "Dashboard operative — MICRO DIGITAL TWIN" },
      { property: "og:description", content: "Indicatori di salute climatica, trend e report esportabili." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const hours = Array.from({ length: 24 }, (_, h) => ({ h: `${h}:00`, wbgt: +(22 + 8 * Math.sin(((h - 8) / 24) * Math.PI * 2 * 0.9) * (h > 6 && h < 21 ? 1 : 0.3) + noise(h) * 1.5).toFixed(1) }));
const days = Array.from({ length: 14 }, (_, d) => ({ d: `G${d + 1}`, s20: +(32 - d * 1.3 + noise(d) * 3).toFixed(1), s50: +(36 - d * 0.7 + noise(d, 2) * 2).toFixed(1) }));
const ripe = Array.from({ length: 10 }, (_, w) => ({ w: `S${w + 1}`, zuccheri: +(12 + w * 1.4 + noise(w) * 0.5).toFixed(1), polifenoli: +(8 + w * 0.9 - Math.max(0, w - 6) * 0.3 + noise(w, 5) * 0.4).toFixed(1) }));
const WATER_BALANCE = [{ m: "Giu", domanda: 420, disponibile: 520 }, { m: "Lug", domanda: 610, disponibile: 470 }, { m: "Ago", domanda: 680, disponibile: 410 }, { m: "Set", domanda: 450, disponibile: 480 }];
const tip = { contentStyle: { borderRadius: 16, border: "none", boxShadow: "0 8px 24px -8px rgb(0 0 0 / .2)" } };

function useChartAnimation() {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return animate;
}

function ChartKey({ items }: { items: Array<{ label: string; color: string }> }) {
  return <div className="dashboard-chart-key" aria-label="Legenda del grafico">{items.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>;
}

function DashboardLoading({ label, tone = "primary" }: { label: string; tone?: "primary" | "urban" | "vine" }) {
  const Icon = tone === "urban" ? Building2 : tone === "vine" ? Grape : Activity;
  const color = tone === "urban" ? "var(--urban)" : tone === "vine" ? "var(--vine)" : "var(--primary)";
  return (
    <div className="dashboard-loader" role="status" aria-live="polite" aria-label={`${label} in caricamento`}>
      <div className="dashboard-loader-ring" style={{ color }} aria-hidden="true">
        <span className="dashboard-loader-orbit" />
        <span className="dashboard-loader-icon">
          {tone === "primary" ? <img src={climateTwinLogoCompact} srcSet={`${climateTwinLogoCompact} 1x, ${climateTwinLogo} 2x`} alt="" className="dashboard-loader-logo" decoding="async" /> : <Icon className="size-7" />}
        </span>
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-semibold">Caricamento {label}</p>
        <p className="mt-1 text-sm text-muted-foreground">Aggiornamento indicatori climatici…</p>
      </div>
    </div>
  );
}

function useDashboardLoading(key: string) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 750);
    return () => window.clearTimeout(timer);
  }, [key]);
  return loading;
}

/** Indicatore compatto: anello piccolo, nome sotto. Tre per riga anche su telefono, così si leggono insieme. */
function Kpi({ value, max, color, center, unit, label, children }: { value: number; max: number; color: string; center: ReactNode; unit: string; label: string; children?: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col items-center gap-1.5 p-2.5 text-center sm:p-5">
      <Ring value={value} max={max} size={84} stroke={8} color={color}><span className="font-display text-xl font-semibold leading-none">{center}</span><span className="text-[10px] text-muted-foreground">{unit}</span></Ring>
      <span className="dashboard-long-label text-xs font-semibold sm:text-sm">{label}</span>
      {children}
    </Card>
  );
}

/** Sezione a fisarmonica: una riga col titolo, il contenuto si apre al tocco (chiuso di partenza), una sola aperta per volta. */
function Fold({ title, hint, icon: Icon, children }: { title: string; hint?: string; icon?: typeof Building2; children: ReactNode }) {
  return (
    // One open section at a time: opening one closes the others in the same list.
    <details className="dashboard-fold group" onToggle={(e) => {
      const el = e.currentTarget;
      if (!el.open) return;
      el.parentElement?.querySelectorAll<HTMLDetailsElement>(":scope > details.dashboard-fold[open]").forEach((other) => { if (other !== el) other.open = false; });
    }}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm font-semibold shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate">{title}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="dashboard-fold-body mt-2 grid gap-3 sm:gap-4">{children}</div>
    </details>
  );
}

const STAGES = ["In valutazione", "Progettazione", "Approvato", "Realizzato"] as const;
const EXTERNAL = ["Comune · Giunta", "Soprintendenza", "Ufficio tecnico"] as const;
type ApprovalStatus = "attesa" | "approvato" | "respinto";
type Approval = { status: ApprovalStatus; ref: string; sent: string; date: string };
const EMPTY_APPROVAL: Approval = { status: "attesa", ref: "", sent: "", date: "" };
const APPROVAL_STATES: [ApprovalStatus, string, string][] = [
  ["attesa", "In attesa", "border-warn bg-warn/20 text-foreground"],
  ["approvato", "Approvato", "border-ok bg-ok/20 text-foreground"],
  ["respinto", "Respinto", "border-danger bg-danger/20 text-foreground"],
];
// Compatibile con il vecchio formato (stringa = data di approvazione)
function normalizeApprovals(raw: Record<string, unknown>): Record<string, Approval> {
  const out: Record<string, Approval> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = { ...EMPTY_APPROVAL, status: "approvato", date: v };
    else if (v && typeof v === "object") {
      const o = v as Partial<Approval>;
      out[k] = { status: o.status === "approvato" || o.status === "respinto" ? o.status : "attesa", ref: String(o.ref ?? ""), sent: String(o.sent ?? ""), date: String(o.date ?? "") };
    }
  }
  return out;
}

// Colore proprio di ogni gradino del ciclo: ambra → blu urbano → turchese → verde
const STAGE_TONES = [
  { todo: "border-warn/40 bg-warn/10", done: "border-warn/70 bg-warn/15", active: "border-warn bg-warn/30 ring-1 ring-warn/40", dot: "bg-warn" },
  { todo: "border-urban/40 bg-urban/10", done: "border-urban/70 bg-urban/15", active: "border-urban bg-urban/30 ring-1 ring-urban/40", dot: "bg-urban" },
  { todo: "border-brand-turquoise/40 bg-brand-turquoise/10", done: "border-brand-turquoise/70 bg-brand-turquoise/15", active: "border-brand-turquoise bg-brand-turquoise/30 ring-1 ring-brand-turquoise/40", dot: "bg-brand-turquoise" },
  { todo: "border-ok/40 bg-ok/10", done: "border-ok/70 bg-ok/15", active: "border-ok bg-ok/30 ring-1 ring-ok/40", dot: "bg-ok" },
] as const;

/** Demo entries shown to guests; signed-in users get their own saved log. */
const DEFAULT_LOG: { d: string; t: string }[] = [
  { d: "02/10", t: "Rilievo termico in piazza" },
  { d: "28/09", t: "Scenario condiviso con l'ufficio tecnico" },
];

function UrbanDash() {
  const animateCharts = useChartAnimation();
  const [target] = useState(30);
  const lab = useLab().urban, m = urbanMetrics(lab), area = splitLabel(lab.location.label), place = splitLocation(lab.location.label);
  const near = place.sub ? splitLabel(place.sub) : `Zona limitrofa · ${area}`;
  const le5 = Math.min(100, Math.round(m.refuges * 1.6)), le10 = Math.min(100, Math.max(le5, Math.round(m.refuges * 2.3)));
  const cover = m.cover;
  const hourData = hours.map((x, h) => ({ ...x, wbgt: +(x.wbgt - (h > 9 && h < 19 ? m.est.dT * 0.7 : m.est.dT * 0.25)).toFixed(1) }));
  const peak = Math.max(...hourData.map((x) => x.wbgt));
  const lvl = peak > 29 ? "elevato" : peak > 26 ? "moderato" : "basso";
  const [stage, setStage] = useState(0);
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState(DEFAULT_LOG.map((n) => ({ ...n })));
  const addLog = (t: string) => setLog((p) => [{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t }, ...p].slice(0, 20));
  const [uid, setUid] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    let seen: string | null | undefined;
    // Only signed-in users read/write their own saved state; guests keep the
    // approval cycle and log in memory and nothing is written to the backend.
    const sync = async (id: string | null) => {
      if (!alive || id === seen) return;
      const hadUser = seen !== null && seen !== undefined;
      seen = id;
      setUid(id);
      if (id) {
        const { data: row } = await supabase.from("urban_dashboard_state").select("stage, log, approvals").eq("user_id", id).maybeSingle();
        if (!alive) return;
        if (row) {
          setStage(row.stage);
          if (Array.isArray(row.log)) setLog(row.log as { d: string; t: string }[]);
          if (row.approvals && typeof row.approvals === "object" && !Array.isArray(row.approvals)) setApprovals(normalizeApprovals(row.approvals as Record<string, unknown>));
        }
      } else if (hadUser) {
        // Signing out must not leave the previous account's data on screen.
        setStage(0); setApprovals({}); setLog(DEFAULT_LOG.map((n) => ({ ...n })));
      }
      setLoaded(true);
    };
    supabase.auth.getUser().then(({ data }) => { void sync(data.user?.id ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { void sync(session?.user?.id ?? null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!uid || !loaded) return;
    const h = setTimeout(() => {
      supabase.from("urban_dashboard_state").upsert({ user_id: uid, stage, log, approvals, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) toast.error("Salvataggio del registro non riuscito"); });
    }, 600);
    return () => clearTimeout(h);
  }, [uid, loaded, stage, log, approvals]);
  const isOk = (e: string) => approvals[e]?.status === "approvato";
  const approvedCount = EXTERNAL.filter(isOk).length;
  const approvalActivity = EXTERNAL.some((e) => approvals[e]?.sent || (approvals[e] && approvals[e]?.status !== "attesa"));
  const approvalSignature = EXTERNAL.map((e) => `${approvals[e]?.status ?? "attesa"}:${approvals[e]?.sent ?? ""}`).join("|");
  const totalSteps = STAGES.length - 1 + EXTERNAL.length;
  const [simUnits, setSimUnits] = useState<number | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  // Both manual entity decisions and incoming email decisions drive the same saved stage.
  useEffect(() => {
    if (!loaded) return;
    setStage((previous) => approvedCount === EXTERNAL.length ? (previous === 3 ? 3 : 2) : approvalActivity || previous > 0 ? 1 : 0);
  }, [loaded, approvedCount, approvalActivity]);
  useEffect(() => {
    setSimUnits(null);
    setSimBusy(false);
  }, [approvalSignature]);
  const progress = Math.round(((simUnits ?? (stage + approvedCount)) / totalSteps) * 100);
  const displayedStage = simUnits === null ? stage : Math.min(STAGES.length - 1, Math.floor(simUnits / 2));
  useEffect(() => {
    if (simUnits === null || simUnits <= 0 || simBusy) return;
    const timer = window.setTimeout(() => setSimUnits((value) => value === null ? null : Math.max(0, value - 1)), 8000);
    return () => window.clearTimeout(timer);
  }, [simUnits, simBusy]);
  useEffect(() => {
    if (!simBusy) return;
    const timer = window.setTimeout(() => {
      setSimUnits((value) => Math.min(totalSteps, (value ?? (stage + approvedCount)) + 1));
      setSimBusy(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [simBusy, stage, approvedCount, totalSteps]);
  useEffect(() => { setSimUnits(null); setSimBusy(false); }, [uid]);
  const editApproval = (e: string, patch: Partial<Approval>) => setApprovals((p) => ({ ...p, [e]: { ...(p[e] ?? EMPTY_APPROVAL), ...patch } }));
  const setApprovalStatus = (e: string, status: ApprovalStatus) => {
    const prev = approvals[e] ?? EMPTY_APPROVAL;
    if (prev.status === status) return;
    const date = status === "attesa" ? "" : new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    editApproval(e, { status, date });
    addLog(status === "approvato" ? `Approvazione ricevuta: ${e}` : status === "respinto" ? `Parere negativo: ${e}` : `Approvazione in attesa: ${e}`);
    if (prev.status === "approvato" && stage >= 2) { setStage(1); toast("Stato riportato a Progettazione", { description: `${e}: ${status === "respinto" ? "respinto" : "in attesa"}` }); }
  };
  // Local demo: the same six-step scale, without modifying real approval decisions.
  const simulateEmail = () => {
    if (simBusy) return;
    setSimBusy(true);
    toast("Email simulata ricevuta", { description: "Parere favorevole · Comune" });
  };
  const confirmRealized = () => {
    if (approvedCount !== EXTERNAL.length || stage === 3) return;
    setSimUnits(null);
    setSimBusy(false);
    setStage(3);
    addLog("Stato aggiornato: Realizzato · completamento intervento confermato");
    toast.success("Intervento realizzato");
  };
  // Real flow (signed-in): create a secret link per body and send it by email.
  const sendRequest = async (e: string) => {
    if (!uid) return;
    const { data, error } = await (supabase as any).from("external_approval_requests").insert({ user_id: uid, entity: e }).select("token").single();
    if (error || !data) { toast.error("Richiesta non creata"); return; }
    const link = `${window.location.origin}/api/public/external-approval?token=${data.token}`;
    editApproval(e, { status: "attesa", sent: new Date().toISOString().slice(0, 10) });
    addLog(`Richiesta di parere inviata: ${e}`);
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard optional */ }
    window.location.href = `mailto:?subject=${encodeURIComponent(`Richiesta di parere · ${e}`)}&body=${encodeURIComponent(`Gentile ${approvals[e]?.ref || "referente"},\n\nper esprimere il parere sull'intervento apra questo link:\n${link}\n\nMicro Digital Twin`)}`;
    toast.success("Link copiato e email pronta", { description: "La barra avanzerà quando l'ente risponde." });
  };
  // Pick up decisions made by bodies through the email link.
  useEffect(() => {
    if (!uid || !loaded) return;
    let alive = true;
    const check = async () => {
      const { data } = await (supabase as any).from("external_approval_requests").select("id, entity, status").eq("user_id", uid).eq("applied", false).neq("status", "attesa");
      if (!alive || !data?.length) return;
      const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
      for (const r of data) {
        const st = r.status as ApprovalStatus;
        setApprovals((p) => ({ ...p, [r.entity]: { ...(p[r.entity] ?? EMPTY_APPROVAL), status: st, date: today } }));
        addLog(`📩 Parere via email: ${r.entity} · ${st}`);
        toast(`📩 ${r.entity} ha risposto`, { description: st === "approvato" ? "Parere favorevole" : "Parere negativo" });
      }
      await (supabase as any).from("external_approval_requests").update({ applied: true }).in("id", data.map((r: { id: string }) => r.id));
    };
    void check();
    const iv = setInterval(check, 15000);
    window.addEventListener("focus", check);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("focus", check); };
  }, [uid, loaded]);
  const co2 = Math.round(lab.trees * 22), water = Math.round(4000 * (lab.permeable / 100) * 0.7 * 0.6), shadeM2 = Math.round(4000 * (lab.shade / 100) + lab.trees * 30);
  return (
    <div className="dashboard-view" data-testid="dashboard-urbana">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Kpi value={peak} max={35} color={levelColor(peak > 29 ? 80 : peak > 26 ? 50 : 20)} center={peak} unit="WBGT °C" label="Calore"><StatusBadge level={lvl}>{lvl}</StatusBadge></Kpi>
        <Kpi value={cover} max={target} color="var(--leaf)" center={`${cover}%`} unit={`su ${target}%`} label="Copertura alberi" />
        <Kpi value={le5} max={100} color="var(--urban)" center={`${le5}%`} unit="≤5 min" label="Rifugi vicini"><span className="text-[10px] text-muted-foreground">{le10}% entro 10 min</span></Kpi>
      </div>
      <div className={`dashboard-urban-main mt-4 grid gap-4 ${uid ? "lg:grid-cols-2" : ""}`}>
        <Card><div className="text-sm font-semibold">Scheda intervento</div>
          <div className="mt-3 space-y-2 text-sm">
            {[["Area", area], ["Interventi", `${lab.trees} alberi · ${lab.permeable}% suolo · ${lab.shade}% ombra`], ["ΔT atteso", `−${m.est.lo.toFixed(1)} / −${m.est.hi.toFixed(1)} °C`], ["Posizione", `${lab.location.lat.toFixed(3)}, ${lab.location.lng.toFixed(3)}`], ["Costo stimato", lab.trees + lab.permeable / 5 + lab.shade / 5 > 25 ? "alto" : lab.trees + lab.permeable / 5 + lab.shade / 5 > 12 ? "medio" : "basso"], ["Stato", STAGES[displayedStage]]].map(([k, v]) => <div key={k} className="dashboard-detail-row"><span className="text-muted-foreground">{k}</span>{k === "Stato" ? <b className="flex items-center gap-1.5"><span className={`size-2 shrink-0 rounded-full ${STAGE_TONES[displayedStage]?.dot}`} />{v}</b> : <b>{v}</b>}</div>)}
          </div>
            <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Ciclo di approvazione</span><span className="text-foreground">{progress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avanzamento approvazione" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${STAGE_TONES[displayedStage]?.dot}`} style={{ width: `${progress}%` }} />
            </div>
            <ol className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] leading-tight sm:text-[11px]" aria-label="Stadi di approvazione">
              {STAGES.map((s, i) => <li key={s} aria-current={i === displayedStage ? "step" : undefined} className={i === displayedStage ? "font-semibold text-foreground" : "text-muted-foreground"}>{s}</li>)}
            </ol>
            {!uid && <Button type="button" variant="ghost" onClick={simulateEmail} disabled={simBusy} className="mt-2 h-9 w-full rounded-full bg-urban/15 px-3 text-xs font-semibold text-urban"><Mail />{simBusy ? "Ricezione in corso…" : simUnits === null ? "Simula arrivo parere via email" : "Reinvia email simulata"}</Button>}
        </Card>
           <div className="dashboard-external-section">
           {uid ? (<>
             <div className="mt-3 text-xs font-semibold text-muted-foreground md:mt-0">Approvazioni esterne</div>
             <ul className="mt-2 space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
              {EXTERNAL.map((e) => {
                const a = approvals[e] ?? EMPTY_APPROVAL;
                return (
                   <li key={e} className="dashboard-tile min-w-0 rounded-xl bg-muted/40 p-2.5 text-xs" data-testid="external-approval">
                     <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                       <span className="min-w-0 font-semibold">{e}</span>
                      <span className={`font-semibold ${a.status === "approvato" ? "text-ok" : a.status === "respinto" ? "text-danger" : "text-muted-foreground"}`}>
                        {a.status === "approvato" ? `Approvato${a.date ? ` ${a.date}` : ""}` : a.status === "respinto" ? `Respinto${a.date ? ` ${a.date}` : ""}` : "In attesa"}
                      </span>
                    </div>
                     <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 md:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto]">
                      <input aria-label={`Referente ${e}`} placeholder="Referente" value={a.ref} onChange={(ev) => editApproval(e, { ref: ev.target.value })} className="h-9 min-w-0 rounded-lg border border-border bg-background px-2" />
                       <input aria-label={`Data di invio ${e}`} type="date" value={a.sent} onChange={(ev) => editApproval(e, { sent: ev.target.value })} className="h-9 min-w-0 max-w-full rounded-lg border border-border bg-background px-2" />
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1" role="group" aria-label={`Stato ${e}`}>
                      {APPROVAL_STATES.map(([v, l, tone]) => (
                        <Button key={v} type="button" variant="ghost" aria-pressed={a.status === v} onClick={() => setApprovalStatus(e, v)} className={`h-8 rounded-full border px-1 text-[11px] font-semibold ${a.status === v ? tone : "border-border bg-background text-muted-foreground"}`}>{l}</Button>
                      ))}
                    </div>
                    {a.status !== "approvato" && <button type="button" onClick={() => void sendRequest(e)} className="mt-1.5 h-8 w-full rounded-full border border-urban/40 text-[11px] font-semibold text-urban">✉️ Invia richiesta via email</button>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Per passare ad “Approvato” servono tutte le approvazioni esterne.</p>
            {stage === 2 && approvedCount === EXTERNAL.length && <Button type="button" variant="outline" onClick={confirmRealized} className="mt-2 w-full border-ok/40 text-xs text-ok">Conferma intervento realizzato</Button>}
          </>) : null}
           </div>
      </div>
      <div className="mt-4 space-y-2">
        <Fold title="Andamento del calore" hint="· 24 h" icon={LineChartIcon}>
        <Card>
          <ChartKey items={[{ label: "WBGT (°C)", color: "var(--danger)" }]} />
          <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={hourData} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}><defs><linearGradient id="gw" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--danger)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--danger)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="h" fontSize={10} interval={3} tickMargin={6} /><YAxis width={30} fontSize={10} domain={[15, 35]} tickMargin={4} /><Tooltip {...tip} /><Area type="monotone" dataKey="wbgt" name="WBGT" stroke="var(--danger)" strokeWidth={3} fill="url(#gw)" isAnimationActive={animateCharts} animationDuration={1400} animationEasing="ease-out" /></AreaChart></ResponsiveContainer></div>
        </Card>
        </Fold>
        <Fold title="Avvisi calore" icon={AlertTriangle}>
        <Card className="space-y-2">
          {[["14:00–17:00", lvl, area], ["12:00–14:00", lvl === "elevato" ? "moderato" : "basso", near], ["Sera", "basso", `Aree verdi · ${area}`]].map(([t, l, p]) => (
            <div key={p} className="dashboard-alert-row"><div className="min-w-0"><div className="dashboard-long-label font-semibold">{p}</div><div className="text-muted-foreground">{t}</div></div><StatusBadge level={l as string} /></div>
          ))}
        </Card>
        </Fold>
        <Fold title="Benefici ambientali" hint="· stima annua" icon={Leaf}>
        <Card className="flex flex-col">
          <div className="mt-3 grid flex-1 grid-cols-3 gap-2 text-center">
            <div className="dashboard-tile dashboard-tile-stat rounded-xl bg-muted/50 p-2"><div className="dashboard-tile-value font-display text-lg font-semibold">{`${co2} kg`}</div><div className="dashboard-tile-label text-[10px] leading-tight text-muted-foreground">CO₂ assorbita</div></div>
            <div className="dashboard-tile dashboard-tile-stat rounded-xl bg-muted/50 p-2"><div className="dashboard-tile-value font-display text-lg font-semibold">{`${water} m³`}</div><div className="dashboard-tile-label text-[10px] leading-tight text-muted-foreground">Acqua trattenuta</div></div>
            <div className="dashboard-tile dashboard-tile-stat rounded-xl bg-muted/50 p-2"><div className="dashboard-tile-value font-display text-lg font-semibold">{`${shadeM2} m²`}</div><div className="dashboard-tile-label text-[10px] leading-tight text-muted-foreground">Superficie ombreggiata</div></div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Valori dimostrativi: ~22 kg CO₂ per albero, 60% di pioggia trattenuta su suolo permeabile (piovosità 700 mm, piazza di riferimento 4000 m²).</p>
        </Card>
        </Fold>
        <Fold title="Registro interventi" icon={NotebookPen}>
        <Card>
            <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { addLog(draft.trim()); setDraft(""); } }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={140} placeholder="Nuovo intervento…" aria-label="Nuova voce del registro" className="min-w-0 rounded-full bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <button aria-label="Aggiungi al registro" className="grid size-9 place-items-center rounded-full bg-urban text-primary-foreground"><Plus className="size-4" /></button>
            </form>
            <button type="button" onClick={() => { addLog(`Scenario: ${lab.trees} alberi, ${lab.permeable}% suolo, ${lab.shade}% ombra (−${m.est.dT.toFixed(1)} °C)`); toast.success("Aggiunto al registro"); }} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-urban/15 px-3 py-1.5 text-xs font-semibold text-urban"><Plus className="size-3.5" />Registra lo scenario della simulazione</button>
            <ul className="mt-3 max-h-52 space-y-2 overflow-auto">{log.map((n, i) => <li key={`${n.d}-${n.t}-${i}`} className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm animate-in fade-in slide-in-from-top-1"><b className="shrink-0 text-urban">{n.d}</b><span className="dashboard-long-label min-w-0 flex-1">{n.t}</span><button type="button" aria-label={`Elimina voce del ${n.d}: ${n.t}`} onClick={() => {
              const removed = n;
              setLog((prev) => prev.filter((_, j) => j !== i));
              toast("Voce eliminata", { description: removed.t, duration: 6000, action: { label: "Annulla", onClick: () => setLog((prev) => { const next = [...prev]; next.splice(Math.min(i, next.length), 0, removed); return next; }) } });
            }} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button></li>)}</ul>
        </Card>
          <FieldAI kind="urban" onAdd={addLog} />
        </Fold>
      </div>
    </div>
  );
}

/** Soil texture: field capacity cap (% vol) and percolation-loss factor. */
const SOILS = {
  sabbioso: { label: "Sabbioso", fc: 20, loss: 1.2 },
  franco: { label: "Franco", fc: 32, loss: 1 },
  argilloso: { label: "Argilloso", fc: 42, loss: 0.9 },
} as const;

type Irrig = { tgt: number; eff: number; soil: keyof typeof SOILS; notes: { d: string; t: string }[] };
let irrig: Irrig = { tgt: 32, eff: 85, soil: "franco", notes: [{ d: "24/09", t: "Trattamento rame zona B" }, { d: "26/09", t: "Irrigazione soccorso 90 m³/ha zona A" }] };
const irrigSubs = new Set<() => void>();
const setIrrig = (p: Partial<Irrig>) => { irrig = { ...irrig, ...p }; irrigSubs.forEach((f) => f()); };
function useIrrig() { return useSyncExternalStore((f) => { irrigSubs.add(f); return () => irrigSubs.delete(f); }, () => irrig, () => irrig); }
const irrigVolume = (tgt: number, cur: number, eff: number, soil: keyof typeof SOILS) => Math.max(0, ((Math.min(tgt, SOILS[soil].fc) - cur) / 100) * 0.5 * 10000 * SOILS[soil].loss / (eff / 100));

function VineDash() {
  const animateCharts = useChartAnimation();
  const vineLab = useLab().vineyard, vm = vineMetrics(vineLab);
  const cur = vm.moisture;
  const setCur = (value: number) => { const delta = value - cur; setVineyard((v) => ({ zones: v.zones.map((z) => ({ ...z, moisture: Math.max(0, Math.min(60, z.moisture + delta)) })) })); };
  const ir = useIrrig();
  const { tgt, eff, soil, notes } = ir;
  const setTgt = (n: number) => setIrrig({ tgt: n }), setEff = (n: number) => setIrrig({ eff: n }), setSoil = (k: keyof typeof SOILS) => setIrrig({ soil: k });
  const setNotes = (u: Irrig["notes"] | ((p: Irrig["notes"]) => Irrig["notes"])) => setIrrig({ notes: typeof u === "function" ? u(irrig.notes) : u });
  const soilInfo = SOILS[soil];
  const effTgt = Math.min(tgt, soilInfo.fc);
  const vol = Math.max(0, ((effTgt - cur) / 100) * 0.5 * 10000 * soilInfo.loss / (eff / 100));
  const deficit = Math.max(0, tgt - cur);
  const cwsi = +Math.min(1, Math.max(0, deficit / Math.max(tgt, 1) * 0.5 + vm.waterStress / 200)).toFixed(2);
  const cwsiLevel = cwsi < 0.35 ? "basso" : cwsi < 0.65 ? "moderato" : "elevato";
  const shift = cur - days.at(-1)!.s20;
  const probeData = days.map((p, i) => {
    const w = i / (days.length - 1);
    return { d: p.d, s20: +(p.s20 + shift * w).toFixed(1), s50: +(p.s50 + shift * 0.6 * w).toFixed(1) };
  });
  const ripeData = ripe.map((r, i) => ({
    w: r.w,
    zuccheri: +(r.zuccheri + i * deficit * 0.02 * (eff / 100)).toFixed(1),
    polifenoli: +(r.polifenoli + i * (deficit < 15 ? deficit * 0.015 : (30 - deficit) * 0.015)).toFixed(1),
  }));
  const [txt, setTxt] = useState("");
  return (
    <div className="dashboard-view" data-testid="dashboard-vitivinicola">
      <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-4">
        {vineLab.zones.map((z, i) => { const s = Math.round(vm.results[i]?.s ?? 0); const lv = vm.results[i]?.risk ?? "basso"; return (
          <Card key={i} className={`min-w-0 space-y-1.5 p-2.5 sm:p-5 ${i === vineLab.selected ? "ring-2 ring-inset ring-vine" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-1"><b className="text-sm">Zona {i + 1}</b><StatusBadge level={lv}>{s}</StatusBadge></div>
            <div className="text-xs text-muted-foreground"><b className="text-foreground">{z.temperature}°C</b> · <b className="text-foreground">{z.moisture}%</b><span className="hidden sm:inline"> · {z.wind} km/h · pioggia {z.rain ? "sì" : "no"}</span></div>
          </Card>); })}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Kpi value={cwsi} max={1} color={levelColor(cwsi * 100)} center={cwsi} unit="CWSI" label="Stress idrico"><StatusBadge level={cwsiLevel}>{cwsiLevel}</StatusBadge></Kpi>
        <Kpi value={probeData.at(-1)!.s20} max={55} color="var(--water)" center={`${probeData.at(-1)!.s20}%`} unit="umidità" label="Sonda 20 cm" />
        <Kpi value={probeData.at(-1)!.s50} max={55} color="var(--urban)" center={`${probeData.at(-1)!.s50}%`} unit="umidità" label="Sonda 50 cm" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Valori dimostrativi: seguono la simulazione e l’irrigazione di soccorso. CWSI 0 = nessuno stress, 1 = massimo.</p>
      <div className="mt-4 space-y-2">
        <Fold title="Irrigazione di soccorso" icon={Droplets}>
        <Card className="space-y-4">
          {[["Umidità attuale", cur, setCur, `${cur}%`], ["Umidità obiettivo", tgt, setTgt, `${tgt}%`], ["Efficienza impianto", eff, setEff, `${eff}%`]].map(([l, v, s, lab]) => (
            <div key={l as string}><div className="dashboard-control-label"><span>{l as string}</span><b>{lab as string}</b></div><Slider min={l === "Efficienza impianto" ? 50 : 5} max={l === "Efficienza impianto" ? 100 : 50} value={[v as number]} onValueChange={([x]) => (s as (n: number) => void)(x ?? 0)} /></div>
          ))}
          <div><div className="dashboard-control-label"><span>Tessitura del suolo</span><b>max {soilInfo.fc}%</b></div>
            <div role="radiogroup" aria-label="Tessitura del suolo" className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
              {(Object.keys(SOILS) as (keyof typeof SOILS)[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={soil === k} onClick={() => setSoil(k)} className={`rounded-full px-2 py-1.5 text-xs font-semibold ${soil === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{SOILS[k].label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-water/10 p-4">
            <div className="text-xs text-muted-foreground">Volume consigliato (strato 50 cm · {soilInfo.label.toLowerCase()})</div>
            <div className="font-display text-4xl font-semibold text-water">{Math.round(vol)} <span className="text-base">m³/ha</span></div>
            {effTgt < tgt && <p className="mt-1 text-xs text-muted-foreground">Obiettivo limitato a {soilInfo.fc}%: oltre la capacità di campo l'acqua si perde.</p>}
            <button type="button" disabled={vol <= 0} onClick={() => { const z = vineLab.selected != null ? ` zona ${vineLab.selected + 1}` : ""; setNotes((prev) => [{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t: `Irrigazione soccorso ${Math.round(vol)} m³/ha${z} (suolo ${soilInfo.label.toLowerCase()})` }, ...prev]); toast.success("Aggiunto al quaderno"); }} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-water px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Plus className="size-3.5" /> Invia al quaderno</button>
          </div>
        </Card>
        </Fold>
        <Fold title="Quaderno di campagna" icon={NotebookPen}>
        <Card>
          <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; setNotes([{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t: txt }, ...notes]); setTxt(""); }}>
            <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Nuova operazione…" className="min-w-0 rounded-full bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button className="grid size-9 place-items-center rounded-full bg-vine text-primary-foreground"><Plus className="size-4" /></button>
          </form>
          <ul className="mt-3 max-h-52 space-y-2 overflow-auto">{notes.map((n, i) => <li key={`${n.d}-${n.t}-${i}`} className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm animate-in fade-in slide-in-from-top-1"><b className="shrink-0 text-vine">{n.d}</b><span className="dashboard-long-label min-w-0 flex-1">{n.t}</span><button type="button" aria-label={`Elimina nota del ${n.d}: ${n.t}`} onClick={() => {
            const removed = n;
            setNotes((prev) => prev.filter((_, j) => j !== i));
            toast("Nota eliminata", { description: removed.t, duration: 6000, action: { label: "Annulla", onClick: () => setNotes((prev) => { const next = [...prev]; next.splice(Math.min(i, next.length), 0, removed); return next; }) } });
          }} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Trash2 className="size-4" /></button></li>)}</ul>
        </Card>
        <FieldAI onAdd={(t) => setNotes((prev) => [{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t }, ...prev])} />
        </Fold>
        <Fold title="Sonde e maturazione" hint="· 14 giorni e 10 settimane" icon={LineChartIcon}>
        <Card><div className="dashboard-card-title">Sonde umidità multilivello <span>· 14 giorni</span></div>
          <ChartKey items={[{ label: "20 cm", color: "var(--water)" }, { label: "50 cm", color: "var(--urban)" }, { label: `Obiettivo ${tgt}%`, color: "var(--vine)" }]} />
          <div className="dashboard-chart dashboard-chart-compact"><ResponsiveContainer width="100%" height="100%"><LineChart data={probeData} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="d" fontSize={10} interval={1} tickMargin={6} /><YAxis width={30} fontSize={10} domain={[0, 55]} tickMargin={4} /><Tooltip {...tip} /><ReferenceLine y={tgt} stroke="var(--vine)" strokeDasharray="6 4" /><Line dataKey="s20" name="20 cm" stroke="var(--water)" strokeWidth={3} dot={false} isAnimationActive={animateCharts} animationDuration={600} animationEasing="ease-out" /><Line dataKey="s50" name="50 cm" stroke="var(--urban)" strokeWidth={3} dot={false} isAnimationActive={animateCharts} animationDuration={600} animationEasing="ease-out" /></LineChart></ResponsiveContainer></div>
        </Card>
        <Card><div className="dashboard-card-title">Curve di maturazione <span>· confronto</span></div>
          <ChartKey items={[{ label: "Zuccheri (°Bx)", color: "var(--warn)" }, { label: "Polifenoli (idx)", color: "var(--vine)" }]} />
          <div className="dashboard-chart dashboard-chart-compact"><ResponsiveContainer width="100%" height="100%"><LineChart data={ripeData} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="w" fontSize={10} tickMargin={6} /><YAxis width={30} fontSize={10} domain={[0, 35]} tickMargin={4} /><Tooltip {...tip} /><Line dataKey="zuccheri" name="Zuccheri (°Bx)" stroke="var(--warn)" strokeWidth={3} dot={false} isAnimationActive={animateCharts} animationDuration={600} animationEasing="ease-out" /><Line dataKey="polifenoli" name="Polifenoli (idx)" stroke="var(--vine)" strokeWidth={3} dot={false} isAnimationActive={animateCharts} animationDuration={600} animationEasing="ease-out" /></LineChart></ResponsiveContainer></div>
        </Card>
        </Fold>
        <Fold title="Bilancio idrico del territorio" hint="· m³" icon={Waves}>
        <Card><ChartKey items={[{ label: "Domanda", color: "var(--warn)" }, { label: "Disponibile", color: "var(--water)" }]} />
          <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={WATER_BALANCE} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="m" fontSize={10} tickMargin={6} /><YAxis width={38} fontSize={10} tickMargin={4} /><Tooltip {...tip} /><Bar dataKey="domanda" name="Domanda" fill="var(--warn)" radius={[8, 8, 0, 0]} isAnimationActive={animateCharts} /><Bar dataKey="disponibile" name="Disponibile" fill="var(--water)" radius={[8, 8, 0, 0]} isAnimationActive={animateCharts} /></BarChart></ResponsiveContainer></div>
        </Card>
        </Fold>
      </div>
    </div>
  );
}

/** Ultimo report generato, conservato anche chiudendo la finestra o cambiando sezione. */
const reportCache = new Map<string, { doc: Promise<any>; pages?: string[] }>();

/** Anello di avanzamento del report: cresce senza ripartire da zero finché non compaiono i dati. */
function ProgressRing({ pct }: { pct: number }) {
  const size = 72, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-label="Preparazione del report" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--primary)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none" />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-foreground">{Math.round(p)}%</span>
    </div>
  );
}

/** "Esporta" della scheda aperta: PDF, copia, stampa, GeoJSON e CSV (prima nel cruscotto esecutivo). */
function ExportReport({ ctx }: { ctx: "Urbano" | "Vitivinicolo" }) {
  const water = WATER_BALANCE;
  const labState = useLab(), um = urbanMetrics(labState.urban), vm = vineMetrics(labState.vineyard);
  const reportMedia = useLabMedia(ctx === "Urbano" ? "urban" : "vineyard");
  // Every AI camera scan of this flow, photo or not.
  const scanRows = scanReportRows(useArScans(ctx === "Urbano" ? "urban" : "vineyard"));
  const idx = ctx === "Urbano" ? [["Calore", um.heat], ["Rifugi", um.refuges], ["Verde", um.green]] : [["Stress idrico", vm.waterStress], ["Stress termico", vm.heatStress], ["Maturità", 30]];
  const lv = (v: number) => (v < 35 ? "basso" : v < 65 ? "moderato" : "elevato");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"print" | "save">("print");
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const step = async (label: string, pct: number) => { setProgress({ label, pct }); await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 16))); };
  const [prepared, setPrepared] = useState(false);
  // Report tenuto in memoria: finché i dati non cambiano, PDF, copia e stampa riusano lo stesso.
  const cacheKey = () => JSON.stringify([ctx, labRows, idx, ctx === "Urbano" ? urbanDashRows : vineDashRows, reportMedia.map(m => [m.id, m.name, m.size]), scanRows]);
  const getDoc = () => {
    const k = cacheKey();
    let e = reportCache.get(k);
    if (!e) { e = { doc: buildPdfImpl() }; reportCache.clear(); reportCache.set(k, e); e.doc.catch(() => reportCache.delete(k)); }
    return e.doc;
  };
  /** "Esporta report": anello di avanzamento finché il report non è pronto, poi le opzioni. */
  const startExport = () => {
    const cached = reportCache.has(cacheKey());
    setPrepared(false); setProgress({ label: "Preparazione del report…", pct: cached ? 100 : 2 }); setOpen(true);
    getDoc().then(() => setPrepared(true), () => { setPrepared(true); toast.error("Preparazione non riuscita"); });
  };
  const u = labState.urban, v = labState.vineyard;
  const labRows: [string, string][] = ctx === "Urbano"
    ? [["Area", u.location.label], ["Coordinate", `${u.location.lat.toFixed(4)}, ${u.location.lng.toFixed(4)}`], ["Alberi", `${u.trees}`], ["Suolo permeabile", `${u.permeable}%`], ["Pergole/ombra", `${u.shade}%`], ["Riduzione stimata", `-${um.est.lo.toFixed(1)} / -${um.est.hi.toFixed(1)} °C`], ["Copertura arborea", `${um.cover}%`]]
    : [["Area", v.location.label], ["Coordinate", `${v.location.lat.toFixed(4)}, ${v.location.lng.toFixed(4)}`], ["Fase fenologica", v.phase], ["Zona selezionata", `Zona ${v.selected + 1}`], ...v.zones.map((z, i): [string, string] => [`Zona ${i + 1}`, `${z.temperature}°C · umidità ${z.moisture}% · vento ${z.wind} km/h · pioggia ${z.rain ? "sì" : "no"} · stress ${vm.results[i]?.s ?? 0} (${vm.results[i]?.risk ?? "-"})`])];
  const stamp = new Date().toLocaleString("it-IT");
  // Riepiloghi delle due dashboard, calcolati dagli stessi dati del Decision Lab.
  const uHourData = hours.map((x, h) => +(x.wbgt - (h > 9 && h < 19 ? um.est.dT * 0.7 : um.est.dT * 0.25)).toFixed(1));
  const uPeak = Math.max(...uHourData);
  const uLvl = uPeak > 29 ? "elevato" : uPeak > 26 ? "moderato" : "basso";
  const uLe5 = Math.min(100, Math.round(um.refuges * 1.6)), uLe10 = Math.min(100, Math.max(uLe5, Math.round(um.refuges * 2.3)));
  const uCost = u.trees + u.permeable / 5 + u.shade / 5 > 25 ? "alto" : u.trees + u.permeable / 5 + u.shade / 5 > 12 ? "medio" : "basso";
  const urbanDashRows: [string, string][] = [
    ["Area", u.location.label],
    ["WBGT massimo (24 h)", `${uPeak} °C — calore ${uLvl}`],
    ["Copertura arborea", `${um.cover}% (target 30%)`],
    ["Rifugi climatici", `${uLe5}% entro 5 min · ${uLe10}% entro 10 min`],
    ["Interventi", `${u.trees} alberi · ${u.permeable}% suolo · ${u.shade}% ombra`],
    ["ΔT atteso", `−${um.est.lo.toFixed(1)} / −${um.est.hi.toFixed(1)} °C`],
    ["Costo stimato", uCost],
  ];
  const ir = useIrrig();
  const vCur = vm.moisture, vTgt = ir.tgt, vEff = ir.eff;
  const vDeficit = Math.max(0, vTgt - vCur);
  const vCwsi = +Math.min(1, Math.max(0, vDeficit / Math.max(vTgt, 1) * 0.5 + vm.waterStress / 200)).toFixed(2);
  const vCwsiLevel = vCwsi < 0.35 ? "basso" : vCwsi < 0.65 ? "moderato" : "elevato";
  const vShift = vCur - days.at(-1)!.s20;
  const vVol = irrigVolume(vTgt, vCur, vEff, ir.soil);
  const vineDashRows: [string, string][] = [
    ["Area", v.location.label],
    ["Fase fenologica", v.phase],
    ["CWSI", `${vCwsi} — stress ${vCwsiLevel}`],
    ["Sonda 20 cm", `${+(days.at(-1)!.s20 + vShift).toFixed(1)}%`],
    ["Sonda 50 cm", `${+(days.at(-1)!.s50 + vShift * 0.6).toFixed(1)}%`],
    ["Irrigazione di soccorso", `${Math.round(vVol)} m³/ha (obiettivo ${Math.min(vTgt, SOILS[ir.soil].fc)}%, efficienza ${vEff}%)`],
    ["Tessitura del suolo", `${SOILS[ir.soil].label} (capacità di campo ${SOILS[ir.soil].fc}%)`],
    ...ir.notes.slice(0, 6).map((n): [string, string] => [`Quaderno ${n.d}`, n.t]),
    ...v.zones.map((z, i): [string, string] => [`Zona ${i + 1}`, `stress ${Math.round(vm.results[i]?.s ?? 0)} (${vm.results[i]?.risk ?? "-"})`]),
  ];
  const text = [`MICRO DIGITAL TWIN`, `REPORT SINTETICO DECISIONI — ${ctx}`, `Data: ${stamp}`, "", "Valori dalle simulazioni:", ...labRows.map(([k, x]) => `- ${k}: ${x}`), "", "Indici normalizzati:", ...idx.map(([k, x]) => `- ${k}: ${x}/100 (${lv(x as number)})`), "", ...(ctx === "Urbano" ? ["Dashboard Urbana:", ...urbanDashRows.map(([k, x]) => `- ${k}: ${x}`)] : ["Bilancio idrico (m³):", ...water.map((w) => `- ${w.m}: domanda ${w.domanda}, disponibile ${w.disponibile}, saldo ${w.disponibile - w.domanda}`), "", "Dashboard Vitivinicola:", ...vineDashRows.map(([k, x]) => `- ${k}: ${x}`)]), ...(scanRows.length ? ["", "Scansioni fotocamera AI:", ...scanRows.map(([k, x]) => `- ${k}: ${x}`)] : []), "", "Nota: valori dimostrativi, da validare con un tecnico."].join("\n");
  // Report PDF con intestazione del sito e grafica coerente con l'app (usato da Scarica e Stampa).
  async function buildPdfImpl() {
    await step("Preparazione del report…", 5);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    type RGB = [number, number, number];
    const C = { turq: [20, 184, 196] as RGB, primary: [37, 99, 235] as RGB, ok: [34, 179, 102] as RGB, warn: [240, 170, 40] as RGB, danger: [222, 72, 52] as RGB, water: [40, 150, 220] as RGB, ink: [22, 28, 40] as RGB, muted: [110, 118, 132] as RGB, line: [226, 230, 236] as RGB, soft: [244, 247, 250] as RGB };
    const accent: RGB = ctx === "Urbano" ? [30, 150, 215] : [170, 40, 100];
    const levelRGB = (x: number): RGB => (x < 35 ? C.ok : x < 65 ? C.warn : C.danger);
    const clean = (t: string) => t.replace(/[−–—]/g, "-").replace(/Δ/g, "Delta ").replace(/→/g, "->").replace(/·/g, "-").replace(/³/g, "3").replace(/≈/g, "~");
    const W = 210, M = 15, CW = W - 2 * M;
    let y = 0;
    const header = () => {
      doc.setFillColor(...C.ink); doc.rect(0, 0, W, 24, "F");
      doc.setFillColor(...C.turq); doc.rect(0, 24, W, 1.2, "F");
      try { doc.addImage(climateTwinLogoCompact, "PNG", M, 5, 14, 14); } catch { /* logo opzionale */ }
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
      doc.text("MICRO DIGITAL", M + 18, 13);
      doc.setTextColor(...C.turq); doc.text("TWIN", M + 18 + doc.getTextWidth("MICRO DIGITAL "), 13);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(200, 206, 216);
      doc.text("Gemello digitale del microclima", M + 18, 18);
      doc.text(clean(stamp), W - M, 13, { align: "right" });
      y = 34;
    };
    const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); header(); } };
    const section = (title: string) => {
      ensure(14);
      doc.setFillColor(...accent); doc.roundedRect(M, y - 3.6, 1.6, 5, 0.8, 0.8, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(...C.ink);
      doc.text(clean(title), M + 4, y); y += 5;
    };
    const table = (rows: [string, string][]) => {
      doc.setFontSize(9);
      rows.forEach(([k, v], i) => {
        const lines = doc.splitTextToSize(clean(v), CW * 0.6 - 4) as string[];
        const h = Math.max(7, lines.length * 4.2 + 3);
        ensure(h);
        if (i % 2 === 0) { doc.setFillColor(...C.soft); doc.rect(M, y, CW, h, "F"); }
        doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted); doc.text(clean(k), M + 3, y + 4.7);
        doc.setFont("helvetica", "bold"); doc.setTextColor(...C.ink); doc.text(lines, M + CW * 0.4, y + 4.7);
        y += h;
      });
      doc.setDrawColor(...C.line); doc.line(M, y, M + CW, y); y += 8;
    };
    const ring = (cx: number, cy: number, r: number, value: number, color: RGB) => {
      doc.setLineWidth(2.4); doc.setDrawColor(...C.line); doc.circle(cx, cy, r, "S");
      doc.setDrawColor(...color);
      const steps = Math.max(1, Math.round(value * 0.9));
      for (let s = 0; s < steps; s++) {
        const a0 = -Math.PI / 2 + (s / steps) * (value / 100) * 2 * Math.PI, a1 = -Math.PI / 2 + ((s + 1) / steps) * (value / 100) * 2 * Math.PI;
        doc.line(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1));
      }
      doc.setLineWidth(0.2);
    };
    header();
    doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...C.ink);
    doc.text(`Report sintetico decisioni - ${ctx}`, M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text(clean(`Area: ${(ctx === "Urbano" ? u : v).location.label}`), M, y); y += 9;
    // Indici con anelli colorati, come nelle card del cruscotto.
    section("Indici normalizzati");
    const cardW = (CW - 8) / 3;
    idx.forEach(([k, x], i) => {
      const val = x as number, cx = M + i * (cardW + 4);
      doc.setFillColor(...C.soft); doc.setDrawColor(...C.line); doc.roundedRect(cx, y, cardW, 30, 3, 3, "FD");
      ring(cx + 14, y + 15, 9, val, levelRGB(val));
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...C.ink); doc.text(String(val), cx + 14, y + 16.5, { align: "center" });
      doc.setFontSize(9.5); doc.text(String(k), cx + 27, y + 12);
      const lvl = lv(val); doc.setFontSize(7.5); const bw = doc.getTextWidth(lvl) + 6;
      doc.setFillColor(...levelRGB(val)); doc.roundedRect(cx + 27, y + 15.5, bw, 5, 2.5, 2.5, "F");
      doc.setTextColor(255, 255, 255); doc.text(lvl, cx + 30, y + 19);
    });
    y += 38;
    section("Valori dalle simulazioni");
    table(labRows);
    // Grafico a barre del bilancio idrico (solo report vitivinicolo).
    if (ctx === "Vitivinicolo") {
    section("Bilancio idrico territoriale (m3)");
    ensure(58);
    const chH = 40, chY = y + 2, maxV = 700, gw = CW / water.length;
    doc.setDrawColor(...C.line); doc.setFontSize(7); doc.setTextColor(...C.muted);
    [0, 350, 700].forEach((t) => { const ly = chY + chH - (t / maxV) * chH; doc.line(M + 8, ly, M + CW, ly); doc.text(String(t), M + 6, ly + 1, { align: "right" }); });
    water.forEach((w, i) => {
      const bx = M + 8 + i * ((CW - 8) / water.length) + 6, bw = ((CW - 8) / water.length - 12) / 2;
      const hd = (w.domanda / maxV) * chH, ha = (w.disponibile / maxV) * chH;
      doc.setFillColor(...C.warn); doc.roundedRect(bx, chY + chH - hd, bw - 1, hd, 1, 1, "F");
      doc.setFillColor(...C.water); doc.roundedRect(bx + bw, chY + chH - ha, bw - 1, ha, 1, 1, "F");
      doc.setTextColor(...C.muted); doc.text(w.m, bx + bw, chY + chH + 4, { align: "center" });
    });
    void gw;
    y = chY + chH + 9;
    doc.setFontSize(8);
    doc.setFillColor(...C.warn); doc.circle(M + 10, y - 1, 1.3, "F"); doc.setTextColor(...C.ink); doc.text("Domanda", M + 13, y);
    doc.setFillColor(...C.water); doc.circle(M + 34, y - 1, 1.3, "F"); doc.text("Disponibile", M + 37, y);
    y += 9;
    }
    await step("Compilazione delle tabelle…", 25);
    if (ctx === "Urbano") { section("Dashboard Urbana"); table(urbanDashRows); }
    else { section("Dashboard Vitivinicola"); table(vineDashRows); }
    // Scansioni della fotocamera AI: ognuna resta nel report anche senza foto (stime indicative).
    if (scanRows.length) { section(`Scansioni fotocamera AI - ${ctx}`); table(scanRows); }
    // Foto e video caricati nelle simulazioni (elenco + miniature delle foto).
    const { currentMedia } = await import("@/models/lab-media-store");
    const toData = async (url: string) => {
      try {
        const blob = await (await fetch(url)).blob();
        const bmp = await createImageBitmap(blob);
        const s = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        return { d: c.toDataURL("image/jpeg", 0.75), r: c.height / c.width };
      } catch { return null; }
    };
    for (const [k, label] of ([["urban", "Urbano"], ["vineyard", "Vitivinicolo"]] as const).filter(([, l]) => l === ctx)) {
      const media = await currentMedia(k);
      if (!media.length) continue;
      section(`Foto e video - ${label}`);
      table(media.map((m, i): [string, string] => [`${i + 1}. ${m.kind === "video" ? "Video" : "Foto"}${/^(foto|video)-ar-/.test(m.name) ? " AR" : ""}`, m.name]));
      const imgs = media.filter((m) => m.kind === "image");
      const tw = (CW - 8) / 3;
      let col = 0;
      for (let i = 0; i < imgs.length; i++) {
        await step(`Elaborazione immagini ${i + 1} di ${imgs.length}…`, 30 + Math.round((i / imgs.length) * 55));
        const img = await toData(imgs[i]!.url);
        if (!img) continue;
        const th = Math.min(tw * img.r, 60);
        if (col === 0) ensure(64);
        const x = M + col * (tw + 4);
        try { doc.addImage(img.d, "JPEG", x, y, tw, th); } catch { /* immagine non supportata */ }
        col = (col + 1) % 3;
        if (col === 0) y += 64;
      }
      if (col !== 0) y += 64;
      y += 4;
    }
    await step("Finalizzazione PDF…", 86);
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
      doc.text("Valori dimostrativi, da validare con un tecnico.", M, 290);
      doc.text(`Pagina ${p} di ${pages}`, W - M, 290, { align: "right" });
    }
    return doc;
  }
  const fileName = `report-${ctx.toLowerCase()}.pdf`;
  /** Il preloader resta visibile fino al termine reale dell'esportazione (salvataggio, condivisione o stampa). */
  const [exporting, setExporting] = useState<string | null>(null);
  const withExport = async (label: string, run: () => Promise<void>) => {
    if (exporting) return;
    const t0 = performance.now();
    setExporting(label);
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 16)));
    try { await run(); }
    finally {
      const wait = 500 - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setExporting(null);
    }
  };
  const download = () => withExport("Esportazione del PDF…", async () => {
    const doc = await getDoc();
    // Se il browser lo supporta, lascia scegliere all'utente dove salvare il file.
    const picker = (window as any).showSaveFilePicker;
    if (typeof picker === "function") {
      try {
        const handle = await picker({
          suggestedName: fileName,
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(doc.output("blob"));
        await writable.close();
        toast.success("PDF salvato");
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // annullato dall'utente
        // altrimenti fallback qui sotto
      }
    }
    doc.save(fileName);
    toast.success("PDF scaricato");
  });
  const sharePdf = () => withExport("Preparazione della condivisione…", async () => {
    try {
      const doc = await getDoc();
      const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Report ${ctx} — MICRO DIGITAL TWIN` });
      } else { doc.save(fileName); toast("Condivisione non supportata: PDF scaricato"); }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Condivisione non riuscita");
    }
  });
  const openPreview = async (m: "print" | "save") => {
    setMode(m);
    const entry = reportCache.get(cacheKey());
    if (entry?.pages) {
      // Prima chiude la finestra delle opzioni, poi mostra l'anteprima già pronta:
      // aprirle nello stesso istante faceva richiudere subito l'anteprima.
      const pages = entry.pages;
      setPreview([]); setProgress({ label: "Caricamento anteprima…", pct: 100 }); setOpen(false);
      await new Promise<void>((r) => setTimeout(r, 350));
      setPreview(pages); setProgress(null);
      return;
    }
    // Anteprima dentro l'app: le pagine del PDF vengono disegnate come immagini.
    setPreview([]);
    setProgress({ label: "Preparazione del report…", pct: 2 });
    setOpen(false);
    try {
      const doc = await getDoc();
      await step("Caricamento anteprima…", 90);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const pdf = await pdfjs.getDocument({ data: doc.output("arraybuffer") }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        await step(`Anteprima pagina ${i} di ${pdf.numPages}…`, 90 + Math.round(((i - 1) / pdf.numPages) * 10));
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        pages.push(canvas.toDataURL("image/jpeg", 0.85));
      }
      const e2 = reportCache.get(cacheKey()); if (e2) e2.pages = pages;
      setPreview(pages);
      setProgress(null);
    } catch (e) {
      console.error("Anteprima di stampa non riuscita", e);
      setPreview(null); setProgress(null);
      toast.error("Anteprima non disponibile");
    }
  };
  const printPreview = async () => {
    if (!preview?.length) return;
    // Stampa dalla pagina stessa: gli iframe nascosti non stampano su molti telefoni.
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    preview.forEach((src) => { const im = new Image(); im.src = src; im.alt = ""; root.appendChild(im); });
    document.body.appendChild(root);
    await Promise.all(Array.from(root.querySelectorAll("img")).map((im) => im.decode().catch(() => null)));
    const cleanup = () => { root.remove(); document.documentElement.classList.remove("printing-report"); window.removeEventListener("afterprint", cleanup); };
    document.documentElement.classList.add("printing-report");
    window.addEventListener("afterprint", cleanup);
    try { window.print(); } catch { cleanup(); toast.error("Stampa non disponibile: scarica il PDF"); return; }
    setTimeout(cleanup, 120000);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Report copiato"); }
    catch { toast.error("Copia non riuscita"); }
  };
  const downloadData = (format: "geojson" | "csv") => {
    const snapshot = labState;
    const flow = ctx === "Urbano" ? "urban" : "vineyard";
    const exportedAt = new Date().toISOString();
    void withExport(`Preparazione ${format === "csv" ? "CSV" : "GeoJSON"}…`, async () => {
      try {
        const content = format === "csv" ? scenarioCsv(snapshot, flow, exportedAt)
          : JSON.stringify(scenarioGeoJson(snapshot, flow, exportedAt), null, 2);
        const blob = new Blob([content], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/geo+json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `scenario-${ctx.toLowerCase()}-${exportedAt.slice(0, 10)}.${format}`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast.success(`${format === "csv" ? "CSV" : "GeoJSON"} scaricato — ${ctx}`);
      } catch { toast.error("Esportazione dei dati non riuscita"); }
    });
  };
  return (
    <>
      <button onClick={startExport} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 sm:px-4"><Download className="size-4 shrink-0" /><span className="truncate">Esporta report</span></button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Esporta report — {ctx}</DialogTitle></DialogHeader>
          {!prepared ? <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground"><ProgressRing pct={progress?.pct ?? 2} /><span>{progress?.label ?? "Preparazione del report…"}</span></div> : <div className="flex flex-col gap-2">
            <button onClick={() => openPreview("save")} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"><Download className="size-4" />Scarica PDF</button>
            <button onClick={copy} className="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition-transform hover:scale-105"><Copy className="size-4" />Copia</button>
            <button onClick={() => openPreview("print")} className="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition-transform hover:scale-105"><Printer className="size-4" />Stampa</button>
            <div className="mt-2 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={!!exporting} onClick={() => downloadData("geojson")}><MapPin className="size-4" />GeoJSON</Button>
                <Button variant="outline" disabled={!!exporting} onClick={() => downloadData("csv")}><Download className="size-4" />CSV</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Simulazione · coordinate della località, non confini rilevati delle zone.</p>
              {exporting && <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 py-3 text-sm"><ProgressRing pct={100} /><span>{exporting}</span></div>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-3">
          <DialogHeader><DialogTitle>{mode === "save" ? "Anteprima PDF" : "Anteprima di stampa"} — {ctx}</DialogTitle></DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
          {exporting && <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/85 text-sm text-foreground backdrop-blur-sm"><span className="size-8 animate-spin rounded-full border-4 border-primary/25 border-t-primary motion-reduce:animate-none" /><span>{exporting}</span></div>}
          <div className="h-full max-h-[calc(90vh-9rem)] space-y-3 overflow-y-auto bg-muted p-2">
            {preview?.length ? preview.map((src, i) => <img key={i} src={src} alt={`Pagina ${i + 1} del report`} className="w-full rounded shadow" />)
              : <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground"><ProgressRing pct={progress?.pct ?? 2} /><span>{progress?.label ?? "Preparazione del report…"}</span></div>}
          </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPreview(null)} className="flex-1 rounded-full border px-4 py-3 text-sm font-medium">Chiudi</button>
            {mode === "save"
              ? <button onClick={() => void download()} disabled={!preview?.length || !!exporting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"><Download className="size-4" />{exporting ? "Esportazione…" : "Salva PDF"}</button>
              : null}
            {mode === "save" && <button onClick={() => void sharePdf()} disabled={!preview?.length || !!exporting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium disabled:opacity-50"><Share2 className="size-4" />Salva in…</button>}
            {mode === "print" && <button onClick={() => void withExport("Preparazione della stampa…", printPreview)} disabled={!preview?.length || !!exporting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"><Printer className="size-4" />Stampa</button>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Dashboard() {
  const { tab: t } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setT = (v: "Piazza" | "Vigneto") =>
    navigate({ search: (prev) => ({ ...prev, tab: v }), replace: true, resetScroll: false });
  const loading = useDashboardLoading(t);
  return (
    <div className="min-w-0 overflow-x-clip">
      <h1 className="sr-only">Dashboard</h1>
      <div className="sticky top-[var(--nav-h)] transition-[top] duration-300 z-[999999998] isolate -mx-4 mb-5 min-w-0 border-b bg-background/95 px-4 py-2 backdrop-blur-xl sm:mb-6">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Pills options={["Piazza", "Vigneto"] as const} value={t} onChange={setT} className="w-auto flex-nowrap" />
          <ExportReport ctx={t === "Piazza" ? "Urbano" : "Vitivinicolo"} />
        </div>
        <LabSyncIndicator className="mt-2 max-w-full" />
      </div>
      <div key={t} className="min-w-0">{loading
        ? <DashboardLoading label={t === "Piazza" ? "dashboard della piazza" : "dashboard del vigneto"} tone={t === "Piazza" ? "urban" : "vine"} />
        : <div className="dashboard-content-enter">{t === "Piazza" ? <UrbanDash /> : <VineDash />}</div>}
      </div>
    </div>
  );
}
