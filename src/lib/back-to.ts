/**
 * Where the Cronologia and Archivio pages go back to: the page their link was tapped on (Benvenuto, the dashboard, a
 * simulation), remembered for the session, so "back" never sends the dashboard's history to Benvenuto.
 */
const KEY = "mdt-back-to";
const LABELS: Array<[string, string]> = [["/dashboard", "Dashboard"], ["/urbano", "Simulazione urbana"], ["/vigneto", "Simulazione vigneto"], ["/profilo", "Profilo"], ["/cronologia", "Cronologia"], ["/benvenuto", "Benvenuto"]];

/** Each target page keeps its own origin, so the Archivio opened from the Cronologia goes back there while the Cronologia still goes back to the dashboard. */
export function rememberBack(target: string) {
  try { sessionStorage.setItem(`${KEY}:${target}`, window.location.pathname + window.location.search); } catch { /* storage unavailable */ }
}

/** The page to go back to and its name; Benvenuto when nothing (or the page itself) was remembered. */
export function backTarget(here: string): { href: string; label: string } {
  let href = "/benvenuto";
  try { href = sessionStorage.getItem(`${KEY}:${here}`) ?? href; } catch { /* storage unavailable */ }
  const path = href.split("?")[0] ?? href;
  if (path === here || path.startsWith(`${here}/`)) href = "/benvenuto";
  const p = href.split("?")[0] ?? "";
  const label = LABELS.find(([k]) => p === k || p.startsWith(`${k}/`))?.[1] ?? "Indietro";
  return { href, label };
}

/** The bottom bar's lit page on the Cronologia and Archivio: the dashboard when opened from there, else Benvenuto. */
export function historyHome(here: string): "/dashboard" | "/benvenuto" {
  return backTarget(here).href.startsWith("/dashboard") ? "/dashboard" : "/benvenuto";
}
