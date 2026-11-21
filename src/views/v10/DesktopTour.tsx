import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** The desktop tutorial (≥ 1024 px): speech bubbles next to the things they explain, instead of the phone's tutorial page.
 *  - At the first access on a computer it starts by itself over a blurred page that cannot be clicked ("full").
 *  - The "i" button shows it again, simplified: no blur, a click outside closes it ("simple").
 *  - Hovering with the mouse over a control shows its own bubble (tips). */

type Step = { sel: string; title: string; text: string };

const DESK_QUERY = "(min-width: 1024px)";
const SEEN_KEY = "mdt-desk-tour-v1";
const OPEN_EVENT = "mdt-desk-tour";

export const isDesktopLayout = () => typeof window !== "undefined" && window.matchMedia(GUIDE_QUERY).matches;
/** The bubbles from the "i" button: computers and tablets held sideways. */
const GUIDE_QUERY = "(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 600px)";
export function openDesktopTour() { window.dispatchEvent(new CustomEvent(OPEN_EVENT)); }

const TOUR: Step[] = [
  { sel: 'aside nav[aria-label="Menu principale"]', title: "Il menu", text: "Da qui passi dalla cronologia alle simulazioni e alla dashboard. Il cerchio turchese segna la pagina aperta." },
  { sel: "[data-sim-tabs]", title: "Mappa e simulazione", text: "Su computer la mappa e la simulazione stanno affiancate. In «Sensori AI» trovi dove mettere le centraline." },
  { sel: 'form[role="search"]', title: "Trova il luogo", text: "Cerca la piazza o il vigneto, oppure accendi il GPS: la mappa si sposta lì." },
  { sel: '[role="group"][aria-label="Vista della mappa"]', title: "2D o 3D", text: "Guarda il luogo dall’alto o in rilievo, con gli interventi disegnati sopra." },
  { sel: '[role="group"][aria-label="Disegna l’area"]', title: "Disegna l’area", text: "Clicca sugli angoli per mettere i pin: la superficie serve per stimare costi e vincoli." },
  { sel: 'main [role="slider"]', title: "Scegli quanto rinfrescare", text: "Trascina il punto bianco sull’arco o clicca un livello: gli interventi si mettono da soli." },
  { sel: '[role="group"][aria-label="Modifica gli interventi"]', title: "Regola a mano", text: "Con − e + cambi alberi, aiuole, vele, nebulizzatori e innaffiatoi uno per uno." },
  { sel: '[aria-label="Persone nella piazza"]', title: "Persone nella piazza", text: "Una stima di quante persone ci sono nel luogo alla stagione e all’ora della simulazione, e quante stanno all’ombra degli interventi." },
  { sel: '[aria-label="Vincoli dell\'area"]', title: "Vincoli dell’area", text: "Beni tutelati, paesaggio e archeologia intorno all’area disegnata: ti dice quali interventi chiedono un’autorizzazione." },
  { sel: "#app-header", title: "Account e aiuto", text: "Qui accedi al tuo account, cambi tema e con «i» rivedi questa guida quando vuoi." },
];

