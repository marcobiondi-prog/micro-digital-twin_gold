import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Camera radial zoom goniometer for landscape mode.
 * Calibrated exactly to user instructions & mockup:
 * - "mezzo cerchio regolare": regular circular arc centered around the capture controls
 * - "al centro sfocato... centro del semicerchio attorno al pulsante di zoom":
 *   frosted glass satinato background (backdrop-filter: blur(24px)) enclosing the shutter, Scansiona, and Strumenti
 * - "la pillola all'apice resta fissa e cambia il numero di zoom al suo interno":
 *   fixed pill button at the apex (0° horizontal) flush ("a filo") with [ Singolo | Multiplo ],
 *   showing the current live zoom value (e.g. 1x, 2x, 3.2x)
 * - "il dial gira... come fosse un goniometro camera radial zoom":
 *   the dial wheel with radial ticks and numbers rotates as the user drags or zooms
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

  // Exact geometry: regular circular arc centered at the capture dock
  // Box: width = 220, height = 280.
  const cx = 168;
  const cy = 140;
  const R = 95;
  const R_bg = 120;
  const degPerOctave = 28; // 28° per zoom doubling (e.g. 1x to 2x)

  // Large frosted glass semi-circle enclosing the controls area
  const bgPath = `M ${cx} ${cy - R_bg} A ${R_bg} ${R_bg} 0 0 0 ${cx} ${cy + R_bg} L 220 ${cy + R_bg} L 220 ${cy - R_bg} Z`;

  // Circular guide track path for the rotating scale (-80° to +80°)
  const trackPath = `M ${cx - R * Math.cos((-80 * Math.PI) / 180)} ${cy + R * Math.sin((-80 * Math.PI) / 180)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos((80 * Math.PI) / 180)} ${cy + R * Math.sin((80 * Math.PI) / 180)}`;

  // Angle on the goniometer for any zoom value (2x is calibrated at 0° apex)
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

  // The rotation angle of the dial wheel:
  // When zoom is 2x, dial is at 0°. When zoom is 1x, dial rotates by +28° to bring 1x to apex (0°).
  const dialRotation = -angleForZoom(zoom);

  const getPointerAngle = (e: ReactPointerEvent<SVGElement>) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 220;
    const scaleY = rect.height / 280;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;
    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;
    const rad = Math.atan2(dy, -dx); // 0° is horizontal left (towards apex)
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

    // Moving upward increases zoom, moving downward decreases zoom
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

  // Stops on the rotating goniometer:
  // 0.5x, 1x, 2x, 3x, 4x, 5x
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
      xIn: cx - (R - 7) * Math.cos(rad),
      yIn: cy + (R - 7) * Math.sin(rad),
      xOut: cx - (R + 7) * Math.cos(rad),
      yOut: cy + (R + 7) * Math.sin(rad),
      textX: cx - (R - 14) * Math.cos(rad),
      textY: cy + (R - 14) * Math.sin(rad) + 4,
    };
  });

  // Minor radial ticks every 3.5° along the scale (from -75° to +75°)
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let d = -75; d <= 75; d += 3.5) {
    if (stops.some((s) => Math.abs(s.deg - d) < 1.8)) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(d % 14) < 1.5;
    const tlen = isCyan ? 5.5 : 3.5;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Apex fixed position:
  // Apex of the circle is at (cx - R, cy) = (73, 140)
  // Pill button at left: "14px", right edge at 52px.
  // Connector line from 52px to 73px.
  const apexX = cx - R;

  // Cycle zoom presets when tapping the fixed apex pill
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
      style={{ width: "220px", height: "280px" }}
      data-camera-controls
    >
      {/* 
        Sfondo sfocato satinato ("il centro del semicerchio attorno al pulsante di zoom. Il cerchio più grande")
        Racchiude lo shutter, Scansiona e Strumenti in un vetro satinato trasparente.
      */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: `path("${bgPath}")`,
          WebkitClipPath: `path("${bgPath}")`,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          backgroundColor: "rgba(20, 26, 36, 0.45)",
          boxShadow: "inset 0 0 20px rgba(0, 0, 0, 0.3)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 220 280"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Bordo satinato semitrasparente del semicerchio grande */}
        <path
          d={bgPath}
          fill="rgba(24, 30, 42, 0.35)"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth="1.2"
        />

        {/* 
          GRUPPO ROTANTE (GONIOMETRO CAMERA RADIAL ZOOM):
          Ruota attorno a (cx, cy) in base allo zoom corrente.
          La tacca corrispondente allo zoom corrente viene portata esattamente all'apice (0°).
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Traccia guida sottile dell'arco regolare */}
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.28)"
            strokeWidth="1.4"
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
              stroke={t.isCyan ? "#00f0ff" : "rgba(255, 255, 255, 0.82)"}
              strokeWidth={t.isCyan ? "2.0" : "1.2"}
              strokeLinecap="round"
            />
          ))}

          {/* Tacche maggiori degli stop con punti luminosi e scritte numeriche (0.5x, 1x, 2x, 3x, 4x, 5x) */}
          {stops.map((s) => (
            <g key={s.label}>
              <line
                x1={s.xIn}
                y1={s.yIn}
                x2={s.xOut}
                y2={s.yOut}
                stroke="#00f0ff"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle
                cx={s.dotX}
                cy={s.dotY}
                r={3}
                fill="#ffffff"
                stroke="#00f0ff"
                strokeWidth="1.5"
              />
              <text
                x={s.textX}
                y={s.textY}
                textAnchor="start"
                fill="#ffffff"
                stroke="rgba(10, 15, 25, 0.7)"
                strokeWidth="0.8"
                paintOrder="stroke fill"
                fontSize="11.5"
                fontWeight="bold"
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
          Non ruotano, restano ancorati all'apice per indicare il valore selezionato.
        */}
        {/* Connettore ciano continuo dalla pillola fissa all'apice dell'arco */}
        <line
          x1={52}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Cursore/mirino ciano luminoso fisso all'apice del dial */}
        <line
          x1={apexX - 5}
          y1={cy}
          x2={apexX + 5}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva per catturare lo swipe/drag rotativo.
        */}
        <path
          d={`M ${cx - R * Math.cos((-60 * Math.PI) / 180)} ${cy + R * Math.sin((-60 * Math.PI) / 180)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos((60 * Math.PI) / 180)} ${cy + R * Math.sin((60 * Math.PI) / 180)}`}
          fill="none"
          stroke="transparent"
          strokeWidth="48"
          strokeLinecap="round"
          className="cursor-ns-resize pointer-events-auto touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </svg>

      {/* 
        PILLOLA FISSA ALL'APICE ("La pillola all'apice resta fissa e cambia il numero di zoom al suo interno"):
        - Posizione fissa all'apice della curvatura
        - Bordo sinistro a filo con il selettore Singolo/Multiplo (left: 14px)
        - Cambia il numero di zoom al suo interno mostrando il valore live
      */}
      <button
        type="button"
        onClick={handlePillClick}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(24,30,42,0.94)] border border-white/25 px-2.5 py-0.5 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "14px",
          top: `${cy - 12}px`,
        }}
        aria-label={`Zoom corrente: ${zoomLabel(zoom)}. Tocca per cambiare preset.`}
      >
        <span className="text-[11.5px] font-bold text-white tracking-tight tabular-nums">
          {zoomLabel(zoom)}
        </span>
      </button>
    </div>
  );
}
