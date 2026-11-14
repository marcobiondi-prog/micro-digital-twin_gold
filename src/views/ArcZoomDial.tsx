import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Ghiera zoom landscape (Camera Jog Dial / Goniometro) - Architettura a 2 cerchi concentrici:
 * 1. CERCHIO 1 (Ghiera esterna): nastro curvo regolare con le linee graduate all'interno.
 * 2. CERCHIO 2 (Vetro satinato trasparente interno): semicerchio satinato trasparente
 *    attorno allo shutter con i numeri (0.5x, 1x, 2x, 3x, 5x) e i pallini bianchi al suo interno.
 *    È QUESTO cerchio satinato trasparente che ruota al variare dello zoom.
 * - L'INTERO BLOCCO è a filo del bordo destro dello schermo.
 * - Pillola fissa all'apice (0° orizzontale) a filo con [ Singolo | Multiplo ] con valore zoom live e mirino ciano.
 * - Rotazione fluida 1:1 al trascinamento del pollice e feedback aptico.
 */
/**
 * Aggiunta in basso alla ghiera: il bordo esterno lascia il cerchio tangente a TAIL_START_DEG e scende con una
 * curva (Bézier cubica, sempre tangente: nessuno spigolo né ammaccatura) più piegata all'inizio e quasi dritta
 * in fondo, fino a TAIL_END, il punto in fondo alla linea disegnata dall'utente, poco sotto il bordo dello schermo.
 * TAIL_PULL_START corto = più curva all'inizio; TAIL_END_DIR e TAIL_PULL_END danno la direzione d'arrivo.
 */
const TAIL_START_DEG = 6;
const TAIL_END: readonly [number, number] = [68, 386.4];
const TAIL_PULL_START = 55;
const TAIL_END_DIR: readonly [number, number] = [0, 1];
const TAIL_PULL_END = 90;
/** Spazio in più sotto il viewBox, così l'aggiunta si chiude fuori dallo schermo senza essere tagliata dal riquadro. */
const SVG_EXTRA_BOTTOM = 110;

