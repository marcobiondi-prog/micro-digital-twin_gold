/**
 * Who may use which simulation. The vineyard is for agronomists, who identify themselves with their plant-protection
 * licence (patentino fitosanitario); the piazza is for municipal officers, identified by their town, office and the
 * town's email. One profile at a time: identifying as one locks the other section.
 * The data are checked for their form only (no public register can be queried): the user declares they are true.
 */
import { fold } from "./comuni";

export type Section = "urban" | "vineyard";
export type ProKind = "agronomo" | "funzionario";

export type AgronomoId = {
  kind: "agronomo"; name: string; licenceType: "consulente" | "utilizzatore"; licence: string; region: string; expires: string; at: string;
};
export type FunzionarioId = {
  kind: "funzionario"; name: string; comune: string; office: string; role: string; email: string; badge: string; at: string;
  /** The town's ISTAT code, for its coat of arms (older profiles have none and find it by name). */
  istat?: string;
};
export type ProId = AgronomoId | FunzionarioId;

/** Which profile opens which section. */
export const SECTION_KIND: Record<Section, ProKind> = { urban: "funzionario", vineyard: "agronomo" };
export const KIND_SECTION: Record<ProKind, Section> = { funzionario: "urban", agronomo: "vineyard" };
export const KIND_LABEL: Record<ProKind, string> = { agronomo: "Agronomo", funzionario: "Funzionario comunale" };
export const SECTION_LABEL: Record<Section, string> = { urban: "piazza", vineyard: "vigneto" };

export const unlocks = (id: ProId | null | undefined, section: Section): boolean => id?.kind === SECTION_KIND[section];

export const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
] as const;
/** The regions matching what was typed (all of them when nothing is), names starting with it first; accents and case aside. */
export function searchRegions(query: string): string[] {
  const q = fold(query);
  if (!q) return [...REGIONS];
  const starts = REGIONS.filter((r) => fold(r).startsWith(q)), inside = REGIONS.filter((r) => !fold(r).startsWith(q) && fold(r).includes(q));
  return [...starts, ...inside];
}
/** The region with exactly this name (accents, case and apostrophes aside), with its own spelling. */
export const findRegion = (name: string): string | undefined => { const q = fold(name); return q ? REGIONS.find((r) => fold(r) === q) : undefined; };

export const OFFICES = [
  "Ufficio tecnico", "Lavori pubblici", "Urbanistica", "Edilizia privata", "Ambiente e verde pubblico", "Mobilità e traffico", "Patrimonio",
  "Protezione civile", "Polizia locale", "Sviluppo economico", "Cultura e turismo", "Servizi sociali", "Segreteria e Giunta", "Altro",
] as const;

/** The offices matching what was typed (all of them, "Altro" aside, when nothing is), names starting with it first. */
export function searchOffices(query: string): string[] {
  const named = OFFICES.filter((o) => o !== "Altro");
  const q = fold(query);
  if (!q) return [...named];
  return [...named.filter((o) => fold(o).startsWith(q)), ...named.filter((o) => !fold(o).startsWith(q) && fold(o).includes(q))];
}
/**
 * What was typed in the office field, as the form expects it: a listed office with its own spelling, or "Altro" with
 * the typed name for an office that is not listed.
 */
export function officeOf(typed: string): { office: string; otherOffice: string } {
  const q = fold(typed);
  if (!q) return { office: "", otherOffice: "" };
  const known = OFFICES.find((o) => o !== "Altro" && fold(o) === q);
  return known ? { office: known, otherOffice: "" } : { office: "Altro", otherOffice: typed };
}
export const ROLES = ["Dirigente", "Funzionario", "Istruttore tecnico", "Assessore o consigliere", "Altro"] as const;

export type Errors<K extends string> = Partial<Record<K, string>>;
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** A licence number as the regions write it: letters, digits and / - . , 4–30 characters, at least one digit. */
export const isLicenceNumber = (s: string) => /^[A-Za-z0-9][A-Za-z0-9/.\- ]{2,28}[A-Za-z0-9]$/.test(s.trim()) && /\d/.test(s);
/** A town's email: …@comune.nome.it (or …@comune-nome.it, …@nome.comune.it). */
export const isTownEmail = (s: string) => /^[^@\s]+@(?:[a-z0-9-]+\.)*[a-z0-9-]*comune[a-z0-9-]*(?:\.[a-z0-9-]+)*\.it$/i.test(s.trim());