/** The "i" guide (simplified, any page): only the points that are not obvious, those on the page open shown. */
const GUIDE: Step[] = [
  // Simulations: the map.
  { sel: '[role="group"][aria-label="Disegna l’area"]', title: "Prima disegna l’area", text: "Clicca sugli angoli per mettere i pin. Da lì partono la ricerca dei vincoli, la stima delle persone e i costi: senza area restano vuoti." },
  { sel: '[data-guide="proposal"]', title: "La proposta", text: "Gli interventi tratteggiati sono un suggerimento fatto in base ai vincoli trovati: non contano finché non premi «Metti»." },
  { sel: '[aria-label="Interventi possibili"]', title: "Cosa si può fare", text: "Ogni intervento con il suo stato: si può fare, serve un’autorizzazione o è sconsigliato. Clicca una riga per sapere perché." },
  { sel: '[data-guide="add-zone"]', title: "Zone dentro l’area", text: "Disegna dove vuoi alberi, aiuole, vele o una zona da lasciare libera. Un «Lotto» divide solo i costi, senza cambiare la disposizione." },
  { sel: '[data-guide="only-drawn"]', title: "Solo quello disegnato", text: "Mette gli interventi solo nelle zone che hai disegnato e regola le leve di conseguenza. Se poi muovi una leva torna la disposizione automatica." },
  { sel: '[data-guide="best-sun"]', title: "Posizione migliore", text: "Sposta vele, aiuole e alberi dove d’estate batte più sole, tenendo conto dei palazzi attorno." },
  { sel: '[data-guide="arrange"]', title: "Sposta elementi", text: "Trascina alberi, zone ed etichette sulla mappa. «Disposizione automatica» annulla gli spostamenti." },
  // Simulations: the reading.
  { sel: '[data-guide="feasibility"]', title: "Fattibilità", text: "I vincoli trovati intorno all’area, in breve. Clicca per leggere i dettagli più sotto." },
  { sel: 'main [role="slider"]', title: "L’arco", text: "Trascina il punto bianco o clicca uno dei tre livelli: le leve sotto si regolano da sole. A destra c’è la media della stagione senza interventi." },
  { sel: '[aria-label="Persone nella piazza"]', title: "Persone nella piazza", text: "Una stima, non un conteggio: dipende da cosa c’è intorno, dalla stagione e dall’ora scelte nella simulazione." },
  { sel: '[aria-label="Vincoli dell\'area"]', title: "Vincoli dell’area", text: "Indicativi: beni tutelati, paesaggio e archeologia intorno all’area. Solo il Comune e la Soprintendenza possono confermarli." },
  // Dashboard.
  { sel: '[role="radiogroup"][aria-label="Stagione"], [aria-label="Stagione"]', title: "La stagione", text: "La dashboard mostra la stagione e l’ora scelte nella simulazione: si cambiano lì, non qui." },
  { sel: '[aria-label="Nuova voce del registro"]', title: "Registro", text: "Annota gli interventi fatti davvero: restano nel registro con data e ora, separati dalla simulazione." },
  { sel: '[data-guide="export"]', title: "Esporta report", text: "Scegli i file (PDF, tabella, dati per la mappa, foto), poi a chi mandarli: email, condivisione o salvataggio." },
  { sel: '[aria-label="Avanzamento approvazione"]', title: "Approvazioni", text: "Manda la richiesta a ogni ente via email: la risposta arriva qui e fa avanzare la barra." },
  // History.
  { sel: '[aria-label="Uffici"]', title: "Uffici", text: "Vedi gli interventi del tuo ufficio, di tutti o di un altro ufficio del Comune." },
  { sel: '[aria-label="Raggruppa foto e video"]', title: "Per gruppo o per giorno", text: "Raggruppa le foto come nella simulazione (gruppi da 20) oppure per giorno di scatto." },
  { sel: '[data-guide="archive"]', title: "Archivio", text: "Le foto archiviate escono dalle pile ma non sono cancellate: da qui le ripristini, le salvi o le elimini per sempre." },
  { sel: '[data-guide="open-history"]', title: "Tutta la cronologia", text: "Qui vedi solo gli ultimi giorni: la cronologia completa ha filtri, archivio e cancellazione." },
];

/** Hover bubbles on the controls whose use is not obvious from their look. */
const TIPS: Step[] = [
  { sel: 'form[role="search"] button[aria-pressed]', title: "GPS", text: "Resta acceso e segue i tuoi spostamenti; se scegli un luogo a mano si mette in pausa." },
  { sel: 'main [role="slider"]', title: "L’arco", text: "Trascina il punto bianco: più a sinistra, più fresco." },
  { sel: '[data-guide="only-drawn"]', title: "Solo quello disegnato", text: "Interventi solo nelle tue zone; muovere una leva lo spegne." },
  { sel: '[data-guide="best-sun"]', title: "Posizione migliore", text: "Mette l’ombra dove d’estate batte più sole." },
  { sel: '[data-guide="arrange"]', title: "Sposta elementi", text: "Trascina alberi e zone sulla mappa." },
  { sel: '[data-guide="add-zone"]', title: "Aggiungi zona", text: "Alberi, aiuole, vele, zona libera o un lotto per dividere i costi." },
  { sel: '[aria-label="Raggruppa foto e video"]', title: "Raggruppa", text: "Per gruppo come nella simulazione, o per giorno." },
  { sel: '[data-guide="archive"]', title: "Archivio", text: "Archiviate, non cancellate: puoi ripristinarle." },
];

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0 && rectOf(el).w > 0;

