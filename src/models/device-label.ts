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
