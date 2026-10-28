import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import { useTabSwipe } from "@/lib/use-tab-swipe";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, Plus, Building2, Grape, Copy, Printer, Activity, Trash2, Share2, Mail, LineChart as LineChartIcon, Leaf, NotebookPen, Droplets, Waves } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addHistory } from "@/lib/use-history";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Ring, StatusBadge, levelColor } from "@/views/health";
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
import { Fold, FoldTabs } from "@/views/Fold";
import { Ambient, PageHero, TabRow } from "@/views/v8/console";
import { FieldAI } from "@/views/FieldAI";
import { DashCard, DashSection, PiazzaDashboard, PremiumPart, URBAN_LOCKED, VINE_LOCKED, VineDashboard, getDashSeason } from "@/views/v10/Dashboard";
import { useQueryClient } from "@tanstack/react-query";
import { heatStep, heatWords, piazzaMix, piazzaSummary, thirstStep, thirstWords, vineMixRows, vineSummary } from "@/models/project-summary";
import { SEASON_LABEL, type Season } from "@/models/season-climate";
import { euroRange, grouped } from "@/models/intervention-cost";
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

/** Premium records of the piazza: the approval cycle with the public bodies, the log of interventions and the AI plan. */
function UrbanRecords() {
  const lab = useLab().urban, m = urbanMetrics(lab);
  const [stage, setStage] = useState(0);
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState(DEFAULT_LOG.map((n) => ({ ...n })));
  const addLog = (t: string) => {
    setLog((p) => [{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t }, ...p].slice(0, 20));
    void addHistory("piazza", t, splitLocation(lab.location.label).name);
  };
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
    if (!uid) {
      // Simulated sign-in (previews): the email is prepared without the answer link, which needs a real account.
      editApproval(e, { status: "attesa", sent: new Date().toISOString().slice(0, 10) });
      addLog(`Richiesta di parere inviata: ${e}`);
      window.location.href = `mailto:?subject=${encodeURIComponent(`Richiesta di parere · ${e}`)}&body=${encodeURIComponent(`Gentile ${approvals[e]?.ref || "referente"},\n\nle chiediamo un parere sull'intervento in ${lab.location.label}: ${lab.trees} alberi, ${lab.permeable}% di prato, ${lab.shade}% di ombra.\n\nMicro Digital Twin`)}`;
      toast("Email pronta", { description: "In anteprima manca il link di risposta: serve un account vero." });
      return;
    }
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
  return (
    <div className="space-y-8">
      <DashSection title="Registro interventi">
        <DashCard>
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
        </DashCard>
      </DashSection>
      <PremiumPart locked={URBAN_LOCKED}>
        <div className="space-y-8">
          <DashSection title="Approvazioni degli enti" hint={STAGES[displayedStage]}>
        <DashCard>
            <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Ciclo di approvazione</span><span className="text-foreground">{progress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avanzamento approvazione" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${STAGE_TONES[displayedStage]?.dot}`} style={{ width: `${progress}%` }} />
            </div>
            <ol className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] leading-tight sm:text-[11px]" aria-label="Stadi di approvazione">
              {STAGES.map((s, i) => <li key={s} aria-current={i === displayedStage ? "step" : undefined} className={i === displayedStage ? "font-semibold text-foreground" : "text-muted-foreground"}>{s}</li>)}
            </ol>
            {!uid && <Button type="button" variant="ghost" onClick={simulateEmail} disabled={simBusy} className="mt-2 h-9 w-full rounded-full bg-urban/15 px-3 text-xs font-semibold text-urban"><Mail />{simBusy ? "Ricezione in corso…" : simUnits === null ? "Simula arrivo parere via email" : "Reinvia email simulata"}</Button>}
           <div className="dashboard-external-section">
           {(<>
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
          </>)}
           </div>
        </DashCard>
      </DashSection>
          <DashSection title="Piano suggerito dall'AI"><FieldAI kind="urban" onAdd={addLog} /></DashSection>
        </div>
      </PremiumPart>
    </div>
  );
}

