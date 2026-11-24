import type { HistoryFlow } from "@/models/intervention-history";

/**
 * The simulation last opened on this device (piazza or vigneto), so the history of someone without a profile (a guest)
 * shows only the branch they came from, never the two mixed.
 */
const KEY = "mdt-last-section-v1";
export function setLastSection(flow: HistoryFlow) { try { localStorage.setItem(KEY, flow); } catch { /* this time only */ } }
export function getLastSection(): HistoryFlow { try { return localStorage.getItem(KEY) === "vigneto" ? "vigneto" : "piazza"; } catch { return "piazza"; } }
