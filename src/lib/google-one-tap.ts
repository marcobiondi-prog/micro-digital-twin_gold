import { supabase } from "@/integrations/supabase/client";

/**
 * Google's sign-in inside the app, with no page of Google's in between: the browser's own account chooser for Google
 * (FedCM, navigator.credentials.get with Google's identity provider) shows as a sheet over the app and hands back
 * Google's ID token, which Supabase turns into a session (signInWithIdToken). The installed app no longer opens Google
 * in a window of its own — that window stayed behind the app, and the phone's Back landed on it.
 *
 * The client is the same OAuth client the Supabase Google provider uses; its "Authorized JavaScript origins" must list
 * the app's address.
 */
export const GOOGLE_CLIENT_ID = "359809801969-2aq36gro41tmgdkbu7u8n663cg5v8tdv.apps.googleusercontent.com";
const GOOGLE_FEDCM = "https://accounts.google.com/gsi/fedcm.json";

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

/**
 * "signed" once the session is in, "cancelled" when the person closed the chooser, "unavailable" when it could not be
 * shown (no FedCM in this browser, Google not answering, an origin not allowed, the chooser closed — the browser does
 * not tell these apart): then the caller uses the redirect to Google's pages instead.
 */
export async function googleInApp(opts: { loginHint?: string } = {}): Promise<"signed" | "cancelled" | "unavailable"> {
  if (typeof window === "undefined" || !crypto?.subtle || !("IdentityCredential" in window) || !navigator.credentials) return "unavailable";
  const raw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nonce = await sha256Hex(raw);
  // The browser answers late or never when it cannot show the chooser (it hides the reason on purpose): 30 s at most.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 30_000);
  let cred: { token?: unknown } | null = null;
  try {
    cred = (await navigator.credentials.get({
      signal: stop.signal,
      mediation: "required",
      identity: {
        context: "signin",
        providers: [{
          configURL: GOOGLE_FEDCM,
          clientId: GOOGLE_CLIENT_ID,
          nonce,
          params: { nonce },
          ...(opts.loginHint ? { loginHint: opts.loginHint } : {}),
        }],
      },
    } as CredentialRequestOptions)) as { token?: unknown } | null;
  } catch {
    // Refused, closed or never shown: the browser does not say which, so Google's own pages take over.
    return "unavailable";
  } finally { clearTimeout(timer); }
  const token = idTokenOf(cred?.token);
  if (!token) return "unavailable";
  // The nonce goes to Supabase only when Google put it in the token (else Supabase refuses a nonce it cannot match).
  const withNonce = claimsOf(token)["nonce"] === nonce;
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, ...(withNonce ? { nonce: raw } : {}) });
  return error ? "unavailable" : "signed";
}
