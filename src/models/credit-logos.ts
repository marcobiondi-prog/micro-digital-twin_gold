import { BRAND_ICONS, type BrandIcon } from "@/data/brand-icons";

/**
 * The services and libraries credited in Licenze — only those that gather data and the technologies the app is made
 * with; nothing about how the site is published or signed in to (no Supabase, Vercel nor Google sign-in) — each shown as a tile with its logo: the Simple Icons mark when
 * there is one (bundled, so it shows offline), else the Wikidata "logo image" (P154) of its English Wikipedia article,
 * else its name alone. Nothing here is drawn by hand.
 */
export type CreditItem = { id: string; name: string; sub: string; icon?: BrandIcon; articles?: string[] };

const si = (slug: string) => BRAND_ICONS[slug];
const item = (id: string, name: string, sub: string, icon?: BrandIcon, articles?: string[]): CreditItem =>
  ({ id, name, sub, ...(icon ? { icon } : {}), ...(articles ? { articles } : {}) });

export const SERVICES: CreditItem[] = [
  item("osm", "OpenStreetMap", "Mappe, luoghi e superfici", si("openstreetmap")),
  item("esri", "Esri", "Immagini satellitari della mappa", si("esri")),
  item("gmaps", "Google Maps", "Ricerca dei luoghi e mappa 3D", si("googlemaps")),
  item("openmeteo", "Open-Meteo", "Meteo e clima dell'anno", undefined, ["Open-Meteo"]),
  item("nasa", "NASA POWER", "Dati climatici", si("nasa")),
  item("copernicus", "Copernicus", "Dati dai satelliti", undefined, ["Copernicus Programme"]),
  item("sensor", "Sensor.Community", "Sensori dell'aria vicini", undefined, ["Sensor.Community", "Luftdaten.info"]),
  item("gemini", "Google Gemini", "Intelligenza artificiale", si("googlegemini")),
  item("openai", "OpenAI", "Intelligenza artificiale", undefined, ["OpenAI"]),
  item("parallel", "Parallel", "Ricerca delle fonti", undefined, ["Parallel Web Systems"]),
  item("kew", "Kew Gardens", "Foto di riferimento delle piante", undefined, ["Royal Botanic Gardens, Kew", "Kew Gardens"]),
  item("gbif", "GBIF", "Foto e nomi delle specie", undefined, ["Global Biodiversity Information Facility"]),
  item("col", "Catalogue of Life", "Verifica dei nomi delle specie", undefined, ["Catalogue of Life"]),
  item("istat", "ISTAT", "Elenco dei comuni", undefined, ["Istat", "Italian National Institute of Statistics"]),
  item("wikidata", "Wikidata", "Stemmi e loghi", si("wikidata")),
  item("commons", "Wikimedia Commons", "Immagini di stemmi e loghi", si("wikimediacommons")),
];

/** The open-source libraries with their licences (the tile's second line). */
export const LIBRARIES: CreditItem[] = [
  item("react", "React", "MIT", si("react")),
  item("tanstack", "TanStack Router, Start e Query", "MIT", si("tanstack")),
  item("tailwind", "Tailwind CSS", "MIT", si("tailwindcss")),
  item("radix", "Radix UI", "MIT", si("radixui")),
  item("lucide", "Lucide", "ISC", si("lucide")),
  item("recharts", "Recharts", "MIT"),
  item("maplibre", "MapLibre GL JS", "BSD-3-Clause", si("maplibre")),
  item("three", "three.js", "MIT", si("threedotjs")),
  item("d3", "D3", "ISC", si("d3")),
  item("jspdf", "jsPDF", "MIT"),
  item("jszip", "JSZip", "MIT"),
  item("pdfjs", "PDF.js", "Apache-2.0", si("mozilla")),
  item("zod", "Zod", "MIT", si("zod")),
  item("datefns", "date-fns", "MIT", si("datefns")),
  item("sonner", "Sonner", "MIT"),
  item("vaul", "Vaul", "MIT"),
  item("cva", "class-variance-authority", "Apache-2.0"),
  item("rhf", "React Hook Form", "MIT", si("reacthookform")),
  item("embla", "Embla Carousel", "MIT"),
  item("tzlookup", "tz-lookup", "CC0-1.0 · fusi orari"),
  item("simpleicons", "Simple Icons", "CC0-1.0 · loghi", si("simpleicons")),
];

const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"@en`;

/** One query for the logos of every item that has articles. */
export function logoQuery(items: Array<{ articles?: string[] }>): string {
  const titles = [...new Set(items.flatMap((g) => g.articles ?? []))].map(quote).join(" ");
  return `SELECT ?title ?img WHERE { VALUES ?title { ${titles} } ?article schema:name ?title; schema:isPartOf <https://en.wikipedia.org/>; schema:about ?item. ?item wdt:P154 ?img. }`;
}

/** The query's rows as one logo file per item (the first article that has one wins, in the listed order). */
export function logosFrom(items: Array<{ id: string; articles?: string[] }>, rows: Array<{ title?: { value?: string }; img?: { value?: string } }>): Record<string, string | null> {
  const byTitle = new Map<string, string>();
  for (const r of rows) { const t = r.title?.value, i = r.img?.value; if (t && i && !byTitle.has(t)) byTitle.set(t, i); }
  return Object.fromEntries(items.filter((g) => g.articles?.length).map((g) => [g.id, g.articles!.map((a) => byTitle.get(a)).find(Boolean) ?? null]));
}

/** A light brand colour (TanStack's cream) needs a dark tile to be seen. */
export function needsDarkTile(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.8;
}
