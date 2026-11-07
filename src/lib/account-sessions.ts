import { preloadNext } from "@/lib/preloader";
import { googleInApp } from "@/lib/google-one-tap";
import { getProId, getSectorGateKind, nextAdoptDone } from "@/lib/use-pro-id";
import { goInApp } from "@/lib/app-nav";
import { supabase } from "@/integrations/supabase/client";
import { disableBiometric, verifyBiometric } from "@/lib/biometric";

/**
 * The personal accounts used on this phone, so that picking a recognised professional profile signs in its personal
 * account too, with no password nor Google round trip (like switching account in a phone's mail app).
 *
 * Every session seen (sign-in, opening, each token refresh) is kept per email in localStorage mdt-account-sessions-v1,
 * always its latest tokens. Switching to another account sets that account's kept session (supabase setSession), which
 * does not end the one left: it stays kept for the way back. An explicit "Esci" ends the session for good (signOut),
 * so that account is forgotten here and needs its sign-in again next time.
 */
const KEY = "mdt-account-sessions-v1";
const OPEN_AFTER = "mdt-open-account-after";
type Saved = { userId: string; email: string; access_token: string; refresh_token: string; at: number };

const read = (): Record<string, Saved> => {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, Saved>; } catch { return {}; }
};
const write = (v: Record<string, Saved>) => { try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* none */ } };
const norm = (e: string) => e.trim().toLowerCase();

/** Is the account with this email kept on this phone (so it can be entered in one tap)? */
export function hasAccountSession(email: string | null | undefined): boolean {
  return !!email && !!read()[norm(email)];
}

let installed = false;
let current: string | null = null;
let leaving = false;
/** Mounted once by the root: keeps every session seen, forgets the one ended by an explicit sign-out. */
export function installAccountSessions() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  supabase.auth.onAuthStateChange((event, s) => {
    if (s?.user.email && s.refresh_token) {
      const email = norm(s.user.email);
      current = email;
      write({ ...read(), [email]: { userId: s.user.id, email, access_token: s.access_token, refresh_token: s.refresh_token, at: Date.now() } });
    } else if (event === "SIGNED_OUT" && current && !leaving) {
      // Signed out on purpose (or ended elsewhere): that session no longer works.
      const all = read(); delete all[current]; write(all); disableBiometric(current); current = null;
    }
  });
  // The panel asked to open after leaving an account without ending it (see leaveAccount).
  try { if (sessionStorage.getItem(OPEN_AFTER)) { sessionStorage.removeItem(OPEN_AFTER); setTimeout(() => window.dispatchEvent(new Event("mdt-open-account")), 600); } } catch { /* none */ }
}

/** The kept accounts' emails, newest first. */
export function keptAccounts(): string[] {
  return Object.values(read()).sort((a, b) => b.at - a.at).map((s) => s.email);
}

/**
 * Enters the kept account with this email; false when it is not kept here, its session no longer works or, with the
 * biometric sign-in on for it, the phone did not recognise the person.
 */
export async function switchToAccount(email: string): Promise<boolean | "refused"> {
  const s = read()[norm(email)];
  if (!s) return false;
  if (!(await verifyBiometric(email)).ok) return "refused";
  const { data, error } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error || !data.session) {
    const all = read(); delete all[norm(email)]; write(all);
    return false;
  }
  return true;
}

/**
 * Leaves the signed-in account without ending its session (it stays kept here for the way back) and reloads the page
 * signed out, with the account panel open to sign in with another one.
 */
export function leaveAccount(opts: { openPanel?: boolean; to?: string; replace?: boolean } = {}) {
  leaving = true;
  try {
    supabase.auth.stopAutoRefresh();
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (key) { window.localStorage.removeItem(key); window.localStorage.removeItem(`${key}-code-verifier`); window.localStorage.removeItem(`${key}-user`); }
    if (opts.openPanel !== false) sessionStorage.setItem(OPEN_AFTER, "1");
    // Left on purpose: the recognition is not asked again by itself on the reload that follows.
    sessionStorage.setItem("mdt-bio-skip", "1");
  } catch { /* none */ }
  preloadNext();
  if (opts.to) { if (opts.replace) window.location.replace(opts.to); else window.location.assign(opts.to); } else window.location.reload();
}

/**
 * Signs in a personal account that is not kept on this phone, with as little as possible in between: a Google account
 * (any account not known to use email and password) goes straight to Google's sign-in for that very address
 * (login_hint), coming back to `back`; any other opens the account panel with its email already written, asking only
 * the password. From then on the account is kept here and entered by itself.
 */
export async function signInAs(email: string, opts: { provider?: string | undefined; back?: string } = {}) {
  // Google unless the account is known to use email and password: school and work addresses (Google Workspace, e.g.
  // …@studenti.itsdemos.it) sign in with Google too, and Google's own page offers that address.
  const google = opts.provider !== "email";
  if (google) {
    const back = opts.back ?? window.location.pathname + window.location.search;
    try { localStorage.setItem("mdt-auth-return", back); } catch { /* none */ }
    const r = await googleOAuth(window.location.origin + back.split("?")[0], { login_hint: email });
    if (!r.error) return;
  }
  window.dispatchEvent(new CustomEvent("mdt-open-account", { detail: { email } }));
}

/**
 * "Aggiungi account": straight to Google's account chooser, with no page in between and no reload first — the account
 * signed in now stays kept on this phone (its session is already saved here) and the one chosen takes its place.
 */
export async function addGoogleAccount(): Promise<boolean> {
  const back = window.location.pathname + window.location.search;
  try { localStorage.setItem("mdt-auth-return", back); } catch { /* none */ }
  const r = await googleOAuth(window.location.origin + window.location.pathname, { prompt: "select_account" });
  return !r.error;
}

/**
 * Google's sign-in, opened in place of the page (location.replace): the page left is not kept twice in the history,
 * and back from the app after the sign-in returns to it rather than to Google's account chooser.
 */
export async function googleOAuth(redirectTo: string, queryParams?: Record<string, string>): Promise<{ error: Error | null }> {
  // First Google's chooser inside the app (no window of Google's left behind the app); its pages only when it cannot show.
  const hint = queryParams?.["login_hint"];
  const inApp = await googleInApp(hint ? { loginHint: hint } : {});
  if (inApp !== "unavailable") {
    try { localStorage.removeItem("mdt-auth-return"); } catch { /* none */ }
    if (inApp === "signed") {
      // The account is read (its profile, or the sector page with its form or the lock), then its simulation opens.
      await nextAdoptDone();
      const pro = getProId();
      if (pro && !getSectorGateKind()) goInApp(pro.kind === "agronomo" ? "/vigneto" : "/urbano");
    }
    return { error: null };
  }
  const r = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true, ...(queryParams ? { queryParams } : {}) } });
  if (r.error || !r.data?.url) return { error: r.error ?? new Error("Accesso Google non disponibile") };
  // Google's pages then stand in the history after this one: back in the app, the root steps back past them to the
  // page before this one and opens the app from there, so the phone's Back never lands on Google's account chooser.
  // With nothing before this page (an app just opened) a copy of it is kept first, to step back to.
  if (window.history.length < 2) window.history.pushState(window.history.state, "");
  try { localStorage.setItem("mdt-auth-hist", JSON.stringify({ n: window.history.length, at: Date.now() })); } catch { /* none */ }
  window.location.replace(r.data.url);
  return { error: null };
}