export function ArcZoomDial({
  zoom,
  max = ZOOM_MAX,
  onZoom,
  disabled = false,
  className = "",
}: {
  zoom: number;
  max?: number;
  onZoom: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastAngle = useRef(0);
  const lastHapticZoom = useRef(zoom);
  // Un trascinamento partito dalla pillola non deve anche cambiare preset al rilascio.
  const dragMoved = useRef(false);
  const dragDialAngle = useRef(0);

  // Dimensioni calibrate: blocco a filo del bordo destro (W=280, H=380)
  const W = 280;
  const H = 380;
  const cx = 240;
  const cy = 190;

  // Cerchio 1 (Ghiera esterna resa leggermente più compatta e spostata più avanti):
  const Ro = 194.0; // Raggio esterno ghiera (leggermente più piccola)
  const Rm = 168.0; // Raggio interno ghiera (spostato più avanti per distaccarsi dai numeri)
  const R = 181.0; // Raggio linea centrale delle tacche graduate (nastro da 26px)

  // Cerchio 2 (Vetro satinato trasparente con i numeri dentro):
  // Raggi calibrati con 22px di distacco dal primo cerchio per non toccarsi mai
  const R_dot = 146.0; // Raggio dei pallini bianchi dentro il vetro satinato
  const R_text = 128.0; // Raggio dei numeri dello zoom dentro il vetro satinato

  const degTop = 56.0;
  const degBot = 66.0;
  const radT = (degTop * Math.PI) / 180;
  const radB = (degBot * Math.PI) / 180;

  // Coordinate Cerchio 1 (Ghiera esterna)
  const xTo = cx - Ro * Math.cos(radT);
  const yTo = cy - Ro * Math.sin(radT);
  const xTm = cx - Rm * Math.cos(radT);
  const yTm = cy - Rm * Math.sin(radT);
  const capR1 = (Ro - Rm) / 2; // 16.5px

  // Path SVG Cerchio 1: ghiera esterna piena (non trasparente) fusa in un solo pezzo con un'aggiunta in basso.
  // In alto l'estremità arrotondata di sempre; il bordo esterno segue il cerchio fino a poco sotto l'apice, poi
  // una curva tangente, più piegata all'inizio (TAIL_START_DEG → TAIL_END), e si chiude sotto, fuori dallo schermo. Bordo interno, tacche e numeri restano sul cerchio.
  // Curva dell'aggiunta: parte in T, il punto del cerchio a TAIL_START_DEG.
  const radS = (TAIL_START_DEG * Math.PI) / 180;
  const xTs = cx - Ro * Math.cos(radS);
  const yTs = cy + Ro * Math.sin(radS);
  // Controlli della Bézier: il primo lungo la tangente al cerchio in T, il secondo prima di TAIL_END.
  const xC1 = xTs + Math.sin(radS) * TAIL_PULL_START, yC1 = yTs + Math.cos(radS) * TAIL_PULL_START;
  const xC2 = TAIL_END[0] - TAIL_END_DIR[0] * TAIL_PULL_END, yC2 = TAIL_END[1] - TAIL_END_DIR[1] * TAIL_PULL_END;
  const innerEndDeg = 70;
  const xIe = cx - Rm * Math.cos((innerEndDeg * Math.PI) / 180);
  const yIe = cy + Rm * Math.sin((innerEndDeg * Math.PI) / 180);
  const ghieraPath = [
    `M ${xTo.toFixed(1)} ${yTo.toFixed(1)}`,
    `A ${Ro} ${Ro} 0 0 0 ${xTs.toFixed(1)} ${yTs.toFixed(1)}`,
    `C ${xC1.toFixed(1)} ${yC1.toFixed(1)} ${xC2.toFixed(1)} ${yC2.toFixed(1)} ${TAIL_END[0]} ${TAIL_END[1]}`,
    `L ${TAIL_END[0]} ${H + 80}`,
    `L ${(xIe + 30).toFixed(1)} ${H + 80}`,
    `L ${xIe.toFixed(1)} ${yIe.toFixed(1)}`,
    `A ${Rm} ${Rm} 0 0 1 ${xTm.toFixed(1)} ${yTm.toFixed(1)}`,
    `A ${capR1.toFixed(1)} ${capR1.toFixed(1)} 0 0 0 ${xTo.toFixed(1)} ${yTo.toFixed(1)} Z`,
  ].join(" ");

  // Mappatura angolare continua: STEP gradi tra uno stop e l'altro (1x a -STEP, 2x all'apice 0°, 3x a +STEP),
  // stretta come nel mockup così all'apice restano visibili anche gli stop vicini.
  const STEP = 26;
  const angleForZoom = (z: number) => {
    if (z <= 1) return -2 * STEP + ((z - 0.5) / 0.5) * STEP;
    if (z <= 2) return -STEP + (z - 1) * STEP;
    if (z <= 3) return (z - 2) * STEP;
    return STEP + ((Math.min(max, z) - 3) / 2) * STEP;
  };

  const zoomForAngle = (deg: number) => {
    let z: number;
    if (deg <= -STEP) z = 0.5 + ((deg + 2 * STEP) / STEP) * 0.5;
    else if (deg <= 0) z = 1 + (deg + STEP) / STEP;
    else if (deg <= STEP) z = 2 + deg / STEP;
    else z = 3 + ((deg - STEP) / STEP) * 2;
    const clamped = Math.min(max, Math.max(ZOOM_MIN, z));
    if (Math.abs(clamped - 0.5) < 0.06) return 0.5;
    if (Math.abs(clamped - 1) < 0.06) return 1;
    if (Math.abs(clamped - 2) < 0.08) return 2;
    if (Math.abs(clamped - 3) < 0.08) return 3;
    if (Math.abs(clamped - 5) < 0.1) return 5;
    return Math.round(clamped * 10) / 10;
  };

  // Rotazione per portare il valore corrente all'apice (0°). I punti sono a (cx - R·cosθ, cy + R·sinθ):
  // rotate(φ) in SVG li porta all'angolo θ − φ, quindi φ = angolo dello zoom corrente.
  const dialRotation = angleForZoom(zoom);

  const getPointerAngle = (e: ReactPointerEvent<Element>) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / (H + SVG_EXTRA_BOTTOM);
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;
    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;
    const rad = Math.atan2(dy, -dx); // 0° è orizzontale a sinistra (apice)
    return (rad * 180) / Math.PI;
  };

  const onPointerDown = (e: ReactPointerEvent<Element>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    dragMoved.current = false;
    lastAngle.current = getPointerAngle(e);
    dragDialAngle.current = angleForZoom(zoom);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<Element>) => {
    if (!dragging.current) return;
    const currentPtrAngle = getPointerAngle(e);
    const deltaAngle = currentPtrAngle - lastAngle.current;
    if (Math.abs(deltaAngle) > 0.5) dragMoved.current = true;
    lastAngle.current = currentPtrAngle;

    // The angle accumulates in a ref: recomputing it from the snapped zoom would pull every small
    // finger step back onto the nearest stop, and the dial would stick there.
    dragDialAngle.current = Math.min(angleForZoom(max), Math.max(angleForZoom(ZOOM_MIN), dragDialAngle.current - deltaAngle));
    const nextZoom = zoomForAngle(dragDialAngle.current);

    if (Math.abs(nextZoom - lastHapticZoom.current) >= 0.1) {
      lastHapticZoom.current = nextZoom;
      hapticTick();
    }
    onZoom(nextZoom);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  // Stop principali (0.5x, 1x, 2x, 3x, 5x): numeri e pallini posizionati dentro il Cerchio 2
  const stops = [
    { label: "0.5x", zoomVal: 0.5 },
    { label: "1x", zoomVal: 1 },
    { label: "2x", zoomVal: 2 },
    { label: "3x", zoomVal: 3 },
    { label: "5x", zoomVal: 5 },
  ].map((s) => {
    const deg = angleForZoom(s.zoomVal);
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      ...s,
      deg,
      dotX: cx - R_dot * cos,
      dotY: cy + R_dot * sin,
      textX: cx - R_text * cos,
      textY: cy + R_text * sin,
      xIn: cx - (R - 7) * cos,
      yIn: cy + (R - 7) * sin,
      xOut: cx - (R + 7) * cos,
      yOut: cy + (R + 7) * sin,
    };
  });

  // Tacche graduate secondarie dentro il Cerchio 1 (ghiera) ogni 4.875°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean; isStop?: boolean }> = [];
  for (let i = -16; i <= 16; i++) {
    const d = i * 4.875;
    // Solo dentro il nastro della ghiera: niente tacche oltre le sue estremità.
    if (d < -degTop + 3 || d > degBot - 3) continue;
    const isStop = stops.some((s) => Math.abs(s.deg - d) < 2.0);
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(i % 4) === 0 || isStop;
    const tlen = isStop ? 7.0 : isCyan ? 4.5 : 3.0;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
      isStop,
    });
  }

  // Pillola dello zenit: dal bordo sinistro fino a poco prima del numero all'apice del secondo cerchio
  // (il numero è centrato a cx - R_text; 14 px lasciano spazio a metà etichetta più un piccolo stacco).
  const pillH = 30;
  const pillLeft = 12;
  const pillRight = cx - R_text - 14;
  const zoomText = zoom % 1 === 0 ? String(zoom) : zoom.toFixed(1);

  // Tocco sulla pillola fissa: passa ai preset rapidi (0.5x, 1x, 2x, 3x, 5x)
  const handlePillClick = () => {
    if (dragMoved.current) { dragMoved.current = false; return; }
    if (zoom < 1) onZoom(1);
    else if (zoom < 2) onZoom(2);
    else if (zoom < 3) onZoom(3);
    else if (zoom < 5) onZoom(5);
    else onZoom(0.5);
    hapticTick();
  };

  // Ghiera ingrandita attorno al centro dello shutter (cx, cy): lo shutter resta al centro dei cerchi e la ghiera
  // può passare un po' sotto i tasti in alto. I due capi del nastro sfumano (maschera verticale) invece di vedersi
  // tagliati dal bordo dello schermo.
  const DIAL_SCALE = 1.18;
  // Margine sopra e sotto il riquadro del vetro, così il disco (più alto della ghiera) non viene tagliato in orizzontale.
  const GLASS_PAD = 40;
  const GLASS_EDGE = 12;
  // La maschera va solo sull'SVG: sul vetro o su un suo antenato spegnerebbe il backdrop-filter. Sfuma solo il
  // capo in alto (sotto i tasti); in basso la ghiera esce dallo schermo e non serve sfumarla.
  const endFade = `linear-gradient(to bottom, transparent ${(0.03 * H).toFixed(1)}px, #000 ${(0.24 * H).toFixed(1)}px)`;
  const fadeStyle = { WebkitMaskImage: endFade, maskImage: endFade };

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 ${className}`}
      style={{ width: `${W}px`, height: `${H}px` }}
      data-camera-controls
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: `${W}px`,
          height: `${H}px`,
          transform: `scale(${DIAL_SCALE})`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
      >
      {/*
        Cerchio interno di vetro: un disco intero di raggio Ro attorno allo shutter che sfoca lo sfondo fino al bordo
        esterno della ghiera. Prima era una forma a D ritagliata con clip-path, ma il backdrop-filter non ne
        rispettava il ritaglio e sfocava tutto il rettangolo: si vedevano tagli dritti in alto e a sinistra.
        Il border-radius invece lo rispetta sempre.
      */}
      {/*
        Il disco va un po' oltre il bordo destro dello schermo (GLASS_EDGE), così tra il vetro e il bordo non resta mai
        una striscia di fotocamera non sfocata.
      */}
      <div
        className="absolute overflow-hidden pointer-events-none"
        aria-hidden="true"
        style={{ left: 0, top: `${-GLASS_PAD}px`, width: `${W + GLASS_EDGE}px`, height: `${H + 2 * GLASS_PAD}px` }}
      >
        <div
          className="ar-dial-glass"
          style={{ left: `${cx - Ro}px`, top: `${cy - Ro + GLASS_PAD}px`, width: `${2 * Ro}px`, height: `${2 * Ro}px` }}
        />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + SVG_EXTRA_BOTTOM}`}
        className="relative w-full overflow-visible pointer-events-none select-none"
        style={{ ...fadeStyle, height: `${H + SVG_EXTRA_BOTTOM}px` }}
        aria-hidden="true"
      >
        <defs>
          {/* Ghiera esterna piena, non trasparente: grigio-blu scuro con una leggera sfumatura */}
          <linearGradient id="outerGhieraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a5262" />
            <stop offset="100%" stopColor="#3b4250" />
          </linearGradient>

          {/* Bagliore ciano vibrante per la tacca indice dello zenit e fermi */}
          <filter id="cyanGlow" x="-30%" y="-70%" width="160%" height="240%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00e5ff" floodOpacity="0.85" />
          </filter>

          {/* Ombra per far risaltare perfettamente i numeri sopra al vetro */}
          <filter id="numShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.9" />
          </filter>
          <filter id="pillShadow" x="-25%" y="-60%" width="150%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/*
          CERCHIO ESTERNO (ghiera): chiaro e semitrasparente, senza bordo né ombra, così si fonde con il
          cerchio interno di vetro sfocato disegnato sotto (livello HTML .ar-dial-glass).
        */}
        <path
          d={ghieraPath}
          fill="url(#outerGhieraGrad)"
          stroke="none"
        />

        {/* 
          LINEE FISSE DENTRO IL CERCHIO ESTERNO:
          Le tacche graduate fisse della ghiera con contrasto e carattere
        */}
        <g>
          {ticks.map((t, idx) => (
            <line
              key={idx}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isCyan ? "#00e5ff" : "rgba(255, 255, 255, 0.85)"}
              strokeWidth={t.isStop ? "2.8" : t.isCyan ? "1.8" : "1.2"}
              strokeLinecap="round"
              filter={t.isCyan ? "url(#cyanGlow)" : undefined}
            />
          ))}
        </g>

        {/*
          PILLOLA DELLO ZENIT: dal bordo sinistro attraversa la ghiera fino al numero del secondo cerchio
          all'apice. Disegnata sotto pallini e numeri, così restano visibili sopra la pillola.
        */}
        <rect
          x={pillLeft}
          y={cy - pillH / 2}
          width={pillRight - pillLeft}
          height={pillH}
          rx={pillH / 2}
          fill="rgba(32, 38, 48, 0.85)"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1"
          filter="url(#pillShadow)"
        />
        <text
          x={pillLeft + 22}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="13.5"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {zoomText}x
        </text>

        {/*
          3. LIVELLO DEI NUMERI SOPRA AL CERCHIO INTERNO:
          Portati sopra al vetro satinato, nitidi e privi di clipping.
          I numeri e i pallini ruotano fluidamente con lo zoom.
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
          filter="url(#numShadow)"
        >
          {stops.map((s) => {
            const screenAngle = Math.abs(s.deg - dialRotation);
            // Dissolvenza morbida: i numeri sono pienamente visibili nell'arco utile,
            // e sfumano a 0 se ruotano troppo in alto o in basso verso Scansiona/Strumenti
            const opacity = screenAngle <= 30 ? 1 : Math.max(0, 1 - (screenAngle - 30) / 8);
            if (opacity <= 0.02) return null;
            return (
              <g key={s.label} opacity={opacity}>
                <circle
                  cx={s.dotX}
                  cy={s.dotY}
                  r={3.5}
                  fill="#ffffff"
                />
                <text
                  x={s.textX}
                  y={s.textY}
                  transform={`rotate(${-dialRotation}, ${s.textX}, ${s.textY})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  stroke="rgba(10, 15, 25, 0.85)"
                  strokeWidth="1.2"
                  paintOrder="stroke fill"
                  fontSize="14.5"
                  fontWeight="700"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  className="pointer-events-none select-none"
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva ampia per swipe fluido con il pollice
        */}
        <path
          d={`M ${cx - Ro * Math.cos(radT)} ${cy - Ro * Math.sin(radT)} A ${Ro} ${Ro} 0 0 0 ${cx - Ro * Math.cos(radB)} ${cy + Ro * Math.sin(radB)}`}
          fill="none"
          stroke="transparent"
          strokeWidth="68"
          strokeLinecap="round"
          className="cursor-ns-resize pointer-events-auto touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </svg>

      {/*
        Area di tocco della pillola dello zenit (disegnata nell'SVG): toccandola passa ai preset rapidi
        (0.5x, 1x, 2x, 3x, 5x).
      */}
      <button
        type="button"
        onClick={handlePillClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute pointer-events-auto touch-none rounded-full bg-transparent active:bg-white/10"
        style={{
          left: `${pillLeft}px`,
          top: `${cy - pillH / 2}px`,
          height: `${pillH}px`,
          width: `${pillRight - pillLeft}px`,
        }}
        aria-label={`Zoom corrente: ${zoomText}x. Tocca per cambiare preset.`}
      />
      </div>
    </div>
  );
}
