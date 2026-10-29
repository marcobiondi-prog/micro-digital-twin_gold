/**
 * The Italian towns (comuni) for the municipal officer's identification: name, province code, population and ISTAT code, from
 * src/data/comuni-it.json (extracted from comuni-json by Matteo Contrini, MIT, ISTAT data as of 1 January 2020).
 * Pure search here; lib/comuni loads the list lazily.
 */
/** Name, province code, population and ISTAT code (which finds the town's coat of arms). */
export type Comune = [name: string, sigla: string, population: number, istat: string];

/** Lowercase, no accents, apostrophes and dashes as spaces: "Sant'Agata de' Goti" → "sant agata de goti". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`\-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Up to `limit` towns for what was typed: names starting with it first, then names with a word starting with it,
 * then names containing it; each group from the most populated. Nothing under two letters.
 */
export function searchComuni(list: readonly Comune[], query: string, limit = 8): Comune[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const starts: Comune[] = [], word: Comune[] = [], inside: Comune[] = [];
  for (const c of list) {
    const n = fold(c[0]);
    if (n.startsWith(q)) starts.push(c);
    else if (n.includes(` ${q}`)) word.push(c);
    else if (n.includes(q)) inside.push(c);
  }
  const byPop = (a: Comune, b: Comune) => b[2] - a[2];
  return [...starts.sort(byPop), ...word.sort(byPop), ...inside.sort(byPop)].slice(0, limit);
}

/** The town with exactly this name (accents, case and apostrophes aside), if any. */
export const findComune = (list: readonly Comune[], name: string): Comune | undefined => {
  const q = fold(name);
  return q ? list.find((c) => fold(c[0]) === q) : undefined;
};

/** The town's usual email domain, to suggest the address: "Campobasso" → "comune.campobasso.it". */
export const townDomain = (name: string) => `comune.${fold(name).replace(/ /g, "")}.it`;

/**
 * The Wikidata query for a town's coat of arms (property P94) by its ISTAT code (P635): the image comes back as a
 * Commons file path, which a width parameter turns into a small PNG.
 */
export const crestQuery = (istat: string) =>
  `SELECT ?img WHERE { ?town wdt:P635 "${istat.replace(/[^0-9]/g, "")}" ; wdt:P94 ?img } LIMIT 1`;
/** The Commons file path made into a picture of the given width, over https. */
export const crestUrl = (filePath: string, width = 160) => `${filePath.replace(/^http:/, "https:")}?width=${width}`;