/** Where the bubble goes: beside the target when there is room on the right, else below or above it. */
function placeBubble(r: Rect, bw: number, bh: number) {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 16;
  if (r.x + r.w + gap + bw < vw - 12 && r.w < vw * 0.45) {
    const top = Math.min(Math.max(12, r.y + r.h / 2 - bh / 2), vh - bh - 12);
    return { left: r.x + r.w + gap, top, side: "left" as const, arrow: Math.min(Math.max(18, r.y + r.h / 2 - top), bh - 18) };
  }
  const left = Math.min(Math.max(12, r.x + r.w / 2 - bw / 2), vw - bw - 12);
  const arrow = Math.min(Math.max(18, r.x + r.w / 2 - left), bw - 18);
  if (r.y + r.h + gap + bh < vh - 12) return { left, top: r.y + r.h + gap, side: "top" as const, arrow };
  return { left, top: Math.max(12, r.y - gap - bh), side: "bottom" as const, arrow };
}

function Bubble({ target, title, text, children, width = 320, onRef, passive }: { target: Rect; title: string; text: string; children?: React.ReactNode; width?: number; onRef?: (el: HTMLDivElement | null) => void; passive?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(140);
  useLayoutEffect(() => { if (ref.current) setH(ref.current.offsetHeight); });
  const p = placeBubble(target, width, h);
  const arrowStyle: React.CSSProperties = p.side === "left" ? { left: -7, top: p.arrow - 7 } : p.side === "top" ? { top: -7, left: p.arrow - 7 } : { bottom: -7, left: p.arrow - 7 };
  return (
    <div ref={(el) => { ref.current = el; onRef?.(el); }} role="dialog" aria-label={title}
      className={`desk-bubble ${passive ? "pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150" : "pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-200"} fixed z-[1000000032] rounded-2xl border border-white/15 bg-[oklch(0.25_0.02_255/0.97)] p-4 text-left text-white shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7)] motion-reduce:animate-none`}
      style={{ left: p.left, top: p.top, width }}>
      <span aria-hidden="true" className="absolute size-3.5 rotate-45 border-l border-t border-white/15 bg-[oklch(0.25_0.02_255)]"
        style={{ ...arrowStyle, transform: `rotate(${p.side === "left" ? -45 : p.side === "top" ? 45 : 225}deg)` }} />
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-snug text-white/75">{text}</p>
      {children}
    </div>
  );
}

export default function DesktopTour() {
  const [desk, setDesk] = useState(false);
  const [mode, setMode] = useState<null | "full" | "simple">(null);
  const [i, setI] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tip, setTip] = useState<{ step: Step; rect: Rect } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESK_QUERY);
    const sync = () => setDesk(mq.matches);
    sync(); mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const start = useCallback((m: "full" | "simple") => {
    const pick = (list: Step[]) => list.filter((s) => visible(document.querySelector(s.sel)));
    const found = m === "simple" ? (pick(GUIDE).length ? pick(GUIDE) : pick(TOUR)) : pick(TOUR);
    if (!found.length) return false;
    setTip(null); setSteps(found); setI(0); setMode(m);
    return true;
  }, []);
  const finish = useCallback(() => {
    setMode(null);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
  }, []);

  // The "i" button on a computer.
  useEffect(() => {
    const open = () => { if (isDesktopLayout()) start("simple"); };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [start]);

  // First access on a computer: once a simulation is on screen (no sector page, no preloader), it starts by itself.
  useEffect(() => {
    if (!desk) return;
    try { if (localStorage.getItem(SEEN_KEY) === "1") return; } catch { return; }
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      const pre = document.getElementById("mdt-preloader");
      const ready = /^\/(urbano|vigneto)/.test(location.pathname)
        && !document.querySelector('[aria-label="Scegli il settore"]')
        && (!pre || pre.classList.contains("out"))
        && !document.querySelector('[role="dialog"][data-state="open"]')
        && visible(document.querySelector('main [role="slider"]'));
      if (ready && n > 2) { if (start("full")) window.clearInterval(id); }
    }, 700);
    return () => window.clearInterval(id);
  }, [desk, start]);

  // Keep the spotlight on the step's target (scrolled into view first), following scroll and resize.
  const step = mode ? steps[i] : null;
  useEffect(() => {
    if (!step) { setRect(null); return; }
    const el = document.querySelector(step.sel);
    if (!visible(el)) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    let raf = 0;
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setRect(rectOf(el))); };
    measure();
    const t = window.setTimeout(measure, 450);
    window.addEventListener("scroll", measure, true); window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [step]);

  // While the full tour runs the page does not scroll by wheel or keys: only the bubble's buttons work.
  useEffect(() => {
    if (mode !== "full") return;
    const stop = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); setI((v) => Math.min(v + 1, steps.length - 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
      else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", " ", "Home", "End"].includes(e.key) && !(e.target as HTMLElement)?.closest?.(".desk-bubble")) e.preventDefault();
    };
    window.addEventListener("wheel", stop, { passive: false });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("wheel", stop); window.removeEventListener("keydown", key); };
  }, [mode, steps.length]);

  useEffect(() => {
    if (mode !== "simple") return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMode(null); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode]);

  // Hover bubbles: a short pause over a control shows what it does; leaving it hides the bubble.
  useEffect(() => {
    if (!desk || mode || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) { setTip(null); return; }
    let timer = 0, current: Element | null = null;
    const over = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest(".desk-bubble")) return;
      let hit: { step: Step; el: Element } | null = null;
      for (const s of TIPS) { const el = t.closest(s.sel); if (el) { hit = { step: s, el }; break; } }
      if (hit?.el === current) return;
      current = hit?.el ?? null;
      clearTimeout(timer); setTip(null);
      if (!hit) return;
      const h = hit;
      timer = window.setTimeout(() => { if (visible(h.el)) setTip({ step: h.step, rect: rectOf(h.el) }); }, 550);
    };
    const hide = () => { clearTimeout(timer); current = null; setTip(null); };
    document.addEventListener("mouseover", over);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("mousedown", hide, true);
    return () => { clearTimeout(timer); document.removeEventListener("mouseover", over); window.removeEventListener("scroll", hide, true); window.removeEventListener("mousedown", hide, true); };
  }, [desk, mode]);

  if (typeof document === "undefined") return null;
  if (tip && !mode) return createPortal(<Bubble passive target={tip.rect} title={tip.step.title} text={tip.step.text} width={260} />, document.body);
  if (!mode || !step || !rect) return null;

  const pad = 8, r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const last = i === steps.length - 1;
  const close = mode === "full" ? finish : () => setMode(null);
  const blur = "fixed z-[1000000030] bg-black/45 backdrop-blur-[6px]";
  return createPortal(
    <div aria-live="polite">
      {/* Four blurred panes round the target, and a clear one over it: nothing behind can be clicked.
          In the simplified guide (the "i" button) a tap on them closes it. */}
      {[
        { left: 0, top: 0, right: 0, height: Math.max(0, r.y) },
        { left: 0, top: r.y + r.h, right: 0, bottom: 0 },
        { left: 0, top: r.y, width: Math.max(0, r.x), height: r.h },
        { left: r.x + r.w, top: r.y, right: 0, height: r.h },
      ].map((st, k) => <div key={k} className={blur} style={st} onPointerDown={mode === "simple" ? () => setMode(null) : undefined} />)}
      <div className="fixed z-[1000000030]" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onPointerDown={mode === "simple" ? () => setMode(null) : undefined} />
      <div aria-hidden="true" className="desk-spot pointer-events-none fixed z-[1000000031] rounded-2xl ring-2 ring-[#2dd4bf] shadow-[0_0_0_4px_rgb(45_212_191/0.18),0_0_30px_rgb(45_212_191/0.35)] transition-[left,top,width,height] duration-300 motion-reduce:transition-none"
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      <Bubble target={r} title={step.title} text={step.text} key={i}>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs tabular-nums text-white/55">{i + 1} / {steps.length}</span>
          <button type="button" onClick={close} className="ml-auto rounded-full px-3 py-1.5 text-sm text-white/70 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white">{mode === "full" ? "Salta" : "Chiudi"}</button>
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">Indietro</button>}
          <button type="button" autoFocus onClick={() => (last ? close() : setI(i + 1))} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-[#2dd4bf]">{last ? "Fine" : "Avanti"}</button>
        </div>
        {mode === "simple" && <button type="button" onClick={close} aria-label="Chiudi la guida" className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>}
      </Bubble>
    </div>,
    document.body,
  );
}
