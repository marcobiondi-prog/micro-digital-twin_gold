/**
 * The satellite navigation systems behind the phone's position (the map's GPS button), credited in Licenze with their
 * logos. Each logo is the system's Wikidata "logo image" (P154), found through its English Wikipedia article so no
 * item id is hard-coded; a system without one shows its name alone.
 */
export type Gnss = { id: string; name: string; country: string; articles: string[] };

export const GNSS: Gnss[] = [
  { id: "gps", name: "GPS", country: "Stati Uniti", articles: ["Global Positioning System"] },
  { id: "galileo", name: "Galileo", country: "Unione europea", articles: ["Galileo (satellite navigation)"] },
  { id: "glonass", name: "GLONASS", country: "Russia", articles: ["GLONASS"] },
  { id: "beidou", name: "BeiDou", country: "Cina", articles: ["BeiDou", "BeiDou Navigation Satellite System"] },
  { id: "qzss", name: "QZSS", country: "Giappone", articles: ["Quasi-Zenith Satellite System"] },
  { id: "navic", name: "NavIC", country: "India", articles: ["Indian Regional Navigation Satellite System", "NavIC"] },
];

const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"@en`;

/** One query for every system: the article titles and their items' logo files. */
export function gnssLogoQuery(): string {
  const titles = GNSS.flatMap((g) => g.articles).map(quote).join(" ");
  return `SELECT ?title ?img WHERE { VALUES ?title { ${titles} } ?article schema:name ?title; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?item. ?item wdt:P154 ?img. }`;
}

/** The query's rows as one logo file per system (the first article that has one wins, in the listed order). */
export function gnssLogosFrom(rows: Array<{ title?: { value?: string }; img?: { value?: string } }>): Record<string, string | null> {
  const byTitle = new Map<string, string>();
  for (const r of rows) { const t = r.title?.value, i = r.img?.value; if (t && i && !byTitle.has(t)) byTitle.set(t, i); }
  return Object.fromEntries(GNSS.map((g) => [g.id, g.articles.map((a) => byTitle.get(a)).find(Boolean) ?? null]));
}
