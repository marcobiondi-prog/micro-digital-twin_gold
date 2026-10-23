import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { arRecognitionSchema, canEstimateRecognizedPlant, estimateCooling, withPlantAlternatives, type GroundSurvey } from "@/models/ar-recognition";
import { ArGatewayError, readArResponse } from "@/controllers/ar-response.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiConfigured, aiResponses } from "@/lib/ai-responses";
import { plantPhotoBounds, type PlantOutline } from "@/models/ar-plant-photo";
import { arFocusOption } from "@/models/ar-focus";
import { satellitePrompt } from "@/models/copernicus";
import { sameBotanicalName, usableBotanicalMatch } from "@/models/ar-botanical-match";
import { gbifPhotoSearchUrl, pickGbifPhoto, pickPowoPhoto, type ReferencePhoto } from "@/models/ar-reference-photo";

export type GrowthForm = "columnar" | "conical" | "round" | "umbrella" | "vine" | "shrub";

export type SoilKind =
  | "artificiale"
  | "argilloso"
  | "sabbioso"
  | "limoso"
  | "franco"
  | "ghiaioso"
  | "roccioso"
  | "prato"
  | "pacciamato";

/** Superficie del terreno inquadrata: tipo, permeabilità e idoneità indicativa alla piantumazione. */
export type Soil = {
  kind: SoilKind;
  label: string;
  permeability: "bassa" | "media" | "alta";
  plantable: boolean;
  note: string;
} | null;

export type Detection = {
  label: string;
  type: "tree" | "vine" | "object";
  box: { x: number; y: number; w: number; h: number };
  outline: PlantOutline | null;
  identification: z.infer<typeof arRecognitionSchema>["identification"];
  species: {
    commonName: string;
    scientificName: string;
    family: string | null;
    gbifKey: number | null;
    gbifUrl: string | null;
    /** Catalogue of Life: elenco mondiale delle specie (nome accettato). */
    colUrl: string | null;
    /** Reference photo of the species from a botanical database (Kew POWO, else GBIF), shown in Esito. Always
     * null here: the camera asks for it after the scan (getReferencePhoto), so the scan never waits on it. */
    photo: ReferencePhoto | null;
    form: GrowthForm;
    heightM: number;
    crownM: number;
    evergreen: boolean;
    density: number;
  } | null;
  cooling: { deltaT: number; shadeM2: number; note: string } | null;
} | null;

const PROMPT = `Analizza le piante REALI nell'immagine: individua l'albero (anche dal solo tronco e corteccia), vite o arbusto più vicino al centro e identifica la specie o il genere solo quando sostenuti da caratteri botanici visibili: il nome scientifico viene verificato sul Catalogue of Life e GBIF. In contesto vitivinicolo riconosci anche gli alberi, non solo le viti. Non generare immagini o modelli.
Usa come criterio PRINCIPALE la FORMA DELLA FOGLIA: semplice/composta, ovata/lanceolata/palmata/aghiforme, lobi, margine intero/seghettato, nervature, disposizione opposta/alterna. Fiori, frutti, corteccia e portamento sono indizi complementari. Non mescolare foglie di piante diverse. Dal solo tronco non forzare una specie.
Confronta internamente le specie simili: richiedi almeno due caratteri diagnostici concordanti per proporre una specie, non basarti sul solo colore. Considera punta e base della foglia, profondità dei lobi, dentatura e disposizione sul ramo; se il dettaglio non discrimina le alternative, restituisci il genere e spiega il limite. Ignora sfocatura, riflessi e foglie di sfondo.
Aggiungi identification:{"level":"species|genus|uncertain","leafVisible":boolean,"evidence":"breve descrizione italiana dei caratteri realmente visibili"}. Se foglie ambigue usa genus; senza caratteri distintivi usa uncertain e plant:null. Se nessuna pianta identification:null. Il catalogo verifica la tassonomia, NON dimostra l'identificazione della foto. Per heightM, crownM e density usa dimensioni botaniche tipiche indicative dell’esemplare della specie/genere riconosciuto per la SIMULAZIONE; non le dimensioni della singola foglia o del ramo ritagliato. Non dichiararle misurate dalla foto.
Aggiungi outline al livello principale del JSON anche quando plant:null: un poligono ordinato di 12-48 punti {x,y} normalizzati rispetto all'INTERO fotogramma. Segui il contorno esterno della pianta reale dalla chioma al tronco e alla base, escludendo il terreno e quanto possibile lo sfondo. Il ritaglio fotografico usa questi punti. Usa outline:null se il contorno non è distinguibile o non è una pianta. Usa plant:null anche quando non ci sono indizi sufficienti per identificarne il genere.
Rispondi SOLO con JSON:
type: "tree" per alberi, arbusti, siepi, piante erbacee e in vaso; "vine" per la vite e i rampicanti; "object" SOLO se non è una pianta.
{"found":true,"label":"nome comune italiano","type":"tree|vine|object","box":{"x":0-1,"y":0-1,"w":0-1,"h":0-1},
"plant":{"scientificName":"Genere specie","commonName":"nome comune italiano","form":"columnar|conical|round|umbrella|vine|shrub","heightM":numero,"crownM":diametro chioma tipica indicativa in metri,"evergreen":true|false,"density":0-1 densità fogliare,"alternatives":[fino a 2 {"scientificName","commonName"} di specie simili che hai considerato, dalla più probabile; [] se nessuna]}}
Aggiungi SEMPRE (anche con found:false) la superficie del terreno visibile:
"soil":{"kind":"artificiale|argilloso|sabbioso|limoso|franco|ghiaioso|roccioso|prato|pacciamato","label":"descrizione breve italiana (es. asfalto, terra argillosa compatta)","permeability":"bassa|media|alta","plantable":true|false,"note":"consiglio breve per piantare"} oppure "soil":null se il terreno non è visibile.
"artificiale" = asfalto, cemento, pavimentazione, erba sintetica.
box è il riquadro normalizzato (x,y angolo in alto a sinistra). Usa "plant":null se non è una pianta. Se non c'è nulla: {"found":false,"soil":{...}}.`;

