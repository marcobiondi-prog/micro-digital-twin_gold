/**
 * A device named in plain words from what the browser says about itself: the system, the browser and, when the app is
 * installed, "app installata" — "Android · Chrome", "iPhone · app installata", "Windows · Edge". A phone model, when
 * the browser gives it (Android Chrome), comes first: "Samsung SM-S918B · Android · Chrome".
 */
export function deviceLabel(ua: string, opts: { standalone?: boolean; model?: string } = {}): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua)) ? "iPad"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android" : "Tablet Android") : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera"
    : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "browser";
  const parts = [opts.model?.trim(), os, opts.standalone ? "app installata" : browser].filter((p): p is string => !!p);
  return parts.join(" · ").slice(0, 120);
}

/**
 * One entry per device: rows with the same label are the same phone or computer registered again (its own id lost
 * with the app's data — a reinstall, cleared site data). Of each group the row of this device is kept (else the one
 * used last), carrying the group's first sign-in and last use; the others are returned to be removed.
 */
export function mergeSameDevices<T extends { id: string; device_id: string; label: string; first_seen: string; last_seen: string }>(rows: T[], me: string): { keep: T[]; drop: T[] } {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(r.label, [...(groups.get(r.label) ?? []), r]);
  const keep: T[] = [], drop: T[] = [];
  for (const g of groups.values()) {
    const byUse = [...g].sort((a, b) => b.last_seen.localeCompare(a.last_seen));
    const head = g.find((r) => r.device_id === me) ?? byUse[0]!;
    const first = g.map((r) => r.first_seen).sort()[0]!;
    keep.push({ ...head, first_seen: first, last_seen: byUse[0]!.last_seen });
    drop.push(...g.filter((r) => r !== head));
  }
  keep.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  return { keep, drop };
}
