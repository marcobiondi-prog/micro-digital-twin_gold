import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Ghiera zoom landscape (Camera Jog Dial / Goniometro) - Replica esatta ad ampio respiro:
 * - Geometria calibrata al mockup di riferimento: centro (cx=272, cy=190), R=153px, ampiezza 324x380px
 * - Nastro curvo satinato regolare con estremità arrotondate che abbraccia elegantemente i comandi
 * - Numeri ben visibili e leggibili all'interno dell'arco (0.5x, 1x, 2x, 3x, 5x) con tracciamento nitido
 * - Tacche radiali graduate ogni ~4.9° con accenti ciano (#00f0ff) e punti bianchi sui preset
 * - Pillola fissa all'apice (0° orizzontale) a filo con [ Singolo | Multiplo ] con valore zoom live e mirino ciano
 * - Rotazione fluida 1:1 con il trascinamento del pollice e feedback aptico
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

  // Dimensioni ampie ed ergonomiche: centro rotazione (cx, cy) concentrico allo shutter button
  const cx = 272;
  const cy = 190;
  const R = 153.0; // Raggio della traccia graduata centrale
  const Ro = 175.0; // Raggio esterno del nastro satinato
  const Ri = 120.0; // Raggio interno del nastro satinato
  const R_dot = 140.0; // Raggio dei punti bianchi di stop
  const R_text = 123.0; // Raggio dei numeri dello zoom all'interno dell'arco

  const degTop = 54.0;
  const degBot = 64.0;
  const radT = (degTop * Math.PI) / 180;
  const radB = (degBot * Math.PI) / 180;

  // Calcolo punti perimetrali del nastro curvo con terminazioni arrotondate
  const xTo = cx - Ro * Math.cos(radT);
  const yTo = cy - Ro * Math.sin(radT);
  const xBo = cx - Ro * Math.cos(radB);
  const yBo = cy + Ro * Math.sin(radB);
  const xBi = cx - Ri * Math.cos(radB);
  const yBi = cy + Ri * Math.sin(radB);
  const xTi = cx - Ri * Math.cos(radT);
  const yTi = cy - Ri * Math.sin(radT);
  const capR = (Ro - Ri) / 2; // 27.5px

  // Path SVG del nastro satinato a semicerchio regolare
  const ribbonPath = `M ${xTo.toFixed(1)} ${yTo.toFixed(1)} A ${Ro} ${Ro} 0 0 0 ${xBo.toFixed(1)} ${yBo.toFixed(1)} A ${capR.toFixed(1)} ${capR.toFixed(1)} 0 0 0 ${xBi.toFixed(1)} ${yBi.toFixed(1)} A ${Ri} ${Ri} 0 0 1 ${xTi.toFixed(1)} ${yTi.toFixed(1)} A ${capR.toFixed(1)} ${capR.toFixed(1)} 0 0 0 ${xTo.toFixed(1)} ${yTo.toFixed(1)} Z`;

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
    const scaleX = rect.width / 324;
    const scaleY = rect.height / 380;
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

  // Stop principali lungo l'arco (0.5x, 1x, 2x, 3x, 5x) con numeri visibili dentro l'arco
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

  // Tacche graduate secondarie ogni 4.875°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let i = -16; i <= 16; i++) {
    const d = i * 4.875;
    if (d < -degTop - 25 || d > degBot + 25) continue;
    if (stops.some((s) => Math.abs(s.deg - d) < 2.0)) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(i % 4) === 0;
    const tlen = isCyan ? 4.5 : 3.0;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Apice orizzontale a sinistra: cx - R = 272 - 153 = 119px
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
      style={{ width: "324px", height: "380px" }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox="0 0 324 380"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="dialRibbonClip">
            <path d={ribbonPath} />
          </clipPath>
        </defs>

        {/* Nastro satinato a semicerchio regolare (sfondo naturale del goniometro) */}
        <path
          d={ribbonPath}
          fill="rgba(32, 38, 48, 0.76)"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="1"
        />

        {/* 
          GHIERA ROTANTE AMPIA (GONIOMETRO CAMERA RADIAL ZOOM):
          Ruota fluidamente attorno al centro dello shutter (cx, cy).
          I numeri e le tacche scorrono all'interno del nastro satinato.
        */}
        <g
          clipPath="url(#dialRibbonClip)"
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Traccia circolare guida sottile */}
          <path
            d={`M ${xTo.toFixed(1)} ${yTo.toFixed(1)} A ${R} ${R} 0 0 0 ${xBo.toFixed(1)} ${yBo.toFixed(1)}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1"
          />

          {/* Tacche graduate secondarie */}
          {ticks.map((t, idx) => (
            <line
              key={idx}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isCyan ? "#00f0ff" : "rgba(255, 255, 255, 0.70)"}
              strokeWidth={t.isCyan ? "1.6" : "1.1"}
              strokeLinecap="round"
            />
          ))}

          {/* Stop principali: tacca ciano, punto bianco e NUMERI VISIBILI DENTRO L'ARCO */}
          {stops.map((s) => (
            <g key={s.label}>
              <line
                x1={s.xIn}
                y1={s.yIn}
                x2={s.xOut}
                y2={s.yOut}
                stroke="#00f0ff"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
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
          Linea orizzontale ciano che connette la pillola fissa all'apice dell'arco
        */}
        <line
          x1={84}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva ampia (60px) per swipe fluido con il pollice
        */}
        <path
          d={`M ${cx - R * Math.cos(radT)} ${cy - R * Math.sin(radT)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos(radB)} ${cy + R * Math.sin(radB)}`}
          fill="none"
          stroke="transparent"
          strokeWidth="64"
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
        - Mostra il valore zoom corrente in tempo reale
        - Toccandola passa ai preset rapidi
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(36,42,52,0.85)] border border-white/22 px-2.5 shadow-lg active:scale-95 transition-transform"
        style={{
          left: "40px",
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
