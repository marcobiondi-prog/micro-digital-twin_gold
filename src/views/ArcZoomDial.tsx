import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN, ZOOM_MAX } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Ghiera zoom landscape (Camera Jog Dial / Goniometro):
 * - "ghiera normale": profilo compatto ad arco (R = 96px, spessore 40px)
 * - "numeri che si vedono dentro l'arco che scorre i numeri": numeri grandi ad alto contrasto (0.5x, 1x, 2x, 3x, 4x, 5x)
 *   collocati direttamente all'interno della traccia circolare che ruota in tempo reale con lo swipe
 * - "elimina la sfocatura al centro": zero blur al centro, lo spazio interno è completamente trasparente
 * - "avvicina il semicerchio della ghiera al bordo destro dello schermo": raggio calibrato a 96px, adiacente al dock dello scatto
 * - "pillola fissa all'apice": fissa a 0° orizzontale a filo con [ Singolo | Multiplo ], visualizza lo zoom live
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

  // Geometria: box 200 x 300, centro rotazione a (148, 150) allineato allo shutter button
  const cx = 148;
  const cy = 150;
  const R = 96;
  const R_in = 76;
  const R_out = 116;
  const degPerOctave = 36; // 36° per raddoppio zoom

  // Traccia del nastro curvo (ribbon) tra -78° e +90°
  // M 123.9 36.5 A 116 116 0 0 0 148 266 L 148 226 A 76 76 0 0 1 132.2 75.7 Z
  const ribbonPath = "M 123.9 36.5 A 116 116 0 0 0 148 266 L 148 226 A 76 76 0 0 1 132.2 75.7 Z";
  const trackLinePath = "M 128.0 56.1 A 96 96 0 0 0 148 246";

  // Angolo del goniometro per un valore di zoom (1x calibrato all'apice 0°)
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
    const scaleX = rect.width / 200;
    const scaleY = rect.height / 300;
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
    // Trascinando verso il basso (delta positivo), lo zoom diminuisce (movimento jog dial 1:1)
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

  // Stop principali con numeri ben visibili e ad alto contrasto dentro l'arco
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
      x: cx - R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
      xIn: cx - (R_in + 4) * Math.cos(rad),
      yIn: cy + (R_in + 4) * Math.sin(rad),
      xOut: cx - (R_out - 4) * Math.cos(rad),
      yOut: cy + (R_out - 4) * Math.sin(rad),
    };
  });

  // Tacche graduate secondarie ogni 4°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let d = -74; d <= 88; d += 4) {
    if (stops.some((s) => Math.abs(s.deg - d) < 3.2)) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(d % 16) < 1.8;
    const tlen = isCyan ? 7 : 4;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Apice orizzontale a sinistra: cx - R = 148 - 96 = 52px
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
      style={{ width: "200px", height: "300px" }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox="0 0 200 300"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* 
          GHIERA ROTANTE NORMALE (GONIOMETRO CAMERA RADIAL ZOOM):
          Ruota fluidamente attorno al centro dello shutter (148, 150).
          La tacca e il numero dello zoom corrente si allineano perfettamente all'apice (0°).
        */}
        <g
          transform={`rotate(${dialRotation}, ${cx}, ${cy})`}
          className="transition-transform duration-75 ease-out"
        >
          {/* Nastro curvo trasparente con leggero sfondo scuro e bordo sottile */}
          <path
            d={ribbonPath}
            fill="rgba(18, 24, 34, 0.78)"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="1.2"
          />

          {/* Traccia guida interna */}
          <path
            d={trackLinePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="1"
            strokeDasharray="3 3"
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

          {/* Stop principali: punto guida e NUMERI BEN VISIBILI DENTRO L'ARCO */}
          {stops.map((s) => (
            <g key={s.label}>
              <circle
                cx={s.xIn}
                cy={s.yIn}
                r={2.2}
                fill="#00f0ff"
                stroke="#ffffff"
                strokeWidth="0.8"
              />
              <text
                x={s.x}
                y={s.y}
                transform={`rotate(${s.deg}, ${s.x}, ${s.y})`}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                stroke="rgba(10, 15, 25, 0.95)"
                strokeWidth="1.2"
                paintOrder="stroke fill"
                fontSize="13.5"
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
          Linea orizzontale ciano che collega la pillola fissa all'apice della ghiera
        */}
        <line
          x1={46}
          y1={cy}
          x2={apexX}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Mirino / indice ciano luminoso fisso sull'apice del dial */}
        <line
          x1={apexX - 3}
          y1={cy}
          x2={apexX + 4}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* 
          ZONA TOUCH DEDICATA: traccia trasparente curva ampia (56px) per swipe fluido con il pollice
        */}
        <path
          d={`M ${cx - R * Math.cos((75 * Math.PI) / 180)} ${cy - R * Math.sin((75 * Math.PI) / 180)} A ${R} ${R} 0 0 0 ${cx - R * Math.cos((75 * Math.PI) / 180)} ${cy + R * Math.sin((75 * Math.PI) / 180)}`}
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
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(20,26,36,0.92)] border border-[#00f0ff]/60 px-2.5 py-1 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "6px",
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
