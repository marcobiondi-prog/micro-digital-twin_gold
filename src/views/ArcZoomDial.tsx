import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Ghiera zoom landscape (Camera Jog Dial / Goniometro) - Architettura a 2 cerchi concentrici:
 * 1. CERCHIO 1 (Ghiera esterna): nastro curvo regolare con le linee graduate fisse all'interno.
 * 2. CERCHIO 2 (Vetro satinato trasparente interno): cerchio continuo (circonferenza non tagliata)
 *    con sfocatura dello sfondo (backdrop-filter: blur) e numeri (0.5x, 1x, 2x, 3x, 5x) e pallini bianchi.
 *    È QUESTO cerchio satinato trasparente che ruota al variare dello zoom.
 * - L'INTERO BLOCCO è a filo del bordo destro dello schermo.
 * - Scansiona e Strumenti distanziati e spostati leggermente a sinistra (non toccano gli angoli curvi dello schermo).
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
  // Il centro dello shutter è a 48px dal bordo destro dello schermo -> cx = 280 - 48 = 232
  const W = 280;
  const H = 380;
  const cx = 232;
  const cy = 190;

  // Cerchio 1 (Ghiera esterna con le linee dentro):
  const Ro = 175.0; // Raggio esterno ghiera
  const Rm = 142.0; // Raggio interno ghiera / raggio del Cerchio 2 (vetro satinato)
  const R = 158.0; // Raggio linea centrale delle tacche graduate

  // Cerchio 2 (Vetro satinato trasparente con i numeri dentro):
  const R_dot = 126.0; // Raggio dei pallini bianchi dentro il vetro satinato
  const R_text = 108.0; // Raggio dei numeri dello zoom dentro il vetro satinato

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

  // Mappatura angolare continua: 1x a -39°, 2x all'apice 0°, 3x a +39°
  const angleForZoom = (z: number) => {
    if (z <= 1) {
      return -78 + ((z - 0.5) / 0.5) * 39;
    }
    if (z <= 2) {
      return -39 + (z - 1) * 39;
    }
    if (z <= 3) {
      return (z - 2) * 39;
    }
    return 39 + ((Math.min(max, z) - 3) / 2) * 25;
  };

  const zoomForAngle = (deg: number) => {
    let z: number;
    if (deg <= -39) {
      z = 0.5 + ((deg + 78) / 39) * 0.5;
    } else if (deg <= 0) {
      z = 1 + (deg + 39) / 39;
    } else if (deg <= 39) {
      z = 2 + deg / 39;
    } else {
      z = 3 + ((deg - 39) / 25) * 2;
    }
    const clamped = Math.min(max, Math.max(ZOOM_MIN, z));
    if (Math.abs(clamped - 0.5) < 0.06) return 0.5;
    if (Math.abs(clamped - 1) < 0.06) return 1;
    if (Math.abs(clamped - 2) < 0.08) return 2;
    if (Math.abs(clamped - 3) < 0.08) return 3;
    if (Math.abs(clamped - 5) < 0.1) return 5;
    return Math.round(clamped * 10) / 10;
  };

  // Rotazione per portare il valore corrente all'apice (0°)
  const dialRotation = -angleForZoom(zoom);

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

  // Tocco sulla pillola fissa: passa ai preset rapidi
  const handlePillClick = () => {
    if (zoom < 1) onZoom(1);
    else if (zoom < 2) onZoom(2);
    else if (zoom < 3) onZoom(3);
    else onZoom(1);
    hapticTick();
  };

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: `${W}px`, height: `${H}px` }}
      data-camera-controls
    >
      {/* 
        CERCHIO 2: VETRO SATINATO TRASPARENTE CON SFOCATURA SFONDO E CIRCONFERENZA CONTINUA:
        - Circonferenza circolare completa e continua a raggio Rm (non tagliata)
        - Sfoca leggermente lo sfondo della fotocamera (backdrop-filter: blur)
      */}
      <div
        className="absolute pointer-events-none select-none rounded-full"
        style={{
          width: `${Rm * 2}px`,
          height: `${Rm * 2}px`,
          left: `${cx - Rm}px`,
          top: `${cy - Rm}px`,
          background: "rgba(28, 36, 48, 0.45)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow: "inset 0 0 18px rgba(0, 0, 0, 0.28)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* 
          CERCHIO 1: LA GHIERA CON LE LINEE DENTRO
          Nastro curvo esterno scuro con le tacche graduate all'interno
        */}
        <path
          d={ghieraPath}
          fill="rgba(20, 25, 34, 0.84)"
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth="1"
        />

        {/* 
          LINEE DENTRO IL CERCHIO 1 (GHIERA):
          Le tacche graduate fisse della ghiera
        */}
        <g>
          {ticks.map((t, idx) => (
            <line
              key={idx}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isCyan ? "#00f0ff" : "rgba(255, 255, 255, 0.70)"}
              strokeWidth={t.isStop ? "2.6" : t.isCyan ? "1.6" : "1.1"}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* 
          CERCHIO DENTRO SATINATO TRASPARENTE CHE RUOTA CON I NUMERI:
          Ruota fluidamente al variare dello zoom attorno a (cx, cy).
          I numeri e i pallini bianchi scorrono nel cerchio satinato trasparente.
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {stops.map((s) => (
            <g key={s.label}>
              <circle
                cx={s.dotX}
                cy={s.dotY}
                r={3.5}
                fill="#ffffff"
              />
              <text
                x={s.textX}
                y={s.textY}
                transform={`rotate(${s.deg}, ${s.textX}, ${s.textY})`}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                stroke="rgba(10, 15, 25, 0.85)"
                strokeWidth="1.2"
                paintOrder="stroke fill"
                fontSize="14"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                className="pointer-events-none select-none"
              >
                {s.label}
              </text>
            </g>
          ))}
        </g>

        {/* 
          ELEMENTI FISSI ALL'APICE (0° ORIZZONTALE):
          Linea orizzontale ciano che connette la pillola fissa all'apice della ghiera
        */}
        <line
          x1={54}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
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
        PILLOLA FISSA ALL'APICE (0° ORIZZONTALE):
        - Fissa all'apice orizzontale a filo con [ Singolo | Multiplo ]
        - Mostra il valore zoom live in tempo reale
        - Toccandola passa ai preset rapidi
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(36,42,52,0.85)] border border-white/22 px-2.5 shadow-lg active:scale-95 transition-transform"
        style={{
          left: "12px",
          top: `${cy - 15}px`,
          height: "30px",
          minWidth: "42px",
        }}
        aria-label={`Zoom corrente: ${zoomLabel(zoom)}. Tocca per cambiare preset.`}
      >
        <span className="text-[13.5px] font-bold text-white tracking-tight tabular-nums">
          {zoomLabel(zoom)}
        </span>
      </button>
    </div>
  );
}
