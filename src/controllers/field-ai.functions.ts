import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiConfigured, aiResponses } from "@/lib/ai-responses";

export type Intervention = { priorita: "alta" | "media" | "bassa"; azione: string; motivazione: string; entro: string };

const URBAN = `Sei un esperto di adattamento climatico urbano e progettazione dello spazio pubblico. Trasforma le osservazioni del tecnico comunale in interventi operativi prioritari contro il calore (alberi, ombra, depavimentazione, rifugi climatici, manutenzione).
Rispondi SOLO con JSON valido, senza testo extra, nel formato:
{"sintesi":"...","interventi":[{"priorita":"alta|media|bassa","azione":"...","motivazione":"...","entro":"es. 2 settimane"}]}
Massimo 5 interventi, ordinati per priorità decrescente. Testi brevi, in italiano. Se mancano dati, indicalo nella sintesi.`;

const SYSTEM = `Sei un agronomo esperto di viticoltura e adattamento climatico. Trasforma le osservazioni di campo del viticoltore in interventi operativi prioritari.
Rispondi SOLO con JSON valido, senza testo extra, nel formato:
{"sintesi":"...","interventi":[{"priorita":"alta|media|bassa","azione":"...","motivazione":"...","entro":"es. 24 ore"}]}
Massimo 5 interventi, ordinati per priorità decrescente. Testi brevi, in italiano. Se mancano dati, indicalo nella sintesi.`;

export const planInterventions = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((d) => z.object({ observation: z.string().trim().min(3).max(2000), phase: z.string().max(40).optional(), kind: z.enum(["urban", "vineyard"]).default("vineyard") }).parse(d))
  .handler(async ({ data }) => {
    if (!aiConfigured()) return { error: "Servizio AI non configurato." };
    const res = await aiResponses({
        instructions: data.kind === "urban" ? URBAN : SYSTEM,
        input: `${data.kind === "urban" ? "Contesto" : "Fase fenologica"}: ${data.phase ?? "non indicata"}\nOsservazioni: ${data.observation}`,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
      });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => "");
      if (res.status === 429) return { error: "Troppe richieste, riprova tra poco." };
      if (res.status === 402) return { error: "Credito dell'API AI esaurito." };
      console.error("AI gateway", res.status, msg);
      return { error: `Errore del servizio AI (${res.status}).` };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        const p = l.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") text += ev.delta;
        } catch { /* ignore */ }
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: "Il modello non ha restituito interventi." };
    try {
      const j = JSON.parse(m[0]) as { sintesi?: string; interventi?: Intervention[] };
      return { sintesi: String(j.sintesi ?? ""), interventi: (j.interventi ?? []).slice(0, 5) };
    } catch {
      return { error: "Risposta del modello non leggibile." };
    }
  });
