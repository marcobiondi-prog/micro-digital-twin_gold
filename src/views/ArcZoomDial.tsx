import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  // Durante il trascinamento la ghiera segue il dito senza animazione; ai tocchi (preset) ruota morbida.
  const [isDragging, setIsDragging] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
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

  // Zona di tocco: una fascia dai numeri fino a poco oltre il bordo esterno della ghiera, così il pollice la prende
  // anche appoggiato sui numeri.
  const TOUCH_R = 166;
  const TOUCH_W = 96;

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

  const xBo = cx - Ro * Math.cos(radB);
  const yBo = cy + Ro * Math.sin(radB);
  const xBm = cx - Rm * Math.cos(radB);
  const yBm = cy + Rm * Math.sin(radB);

  // Path SVG Cerchio 1: ghiera esterna piena (non trasparente) con estremità arrotondate.
  const ghieraPath = `M ${xTo.toFixed(1)} ${yTo.toFixed(1)} A ${Ro} ${Ro} 0 0 0 ${xBo.toFixed(1)} ${yBo.toFixed(1)} A ${capR1.toFixed(1)} ${capR1.toFixed(1)} 0 0 0 ${xBm.toFixed(1)} ${yBm.toFixed(1)} A ${Rm} ${Rm} 0 0 1 ${xTm.toFixed(1)} ${yTm.toFixed(1)} A ${capR1.toFixed(1)} ${capR1.toFixed(1)} 0 0 0 ${xTo.toFixed(1)} ${yTo.toFixed(1)} Z`;

  // Mappatura angolare continua: STEP gradi tra uno stop e l'altro (1x a -STEP, 2x all'apice 0°, 3x a +STEP),
  // stretta come nel mockup così all'apice restano visibili anche gli stop vicini.
  const STEP = 26;
  const STOP_VALUES = [0.5, 1, 2, 3, 5];
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
    // Piccoli "scatti" sugli stop (circa 2,5° di ghiera): fermarsi esattamente su 1x, 2x... è facile.
    if (Math.abs(clamped - 0.5) < 0.05) return 0.5;
    if (Math.abs(clamped - 1) < 0.1) return 1;
    if (Math.abs(clamped - 2) < 0.1) return 2;
    if (Math.abs(clamped - 3) < 0.1) return 3;
    if (Math.abs(clamped - 5) < 0.2) return 5;
    return Math.round(clamped * 10) / 10;
  };

  // Rotazione per portare il valore corrente all'apice (0°). I punti sono a (cx - R·cosθ, cy + R·sinθ):
  // rotate(φ) in SVG li porta all'angolo θ − φ, quindi φ = angolo dello zoom corrente.
  const dialRotation = angleForZoom(zoom);

  /** Centro della ghiera e raggio delle tacche sullo schermo (la ghiera è scalata con DIAL_SCALE). */
  const screenGeometry = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const sx = rect.width / W;
    const sy = rect.height / H;
    return { x: rect.left + cx * sx, y: rect.top + cy * sy, r: R * sx };
  };
  /** Angolo del dito sulla ghiera: 0° all'apice (orizzontale a sinistra del centro), positivo verso il basso. */
  const pointerAngle = (e: ReactPointerEvent<Element>) => {
    const g = screenGeometry();
    if (!g) return 0;
    return (Math.atan2(e.clientY - g.y, -(e.clientX - g.x)) * 180) / Math.PI;
  };

  const onPointerDown = (e: ReactPointerEvent<Element>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    dragMoved.current = false;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    dragDialAngle.current = angleForZoom(zoom);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<Element>) => {
    if (!dragging.current || !lastPoint.current) return;
    const g = screenGeometry();
    if (!g) return;
    const mx = e.clientX - lastPoint.current.x;
    const my = e.clientY - lastPoint.current.y;
    // Piccolo margine prima di iniziare: un tocco un po' mosso resta un tocco.
    if (!dragMoved.current && Math.hypot(e.clientX - (lastPoint.current.x), e.clientY - lastPoint.current.y) < 4) return;
    if (!dragMoved.current) { dragMoved.current = true; setIsDragging(true); }
    lastPoint.current = { x: e.clientX, y: e.clientY };

    // Sensibilità costante: conta solo lo spostamento lungo la ghiera (componente tangente) diviso per il raggio
    // delle tacche, così 1 px di dito = 1 px di ghiera ovunque si appoggi il pollice. Con l'angolo dal centro,
    // un dito vicino allo shutter faceva saltare lo zoom e uno lontano lo muoveva appena.
    const th = (pointerAngle(e) * Math.PI) / 180;
    const along = mx * Math.sin(th) + my * Math.cos(th);
    const deltaDeg = ((along / g.r) * 180) / Math.PI;

    // L'angolo si accumula in un ref: ricalcolarlo dallo zoom arrotondato riporterebbe ogni piccolo passo sullo
    // stop più vicino e la ghiera resterebbe incollata lì.
    dragDialAngle.current = Math.min(
      angleForZoom(max),
      Math.max(angleForZoom(ZOOM_MIN), dragDialAngle.current - deltaDeg),
    );
    const nextZoom = zoomForAngle(dragDialAngle.current);
    if (nextZoom === zoom) return;

    // Scatto aptico leggero a ogni decimo (era il doppio impulso pieno: trascinando diventava un ronzio);
    // quello pieno solo quando si arriva su uno stop (0.5x, 1x, 2x, 3x, 5x).
    if (Math.abs(nextZoom - lastHapticZoom.current) >= 0.1) {
      lastHapticZoom.current = nextZoom;
      hapticTick(STOP_VALUES.includes(nextZoom) ? undefined : 8);
    }
    onZoom(nextZoom);
  };

  const onPointerUp = (e: ReactPointerEvent<Element>) => {
    const wasDrag = dragMoved.current;
    dragging.current = false;
    lastPoint.current = null;
    setIsDragging(false);
    // Tocco sulla ghiera (non sulla pillola) senza trascinare: va allo stop toccato, se il dito è vicino a uno.
    if (!wasDrag && e.type === "pointerup" && e.currentTarget instanceof SVGElement && !disabled) {
      const target = dragDialAngle.current + pointerAngle(e);
      const near = STOP_VALUES.map((v) => ({ v, d: Math.abs(angleForZoom(v) - target) }))
        .filter((s) => s.v <= max)
        .sort((p, q) => p.d - q.d)[0];
      if (near && near.d < STEP * 0.4 && near.v !== zoom) {
        lastHapticZoom.current = near.v;
        hapticTick();
        onZoom(near.v);
      }
    }
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
      // Le etichette lunghe (0.5x) si spostano un po' verso lo shutter, così non coprono il loro pallino.
      textX: cx - (R_text - (s.label.length - 2) * 4) * cos,
      textY: cy + (R_text - (s.label.length - 2) * 4) * sin,
      xIn: cx - (R - 7) * cos,
      yIn: cy + (R - 7) * sin,
      xOut: cx - (R + 7) * cos,
      yOut: cy + (R + 7) * sin,
    };
  });

  // Tacche graduate: girano con i numeri (come una ghiera vera), una ogni ottavo di STEP, così ogni stop ha la
  // sua tacca lunga ciano proprio accanto al suo pallino. Generate su tutta la corsa; si disegnano solo quelle
  // che in quel momento cadono dentro il nastro della ghiera.
  const TICK = STEP / 8;
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isStop: boolean; isHalf: boolean }> = [];
  for (let i = -48; i <= 48; i++) {
    const d = i * TICK;
    const isStop = i % 8 === 0 && Math.abs(i) <= 16;
    const isHalf = !isStop && Math.abs(i % 4) === 0;
    const tlen = isStop ? 7.0 : isHalf ? 4.5 : 3.0;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isStop,
      isHalf,
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
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
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
  // La maschera va solo sull'SVG: sul vetro o su un suo antenato spegnerebbe il backdrop-filter.
  const endFade = "linear-gradient(to bottom, transparent 3%, #000 24%, #000 76%, transparent 97%)";
  const fadeStyle = { WebkitMaskImage: endFade, maskImage: endFade };
  // Rotazione come stile CSS (non attributo SVG), così si anima: segue il dito senza ritardo mentre si trascina,
  // e gira morbida quando lo zoom cambia da un tocco (pillola, stop toccato, pizzico).
  const spin = (deg: number, ox: number, oy: number) => ({
    transform: `rotate(${deg}deg)`,
    transformOrigin: `${ox}px ${oy}px`,
    transformBox: "view-box" as const,
    transition: isDragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
  });

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
        viewBox={`0 0 ${W} ${H}`}
        className="relative w-full h-full overflow-visible pointer-events-none select-none"
        style={fadeStyle}
        aria-hidden="true"
      >
        <defs>
          {/* Ghiera esterna piena, non trasparente: grigio-blu scuro con una leggera sfumatura */}
          <linearGradient id="outerGhieraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a5262" />
            <stop offset="100%" stopColor="#3b4250" />
          </linearGradient>

          {/* Bagliore ciano vibrante per la tacca indice dello zenit e fermi */}
          {/* Regione in coordinate della ghiera, non della tacca: una tacca orizzontale ha altezza 0 e con le
              percentuali il filtro la faceva sparire. */}
          <filter id="cyanGlow" filterUnits="userSpaceOnUse" x={-40} y={-40} width={W + 80} height={H + 80}>
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
        <path d={ghieraPath} fill="url(#outerGhieraGrad)" stroke="none" />
        {/* Filo di luce sui due bordi della ghiera: le dà spessore senza appesantirla. */}
        <path
          d={`M ${xTo.toFixed(1)} ${yTo.toFixed(1)} A ${Ro} ${Ro} 0 0 0 ${xBo.toFixed(1)} ${yBo.toFixed(1)}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="1"
        />
        <path
          d={`M ${xTm.toFixed(1)} ${yTm.toFixed(1)} A ${Rm} ${Rm} 0 0 0 ${xBm.toFixed(1)} ${yBm.toFixed(1)}`}
          fill="none"
          stroke="rgba(0, 0, 0, 0.35)"
          strokeWidth="1"
        />

        {/* 
          LINEE FISSE DENTRO IL CERCHIO ESTERNO:
          Le tacche graduate fisse della ghiera con contrasto e carattere
        */}
        <g style={spin(dialRotation, cx, cy)}>
          {ticks.map((t) => {
            // Posizione sullo schermo: fuori dal nastro non si disegna; ai due capi sfuma con la maschera.
            const screenDeg = t.deg - dialRotation;
            if (screenDeg < -degTop + 3 || screenDeg > degBot - 3) return null;
            return (
              <line
                key={t.deg}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.isStop ? "#00e5ff" : t.isHalf ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.55)"}
                strokeWidth={t.isStop ? 2.8 : t.isHalf ? 1.8 : 1.2}
                strokeLinecap="round"
                filter={t.isStop ? "url(#cyanGlow)" : undefined}
              />
            );
          })}
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
        <g style={spin(dialRotation, cx, cy)} filter="url(#numShadow)">
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
                  r={Math.abs(s.zoomVal - zoom) < 0.05 ? 4.2 : 3.2}
                  fill={Math.abs(s.zoomVal - zoom) < 0.05 ? "#00e5ff" : "#ffffff"}
                />
                <text
                  x={s.textX}
                  y={s.textY}
                  style={spin(-dialRotation, s.textX, s.textY)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={Math.abs(s.zoomVal - zoom) < 0.05 ? "#00e5ff" : "#ffffff"}
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
          d={`M ${cx - TOUCH_R * Math.cos(radT)} ${cy - TOUCH_R * Math.sin(radT)} A ${TOUCH_R} ${TOUCH_R} 0 0 0 ${cx - TOUCH_R * Math.cos(radB)} ${cy + TOUCH_R * Math.sin(radB)}`}
          fill="none"
          stroke="transparent"
          strokeWidth={TOUCH_W}
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
