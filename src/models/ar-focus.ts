export type ArKind = "urban" | "vineyard";
export type ArFocus = "auto" | "tree" | "ground" | "leaf" | "canopy" | "interrow";

/** One scan phase as shown to the user: the viewfinder tag and the status line. */
type ScanPhaseText = { tag: string; status: string };
/** What a target must find in the frame; `missing` is shown when the scan stops without it; `phases` name its two scan steps. */
/** Result panel wording: title, heading when nothing is identified, idle hint and method note. */
type SummaryText = { title: string; empty: string; idle: string; note: string };
type FocusOption = { id: ArFocus; label: string; hint: string; prompt: string; seeks: "vegetation" | "ground" | "any"; missing: string; phases: readonly [ScanPhaseText, ScanPhaseText]; summary: SummaryText };

/** Each Lab tab opens its own AI camera: distinct targets, commands and analysis emphasis. */
export const AR_FOCUS: Record<ArKind, readonly FocusOption[]> = {
  urban: [
    // The piazza has no target selector: one scan, the AI tells a plant (species, crown, shade) from the paving
    // (permeability, depaving). "tree" and "ground" stay to name the records by what was found (AUTO_FOUND).
    { id: "auto", label: "Piante e suolo", hint: "Inquadra un albero o la pavimentazione: l’AI riconosce cosa c’è.",
      prompt: "Obiettivo urbano: riconosci da solo cosa è inquadrato. Se c’è una pianta (albero, arbusto, siepe, aiuola) privilegia chioma, tronco e specie: l’ombra serve al comfort dei pedoni. Se non c’è nessuna pianta, privilegia soil e survey della pavimentazione: asfalto, cemento, lastricato o terra; nella note indica se la depavimentazione (aiuola, pozzo drenante) è fattibile e l’accumulo di calore apparente.",
      seeks: "any", missing: "Né piante né pavimentazione riconosciute: inquadra un albero o la superficie a terra e riprova.",
      phases: [{ tag: "Inquadratura", status: "Riconosco cosa c’è: pianta o pavimentazione…" }, { tag: "Analisi", status: "Specie e ombra, oppure suolo e calore…" }],
      summary: { title: "Piante e suolo", empty: "Niente di riconosciuto", idle: "Inquadra un albero o la pavimentazione e avvia la scansione.", note: "Ombra da chioma tipica o permeabilità apparente dalla foto · temperatura non misurata" } },
    { id: "tree", label: "Alberi e ombra", hint: "Inquadra chioma e tronco: stima ombra e raffrescamento per i pedoni.",
      prompt: "Obiettivo urbano: alberatura stradale o di piazza. Privilegia chioma, tronco e specie arborea; l’ombra serve al comfort dei pedoni.",
      seeks: "vegetation", missing: "Nessun albero inquadrato: punta chioma o tronco e riprova.",
      phases: [{ tag: "Chioma e tronco", status: "Rilevamento di chioma e tronco…" }, { tag: "Verifica botanica", status: "Confronto botanico e stima dell’ombra…" }],
      summary: { title: "Alberi e ombra", empty: "Albero non identificato", idle: "Inquadra chioma o tronco e avvia la scansione.", note: "Simulazione da chioma tipica · massimo −3 °C · ombre sovrapponibili · temperatura non misurata" } },
    { id: "ground", label: "Suolo e depavimentazione", hint: "Inquadra la pavimentazione: permeabilità e possibilità di depavimentare.",
      prompt: "Obiettivo urbano: superficie e pavimentazione. Privilegia soil e survey: asfalto, cemento, lastricato o terra; nella note indica se la depavimentazione (aiuola, pozzo drenante) è fattibile e l’accumulo di calore apparente.",
      seeks: "ground", missing: "Nessuna pavimentazione o suolo riconosciuto: inquadra la superficie a terra e riprova.",
      phases: [{ tag: "Superficie", status: "Rilevamento della pavimentazione…" }, { tag: "Analisi del suolo", status: "Stima di permeabilità e calore…" }],
      summary: { title: "Suolo e calore", empty: "Suolo non classificato", idle: "Inquadra la pavimentazione e avvia la scansione.", note: "Permeabilità e calore apparenti dalla foto · verifica con sonda e prova del terreno · temperatura non misurata" } },
  ],
  vineyard: [
    { id: "leaf", label: "Foglia e varietà", hint: "Avvicinati a 20–30 cm da una foglia: forma, lobi e segni di stress.",
      prompt: "Obiettivo vitivinicolo: singola foglia da vicino. Privilegia l’ampelografia (lobi, seni, dentatura, nervature) e nell’evidence segnala segni visibili di stress termico, clorosi o scottature, senza diagnosi certe.",
      seeks: "vegetation", missing: "Nessuna foglia inquadrata: avvicinati a 20–30 cm da una foglia di vite e riprova.",
      phases: [{ tag: "Morfologia fogliare", status: "Rilevamento della morfologia fogliare…" }, { tag: "Verifica varietale", status: "Confronto ampelografico e segni di stress…" }],
      summary: { title: "Foglia e stress", empty: "Foglia non identificata", idle: "Avvicinati a 20–30 cm da una foglia e avvia la scansione.", note: "Varietà e stress indicativi dalla forma fogliare · nessuna diagnosi · temperatura non misurata" } },
    { id: "canopy", label: "Parete vegetativa", hint: "Inquadra il filare: densità della chioma e ombra sui grappoli.",
      prompt: "Obiettivo vitivinicolo: parete vegetativa del filare. Privilegia densità fogliare e ombreggiamento della fascia dei grappoli; density riflette la parete osservata in modo indicativo.",
      seeks: "vegetation", missing: "Nessuna parete vegetativa inquadrata: punta il filare e riprova.",
      phases: [{ tag: "Parete vegetativa", status: "Rilevamento della parete vegetativa…" }, { tag: "Densità fogliare", status: "Stima di densità e ombra sui grappoli…" }],
      summary: { title: "Parete e ombra", empty: "Parete non valutata", idle: "Inquadra il filare e avvia la scansione.", note: "Densità e ombra sui grappoli indicative · simulazione da parete tipica · temperatura non misurata" } },
    { id: "interrow", label: "Interfilare", hint: "Inquadra il suolo tra i filari: inerbimento, suolo nudo e compattamento.",
      prompt: "Obiettivo vitivinicolo: interfilare. Privilegia soil e survey: inerbimento, suolo nudo, pacciamatura, segni apparenti di compattamento ed evaporazione; consiglia la verifica con sonda.",
      seeks: "ground", missing: "Nessun interfilare riconosciuto: inquadra il suolo tra i filari e riprova.",
      phases: [{ tag: "Interfilare", status: "Rilevamento dell’interfilare…" }, { tag: "Analisi del suolo", status: "Stima di copertura e compattamento…" }],
      summary: { title: "Interfilare", empty: "Interfilare non classificato", idle: "Inquadra il suolo tra i filari e avvia la scansione.", note: "Copertura e compattamento apparenti dalla foto · verifica con sonda · temperatura non misurata" } },
  ],
};

