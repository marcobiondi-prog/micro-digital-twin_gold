import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOfficeEmail } from "@/controllers/ipa.functions";
import { officeEmail } from "@/models/professional-id";

/**
 * The email of the municipal officer's office: the official one from the public administrations' register when it
 * lists that office (asked once per town and office, the answer kept on this device in localStorage mdt-office-mail-v1),
 * else the usual pattern (officeEmail), marked as indicative. A failed lookup is not kept, so it is tried again later.
 */
const KEY = "mdt-office-mail-v1";
type Found = { mail: string; official: boolean };
const readAll = (): Record<string, string | null> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string | null>; } catch { return {}; } };

export function useOfficeEmail(comune: string, office: string, istat?: string): Found {
  const fetchMail = useServerFn(getOfficeEmail);
  const key = `${comune}|${office}`.toLowerCase();
  const fallback: Found = { mail: comune && office ? officeEmail(office, comune) : "", official: false };
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!comune || !office) return;
    const kept = readAll()[key];
    if (kept !== undefined) { setFound(kept ? { mail: kept, official: true } : null); return; }
    let live = true;
    fetchMail({ data: { comune, office, ...(istat ? { istat } : {}) } }).then((r) => {
      // Kept either way once the register answered (null = it lists no such office).
      try { localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [key]: r?.mail ?? null })); } catch { /* memory only */ }
      if (live) setFound(r ? { mail: r.mail, official: true } : null);
    }, () => undefined);
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return found ?? fallback;
}