type Notes = { d: string; t: string }[];
let vineNotes: Notes = [{ d: "24/09", t: "Trattamento rame zona B" }, { d: "26/09", t: "Irrigazione soccorso 90 m³/ha zona A" }];
const notesSubs = new Set<() => void>();
const setNotesStore = (n: Notes) => { vineNotes = n; notesSubs.forEach((f) => f()); };
function useNotes() { return useSyncExternalStore((f) => { notesSubs.add(f); return () => notesSubs.delete(f); }, () => vineNotes, () => vineNotes); }

/** Premium records of the vineyard: the field notebook and the AI plan. */
function VineRecords() {
  const notes = useNotes();
  const setNotes = (u: Notes | ((p: Notes) => Notes)) => setNotesStore(typeof u === "function" ? u(vineNotes) : u);
  const [txt, setTxt] = useState("");
  const place = splitLocation(useLab().vineyard.location.label).name;
  const addNote = (t: string) => {
    setNotes((prev) => [{ d: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }), t }, ...prev]);
    void addHistory("vigneto", t, place);
  };
  return (
    <div className="space-y-8">
      <DashSection title="Quaderno di campagna">
        <DashCard>
          <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; addNote(txt); setTxt(""); }}>
            <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Nuova operazione…" className="min-w-0 rounded-full bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button className="grid size-9 place-items-center rounded-full bg-vine text-primary-foreground"><Plus className="size-4" /></button>
          </form>
          <ul className="mt-3 max-h-52 space-y-2 overflow-auto">{notes.map((n, i) => <li key={`${n.d}-${n.t}-${i}`} className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm animate-in fade-in slide-in-from-top-1"><b className="shrink-0 text-vine">{n.d}</b><span className="dashboard-long-label min-w-0 flex-1">{n.t}</span><button type="button" aria-label={`Elimina nota del ${n.d}: ${n.t}`} onClick={() => {
            const removed = n;
            setNotes((prev) => prev.filter((_, j) => j !== i));
            toast("Nota eliminata", { description: removed.t, duration: 6000, action: { label: "Annulla", onClick: () => setNotes((prev) => { const next = [...prev]; next.splice(Math.min(i, next.length), 0, removed); return next; }) } });
          }} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Trash2 className="size-4" /></button></li>)}</ul>
        </DashCard>
      </DashSection>
      <PremiumPart locked={VINE_LOCKED}>
        <DashSection title="Piano suggerito dall'AI"><FieldAI onAdd={addNote} /></DashSection>
      </PremiumPart>
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
  const labState = useLab();
  const reportMedia = useLabMedia(ctx === "Urbano" ? "urban" : "vineyard");
  // Every AI camera scan of this flow, photo or not.
  const scanRows = scanReportRows(useArScans(ctx === "Urbano" ? "urban" : "vineyard"));
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"print" | "save">("print");
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const step = async (label: string, pct: number) => { setProgress({ label, pct }); await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 16))); };
  const [prepared, setPrepared] = useState(false);
  // Report tenuto in memoria: finché i dati non cambiano, PDF, copia e stampa riusano lo stesso.
  const cacheKey = () => JSON.stringify([ctx, reportRows, ps.day, reportMedia.map(m => [m.id, m.name, m.size]), scanRows]);
  // Two looks of the same report: the dark one of the app (Salva PDF, Salva in…) and a light one for paper (Stampa).
  const getDoc = (light = false) => {
    const base = cacheKey(), k = `${base}|${light ? "light" : "dark"}`;
    let e = reportCache.get(k);
    if (!e) {
      e = { doc: buildPdfImpl(light) };
      for (const old of [...reportCache.keys()]) if (!old.startsWith(base)) reportCache.delete(old);
      reportCache.set(k, e); e.doc.catch(() => reportCache.delete(k));
    }
    return e.doc;
  };
  /** "Esporta report": anello di avanzamento finché il report non è pronto, poi le opzioni. */
  const startExport = () => {
    const cached = reportCache.has(`${cacheKey()}|dark`);
    setPrepared(false); setProgress({ label: "Preparazione del report…", pct: cached ? 100 : 2 }); setOpen(true);
    getDoc().then(() => setPrepared(true), () => { setPrepared(true); toast.error("Preparazione non riuscita"); });
  };
  const u = labState.urban, v = labState.vineyard;
  // The same summary as the dashboard on screen (season, measured surfaces and the place's real year from the shared cache).
  const qc = useQueryClient();
  const season = getDashSeason();
  const areaOf = (key: unknown[]) => (qc.getQueryData(key) as { m2: number | null } | undefined)?.m2 ?? null;
  const yearOf = qc.getQueryData(["season-climate", u.location.lat, u.location.lng]) as { profile: Record<Season, Array<number | null>> } | undefined;
  const ps = piazzaSummary(u, season, yearOf?.profile[season] ?? null, areaOf(["place-area", u.location.lat, u.location.lng]));
  const vs = vineSummary(v, areaOf(["vine-area", v.location.lat, v.location.lng]));
  const notes = useNotes();
  const f1 = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const stamp = new Date().toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const mixRows = ctx === "Urbano" ? piazzaMix(u, ps) : vineMixRows(vs);
  const resultRows: [string, string][] = ctx === "Urbano"
    ? [
      ["Luogo", u.location.label],
      ["Quando", `Ora più calda · ${SEASON_LABEL[season].toLowerCase()}, ore ${ps.hour}${ps.estimated ? " (stima indicativa)" : ""}`],
      ["Calore percepito", `da ${f1(ps.before)} °C a ${f1(ps.after)} °C (−${f1(ps.before - ps.after)} °C) · ${heatWords(ps.after)}`],
      ["Livello", ps.level ?? "Nessun intervento"],
      ["Costo indicativo", ps.empty ? "Nessun intervento" : euroRange(ps.cost)],
      ["Superficie", `${grouped(ps.m2)} m² ${ps.measured ? "della piazza" : "di riferimento"}`],
    ]
    : [
      ["Luogo", v.location.label],
      ["Fase della vite", v.phase],
      ["Sete delle viti", `da ${Math.round(vs.before)} a ${Math.round(vs.after)} su 100 · ${thirstWords(vs.after)}`],
      ["Livello", vs.level ?? "Nessun intervento"],
      ["Costo indicativo", vs.empty ? "Nessun intervento" : euroRange(vs.cost)],
      ["Superficie", vs.measured ? `${grouped(vs.m2)} m² del vigneto` : "1 ettaro di riferimento"],
    ];
  const benefits: Array<[string, string]> = ctx === "Urbano"
    ? [[`${ps.co2} kg`, "CO2 l'anno"], [`${grouped(ps.water)} m³`, "Pioggia tenuta"], [`${grouped(ps.shadeM2)} m²`, "All'ombra"]]
    : [[`${vs.safe} di ${vs.zones.length}`, "Zone al sicuro"], [vs.mix.shade ? `-${f1((vs.mix.shade / 100) * 3)}°` : "0°", "Sulle foglie"], [vs.mix.windbreak ? `-${Math.round((vs.mix.windbreak / 100) * 60)}%` : "0%", "Vento"]];
  const zoneRows: [string, string][] = ctx === "Urbano" ? [] : vs.zones.map((z, i): [string, string] => [`Zona ${i + 1}`, `sete ${Math.round(z.after)} (senza: ${Math.round(z.plain)}) · ${Math.round(z.temp)} °C · ${Math.round(z.moisture)}% acqua`]);
  const noteRows: [string, string][] = ctx === "Urbano" ? [] : notes.slice(0, 8).map((n): [string, string] => [n.d, n.t]);
  const reportRows: [string, string][] = [
    ...resultRows,
    ...mixRows.map((r): [string, string] => [r.label, `${r.value} · ${r.cost}`]),
    ...benefits.map(([x, l]): [string, string] => [l, x]),
    ...zoneRows,
    ...noteRows.map(([d, t]): [string, string] => [`Quaderno ${d}`, t]),
  ];
  const text = [`MICRO DIGITAL TWIN`, `Report · ${ctx === "Urbano" ? "Piazza" : "Vigneto"}`, stamp, "", ...reportRows.map(([k, x]) => `- ${k}: ${x}`), ...(scanRows.length ? ["", "Scansioni fotocamera AI:", ...scanRows.map(([k, x]) => `- ${k}: ${x}`)] : []), "", "Valori indicativi, da validare con un tecnico."].join("\n");
  // Report PDF con intestazione del sito e grafica coerente con l'app (usato da Scarica e Stampa).
  // Report PDF in the app's own look (v10): the dark canvas, slate cards, thin big readings, the half ring of the result.
  async function buildPdfImpl(light = false) {
    await step("Preparazione del report…", 5);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    type RGB = [number, number, number];
    // Dark like the app on screen, or light for paper (white page, pale cards, dark ink, a deeper turquoise to stay legible).
    const C = light
      ? { page: [255, 255, 255] as RGB, card: [241, 243, 246] as RGB, line: [221, 225, 231] as RGB, ink: [20, 26, 38] as RGB, muted: [98, 107, 122] as RGB, turq: [13, 148, 136] as RGB, dot: [20, 26, 38] as RGB }
      : { page: [10, 13, 19] as RGB, card: [24, 29, 38] as RGB, line: [42, 49, 61] as RGB, ink: [242, 244, 248] as RGB, muted: [148, 156, 170] as RGB, turq: [76, 201, 189] as RGB, dot: [13, 16, 22] as RGB };
    // The five-step scale of the app, worst first (as GAIN_BG), and the arc's gradient from cool to extreme.
    const STEP: RGB[] = [[220, 38, 38], [249, 115, 22], [234, 179, 8], [132, 204, 22], [34, 197, 94]];
    const SCALE: RGB[] = [[56, 189, 248], [74, 222, 128], [250, 204, 21], [249, 115, 22], [220, 38, 38]];
    const scaleAt = (t: number): RGB => {
      const x = Math.max(0, Math.min(1, t)) * (SCALE.length - 1), i = Math.min(SCALE.length - 2, Math.floor(x)), f = x - i;
      return SCALE[i]!.map((c, k) => Math.round(c + (SCALE[i + 1]![k]! - c) * f)) as RGB;
    };
    const clean = (t: string) => t.replace(/[−–]/g, "-").replace(/—/g, "-").replace(/Δ/g, "Delta ").replace(/→/g, "->").replace(/₂/g, "2").replace(/≈/g, "~");
    const W = 210, H = 297, M = 14, CW = W - 2 * M, BOTTOM = 280;
    const flowName = ctx === "Urbano" ? "Piazza" : "Vigneto";
    let y = 0;
    const paint = () => {
      doc.setFillColor(...C.page); doc.rect(0, 0, W, H, "F");
      // The app's logo, then the name spaced out (TWIN in turquoise), as the heading of every page.
      try { doc.addImage(climateTwinLogoCompact, "PNG", M, 5.5, 10, 10); } catch { /* logo opzionale */ }
      const nx = M + 13;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...C.ink);
      doc.text("MICRO DIGITAL", nx, 11.8, { charSpace: 0.9 });
      doc.setTextColor(...C.turq); doc.text("TWIN", nx + doc.getTextWidth("MICRO DIGITAL ") + "MICRO DIGITAL ".length * 0.9, 11.8, { charSpace: 0.9 });
      doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
      doc.text(clean(`Report · ${flowName}`), W - M, 11.8, { align: "right" });
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, 19, W - M, 19);
      y = 27;
    };
    const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); paint(); } };
    const card = (x: number, top: number, w: number, h: number) => { doc.setFillColor(...C.card); doc.roundedRect(x, top, w, h, 4, 4, "F"); };
    const title = (t: string, hint?: string) => {
      ensure(28);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...C.ink); doc.text(clean(t), M + 1, y + 5);
      if (hint) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.muted); doc.text(clean(hint), W - M - 1, y + 5, { align: "right" }); }
      y += 10;
    };
    /** Rows in one slate card, a hairline between them: label on the left, value on the right (wrapped). */
    const rows = (list: Array<[string, string]>, opts: { strongLast?: boolean; head?: [string, string?] } = {}) => {
      doc.setFontSize(9.5);
      const lay = list.map(([k, v]) => {
        const lines = doc.splitTextToSize(clean(v), CW * 0.58 - 8) as string[];
        return { k, lines, h: Math.max(10, lines.length * 4.4 + 5.6) };
      });
      // A short card moves whole to the next page (with its title) rather than splitting.
      const total = lay.reduce((t, r) => t + r.h, 0) + (opts.head ? 10 : 0);
      if (total <= BOTTOM - 30) ensure(total);
      if (opts.head) title(opts.head[0], opts.head[1]);
      let i = 0;
      while (i < lay.length) {
        ensure(12);
        doc.setFontSize(9.5);
        // As many rows as fit on this page go in one card.
        let h = 0, j = i;
        while (j < lay.length && y + h + lay[j]!.h <= BOTTOM) { h += lay[j]!.h; j++; }
        if (j === i) { h = lay[i]!.h; j = i + 1; }
        card(M, y, CW, h);
        let ry = y;
        for (let r = i; r < j; r++) {
          const row = lay[r]!, strong = opts.strongLast && r === lay.length - 1;
          if (r > i) { doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M + 5, ry, M + CW - 5, ry); }
          doc.setFont("helvetica", strong ? "bold" : "normal"); doc.setTextColor(...(strong ? C.ink : C.muted)); doc.text(clean(row.k), M + 5, ry + 6.3);
          doc.setFont("helvetica", "bold"); doc.setTextColor(...C.ink); doc.text(row.lines, M + CW - 5, ry + 6.3, { align: "right" });
          ry += row.h;
        }
        y += h + 3;
        i = j;
      }
      y += 5;
    };
    /** The half ring of the result, as on screen: grey track, the coloured arc up to the reading, a ring where it starts, the white dot. */
    const arc = (cx: number, cy: number, r: number, before: number, after: number, min: number, max: number) => {
      const share = (t: number) => Math.max(0, Math.min(1, (t - min) / (max - min)));
      const at = (s: number) => ({ x: cx - Math.cos(Math.PI * s) * r, y: cy - Math.sin(Math.PI * s) * r });
      doc.setLineCap("round"); doc.setLineWidth(6);
      doc.setDrawColor(...C.line);
      const N = 72;
      for (let k = 0; k < N; k++) { const a = at(k / N), b = at((k + 1) / N); doc.line(a.x, a.y, b.x, b.y); }
      const end = share(after), n = Math.max(1, Math.round(N * end));
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * end, s1 = ((k + 1) / n) * end, a = at(s0), b = at(s1);
        doc.setDrawColor(...scaleAt((s0 + s1) / 2)); doc.line(a.x, a.y, b.x, b.y);
      }
      doc.setLineCap("butt");
      const b = at(share(before)), d = at(end);
      doc.setLineWidth(0.8); doc.setDrawColor(...C.muted); doc.circle(b.x, b.y, 2.4, "S");
      doc.setLineWidth(1); doc.setDrawColor(...C.dot); doc.setFillColor(255, 255, 255); doc.circle(d.x, d.y, 3.6, "FD");
      doc.setLineWidth(0.2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
      doc.text(String(Math.round(min)), cx - r, cy + 7, { align: "center" }); doc.text(String(Math.round(max)), cx + r, cy + 7, { align: "center" });
    };
    const pill = (text: string, cx: number, cy: number, color: RGB) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      const w = doc.getTextWidth(clean(text)) + 8;
      doc.setFillColor(...color); doc.roundedRect(cx - w / 2, cy - 4, w, 6.4, 3.2, 3.2, "F");
      doc.setTextColor(255, 255, 255); doc.text(clean(text), cx, cy + 0.6, { align: "center" });
    };

    paint();
    // Cover: what the report is, the place, the date.
    const placeName = splitLocation((ctx === "Urbano" ? u : v).location.label);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...C.turq);
    doc.text(clean(`REPORT · ${flowName.toUpperCase()}`), M + 1, y + 2, { charSpace: 0.8 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(28); doc.setTextColor(...C.ink);
    const nameLines = doc.splitTextToSize(clean(placeName.name), CW) as string[];
    doc.text(nameLines, M + 1, y + 14); y += 14 + (nameLines.length - 1) * 11;
    doc.setFontSize(10); doc.setTextColor(...C.muted);
    doc.text(clean([placeName.sub, stamp].filter(Boolean).join(" · ")), M + 1, y + 7); y += 16;

    // The result, read like the dashboard.
    const urban = ctx === "Urbano";
    const before = urban ? ps.before : vs.before, after = urban ? ps.after : vs.after;
    const min = urban ? Math.floor(Math.min(after, before) - 3) : Math.max(0, Math.floor(Math.min(after, before) - 8));
    const max = urban ? Math.ceil(before + 2) : Math.min(100, Math.ceil(before + 6));
    const stepIx = urban ? heatStep(after) : thirstStep(after);
    const words = urban ? heatWords(after) : thirstWords(after);
    const level = (urban ? ps.level : vs.level) ?? "Nessun intervento";
    const cost = (urban ? ps.empty : vs.empty) ? "0 €" : euroRange(urban ? ps.cost : vs.cost);
    card(M, y, CW, 92);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text(clean(urban ? `Nell'ora più calda · ${SEASON_LABEL[season].toLowerCase()}, ore ${ps.hour}` : "Sete delle viti · media delle tre zone"), W / 2, y + 10, { align: "center" });
    const cy = y + 60;
    arc(W / 2, cy, 38, before, after, min, max);
    pill(words, W / 2, cy - 25, STEP[stepIx]!);
    doc.setFont("helvetica", "normal"); doc.setFontSize(34); doc.setTextColor(...C.ink);
    doc.text(urban ? `${f1(after)}°` : `${Math.round(after)}`, W / 2, cy - 6, { align: "center" });
    doc.setFontSize(8.5); doc.setTextColor(...C.muted); doc.text(clean(`${level} · ${cost}`), W / 2, cy + 1, { align: "center" });
    doc.setFontSize(10); doc.setTextColor(...C.ink);
    const gain = before - after;
    doc.text(clean(urban
      ? gain >= 0.05 ? `Da ${f1(before)}° a ${f1(after)}° percepiti: -${f1(gain)}°` : ps.empty ? "Nessun intervento" : "Nessun cambiamento del calore"
      : gain >= 0.5 ? `Da ${Math.round(before)} a ${Math.round(after)} su 100: -${Math.round(gain)}` : vs.empty ? "Nessun intervento" : "Gli interventi qui cambiano poco"), W / 2, y + 84, { align: "center" });
    y += 100;

    await step("Disegno dei grafici…", 20);
    if (urban) {
      // A day of the season: without (orange, soft fill) and with the interventions (green).
      title("La giornata", ps.estimated ? "stima indicativa" : "anno reale del luogo");
      ensure(64);
      card(M, y, CW, 60);
      const gx = M + 14, gw = CW - 22, gy = y + 12, gh = 36;
      const all = ps.day.flatMap((d) => [d.prima, d.dopo]);
      const lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 1);
      const px = (h: number) => gx + (h / 23) * gw, py = (t: number) => gy + gh - ((t - lo) / (hi - lo)) * gh;
      doc.setFontSize(7); doc.setTextColor(...C.muted); doc.setDrawColor(...C.line); doc.setLineWidth(0.15);
      for (const t of [lo, Math.round((lo + hi) / 2), hi]) { doc.line(gx, py(t), gx + gw, py(t)); doc.text(`${t}°`, gx - 2, py(t) + 1, { align: "right" }); }
      for (const h of [0, 6, 12, 18]) doc.text(`${h}:00`, px(h), gy + gh + 5, { align: "center" });
      const line = (key: "prima" | "dopo", color: RGB, w: number) => {
        doc.setDrawColor(...color); doc.setLineWidth(w); doc.setLineCap("round");
        for (let h = 0; h < 23; h++) doc.line(px(h), py(ps.day[h]![key]), px(h + 1), py(ps.day[h + 1]![key]));
        doc.setLineCap("butt");
      };
      line("prima", [249, 115, 22], 0.8); line("dopo", [34, 197, 94], 1);
      doc.setFillColor(249, 115, 22); doc.circle(M + 6, y + 6, 1.2, "F"); doc.setTextColor(...C.muted); doc.text("Senza interventi", M + 9, y + 7);
      doc.setFillColor(34, 197, 94); doc.circle(M + 40, y + 6, 1.2, "F"); doc.text("Con gli interventi", M + 43, y + 7);
      doc.setLineWidth(0.2);
      y += 68;
    } else {
      // The three zones: thirst after the interventions (coloured), without them, air and water.
      title("Le tre zone", "sete su 100");
      ensure(40);
      const zw = (CW - 6) / 3;
      vs.zones.forEach((z, i) => {
        const x = M + i * (zw + 3);
        card(x, y, zw, 36);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...C.muted); doc.text(`Zona ${i + 1}`, x + zw / 2, y + 8, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(24); doc.setTextColor(...STEP[thirstStep(z.after)]!); doc.text(String(Math.round(z.after)), x + zw / 2, y + 20, { align: "center" });
        doc.setFontSize(7.5); doc.setTextColor(...C.muted);
        doc.text(`senza: ${Math.round(z.plain)}`, x + zw / 2, y + 26, { align: "center" });
        doc.text(`${Math.round(z.temp)}° - ${Math.round(z.moisture)}% acqua`, x + zw / 2, y + 31, { align: "center" });
      });
      y += 44;
    }

    // Three big numbers.
    title("Cosa ottieni", urban ? "stima annua" : undefined);
    ensure(30);
    const fw = (CW - 6) / 3;
    benefits.forEach(([value, label], i) => {
      const x = M + i * (fw + 3);
      card(x, y, fw, 26);
      doc.setFont("helvetica", "normal"); doc.setFontSize(17); doc.setTextColor(...C.ink); doc.text(clean(value), x + fw / 2, y + 12, { align: "center" });
      doc.setFontSize(8); doc.setTextColor(...C.muted); doc.text(clean(label), x + fw / 2, y + 19, { align: "center" });
    });
    y += 34;

    await step("Compilazione delle tabelle…", 30);
    rows([...mixRows.map((r): [string, string] => [`${r.label}  ${r.value}`, r.cost]), ["Totale indicativo", (urban ? ps.empty : vs.empty) ? "Nessun intervento" : euroRange(urban ? ps.cost : vs.cost)]],
      { strongLast: true, head: ["Cosa hai messo", urban ? `${grouped(ps.m2)} m² ${ps.measured ? "della piazza" : "di riferimento"}` : vs.measured ? `${grouped(vs.m2)} m² del vigneto` : "1 ettaro di riferimento"] });
    if (noteRows.length) rows(noteRows, { head: ["Quaderno di campagna"] });
    // AI camera scans: each one stays in the report even without a photo (indicative estimates).
    if (scanRows.length) rows(scanRows, { head: ["Scansioni della Fotocamera AI"] });

    // Photos and videos of the simulation (list + photo thumbnails).
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
    const media = await currentMedia(urban ? "urban" : "vineyard");
    if (media.length) {
      title("Foto e video", `${media.length}`);
      const imgs = media.filter((m) => m.kind === "image");
      const others = media.filter((m) => m.kind !== "image");
      if (others.length) rows(others.map((m, i): [string, string] => [`Video ${i + 1}`, m.name]));
      const tw = (CW - 6) / 3;
      let col = 0;
      for (let i = 0; i < imgs.length; i++) {
        await step(`Elaborazione immagini ${i + 1} di ${imgs.length}…`, 35 + Math.round((i / imgs.length) * 50));
        const img = await toData(imgs[i]!.url);
        if (!img) continue;
        const th = Math.min(tw * img.r, 58);
        if (col === 0) ensure(62);
        const x = M + col * (tw + 3);
        card(x, y, tw, th);
        try { doc.addImage(img.d, "JPEG", x, y, tw, th); } catch { /* immagine non supportata */ }
        col = (col + 1) % 3;
        if (col === 0) y += 62;
      }
      if (col !== 0) y += 62;
    }

    await step("Finalizzazione PDF…", 86);
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, 284, W - M, 284);
      doc.text("Valori indicativi, da validare con un tecnico. Costi IVA esclusa.", M, 290);
      doc.text(`${p} / ${pages}`, W - M, 290, { align: "right" });
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
    const light = m === "print", key = `${cacheKey()}|${light ? "light" : "dark"}`;
    const entry = reportCache.get(key);
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
      const doc = await getDoc(light);
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
      const e2 = reportCache.get(key); if (e2) e2.pages = pages;
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
      <button onClick={startExport} className="inline-flex min-w-0 items-center justify-center gap-2 h-11 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 active:bg-foreground/80"><Download className="size-4 shrink-0" /><span className="truncate">Esporta report</span></button>
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
  useTabSwipe(["Piazza", "Vigneto"] as const, t, setT);
  const loading = useDashboardLoading(t);
  return (
    <div className="min-w-0">
      <Ambient tone={t === "Piazza" ? "rgb(28 112 210 / 0.38)" : "rgb(150 36 110 / 0.38)"} />
      <LabSyncIndicator />
      {/* v8: a big thin title with the report on the right, then the PS pills. */}
      <PageHero title="Dashboard" actions={<ExportReport ctx={t === "Piazza" ? "Urbano" : "Vitivinicolo"} />} />
      <div className="sticky top-[var(--nav-h)] transition-[top] duration-300 z-[999999998] isolate mx-[calc(50%-50vw)] mb-5 mt-3 min-w-0 bg-background/80 px-0 py-2 sm:px-[calc(50vw-50%)] backdrop-blur-xl sm:mb-6">
        <TabRow fill label="Dashboard" items={[{ id: "Piazza", label: "Piazza", icon: Building2 }, { id: "Vigneto", label: "Vigneto", icon: Grape }]} value={t} onChange={setT} />
      </div>
      <div key={t} className="min-w-0">{loading
        ? <DashboardLoading label={t === "Piazza" ? "dashboard della piazza" : "dashboard del vigneto"} tone={t === "Piazza" ? "urban" : "vine"} />
        : <div className="dashboard-content-enter">{t === "Piazza" ? <PiazzaDashboard records={<UrbanRecords />} /> : <VineDashboard records={<VineRecords />} />}</div>}
      </div>
    </div>
  );
}