/** The piazza's single scan names its record by what it found: a plant → "Alberi e ombra", else the paving. */
export function foundFocus(kind: ArKind, focus: ArFocus | undefined, plant: boolean): FocusOption {
  const option = arFocusOption(kind, focus);
  if (option.seeks !== "any") return option;
  return arFocusOption(kind, plant ? "tree" : "ground");
}
/** The targets shown in the selector (the piazza's automatic scan shows none). */
export function selectableFocus(kind: ArKind): readonly FocusOption[] {
  return AR_FOCUS[kind].some((o) => o.seeks === "any") ? [] : AR_FOCUS[kind];
}

export function defaultArFocus(kind: ArKind): ArFocus { return AR_FOCUS[kind][0]!.id; }

/** Rejects a target belonging to the other tab, falling back to that tab's default. */
export function arFocusOption(kind: ArKind, focus: ArFocus | undefined): FocusOption {
  return AR_FOCUS[kind].find(o => o.id === focus) ?? AR_FOCUS[kind][0]!;
}

/** Before calling the AI: a vegetation target stops at once only when nothing is locked AND the frame is unusable. */
export function scanPrecheck(kind: ArKind, focus: ArFocus | undefined, vegetationLocked: boolean, frameUsable = false): string | null {
  const option = arFocusOption(kind, focus);
  // The colour lock is only a hint: an unlocked but usable frame still goes to the AI (dark foliage, shade,
  // backlight or autumn leaves can miss the lock); only a black or flat frame stops before it.
  return option.seeks === "vegetation" && !vegetationLocked && !frameUsable ? option.missing : null;
}

/** After the AI: the result must contain what the target looks for (a plant, or the ground). */
export function scanMissing(kind: ArKind, focus: ArFocus | undefined, result: { plant: boolean; ground: boolean }): string | null {
  const option = arFocusOption(kind, focus);
  const ok = option.seeks === "any" ? result.plant || result.ground : option.seeks === "vegetation" ? result.plant : result.ground;
  return ok ? null : option.missing;
}
