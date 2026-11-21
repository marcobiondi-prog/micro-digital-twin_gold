/**
 * "Disegna l'area" from anywhere (the people and constraints cards, the dashboard): the simulation's map opens and
 * starts drawing by itself. The request waits a few seconds for the map to mount (it may be on another page or tab).
 */
type Kind = "urban" | "vineyard";
let pending: { kind: Kind; at: number } | null = null;
export const DRAW_EVENT = "mdt-start-draw";

export function requestDraw(kind: Kind) {
  pending = { kind, at: Date.now() };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAW_EVENT));
}

/** True (once) when drawing was asked for this simulation in the last 6 s. */
export function takeDrawRequest(kind: Kind): boolean {
  if (!pending || pending.kind !== kind || Date.now() - pending.at > 6000) return false;
  pending = null;
  return true;
}
