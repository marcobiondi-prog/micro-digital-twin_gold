import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Token = z.string().uuid();
const Decision = z.enum(["approvato", "respinto"]);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Micro Digital Twin</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f7f8;color:#10222a;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}main{background:#fff;border-radius:20px;padding:28px;max-width:420px;width:100%;box-shadow:0 10px 30px #0001}h1{font-size:20px;margin:0 0 8px}p{color:#4a5d66;line-height:1.5}.brand{font-size:12px;font-weight:700;letter-spacing:.08em;color:#4a5d66}.brand b{color:#14b8a6}form{display:flex;gap:8px;margin-top:20px}button{flex:1;height:44px;border-radius:999px;border:0;font-weight:700;font-size:15px;cursor:pointer}.ok{background:#16a34a;color:#fff}.no{background:#fee2e2;color:#b91c1c}</style></head>
<body><main><div class="brand">MICRO DIGITAL <b>TWIN</b> <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.08em;color:#4cc9bd;background:rgba(76,201,189,.15);border:1px solid rgba(76,201,189,.4)">BETA</span></div>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function findRequest(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("external_approval_requests").select("id, entity, status").eq("token", token).maybeSingle();
  return { supabaseAdmin, req: data };
}

export const Route = createFileRoute("/api/public/external-approval")({
  server: {
    handlers: {
      // GET only shows the choice: email scanners that prefetch links cannot approve anything.
      GET: async ({ request }) => {
        const t = Token.safeParse(new URL(request.url).searchParams.get("token"));
        if (!t.success) return page("Link non valido", "<h1>Link non valido</h1><p>Il link di approvazione non è corretto.</p>", 400);
        const { req } = await findRequest(t.data);
        if (!req) return page("Link non valido", "<h1>Link non valido</h1><p>Richiesta non trovata o scaduta.</p>", 404);
        if (req.status !== "attesa") return page("Parere già registrato", `<h1>Parere già registrato</h1><p>${esc(req.entity)}: ${req.status === "approvato" ? "approvato" : "respinto"}.</p>`);
        return page("Richiesta di parere", `<h1>Richiesta di parere</h1><p>Ente: <b>${esc(req.entity)}</b><br>Esprimi il parere sull’intervento di mitigazione climatica proposto.</p>
<form method="post"><input type="hidden" name="token" value="${t.data}"><button class="ok" name="decision" value="approvato">Approva</button><button class="no" name="decision" value="respinto">Respingi</button></form>`);
      },
      POST: async ({ request }) => {
        const form = await request.formData();
        const t = Token.safeParse(form.get("token"));
        const d = Decision.safeParse(form.get("decision"));
        if (!t.success || !d.success) return page("Richiesta non valida", "<h1>Richiesta non valida</h1>", 400);
        const { supabaseAdmin, req } = await findRequest(t.data);
        if (!req) return page("Link non valido", "<h1>Link non valido</h1>", 404);
        if (req.status !== "attesa") return page("Parere già registrato", "<h1>Parere già registrato</h1><p>Questo link è già stato usato.</p>");
        const { error } = await (supabaseAdmin as any).from("external_approval_requests").update({ status: d.data, decided_at: new Date().toISOString() }).eq("id", req.id).eq("status", "attesa");
        if (error) return page("Errore", "<h1>Errore</h1><p>Riprova più tardi.</p>", 500);
        return page("Parere registrato", `<h1>Parere registrato</h1><p>Grazie. Il parere di <b>${esc(req.entity)}</b> (${d.data}) è stato registrato nel Micro Digital Twin.</p>`);
      },
    },
  },
});
