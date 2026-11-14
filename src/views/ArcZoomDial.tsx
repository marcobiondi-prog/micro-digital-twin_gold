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

  // Dimensioni calibrate: blocco a filo del bordo destro (W=280, H=380)
  const W = 280;
  const H = 380;
  const cx = 240;
  const cy = 190;

  // Cerchio 1 (Ghiera esterna resa leggermente più compatta e spostata più avanti):
  const Ro = 194.0; // Raggio esterno ghiera (leggermente più piccola)
  const Rm = 168.0; // Raggio interno ghiera (spostato più avanti per distaccarsi dai numeri)
  const R = 181.0; // Raggio linea centrale delle tacche graduate (nastro da 26px)

  // Cerchio Grande (indicato in rosso dall'utente):
  // Raggio ampio R_big = 206px attorno a (cx, cy) che abbraccia l'intero blocco comandi
  const R_big = 206.0;
  const radBig = (78.0 * Math.PI) / 180;
  const xT_big = cx - R_big * Math.cos(radBig);
  const yT_big = cy - R_big * Math.sin(radBig);
  const xB_big = xT_big;
  const yB_big = cy + R_big * Math.sin(radBig);
  const cerchioGrandePath = `M ${xT_big.toFixed(1)} ${yT_big.toFixed(1)} A ${R_big} ${R_big} 0 0 0 ${xB_big.toFixed(1)} ${yB_big.toFixed(1)} L ${W} ${yB_big.toFixed(1)} L ${W} ${yT_big.toFixed(1)} Z`;

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
  const xBo = cx - Ro * Math.cos(radB);
  const yBo = cy + Ro * Math.sin(radB);
  const xBm = cx - Rm * Math.cos(radB);
  const yBm = cy + Rm * Math.sin(radB);
  const xTm = cx - Rm * Math.cos(radT);
  const yTm = cy - Rm * Math.sin(radT);
  const capR1 = (Ro - Rm) / 2; // 16.5px

  // Path SVG Cerchio 1 (Ghiera esterna con estremità arrotondate)
  const ghieraPath = `M ${xTo.toFixed(1)} ${yTo.toFixed(1)} A ${Ro} ${Ro} 0 0 0 ${xBo.toFixed(1)} ${yBo.toFixed(1)} A ${capR1.toFixed(1)} ${capR1.toFixed(1)} 0 0 0 ${xBm.toFixed(1)} ${yBm.toFixed(1)} A ${Rm} ${Rm} 0 0 1 ${xTm.toFixed(1)} ${yTm.toFixed(1)} A ${capR1.toFixed(1)} ${capR1.toFixed(1)} 0 0 0 ${xTo.toFixed(1)} ${yTo.toFixed(1)} Z`;

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

  const getPointerAngle = (e: ReactPointerEvent<SVGElement>) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;
    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;
    const rad = Math.atan2(dy, -dx); // 0° è orizzontale a sinistra (apice)
    return (rad * 180) / Math.PI;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    lastAngle.current = getPointerAngle(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGElement>) => {
    if (!dragging.current) return;
    const currentPtrAngle = getPointerAngle(e);
    const deltaAngle = currentPtrAngle - lastAngle.current;
    lastAngle.current = currentPtrAngle;

    const currentDialAngle = angleForZoom(zoom);
    const newDialAngle = currentDialAngle - deltaAngle;
    const nextZoom = zoomForAngle(newDialAngle);

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
    if (d < -degTop - 25 || d > degBot + 25) continue;
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

  // Apice orizzontale della ghiera a sinistra: cx - R = 232 - 158 = 74px
  const apexX = cx - R;

  // Tocco sulla pillola fissa: passa ai preset rapidi (0.5x, 1x, 2x, 3x, 5x)
  const handlePillClick = () => {
    if (zoom < 1) onZoom(1);
    else if (zoom < 2) onZoom(2);
    else if (zoom < 3) onZoom(3);
    else if (zoom < 5) onZoom(5);
    else onZoom(0.5);
    hapticTick();
  };

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: `${W}px`, height: `${H}px` }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        <defs>
          {/* Blur in verticale per sfumare morbidamente i bordi del secondo cerchio */}
          <filter id="verticalGlassBlur" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6 22" result="vBlur" />
          </filter>

          {/* Sfumatura radiale satinata: tonalità smoked glass scuro e morbido fedele allo screenshot */}
          <radialGradient id="cerchioGrandeGrad" cx={cx} cy={cy} r={R_big} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#141922" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#181e28" stopOpacity="0.55" />
            <stop offset="75%" stopColor="#1c232e" stopOpacity="0.35" />
            <stop offset="90%" stopColor="#222b38" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#222b38" stopOpacity="0.0" />
          </radialGradient>

          {/* Tonalità smoked dark slate glass della ghiera esterna calibrata allo screenshot */}
          <linearGradient id="outerGhieraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(40, 48, 62, 0.88)" />
            <stop offset="35%" stopColor="rgba(26, 32, 42, 0.94)" />
            <stop offset="70%" stopColor="rgba(18, 22, 30, 0.94)" />
            <stop offset="100%" stopColor="rgba(28, 36, 48, 0.90)" />
          </linearGradient>

          {/* Ombra di profondità per far staccare la ghiera esterna */}
          <filter id="ghieraDepth" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="-2" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.55" />
          </filter>

          {/* Bagliore ciano vibrante per la tacca indice dello zenit e fermi */}
          <filter id="cyanGlow" x="-30%" y="-70%" width="160%" height="240%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00e5ff" floodOpacity="0.85" />
          </filter>

          {/* Ombra per far risaltare perfettamente i numeri sopra al vetro */}
          <filter id="numShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.9" />
          </filter>
        </defs>

        {/* 
          1. IL CERCHIO GRANDE (ALFA AL 30%, BLUR VERTICALE SFUMATO, NIENTE BORDER):
          - Vetro satinato con alfa del 30% e blur verticale morbido per sfumare i bordi
          - Senza bordo (niente border)
          - Si estende sopra Scansiona (y=9) e sotto Strumenti (y=371)
        */}
        <path
          d={cerchioGrandePath}
          fill="url(#cerchioGrandeGrad)"
          filter="url(#verticalGlassBlur)"
        />

        {/* 
          2. CERCHIO ESTERNO (GHIERA CON CARATTERE - SENZA BORDO):
          Tonalità smoked dark glass con profondità e riflesso, bordo rimosso (stroke="none")
        */}
        <path
          d={ghieraPath}
          fill="url(#outerGhieraGrad)"
          stroke="none"
          filter="url(#ghieraDepth)"
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
          LINEA INDICE DELLO ZENIT (0° ORIZZONTALE):
          Raccordo ciano tra la pillola dello zenit e l'apice della ghiera con bagliore
        */}
        <line
          x1={56}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00e5ff"
          strokeWidth="2.8"
          strokeLinecap="round"
          filter="url(#cyanGlow)"
        />

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
        IN GIALLO LA PILLOLA:
        - Pillola fissa all'apice (0° orizzontale) a filo con la ghiera come cerchiato in giallo
        - Mostra il valore zoom live in tempo reale (es. "2x")
        - Toccandola passa ai preset rapidi (0.5x, 1x, 2x, 3x, 5x)
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(32,38,48,0.85)] border border-white/20 backdrop-blur-md px-2.5 shadow-md active:scale-95 transition-transform"
        style={{
          left: "12px",
          top: `${cy - 15}px`,
          height: "30px",
          minWidth: "44px",
        }}
        aria-label={`Zoom corrente: ${zoom % 1 === 0 ? zoom : zoom.toFixed(1)}x. Tocca per cambiare preset.`}
      >
        <span className="text-[13.5px] font-bold text-white tracking-tight tabular-nums">
          {zoom % 1 === 0 ? zoom : zoom.toFixed(1)}x
        </span>
      </button>
    </div>
  );
}
