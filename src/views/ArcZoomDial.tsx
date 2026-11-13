import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Grande ghiera rotante dello zoom per la modalità landscape (Camera Radial Zoom).
 * - "grande con i numeri che si vedono": ghiera ampia (R = 150px) con numeri 0.5x, 1x, 2x, 3x, 4x, 5x grandi, nitidi e bold
 * - "il centro del semicerchio attorno al pulsante di zoom è sfocato e trasparente vetro satinato":
 *   grande semicerchio satinato (R = 168px) con backdrop-filter: blur(24px) dietro lo shutter e i comandi
 * - "il dial gira... come fosse un goniometro camera radial zoom":
 *   la ghiera graduata ruota fluidamente attorno al centro dello shutter mentre si trascina il pollice
 * - "la pillola all'apice resta fissa e cambia il numero di zoom al suo interno":
 *   pillola fissa all'apice (0° orizzontale) a filo con [ Singolo | Multiplo ], con valore zoom live
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

  // Dimensioni ghiera grande: box 280 x 380, centro shutter a (210, 190)
  const cx = 210;
  const cy = 190;
  const R = 150;
  const R_bg = 168;
  const degPerOctave = 32; // 32° per raddoppio dello zoom

  // Grande semicerchio satinato trasparente che racchiude i controlli
  const bgPath = `M ${cx} ${cy - R_bg} A ${R_bg} ${R_bg} 0 0 0 ${cx} ${cy + R_bg} L 280 ${cy + R_bg} L 280 ${cy - R_bg} Z`;

  // Traccia circolare regolare per la scala goniometrica (-85° a +85°)
  const radSpan = (85 * Math.PI) / 180;
  const trackPath = `M ${cx - R * Math.cos(radSpan)} ${cy - R * Math.sin(radSpan)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos(radSpan)} ${cy + R * Math.sin(radSpan)}`;

  // Angolo del goniometro corrispondente a un valore di zoom (2x calibrato all'apice 0°)
  const angleForZoom = (z: number) => {
    return (Math.log2(Math.max(ZOOM_MIN, z)) - 1) * degPerOctave;
  };

  const zoomForAngle = (deg: number) => {
    const raw = Math.pow(2, deg / degPerOctave + 1);
    const clamped = Math.min(max, Math.max(0.5, raw));
    if (Math.abs(clamped - 0.5) < 0.08) return 0.5;
    if (Math.abs(clamped - 1) < 0.08) return 1;
    if (Math.abs(clamped - 2) < 0.1) return 2;
    if (Math.abs(clamped - 3) < 0.1) return 3;
    if (Math.abs(clamped - 4) < 0.1) return 4;
    if (Math.abs(clamped - 5) < 0.1) return 5;
    return Math.round(clamped * 10) / 10;
  };

  // Rotazione della ghiera: quando lo zoom è z, ruota per portare quel valore esattamente all'apice (0°)
  const dialRotation = -angleForZoom(zoom);

  const getPointerAngle = (e: ReactPointerEvent<SVGElement>) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 280;
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
    const newDialAngle = currentDialAngle + deltaAngle;
    const nextZoom = zoomForAngle(newDialAngle);

    if (Math.abs(nextZoom - lastHapticZoom.current) >= 0.1) {
      lastHapticZoom.current = nextZoom;
      hapticTick();
    }
    onZoom(nextZoom);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGElement>) => {
    dragging.current = false;
  };

  // Stop principali con numeri grandi e ben visibili
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
    return {
      ...s,
      deg,
      dotX: cx - R * Math.cos(rad),
      dotY: cy + R * Math.sin(rad),
      xIn: cx - (R - 9) * Math.cos(rad),
      yIn: cy + (R - 9) * Math.sin(rad),
      xOut: cx - (R + 9) * Math.cos(rad),
      yOut: cy + (R + 9) * Math.sin(rad),
      textX: cx - (R - 22) * Math.cos(rad),
      textY: cy + (R - 22) * Math.sin(rad) + 5,
    };
  });

  // Tacche graduate secondarie ogni 4°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let d = -80; d <= 80; d += 4) {
    if (stops.some((s) => Math.abs(s.deg - d) < 2.0)) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(d % 16) < 1.8;
    const tlen = isCyan ? 7 : 4.5;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Apice orizzontale a sinistra: cx - R = 210 - 150 = 60px
  const apexX = cx - R;

  // Tocco sulla pillola fissa all'apice: passa ai preset rapidi
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
      style={{ width: "280px", height: "380px" }}
      data-camera-controls
    >
      {/* 
        Sfondo sfocato satinato trasparente del semicerchio grande attorno ai controlli
      */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: `path("${bgPath}")`,
          WebkitClipPath: `path("${bgPath}")`,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          backgroundColor: "rgba(18, 24, 34, 0.48)",
          boxShadow: "inset 0 0 24px rgba(0, 0, 0, 0.35)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 280 380"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Bordo satinato semitrasparente del semicerchio grande */}
        <path
          d={bgPath}
          fill="rgba(20, 26, 38, 0.35)"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth="1.2"
        />

        {/* 
          GHIERA ROTANTE (GONIOMETRO CAMERA RADIAL ZOOM):
          Ruota fluidamente attorno a (cx, cy) = (210, 190).
          La tacca corrispondente allo zoom corrente viene portata all'apice (0°).
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Traccia guida sottile della ghiera circolare */}
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.32)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* Tacche radiali graduate secondarie */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isCyan ? "#00f0ff" : "rgba(255, 255, 255, 0.85)"}
              strokeWidth={t.isCyan ? "2.2" : "1.4"}
              strokeLinecap="round"
            />
          ))}

          {/* Tacche principali con punti luminosi e NUMERI GRANDI E VISIBILI (0.5x, 1x, 2x, 3x, 4x, 5x) */}
          {stops.map((s) => (
            <g key={s.label}>
              <line
                x1={s.xIn}
                y1={s.yIn}
                x2={s.xOut}
                y2={s.yOut}
                stroke="#00f0ff"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <circle
                cx={s.dotX}
                cy={s.dotY}
                r={3.5}
                fill="#ffffff"
                stroke="#00f0ff"
                strokeWidth="1.6"
              />
              <text
                x={s.textX}
                y={s.textY}
                textAnchor="middle"
                fill="#ffffff"
                stroke="rgba(10, 15, 25, 0.85)"
                strokeWidth="1.0"
                paintOrder="stroke fill"
                fontSize="14.5"
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
          Riconnettono la pillola fissa alla ghiera che gira sotto.
        */}
        {/* Linea orizzontale ciano continua dalla pillola fissa all'apice della ghiera */}
        <line
          x1={54}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Mirino / indicatore ciano luminoso sull'apice del dial */}
        <line
          x1={apexX - 5}
          y1={cy}
          x2={apexX + 5}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="3.4"
          strokeLinecap="round"
        />

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva ampia (60px) per swipe fluido con il pollice
        */}
        <path
          d={`M ${cx - R * Math.cos((70 * Math.PI) / 180)} ${cy - R * Math.sin((70 * Math.PI) / 180)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos((70 * Math.PI) / 180)} ${cy + R * Math.sin((70 * Math.PI) / 180)}`}
          fill="none"
          stroke="transparent"
          strokeWidth="60"
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
        - Fissa all'apice (left: 14px, a filo con [ Singolo | Multiplo ])
        - Cambia il numero di zoom live al suo interno
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(24,30,42,0.95)] border border-white/30 px-3 py-1 shadow-2xl active:scale-95 transition-transform"
        style={{
          left: "14px",
          top: `${cy - 14}px`,
        }}
        aria-label={`Zoom corrente: ${zoomLabel(zoom)}. Tocca per cambiare preset.`}
      >
        <span className="text-[12.5px] font-extrabold text-white tracking-tight tabular-nums">
          {zoomLabel(zoom)}
        </span>
      </button>
    </div>
  );
}
