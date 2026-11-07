import { supabase } from "@/integrations/supabase/client";

/**
 * Google's sign-in inside the app, with no page of Google's in between: Google's own library (Google Identity
 * Services, through the browser's FedCM chooser) shows the accounts as a sheet over the app and hands back Google's ID
 * token, which Supabase turns into a session (signInWithIdToken). The installed app no longer opens Google
 * in a window of its own — that window stayed behind the app, and the phone's Back landed on it.
 *
 * The client is the same OAuth client the Supabase Google provider uses; its "Authorized JavaScript origins" must list
 * the app's address.
 */
export const GOOGLE_CLIENT_ID = "359809801969-2aq36gro41tmgdkbu7u8n663cg5v8tdv.apps.googleusercontent.com";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The ID token in what the browser hands back: the token itself, or a JSON wrapping it. */
function idTokenOf(token: unknown): string | null {
  if (typeof token !== "string") return null;
  if (token.split(".").length === 3) return token;
  try {
    const j = JSON.parse(token) as { credential?: unknown; token?: unknown; id_token?: unknown };
    const t = j.credential ?? j.id_token ?? j.token;
    return typeof t === "string" && t.split(".").length === 3 ? t : null;
  } catch { return null; }
}

function claimsOf(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))))) as Record<string, unknown>;
  } catch { return {}; }
}

type Moment = { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean };
type Gis = { accounts: { id: { initialize: (o: Record<string, unknown>) => void; prompt: (cb?: (n: Moment) => void) => void; cancel: () => void } } };
declare global { interface Window { google?: Gis } }

let loading: Promise<Gis | null> | null = null;
/** Google's own sign-in library (it asks the browser's chooser with the parameters Google expects). */
function loadGis(): Promise<Gis | null> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    const t = setTimeout(() => { loading = null; resolve(null); }, 8000);
    s.onload = () => { clearTimeout(t); resolve(window.google?.accounts?.id ? window.google : null); };
    s.onerror = () => { clearTimeout(t); loading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * "signed" once the session is in, "unavailable" when the chooser could not be used (no library, not shown, closed,
 * refused, no answer in 30 s — the browser does not tell these apart): then the caller uses the redirect to Google's
 * pages instead. ("cancelled" is kept for callers; nothing returns it now.)
 */
export async function googleInApp(opts: { loginHint?: string } = {}): Promise<"signed" | "cancelled" | "unavailable"> {
  if (typeof window === "undefined" || !crypto?.subtle) return "unavailable";
  const gis = await loadGis();
  if (!gis) return "unavailable";
  const raw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nonce = await sha256Hex(raw);
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: "signed" | "unavailable") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (r !== "signed") { try { gis.accounts.id.cancel(); } catch { /* none */ } }
      resolve(r);
    };
    const timer = setTimeout(() => finish("unavailable"), 30_000);
    gis.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: "signin",
      ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
      callback: async (res: { credential?: string }) => {
        const token = idTokenOf(res?.credential);
        if (!token) { finish("unavailable"); return; }
        // The nonce goes to Supabase only when Google put it in the token (else Supabase refuses a nonce it cannot match).
        const withNonce = claimsOf(token)["nonce"] === nonce;
        const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, ...(withNonce ? { nonce: raw } : {}) });
        finish(error ? "unavailable" : "signed");
      },
    });
    gis.accounts.id.prompt((n) => { if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) finish("unavailable"); });
  });
}