const FORMS: GrowthForm[] = ["columnar", "conical", "round", "umbrella", "vine", "shrub"];

export { estimateCooling } from "@/models/ar-recognition";

async function gbif(name: string) {
  try {
    const r = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}&kingdom=Plantae&strict=true`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      usageKey?: number;
      canonicalName?: string;
      family?: string;
      matchType?: string;
      kingdom?: string;
      rank?: string;
    };
    if (!j.usageKey || !usableBotanicalMatch(name, {name:j.canonicalName, rank:j.rank?.toLowerCase(), kingdom:j.kingdom, type:j.matchType})) return null;
    return { key: j.usageKey, name: j.canonicalName ?? name, family: j.family ?? null };
  } catch {
    return null;
  }
}

type ColUsage = { id?: string; name?: string; rank?: string; status?: string; accepted?: ColUsage; classification?: { name?: string; rank?: string }[] };
/** Catalogue of Life (database botanico mondiale): nome accettato e famiglia. */
async function catalogueOfLife(name: string) {
  try {
    const r = await fetch(`https://api.checklistbank.org/dataset/3LR/match/nameusage?scientificName=${encodeURIComponent(name)}&kingdom=Plantae`);
    if (!r.ok) return null;
    const j = (await r.json()) as { usage?: ColUsage; match?: boolean; type?: string };
    if (!j.match || !usableBotanicalMatch(name, {name:j.usage?.name,rank:j.usage?.rank,kingdom:j.usage?.classification?.find(c => c.rank === "kingdom")?.name,type:j.type})) return null;
    const u = j.usage?.status === "synonym" && j.usage.accepted ? j.usage.accepted : j.usage;
    if (!u?.id || !u.name) return null;
    const family = (u.classification ?? j.usage?.classification ?? []).find((c) => c.rank === "family")?.name ?? null;
    return { id: u.id, name: u.name, family };
  } catch {
    return null;
  }
}

/** Reference photo of the whole plant: Kew's Plants of the World Online first, then an openly licensed GBIF photo.
 * Best effort with timeouts, outside the scan: the camera asks for it once the species is known. */
async function referencePhoto(name: string, gbifKey: number | null): Promise<ReferencePhoto | null> {
  const get = async (url: string) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
      return r.ok ? ((await r.json()) as unknown) : null;
    } catch {
      return null;
    }
  };
  // The whole plant first: a Kew habit photo, else a GBIF field photo, else any Kew photo that is not a close-up.
  const [powo, occurrences] = await Promise.all([
    get(`https://powo.science.kew.org/api/2/search?q=${encodeURIComponent(name)}`),
    gbifKey ? get(gbifPhotoSearchUrl(gbifKey)) : null,
  ]);
  const photo = pickPowoPhoto(powo, name, true) ?? pickGbifPhoto(occurrences) ?? pickPowoPhoto(powo, name);
  // Visible in the Vercel logs: which database answered when a species ends up without a reference photo.
  if (!photo) console.info("AR reference photo: none", { name, kew: powo !== null, gbif: occurrences !== null });
  return photo;
}

const detectInput = z.object({ image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(3_000_000), detailImage: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(1_000_000).optional(), kind: z.enum(["urban", "vineyard"]).default("urban"), target: z.enum(["tree", "ground", "leaf", "canopy", "interrow"]).optional(), focus: z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().min(0).max(1),h:z.number().min(0).max(1)}).optional(), satellite: z.object({ ndvi: z.number().min(-1).max(1).optional(), ndviDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), surfaceTemp: z.number().min(-60).max(80).optional(), tempDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional() });
type DetectResult = { detection: Detection; soil?: Soil; survey?: GroundSurvey | null; error?: string; status?: number };

