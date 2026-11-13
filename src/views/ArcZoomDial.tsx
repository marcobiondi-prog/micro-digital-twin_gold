import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Curved radial arc zoom wheel for landscape mode.
 * Perfectly calibrated to image_2.png reference:
 * - Sweeping gentle curve (R = 220px, cx = 334, cy = 160) spanning gracefully alongside capture controls
 * - Slender 48px frosted glass blurred ribbon with backdrop-filter: blur(24px)
 * - Prominent, crisp 1x and 2x numbers and luminous dots
 * - Cyan connector and pill button [ 2x ] touching outer boundary
 * - Sliding 3D glass bead along the track
 * - Pure SVG attributes (no buggy filters) for 100% cross-device rendering guarantee
 */
export function ArcZoomDial({
  zoom,
  max,
  onZoom,
  disabled = false,
  className = "",
}: {
  zoom: number;
  max: number;
  onZoom: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastHapticZoom = useRef(zoom);

  // Exact geometry calibrated to image_2.png
  // Box: width = 240, height = 320. Shutter center at (190, 160).
  const cx = 334;
  const cy = 160;
  const R = 220;
  const R_in = 196;
  const R_out = 244;
  const degPerOctave = 16.5;

  const fanPath = "M 129.4 27.1 A 244.0 244.0 0 0 0 129.4 292.9 L 169.6 266.7 A 196.0 196.0 0 0 1 169.6 53.3 Z";
  const trackPath = "M 149.5 40.2 A 220.0 220.0 0 0 0 149.5 279.8";

  // Map zoom to angle (-16.5° = 1x, 0° = 2x, +16.5° = 4x)
  const angleForZoom = (z: number) => {
    return (Math.log2(Math.max(ZOOM_MIN, z)) - 1) * degPerOctave;
  };

  const zoomForAngle = (deg: number) => {
    const raw = Math.pow(2, deg / degPerOctave + 1);
    const clamped = Math.min(max, Math.max(0.5, raw));
    if (Math.abs(clamped - 1) < 0.12) return 1;
    if (Math.abs(clamped - 2) < 0.14) return 2;
    if (Math.abs(clamped - 0.5) < 0.08) return 0.5;
    return Math.round(clamped * 10) / 10;
  };

  const currentAngle = Math.min(33, Math.max(-33, angleForZoom(zoom)));

  const handlePointer = (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 240;
    const scaleY = rect.height / 320;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;

    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;

    const rad = Math.atan2(dy, -dx);
    const deg = (rad * 180) / Math.PI;

    if (deg >= -38 && deg <= 38) {
      const nextZoom = zoomForAngle(deg);
      if (Math.abs(nextZoom - lastHapticZoom.current) >= 0.1) {
        lastHapticZoom.current = nextZoom;
        hapticTick();
      }
      onZoom(nextZoom);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGElement>) => {
    if (!dragging.current) return;
    handlePointer(e);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGElement>) => {
    dragging.current = false;
  };

  // Generate radial ticks between -33° and +33°
  // Calibrated exactly to image_2.png: 8 subdivisions per octave (2.0625° step)
  const step = degPerOctave / 8; // 2.0625°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let i = -15; i <= 15; i++) {
    // Skip preset stop positions (rendered with custom prominent lines & dots below)
    if (i === -8 || i === 0 || i === 8) continue;
    const d = i * step;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(i) === 4 || Math.abs(i) === 12;
    const tlen = isCyan ? 6.5 : 4.5;
    ticks.push({
      deg: d,
      x1: cx - (R - tlen) * cos,
      y1: cy + (R - tlen) * sin,
      x2: cx - (R + tlen) * cos,
      y2: cy + (R + tlen) * sin,
      isCyan,
    });
  }

  // Preset stop coordinates:
  // Stop 1: 1x (-16.5°, i = -8)
  const rad1 = (-degPerOctave * Math.PI) / 180;
  const stop1 = {
    xIn: cx - (R - 8.5) * Math.cos(rad1),
    yIn: cy + (R - 8.5) * Math.sin(rad1),
    xOut: cx - (R + 8.5) * Math.cos(rad1),
    yOut: cy + (R + 8.5) * Math.sin(rad1),
    dotX: cx - R * Math.cos(rad1),
    dotY: cy + R * Math.sin(rad1),
  };

  // Stop 2: 2x (0°, i = 0)
  const stop2 = {
    xIn: cx - (R - 8.5),
    yIn: cy,
    xOut: cx - (R + 8.5),
    yOut: cy,
    dotX: cx - R,
    dotY: cy,
  };

  // Stop 3: Inferiore (+16.5°, i = +8)
  const rad3 = (degPerOctave * Math.PI) / 180;
  const stop3 = {
    xIn: cx - (R - 8.5) * Math.cos(rad3),
    yIn: cy + (R - 8.5) * Math.sin(rad3),
    xOut: cx - (R + 8.5) * Math.cos(rad3),
    yOut: cy + (R + 8.5) * Math.sin(rad3),
    dotX: cx - R * Math.cos(rad3),
    dotY: cy + R * Math.sin(rad3),
  };

  // End ticks at -33° and +33°
  const radTop = (-33 * Math.PI) / 180;
  const endTop = {
    x1: cx - (R - 9) * Math.cos(radTop),
    y1: cy + (R - 9) * Math.sin(radTop),
    x2: cx - (R + 9) * Math.cos(radTop),
    y2: cy + (R + 9) * Math.sin(radTop),
  };

  const radBottom = (33 * Math.PI) / 180;
  const endBottom = {
    x1: cx - (R - 9) * Math.cos(radBottom),
    y1: cy + (R - 9) * Math.sin(radBottom),
    x2: cx - (R + 9) * Math.cos(radBottom),
    y2: cy + (R + 9) * Math.sin(radBottom),
  };

  // Active glowing bead coordinates
  const currentRad = (currentAngle * Math.PI) / 180;
  const beadX = cx - R * Math.cos(currentRad);
  const beadY = cy + R * Math.sin(currentRad);

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: "240px", height: "320px" }}
      data-camera-controls
    >
      {/* Sfondo sfocato hardware-accelerated con backdrop-filter ritagliato esattamente sulla fascia curva a ventaglio */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: `path("${fanPath}")`,
          WebkitClipPath: `path("${fanPath}")`,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          backgroundColor: "rgba(22, 28, 40, 0.58)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 240 320"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Corpo scuro semitrasparente e bordo della fascia sfocata */}
        <path
          d={fanPath}
          fill="rgba(25, 32, 45, 0.28)"
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth="1.2"
        />

        {/* Traccia sottile guida dell'arco */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Tacche radiali graduate */}
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

        {/* Tacche bianche marcate alle estremità superiore e inferiore */}
        <line
          x1={endTop.x1}
          y1={endTop.y1}
          x2={endTop.x2}
          y2={endTop.y2}
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <line
          x1={endBottom.x1}
          y1={endBottom.y1}
          x2={endBottom.x2}
          y2={endBottom.y2}
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Stop 1 (1x): Tacca ciano neon, pallino bianco ed etichetta 1x */}
        <line
          x1={stop1.xIn}
          y1={stop1.yIn}
          x2={stop1.xOut}
          y2={stop1.yOut}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle
          cx={stop1.dotX}
          cy={stop1.dotY}
          r={3.2}
          fill="#ffffff"
          stroke="#00f0ff"
          strokeWidth="1.5"
        />
        <text
          x={stop1.dotX + 9}
          y={stop1.dotY + 4.5}
          textAnchor="start"
          fill="#ffffff"
          stroke="rgba(10, 15, 25, 0.7)"
          strokeWidth="0.8"
          paintOrder="stroke fill"
          fontSize="13"
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          className="pointer-events-none select-none"
        >
          1x
        </text>

        {/* Stop 2 (2x): Tacca ciano neon, pallino bianco ed etichetta 2x */}
        <line
          x1={stop2.xIn}
          y1={stop2.yIn}
          x2={stop2.xOut}
          y2={stop2.yOut}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle
          cx={stop2.dotX}
          cy={stop2.dotY}
          r={3.2}
          fill="#ffffff"
          stroke="#00f0ff"
          strokeWidth="1.5"
        />
        <text
          x={stop2.dotX + 9}
          y={stop2.dotY + 4.5}
          textAnchor="start"
          fill="#ffffff"
          stroke="rgba(10, 15, 25, 0.7)"
          strokeWidth="0.8"
          paintOrder="stroke fill"
          fontSize="13"
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          className="pointer-events-none select-none"
        >
          2x
        </text>

        {/* Stop 3 (Inferiore): Tacca ciano neon e pallino bianco */}
        <line
          x1={stop3.xIn}
          y1={stop3.yIn}
          x2={stop3.xOut}
          y2={stop3.yOut}
          stroke="#00f0ff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle
          cx={stop3.dotX}
          cy={stop3.dotY}
          r={3.2}
          fill="#ffffff"
          stroke="#00f0ff"
          strokeWidth="1.5"
        />

        {/* Connettore ciano neon continuo verso la pillola [ 2x ] */}
        <line
          x1={90}
          y1={cy}
          x2={stop2.dotX - 2.5}
          y2={cy}
          stroke="#00f0ff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Sferetta / bead luminosa che segue fluidamente lo zoom come un cursore di vetro */}
        <circle
          cx={beadX}
          cy={beadY}
          r={6}
          fill="#ffffff"
          stroke="#00f0ff"
          strokeWidth="2.5"
        />

        {/* ZONA TOUCH DEDICATA: traccia trasparente lungo l'arco */}
        <path
          d={trackPath}
          fill="none"
          stroke="transparent"
          strokeWidth="34"
          strokeLinecap="round"
          className="cursor-pointer pointer-events-auto touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </svg>

      {/* Pillola interattiva [ 2x ] collegata al connettore ciano neon */}
      <button
        type="button"
        onClick={() => { onZoom(2); hapticTick(); }}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(24,30,42,0.92)] border border-white/25 px-2.5 py-0.5 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "56px",
          top: `${cy - 12}px`,
        }}
        aria-label="Imposta zoom 2x"
      >
        <span className="text-[11px] font-bold text-white tracking-tight">
          2x
        </span>
      </button>
    </div>
  );
}
