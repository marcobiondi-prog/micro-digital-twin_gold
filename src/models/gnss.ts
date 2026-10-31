import { logoQuery, logosFrom } from "@/models/credit-logos";

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

export const gnssLogoQuery = () => logoQuery(GNSS);
export const gnssLogosFrom = (rows: Parameters<typeof logosFrom>[1]) => logosFrom(GNSS, rows);