/** Foto di riferimento della specie riconosciuta, chiesta dalla fotocamera dopo la scansione (solo utenti registrati). */
export const getReferencePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(2).max(80), gbifKey: z.number().int().positive().nullable() }).parse(d))
  .handler(async ({ data }): Promise<ReferencePhoto | null> => referencePhoto(data.name, data.gbifKey));

/** Riconosce oggetto e specie inquadrati dalla fotocamera AR (solo utenti registrati). */
export const detectArObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => detectInput.parse(d))
  .handler(async ({ data }): Promise<DetectResult> => {
    // Unexpected server failures come back as a readable error instead of a thrown request.
    try {
      return await recognize(data);
    } catch (error) {
      console.error("AR recognition", error);
      const missingKey = error instanceof Error && /SUPABASE_SERVICE_ROLE_KEY/.test(error.message);
      return { detection: null, error: missingKey ? "Server non configurato: manca SUPABASE_SERVICE_ROLE_KEY." : "Errore del server durante l’analisi. Nessun nuovo risultato applicato." };
    }
  });

async function recognize(data: z.infer<typeof detectInput>): Promise<DetectResult> {
    if (!aiConfigured()) return { detection: null, error: "Servizio AI non configurato." };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: blocked, error: stateError } = await supabaseAdmin.from("ar_ai_access_state").select("status,reason").eq("scope", "recognition").maybeSingle();
  if (stateError) return { detection: null, error: "Impossibile verificare la disponibilità del servizio AI." };
  if (blocked) return { detection: null, error: blocked.reason, status: blocked.status };
  const res = await aiResponses({
      store: false,
      stream: true,
      reasoning: { effort: "medium", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: { format: { type: "json_schema", name: "ar_recognition", strict: true, schema: z.toJSONSchema(arRecognitionSchema) } },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${PROMPT}\n${arFocusOption(data.kind, data.target).prompt}\n${data.focus ? `Mirino normalizzato: ${JSON.stringify(data.focus)}. Identifica la pianta nel mirino; tutte le coordinate della risposta restano relative all’intero fotogramma.` : arFocusOption(data.kind, data.target).seeks === "vegetation" ? "Il mirino non ha agganciato la pianta dal colore: cercala in TUTTO il fotogramma, anche se piccola, decentrata, in ombra, in controluce, con foglie scure, grigio-argentee o autunnali, o se si vede solo il tronco. Rispondi found:false solo se davvero non c’è nessuna pianta." : ""}\nContesto: ${data.kind === "urban" ? "urbanistica" : "vitivinicolo"}. Fornisci plant solo per una specie o un genere sostenuti dai caratteri visibili, altrimenti plant:null e identification.level uncertain; soil null se non distinguibile. Per found:false usa label vuota, type object, box e plant null. Aggiungi survey:null se il terreno non è distinguibile; altrimenti survey con consistency (breve descrizione della consistenza APPARENTE, es. compatta, granulosa, coperta; dichiarare se incerta), heatNote (esposizione visibile al sole/ombra e possibile accumulo termico, SENZA temperature, umidità o misure inventate) e regions: da 1 a 8 rettangoli del SOLO terreno visibile nella metà inferiore del fotogramma. Ogni regione ha label, box x/y/w/h normalizzati 0-1, exposure ombra|mista|esposta|incerta, plantable boolean. Non includere cielo, edifici, persone o chiome. Asfalto/cemento non piantabili. Tessitura, compattazione e calore reali richiedono sensori o analisi, non possono essere misurati dalla foto. Per il vigneto descrivi cautamente copertura/interfila, rischio da esposizione e verifica con sonda di temperatura e prova del terreno.${data.satellite ? `\n${satellitePrompt(data.satellite)}` : ""}` },
            { type: "input_image", image_url: data.image },
            ...(data.detailImage ? [{type:"input_text",text:"Seconda immagine: dettaglio del mirino dallo STESSO fotogramma. Usalo per la morfologia fogliare, non come pianta diversa. Box, outline e terreno devono restare riferiti alla PRIMA immagine completa."}, {type:"input_image",image_url:data.detailImage}] : []),
          ],
        },
      ],
    });
  let p: z.infer<typeof arRecognitionSchema>;
  try {
    p = arRecognitionSchema.parse(withPlantAlternatives(JSON.parse(await readArResponse(res))));
  } catch (error) {
    if (error instanceof ArGatewayError) {
      if (error.persistent) {
        const { error: saveError } = await supabaseAdmin.from("ar_ai_access_state").upsert({ scope: "recognition", status: error.status, reason: error.message, updated_at: new Date().toISOString() });
        if (saveError) console.error("AR pause persistence failed", saveError.code);
      }
      return { detection: null, error: error.message, status: error.status };
    }
    return { detection: null, error: "Risposta di riconoscimento non valida. Nessun nuovo risultato applicato." };
  }
  const KINDS: SoilKind[] = ["artificiale","argilloso","sabbioso","limoso","franco","ghiaioso","roccioso","prato","pacciamato"];
  const ps = p.soil;
  const survey = p.survey ? { ...p.survey, regions: p.survey.regions.filter(({ box }) => box.x >= 0 && box.y >= 0.48 && box.w > 0 && box.h > 0 && box.x + box.w <= 1.01 && box.y + box.h <= 1.01).slice(0, 8) } : null;
  const soil: Soil =
    ps && KINDS.includes(ps.kind)
      ? {
          kind: ps.kind,
          label: String(ps.label ?? ps.kind).slice(0, 50),
          permeability: ["bassa", "media", "alta"].includes(ps.permeability) ? ps.permeability : "media",
          plantable: ps.kind === "artificiale" ? false : Boolean(ps.plantable),
          note: String(ps.note ?? "").slice(0, 120),
        }
      : null;
  if (!p.found || !p.box)
    // Nothing found is a result, not an error: the camera names what the selected target missed.
    return { detection: null, soil, survey };
  const c = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));
  const num = (n: unknown, lo: number, hi: number, def: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  };
  // A plant the model still labelled "object" (a shrub, a potted plant) counts as a plant, not a missing one.
  const type: "tree" | "vine" | "object" =
    p.type === "vine" ? "vine" : p.type === "tree" || p.plant ? "tree" : "object";

  let species: NonNullable<Detection>["species"] = null;
  let cooling: NonNullable<Detection>["cooling"] = null;
  const pl = p.plant;
  // A plant the model labelled "object" (a shrub, a potted plant) is still a plant for the estimate.
  if (pl && canEstimateRecognizedPlant({ ...p, type: type === "object" ? "tree" : type }) && pl.scientificName.trim()) {
    // The first name the catalogues confirm wins: the model's pick, then its look-alikes in order, so a
    // misspelt or unlisted first guess no longer leaves the scan without a species.
    const candidates = [{ scientificName: pl.scientificName, commonName: pl.commonName }, ...(pl.alternatives ?? []).slice(0, 2)]
      .map((c) => ({ sci: c.scientificName.trim().replace(/\s+/g, " ").slice(0, 80), common: c.commonName }))
      .filter((c, i, all) => c.sci.length > 1 && all.findIndex((o) => sameBotanicalName(o.sci, c.sci)) === i);
    let g: Awaited<ReturnType<typeof gbif>> = null, col: Awaited<ReturnType<typeof catalogueOfLife>> = null, sci = candidates[0]?.sci ?? "", common = pl.commonName;
    for (const c of candidates) {
      const [gbifMatch, colMatch] = await Promise.all([gbif(c.sci), catalogueOfLife(c.sci)]);
      g = colMatch && gbifMatch && !sameBotanicalName(colMatch.name, gbifMatch.name) ? null : gbifMatch;
      col = colMatch;
      if (g || col) { sci = c.sci; common = c.common; break; }
    }
    if (!g && !col) return { soil, survey, detection: {label:p.label, type, box:p.box, outline:null, identification:p.identification, species:null, cooling:null} };
    const form: GrowthForm = FORMS.includes(pl.form) ? pl.form : type === "vine" ? "vine" : "round";
    const crownM = num(pl.crownM, 0.3, 30, 4);
    const density = num(pl.density, 0, 1, 0.6);
    const evergreen = Boolean(pl.evergreen);
    const scientificName = col?.name ?? g?.name ?? sci;
    species = {
      commonName: String(common || p.label || sci).slice(0, 40),
      scientificName,
      family: col?.family ?? g?.family ?? null,
      gbifKey: g?.key ?? null,
      gbifUrl: g ? `https://www.gbif.org/species/${g.key}` : null,
      colUrl: col ? `https://www.catalogueoflife.org/data/taxon/${encodeURIComponent(col.id)}` : null,
      photo: null,
      form,
      heightM: num(pl.heightM, 0.3, 60, 6),
      crownM,
      evergreen,
      density,
    };
    const est = estimateCooling(crownM, density, evergreen);
    cooling = {
      ...est,
      note: "Stima indicativa da chioma e densità fogliare della specie",
    };
  }
  return {
    soil,
    survey,
    detection: {
      label: String(p.label ?? "Oggetto").slice(0, 40),
      type,
      box: { x: c(p.box.x), y: c(p.box.y), w: c(p.box.w), h: c(p.box.h) },
      identification: p.identification,
      outline: p.outline && plantPhotoBounds(p.outline) ? p.outline : null,
      species,
      cooling,
    },
  };
}
