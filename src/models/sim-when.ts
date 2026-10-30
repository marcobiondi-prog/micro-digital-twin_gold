import type { Season } from "./season-climate";

/**
 * The season and hour each simulation is set to (its "when" chip), kept at module level so the history can record them
 * with an intervention, and so "Riapri" can ask the simulation to open on the season and hour of a past entry.
 */
export type SimWhen = { season: Season; hour: number; minute?: number };

/** "15:42" ("15:00" without minutes). */
export const clockText = (hour: number, minute = 0) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
type Kind = "urban" | "vineyard";

const current: Partial<Record<Kind, SimWhen>> = {};
const requested: Partial<Record<Kind, SimWhen>> = {};

export const setSimWhen = (kind: Kind, when: SimWhen) => { current[kind] = when; };
export const getSimWhen = (kind: Kind): SimWhen | null => current[kind] ?? null;

/** Asks the simulation to open on this season and hour the next time its clock starts. */
export const requestSimWhen = (kind: Kind, when: SimWhen) => { requested[kind] = when; };
/** The season and hour asked for, if any (read on start; cleared once the clock has started). */
export const peekRequestedWhen = (kind: Kind): SimWhen | null => requested[kind] ?? null;
export const clearRequestedWhen = (kind: Kind) => { delete requested[kind]; };
