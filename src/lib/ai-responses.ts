// Server-only helper for the AI calls (camera AR, sensor advice, interventions).
// Call it only inside server function handlers: it reads secrets from process.env.
// Callers speak the OpenAI Responses API (POST /v1/responses, streamed as SSE).
// With GEMINI_API_KEY the request goes to Google Gemini instead and the reply is
// re-emitted as Responses-style SSE events, so callers parse both the same way.
// OPENAI_BASE_URL lets you point at any Responses-compatible endpoint
// (Azure OpenAI, OpenRouter, a local proxy, ...).

export function aiConfigured(): boolean {
  return Boolean(process.env["GEMINI_API_KEY"] || process.env["OPENAI_API_KEY"]);
}

export function aiResponses(body: Record<string, unknown>): Promise<Response> {
  if (process.env["GEMINI_API_KEY"]) return geminiResponses(body);
  const apiKey = process.env["OPENAI_API_KEY"] ?? "";
  const baseUrl = (process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env["OPENAI_MODEL"] ?? "gpt-6-astra";
  return fetch(`${baseUrl}/responses`, {
    method: "POST",
    signal: AbortSignal.timeout(BUDGET_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, ...body }),
  });
}

type ResponsesPart = { type: string; text?: string; image_url?: string };
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function toGeminiParts(content: unknown): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [];
  return (content as ResponsesPart[]).flatMap((part): GeminiPart[] => {
    if (part.type === "input_text" && part.text) return [{ text: part.text }];
    const image = part.type === "input_image" ? /^data:([^;]+);base64,(.+)$/.exec(part.image_url ?? "") : null;
    return image ? [{ inlineData: { mimeType: image[1]!, data: image[2]! } }] : [];
  });
}

const sse = (events: Record<string, unknown>[], status = 200) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status, headers: { "Content-Type": "text/event-stream" } });

const failure = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers: { "Content-Type": "application/json" } });

/** The whole AI call must end well inside the host's 60 s limit for a server function. */
const BUDGET_MS = 46_000;
const FIRST_MS = 30_000;
const isTimeout = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

async function geminiResponses(body: Record<string, unknown>): Promise<Response> {
  const model = process.env["GEMINI_MODEL"] ?? "gemini-flash-latest";
  const fallbackModels = (process.env["GEMINI_FALLBACK_MODELS"] ?? "gemini-flash-lite-latest,gemini-2.5-flash").split(",").map((m) => m.trim()).filter((m) => m && m !== model);
  const input = body["input"];
  const contents = typeof input === "string"
    ? [{ role: "user", parts: toGeminiParts(input) }]
    : (Array.isArray(input) ? input as { role?: string; content: unknown }[] : []).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: toGeminiParts(m.content) }));
  // Structured output: Gemini enforces the schema (responseJsonSchema) and also reads it as an instruction.
  const format = (body["text"] as { format?: { type?: string; schema?: unknown } } | undefined)?.format;
  const schema = format?.type === "json_schema" && format.schema && typeof format.schema === "object" ? (({ $schema: _, ...rest }) => rest)(format.schema as Record<string, unknown>) : null;
  const system = [body["instructions"], schema ? `Rispondi solo con JSON valido conforme a questo JSON Schema:\n${JSON.stringify(schema)}` : null].filter((t): t is string => typeof t === "string" && t.length > 0);
  // Every call has a time limit: a slow model left the server function running past the host's 60 s and the camera
  // only saw "Analisi interrotta". The first model gets FIRST_MS; if it does not answer in time, the first fallback
  // (a lighter, quicker model) gets what is left of the budget.
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);
  type Payload = {
    error?: { message?: string; status?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  } | null;
  const request = async (enforceSchema: boolean, name = model, ms = Math.min(FIRST_MS, left())): Promise<{ res: Response; payload: Payload }> => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(Math.max(1000, ms)),
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env["GEMINI_API_KEY"] ?? "" },
      body: JSON.stringify({
        contents,
        ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
        ...(schema ? { generationConfig: { responseMimeType: "application/json", ...(enforceSchema ? { responseJsonSchema: schema } : {}) } } : {}),
      }),
    });
    const payload = await res.json().catch((e: unknown) => { if (isTimeout(e)) throw e; return null; }) as Payload;
    return { res, payload };
  };
  let res: Response;
  let payload: Payload;
  try {
    let out: { res: Response; payload: Payload };
    try {
      out = await request(Boolean(schema));
    } catch (error) {
      const quick = fallbackModels[0];
      if (!isTimeout(error) || !quick || left() < 8000) throw error;
      console.error("Gemini", model, "too slow - retrying on", quick);
      out = await request(Boolean(schema), quick, left() - 1500);
    }
    // A model or schema the structured-output mode rejects falls back to plain JSON mode.
    if (schema && out.res.status === 400 && !/API key/i.test(out.payload?.error?.message ?? "") && left() > 6000) out = await request(false, model, left() - 1500);
    // An overloaded (503/500) or rate-limited (429) model is retried once on each fallback model,
    // in order: each Gemini model has its own quota.
    for (const fallback of fallbackModels) {
      if (out.res.status !== 503 && out.res.status !== 500 && out.res.status !== 429) break;
      if (left() < 6000) break;
      console.error("Gemini", out.res.status, "- retrying on", fallback);
      await new Promise((resolve) => setTimeout(resolve, 800));
      out = await request(Boolean(schema), fallback, left() - 1500);
    }
    res = out.res; payload = out.payload;
  } catch (error) {
    console.error("Gemini request", error);
    if (isTimeout(error)) return failure(504, "Il servizio AI ha impiegato troppo: riprova la scansione.");
    return failure(502, "Servizio AI non raggiungibile.");
  }
  if (!res.ok) {
    console.error("Gemini", res.status, payload?.error?.status, payload?.error?.message);
    // An invalid key comes back as 400: report it as a permission problem like OpenAI's 403.
    const badKey = /API key/i.test(payload?.error?.message ?? "");
    const status = badKey ? 403 : res.status;
    const message = badKey ? "Chiave Gemini non valida: verifica GEMINI_API_KEY." : res.status === 429 ? "Troppe richieste al servizio AI, riprova tra poco." : res.status === 503 ? "Servizio AI sovraccarico, riprova tra qualche secondo." : `Servizio AI non disponibile (${res.status}).`;
    return failure(status, message);
  }
  const candidate = payload?.candidates?.[0];
  if (payload?.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY")
    return sse([{ type: "response.refusal.done", refusal: "Il servizio ha rifiutato questa analisi." }]);
  if (candidate?.finishReason === "MAX_TOKENS") return sse([{ type: "response.incomplete" }]);
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return sse([{ type: "response.output_text.delta", delta: text }, { type: "response.completed" }]);
}
