import type { NetworkSummary, SensorPick } from "@/controllers/sensor-ai.functions";

/** Metres → degrees around a latitude, for placing example points near the chosen place. */
const offset = (lat: number, lng: number, northM: number, eastM: number) => ({
  lat: +(lat + northM / 111_320).toFixed(5),
  lng: +(lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(5),
});

/**
 * Example of the AI sensor suggestions, shown only with the preview's simulated sign-in (the real
 * suggestions come from an auth-protected server function). Same shape as the real result, around
 * the chosen place, and labelled as an example on screen.
 */
export function exampleSensorSuggestion(kind: "urban" | "vineyard", lat: number, lng: number): { sintesi: string; sensori: SensorPick[]; network: NetworkSummary } {
  const urban = kind === "urban";
  const picks: Array<[number, number, string, string, SensorPick["priorita"], string[]]> = urban
    ? [
        [0, 0, "Centro della piazza", "Centro della piazza, zona senza ombra", "alta", ["Superficie pavimentata esposta al sole tutto il giorno", "Nessun sensore attivo nel raggio di 300 m"]],
        [420, -260, "Vicino alla scuola", "Ingresso della scuola più vicina", "alta", ["Bambini all’aperto nelle ore calde", "Luogo sensibile senza misure di temperatura"]],
        [-380, 310, "Fermata dell’autobus", "Fermata principale dell’autobus", "media", ["Persone in attesa sotto il sole", "Asfalto e pensilina poco ombreggiata"]],
        [650, 520, "Parco", "Ingresso del parco", "bassa", ["Punto di confronto con un’area verde più fresca"]],
      ]
    : [
        [-250, 120, "Versante sud", "Versante sud, zona più calda del vigneto", "alta", ["Massima esposizione al sole nel pomeriggio", "Viti con più sete nelle simulazioni"]],
        [180, -300, "Fondovalle", "Fondovalle, zona più umida", "media", ["L’aria fredda e l’umidità ristagnano al mattino", "Utile per il rischio di malattie"]],
        [420, 380, "Crinale", "Crinale ventilato", "bassa", ["Vento più forte: confronto con le zone riparate"]],
      ];
  return {
    sintesi: urban
      ? "Esempio: i sensori vanno dove il calore pesa di più sulle persone e dove oggi non ci sono misure."
      : "Esempio: un sensore per ogni tipo di zona del vigneto, dalla più calda alla più umida.",
    sensori: picks.map(([n, e, nome, luogo, priorita, motivi]) => ({ nome, luogo, priorita, motivi, ...offset(lat, lng, n, e) })),
    network: urban
      ? { sensoriEsistenti: 2, temperaturaMedia: 31.4, puntiSensibili: 6, fermate: 4 }
      : { sensoriEsistenti: 0, temperaturaMedia: null, puntiSensibili: 1, fermate: 0 },
  };
}
