import { useSyncExternalStore } from "react";

/**
 * The phone's biometrics on each professional profile (views/v10/Biometric: keys "pro:<kind>:<at>"), asked before
 * taking a profile up again. Sign-in with the phone's biometrics (Face ID or Touch ID on iPhone, fingerprint or face on Android, Windows Hello on a
 * computer), through the browser's own passkey prompt (WebAuthn, platform authenticator, user verification required).
 *
 * It unlocks a personal account kept on this phone (lib/account-sessions): turned on for an account, entering it —
 * from the sign-in panel's "Entra con Face ID", or from a recognised profile — first asks the phone's biometrics, and
 * "Esci" keeps the account on the phone (not ended) so it can be entered again with a glance or a touch. The
 * biometric data never leave the phone: the app only keeps the credential's id per email (localStorage
 * mdt-biometric-v1). It is a lock on this phone, not a server login: a forgotten account still needs its password or Google.
 */
const KEY = "mdt-biometric-v1";
type Entry = { id: string; at: number };
const subs = new Set<() => void>();
let snap: Record<string, Entry> | null = null;
const read = (): Record<string, Entry> => {
  if (snap) return snap;
  try { snap = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>; } catch { snap = {}; }
  return snap;
};
const write = (v: Record<string, Entry>) => { snap = v; try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* memory only */ } subs.forEach((f) => f()); };
const norm = (e: string) => e.trim().toLowerCase();

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => { const t = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const out = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i); return out; };
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** What the phone's biometrics are called here, in plain words. */
export function biometricName(): string {
  if (typeof navigator === "undefined") return "impronta o volto";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID o Touch ID";
  if (/Android/.test(ua)) return "impronta digitale o volto";
  if (/Windows/.test(ua)) return "Windows Hello";
  if (/Macintosh/.test(ua)) return "Touch ID";
  return "impronta o volto";
}

/** Whether this phone has a biometric unlock the browser can use. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return typeof window !== "undefined" && !!window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export const biometricOn = (email: string | null | undefined) => !!email && !!read()[norm(email)];
export function useBiometricOn(email: string | null | undefined): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => biometricOn(email), () => false);
}
/** Every account with the biometric sign-in on, newest first. */
export function biometricAccounts(): string[] {
  return Object.entries(read()).sort((a, b) => b[1].at - a[1].at).map(([e]) => e);
}
export function useBiometricAccounts(): string[] {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => JSON.stringify(read()), () => "{}");
  return Object.entries(JSON.parse(v) as Record<string, Entry>).sort((a, b) => b[1].at - a[1].at).map(([e]) => e);
}

/** Turns the biometric sign-in on for this account: the phone asks its biometrics once to make the key. */
export async function enableBiometric(email: string, label = email): Promise<{ ok: boolean; reason?: string }> {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: "Micro Digital Twin", id: window.location.hostname },
        user: { id: random(16), name: label, displayName: label },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60_000,
        attestation: "none",
      },
    }) as PublicKeyCredential | null;
    if (!cred) return { ok: false, reason: "Annullato." };
    write({ ...read(), [norm(email)]: { id: b64(cred.rawId), at: Date.now() } });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: plainError(e) };
  }
}

export function disableBiometric(email: string) {
  const all = { ...read() }; delete all[norm(email)]; write(all);
}

/** Asks the phone's biometrics for this account; true when the person is recognised. */
/**
 * The app unlocked by the phone's recognition at its opening: for a few minutes after it the recognition is not asked
 * again (picking a profile on the sector page right after unlocking does not ask twice).
 */
let unlockedUntil = 0;
export function markUnlocked(ms = 5 * 60_000) { unlockedUntil = Date.now() + ms; }
export async function verifyBiometric(email: string): Promise<{ ok: boolean; reason?: string }> {
  const e = read()[norm(email)];
  if (!e) return { ok: true };
  if (Date.now() < unlockedUntil) return { ok: true };
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: unb64(e.id) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return got ? { ok: true } : { ok: false, reason: "Annullato." };
  } catch (err) {
    return { ok: false, reason: plainError(err) };
  }
}

const plainError = (e: unknown): string => {
  const name = (e as { name?: string } | null)?.name;
  if (name === "NotAllowedError") return "Riconoscimento annullato o non riuscito.";
  if (name === "InvalidStateError") return "Su questo telefono è già attivo.";
  if (name === "NotSupportedError" || name === "SecurityError") return "Questo telefono o browser non lo permette qui.";
  return "Non è stato possibile usare il riconoscimento.";
};
