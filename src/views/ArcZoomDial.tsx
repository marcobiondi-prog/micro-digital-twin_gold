import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Ghiera zoom landscape (Camera Jog Dial / Goniometro) - Replica esatta del mockup:
 * - Geometria: raggio R = 100px calibrato al pixel attorno allo shutter button
 * - Pannello dock satinato curvo adiacente ai comandi, zero sfocatura al centro dello schermo
 * - Numeri (0.5x, 1x, 2x, 3x, 4x, 5x) ad alto contrasto con contorno scuro lungo l'arco
 * - Traccia graduata con tacche ogni 4° e tacche ciano principali
 * - Pillola fissa all'apice orizzontale a filo con [ Singolo | Multiplo ] con valore zoom live e mirino ciano
 * - Rotazione fluida 1:1 con il trascinamento del pollice e haptic tick
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

  // Geometria calibrata: box 180 x 280, centro shutter a (128, 140)
  const cx = 128;
  const cy = 140;
  const R = 100;
  const R_text = 84; // Numeri posizionati all'interno della curvatura
  const degPerOctave = 36; // 36° per raddoppio dello zoom

  // Pannello satinato di fondo che abbraccia esclusivamente i comandi
  const dockPath = "M 57.3 55.7 A 110 110 0 0 0 57.3 224.3 L 180 224.3 L 180 55.7 Z";

  // Traccia circolare guida dell'arco (-48° a +48°)
  const trackPath = "M 61.1 65.7 A 100 100 0 0 0 61.1 214.3";

  // Angolo del goniometro corrispondente allo zoom (1x calibrato all'apice 0°)
  const angleForZoom = (z: number) => {
    return Math.log2(Math.max(ZOOM_MIN, z)) * degPerOctave;
  };

  const zoomForAngle = (deg: number) => {
    const raw = Math.pow(2, deg / degPerOctave);
    const clamped = Math.min(max, Math.max(ZOOM_MIN, raw));
    if (Math.abs(clamped - 0.5) < 0.08) return 0.5;
    if (Math.abs(clamped - 1) < 0.08) return 1;
    if (Math.abs(clamped - 2) < 0.1) return 2;
    if (Math.abs(clamped - 3) < 0.1) return 3;
    if (Math.abs(clamped - 4) < 0.1) return 4;
    if (Math.abs(clamped - 5) < 0.1) return 5;
    return Math.round(clamped * 10) / 10;
  };

  // Rotazione per portare il valore corrente all'apice (0°)
  const dialRotation = -angleForZoom(zoom);

  const getPointerAngle = (e: ReactPointerEvent<SVGElement>) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 180;
    const scaleY = rect.height / 280;
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

  // Stop principali lungo l'arco (0.5x, 1x, 2x, 3x, 4x, 5x)
  const stops = [
    { label: "0.5x", zoomVal: 0.5 },
    { label: "1x", zoomVal: 1 },
    { label: "2x", zoomVal: 2 },
    { label: "3x", zoomVal: 3 },
    { label: "4x", zoomVal: 4 },
    { label: "5x", zoomVal: 5 },
  ].map((s) => {
    const deg = angleForZoom(s.zoomVal);
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      ...s,
      deg,
      dotX: cx - R * cos,
      dotY: cy + R * sin,
      textX: cx - R_text * cos,
      textY: cy + R_text * sin,
      xIn: cx - (R - 7) * cos,
      yIn: cy + (R - 7) * sin,
      xOut: cx - (R + 7) * cos,
      yOut: cy + (R + 7) * sin,
    };
  });

  // Tacche graduate secondarie ogni 4°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let d = -68; d <= 88; d += 4) {
    if (stops.some((s) => Math.abs(s.deg - d) < 2.5)) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(d % 16) < 1.8;
    const tlen = isCyan ? 6 : 3.5;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Apice orizzontale a sinistra: cx - R = 128 - 100 = 28px
  const apexX = cx - R;

  // Tocco sulla pillola fissa: passa ai preset rapidi
  const handlePillClick = () => {
    if (zoom < 1) onZoom(1);
    else if (zoom < 2) onZoom(2);
    else if (zoom < 4) onZoom(4);
    else onZoom(1);
    hapticTick();
  };

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: "180px", height: "280px" }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox="0 0 180 280"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Sfondo satinato compatto del dock (racchiude solo i pulsanti e la ghiera) */}
        <path
          d={dockPath}
          fill="rgba(18, 24, 34, 0.62)"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1"
        />

        {/* 
          GHIERA ROTANTE NORMALE (GONIOMETRO CAMERA RADIAL ZOOM):
          Ruota fluidamente attorno al centro dello shutter (128, 140).
          La tacca e il numero dello zoom corrente si allineano perfettamente all'apice (0°).
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Traccia circolare guida sottile */}
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.40)"
            strokeWidth="1.4"
          />

          {/* Tacche radiali graduate secondarie */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isCyan ? "#00f0ff" : "rgba(255, 255, 255, 0.65)"}
              strokeWidth={t.isCyan ? "1.8" : "1.2"}
              strokeLinecap="round"
            />
          ))}

          {/* Stop principali: punto luminoso ciano e NUMERI BEN VISIBILI DENTRO L'ARCO */}
          {stops.map((s) => (
            <g key={s.label}>
              <line
                x1={s.xIn}
                y1={s.yIn}
                x2={s.xOut}
                y2={s.yOut}
                stroke="#00f0ff"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle
                cx={s.dotX}
                cy={s.dotY}
                r={2.6}
                fill="#00f0ff"
                stroke="#ffffff"
                strokeWidth="1"
              />
              <text
                x={s.textX}
                y={s.textY}
                transform={`rotate(${s.deg}, ${s.textX}, ${s.textY})`}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                stroke="rgba(10, 15, 25, 0.95)"
                strokeWidth="1.2"
                paintOrder="stroke fill"
                fontSize="12.5"
                fontWeight="800"
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
          x1={24}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Mirino / indice ciano luminoso fisso sull'apice del dial */}
        <line
          x1={apexX - 2}
          y1={cy}
          x2={apexX + 5}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva ampia (56px) per swipe fluido con il pollice
        */}
        <path
          d={`M ${cx - R * Math.cos((52 * Math.PI) / 180)} ${cy - R * Math.sin((52 * Math.PI) / 180)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos((52 * Math.PI) / 180)} ${cy + R * Math.sin((52 * Math.PI) / 180)}`}
          fill="none"
          stroke="transparent"
          strokeWidth="56"
          strokeLinecap="round"
          className="cursor-ns-resize pointer-events-auto touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </svg>

      {/* 
        PILLOLA FISSA ALL'APICE:
        - Fissa all'apice orizzontale a filo con [ Singolo | Multiplo ]
        - Cambia il numero di zoom in tempo reale al suo interno
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(20,26,36,0.92)] border border-[#00f0ff]/70 px-2.5 py-1 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "0px",
          top: `${cy - 14}px`,
        }}
        aria-label={`Zoom corrente: ${zoomLabel(zoom)}. Tocca per cambiare preset.`}
      >
        <span className="text-[12px] font-extrabold text-[#00f0ff] tracking-tight tabular-nums">
          {zoomLabel(zoom)}
        </span>
      </button>
    </div>
  );
}
