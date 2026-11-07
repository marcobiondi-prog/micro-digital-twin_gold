import { fold } from "./comuni";

/**
 * The official email of a town's office, from the public administrations' own register (the index of every Italian
 * public body with its offices and their addresses). The register lists each office ("unità organizzativa") with up to
 * three addresses, ordinary or certified (PEC); the one picked is the office whose name shares most words with the
 * office chosen in the form, its ordinary address first.
 */
export type RegisterOffice = { name: string; mails: Array<{ mail: string; pec: boolean }> };

const STOP = new Set(["ufficio", "servizio", "settore", "area", "e", "di", "del", "della", "dei", "delle", "degli", "al", "alla", "ai", "per", "il", "la", "lo", "gli", "le", "comune", "uo", "u", "o"]);
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));

/** How well a register office's name matches the office chosen (shared words, a stem of 5 letters counting too). */
export function officeScore(registerName: string, chosen: string): number {
  const a = words(registerName), b = words(chosen);
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const w of b) if (a.some((x) => x === w || (x.length >= 5 && w.length >= 5 && x.slice(0, 5) === w.slice(0, 5)))) hit += 1;
  return hit / b.length;
}

/** The best address for the office chosen, or null when no office of the register matches at least half its words. */
export function pickOfficeMail(offices: RegisterOffice[], chosen: string): { mail: string; office: string; pec: boolean } | null {
  let best: { mail: string; office: string; pec: boolean; score: number } | null = null;
  for (const o of offices) {
    const score = officeScore(o.name, chosen);
    if (score < 0.5) continue;
    const m = o.mails.find((x) => !x.pec) ?? o.mails[0];
    if (!m) continue;
    const s = score + (m.pec ? 0 : 0.01);
    if (!best || s > best.score) best = { mail: m.mail.toLowerCase(), office: o.name, pec: m.pec, score: s };
  }
  return best && { mail: best.mail, office: best.office, pec: best.pec };
}

/** The town's own entry name in the register ("Comune di Campobasso"). */
export const townEntity = (comune: string) => `Comune di ${comune}`;
