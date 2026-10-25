import { useState } from "react";
import { useSignedIn } from "@/lib/use-signed-in";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Grape, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/views/health";
import { planInterventions, type Intervention } from "@/controllers/field-ai.functions";

const prioTone: Record<string, string> = { alta: "bg-danger/15 text-danger", media: "bg-warn/15 text-warn", bassa: "bg-ok/15 text-ok" };

const COPY = {
  vineyard: { title: "Osservazioni di campo → interventi prioritari con l'AI", hint: "Descrivi ciò che osservi nel vigneto: l'AI propone interventi per lo stress idrico, il calore e la salute delle viti ordinati per priorità. Suggerimenti indicativi, da verificare con un agronomo.", ph: "Es. foglie ingiallite zona B, acini raggrinziti sul lato sud, suolo secco a 20 cm…", opts: ["Germogliamento", "Fioritura", "Invaiatura", "Maturazione"], def: "Invaiatura", label: "Fase fenologica", tone: "bg-vine", text: "text-vine", hover: "hover:bg-vine/10", added: "Aggiunto al quaderno" },
  urban: { title: "Osservazioni sul posto → interventi prioritari con l'AI", hint: "Descrivi ciò che vedi nell'area: l'AI propone interventi contro il calore ordinati per priorità. Suggerimenti indicativi, da verificare con l'ufficio tecnico.", ph: "Es. asfalto rovente vicino alla fermata, panchine senza ombra, fontanella guasta…", opts: ["Piazza", "Strada", "Scuola", "Parcheggio", "Parco"], def: "Piazza", label: "Tipo di area", tone: "bg-urban", text: "text-urban", hover: "hover:bg-urban/10", added: "Aggiunto al registro" },
} as const;

export function FieldAI({ onAdd, kind = "vineyard" }: { onAdd: (t: string) => void; kind?: "urban" | "vineyard" }) {
  const c = COPY[kind];
  const plan = useServerFn(planInterventions);
  const [obs, setObs] = useState("");
  const [phase, setPhase] = useState<string>(c.def);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sintesi: string; interventi: Intervention[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Signed in, or the simulated sign-in on previews (the AI call itself still needs a real account).
  const { signedIn } = useSignedIn();
  const submit = async () => {
    if (!signedIn || obs.trim().length < 3 || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await plan({ data: { observation: obs, phase, kind } });
      if ("error" in r && r.error) setError(r.error);
      else if ("interventi" in r) setResult({ sintesi: r.sintesi ?? "", interventi: r.interventi ?? [] });
    } catch { setError("Impossibile contattare il servizio AI."); }
    finally { setLoading(false); }
  };
  // Guests never see the AI card: it stays hidden until they sign in.
  if (!signedIn) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm font-semibold">{kind === "urban" ? <Building2 className="size-4 text-urban" /> : <Grape className="size-4 text-vine" />} {c.title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} aria-label="Osservazioni di campo" placeholder={c.ph} className="w-full rounded-2xl bg-muted px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex flex-col gap-2">
          <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label={c.label} className="rounded-full bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            {c.opts.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button type="button" onClick={submit} disabled={!signedIn || loading || obs.trim().length < 3} className={`rounded-full ${c.tone} px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50`}>{loading ? "Analisi in corso…" : "Genera interventi"}</button>
        </div>
      </div>
      {!signedIn && <p className="mt-3 text-xs text-muted-foreground">Accedi con un account per generare gli interventi con l'AI.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2" aria-live="polite">
          {result.sintesi && <p className="text-sm text-muted-foreground">{result.sintesi}</p>}
          {result.interventi.map((it, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm animate-in fade-in slide-in-from-top-1">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${prioTone[it.priorita] ?? "bg-card"}`}>{it.priorita}</span>
              <div className="min-w-0 flex-1"><div className="font-semibold">{it.azione}</div><div className="text-xs text-muted-foreground">{it.motivazione} · entro {it.entro}</div></div>
              <button type="button" onClick={() => { onAdd(it.azione); toast.success(c.added); }} aria-label={`${c.added}: ${it.azione}`} className={`grid size-7 shrink-0 place-items-center rounded-full ${c.text} ${c.hover}`}><Plus className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
