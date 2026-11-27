/**
 * Progetti condivisi · fase 0: the part of the simulation (lab-store) that belongs to a project in the account, and what
 * to do when the device and the account meet (lib/project-sync).
 */
import type { LabState } from "./lab-store";

export type ProjectKind = "piazza" | "vigneto";
/** Per account and kind, on this device: which project, the account's last update already seen, when it was last in step. */
/** shared: the project in use is someone else's, shared with this account (an invite accepted). */
export type SyncMeta = { id?: string; known?: string; syncedAt?: number; shared?: boolean };

/** What goes to the account: the whole slice of the simulation, less what only this device works out (the clock's air). */
export function projectSlice(kind: ProjectKind, lab: LabState): Record<string, unknown> {
  if (kind === "piazza") { const { realTemp: _t, ...u } = lab.urban; return u; }
  const { climateKey: _c, ...v } = lab.vineyard;
  return v;
}

export function placeOf(kind: ProjectKind, lab: LabState) {
  return kind === "piazza" ? lab.urban.location : lab.vineyard.location;
}

/** A project's name: the place's first part ("Piazza Vittorio Emanuele II"). */
export function projectName(label: string): string {
  return (label.split(/ · |, /)[0] ?? label).trim().slice(0, 200) || "Progetto";
}

export type SyncStep = "none" | "create" | "pull" | "push";
/**
 * - no project in the account: one is made from the device (once a place is chosen);
 * - never in step on this device: the account wins (what was tried before signing in never overwrites it);
 * - edited here since the last time in step: the device's goes up (the last change wins);
 * - the account changed since (another device, a colleague): it comes down.
 */
export function syncStep(o: { meta: SyncMeta | undefined; editedAt: number; remoteAt: string | null; pending: boolean }): SyncStep {
  if (!o.remoteAt) return o.pending ? "none" : "create";
  if (!o.meta?.syncedAt || !o.meta.known) return "pull";
  if (o.editedAt > o.meta.syncedAt) return "push";
  if (o.remoteAt !== o.meta.known) return "pull";
  return "none";
}
