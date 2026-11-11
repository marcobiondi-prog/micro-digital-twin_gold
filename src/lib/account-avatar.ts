import { useSyncExternalStore } from "react";
import seedling from "@/assets/avatar-seedling.svg";
import city from "@/assets/avatar-city.svg";
import sun from "@/assets/avatar-sun.svg";
import vine from "@/assets/avatar-vine.svg";

export const AVATAR_SUGGESTIONS = [
  { id: "seedling", label: "Germoglio", src: seedling },
  { id: "city", label: "Città", src: city },
  { id: "sun", label: "Sole", src: sun },
  { id: "vine", label: "Vigneto", src: vine },
] as const;

export type AvatarChoice = (typeof AVATAR_SUGGESTIONS)[number]["id"] | "upload";

export const LOCAL_AVATAR_KEY = "mdt-account-avatar-v1";

/**
 * The picture of the personal account now shown in the header (chosen, uploaded or Google's), published by the account
 * control so other views — the sector page's "Ti abbiamo riconosciuto" — can show it too. null when signed out or none.
 */
let url: string | null = null;
const subs = new Set<() => void>();

export function setAccountAvatar(next: string | null) {
  if (next === url) return;
  url = next;
  subs.forEach((f) => f());
}

export function useAccountAvatar(): string | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => url, () => null);
}

/** The picture now shown, read outside React (kept with a professional profile when it is registered). */
export const getAccountAvatar = (): string | null => url;

/** Reads the saved avatar image URL (preset SVG or custom URL / base64) for an account email from localStorage. */
export function readLocalAvatar(email?: string | null): string | null {
  if (!email || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_AVATAR_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Record<string, unknown>;
    const val = m[email.trim().toLowerCase()];
    if (!val) return null;
    if (typeof val === "string") {
      const match = AVATAR_SUGGESTIONS.find((s) => s.id === val);
      if (match) return match.src;
      if (val !== "upload") return val;
      return null;
    }
    if (typeof val === "object" && val !== null) {
      const obj = val as { url?: string | null; choice?: string | null };
      if (obj.url) return obj.url;
      if (obj.choice) {
        const match = AVATAR_SUGGESTIONS.find((s) => s.id === obj.choice);
        if (match) return match.src;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads the choice identifier ("seedling", "city", etc. or "upload") for an account email. */
export function readLocalAvatarChoice(email?: string | null): AvatarChoice | null {
  if (!email || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_AVATAR_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Record<string, unknown>;
    const val = m[email.trim().toLowerCase()];
    if (!val) return null;
    if (typeof val === "string") {
      if (val === "upload" || AVATAR_SUGGESTIONS.some((s) => s.id === val)) {
        return val as AvatarChoice;
      }
      return "upload";
    }
    if (typeof val === "object" && val !== null) {
      const obj = val as { choice?: string | null; url?: string | null };
      if (obj.choice && (obj.choice === "upload" || AVATAR_SUGGESTIONS.some((s) => s.id === obj.choice))) {
        return obj.choice as AvatarChoice;
      }
      if (obj.url) return "upload";
    }
    return null;
  } catch {
    return null;
  }
}

/** Writes the avatar choice and optional image URL to localStorage so it is remembered at app entrance. */
export function writeLocalAvatar(email: string, choice?: string | null, avatarUrl?: string | null) {
  if (!email || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCAL_AVATAR_KEY);
    const m = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const key = email.trim().toLowerCase();
    if (!choice && !avatarUrl) {
      delete m[key];
    } else {
      m[key] = { choice: choice ?? null, url: avatarUrl ?? null };
    }
    localStorage.setItem(LOCAL_AVATAR_KEY, JSON.stringify(m));
  } catch { /* memory only */ }
}

/**
 * Resolves a profile's avatar image URL:
 * 1. Checks profile's attached picture (k.acct.pic) or preset match
 * 2. Checks local avatar memory for the profile's email (readLocalAvatar)
 * 3. Falls back to the current active account avatar if provided
 */
export function resolveProfilePic(
  k?: { acct?: { email?: string; pic?: string } } | null,
  fallback?: string | null
): string | null {
  if (!k) return fallback ?? null;
  const pic = k.acct?.pic;
  if (pic) {
    const match = AVATAR_SUGGESTIONS.find((s) => s.id === pic);
    if (match) return match.src;
    if (pic !== "upload") return pic;
  }
  const email = k.acct?.email;
  if (email) {
    const local = readLocalAvatar(email);
    if (local) return local;
  }
  return fallback ?? null;
}