export type AgronomoInput = { name: string; licenceType: string; licence: string; region: string; expires: string; declared: boolean };
export function checkAgronomo(v: AgronomoInput, today: Date = new Date()): { id: AgronomoId | null; errors: Errors<keyof AgronomoInput> } {
  const errors: Errors<keyof AgronomoInput> = {};
  if (clean(v.name).split(" ").length < 2) errors.name = "Scrivi nome e cognome.";
  if (v.licenceType !== "consulente" && v.licenceType !== "utilizzatore") errors.licenceType = "Scegli il tipo di patentino.";
  if (!isLicenceNumber(v.licence)) errors.licence = "Scrivi il numero come è sul patentino (lettere, numeri, / o -).";
  if (!(REGIONS as readonly string[]).includes(v.region)) errors.region = "Scegli la regione che l'ha rilasciato.";
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(v.expires) ? new Date(`${v.expires}T23:59:59`) : null;
  if (!exp || Number.isNaN(exp.getTime())) errors.expires = "Scrivi la data di scadenza.";
  else if (exp < today) errors.expires = "Il patentino è scaduto: serve un patentino valido.";
  if (!v.declared) errors.declared = "Conferma che i dati sono tuoi e veri.";
  if (Object.keys(errors).length) return { id: null, errors };
  return { id: { kind: "agronomo", name: clean(v.name), licenceType: v.licenceType as AgronomoId["licenceType"], licence: v.licence.trim().toUpperCase(), region: v.region, expires: v.expires, at: today.toISOString() }, errors };
}

export type FunzionarioInput = { name: string; comune: string; office: string; otherOffice: string; role: string; email: string; badge: string; declared: boolean };
export function checkFunzionario(v: FunzionarioInput, today: Date = new Date()): { id: FunzionarioId | null; errors: Errors<keyof FunzionarioInput> } {
  const errors: Errors<keyof FunzionarioInput> = {};
  if (clean(v.name).split(" ").length < 2) errors.name = "Scrivi nome e cognome.";
  if (clean(v.comune).length < 2) errors.comune = "Scrivi il Comune in cui lavori.";
  if (!(OFFICES as readonly string[]).includes(v.office)) errors.office = "Scegli l'ufficio di appartenenza.";
  else if (v.office === "Altro" && clean(v.otherOffice).length < 3) errors.otherOffice = "Scrivi il nome dell'ufficio.";
  if (!(ROLES as readonly string[]).includes(v.role)) errors.role = "Scegli il tuo ruolo.";
  if (!isTownEmail(v.email)) errors.email = "Usa l'email del Comune, per esempio nome.cognome@comune.campobasso.it.";
  if (!v.declared) errors.declared = "Conferma che i dati sono tuoi e veri.";
  if (Object.keys(errors).length) return { id: null, errors };
  return { id: { kind: "funzionario", name: clean(v.name), comune: clean(v.comune), office: v.office === "Altro" ? clean(v.otherOffice) : v.office, role: v.role, email: v.email.trim().toLowerCase(), badge: clean(v.badge), at: today.toISOString() }, errors };
}

/** A saved profile that still reads right (older or hand-edited copies are dropped). */
export function isProId(v: unknown): v is ProId {
  const o = v as { kind?: unknown; name?: unknown; at?: unknown; licence?: unknown; region?: unknown; expires?: unknown; comune?: unknown; office?: unknown; email?: unknown } | null;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || typeof o.at !== "string") return false;
  if (o.kind === "agronomo") return typeof o.licence === "string" && typeof o.region === "string" && typeof o.expires === "string";
  if (o.kind === "funzionario") return typeof o.comune === "string" && typeof o.office === "string" && typeof o.email === "string";
  return false;
}

/** One line saying who is identified: "Agronomo · patentino CB/1234 (Molise)", "Funzionario comunale · Comune di Campobasso, Ufficio tecnico". */
export function proSummary(id: ProId): string {
  return id.kind === "agronomo"
    ? `${KIND_LABEL.agronomo} · patentino ${id.licence} (${id.region})`
    : `${KIND_LABEL.funzionario} · Comune di ${id.comune}, ${id.office}`;
}
