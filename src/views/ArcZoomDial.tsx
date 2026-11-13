import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Curved radial arc zoom wheel for landscape mode.
 * Perfectly calibrated to user specifications & reference mockup:
 * - "sottile": slender 30px frosted-glass band (R_in = 80px, R_out = 110px)
 * - "mezzo cerchio regolare": regular circular arc (R = 95px, cx = 168, cy = 140) spanning from -55° to +55°
 * - "al centro sfocato": hardware-accelerated frosted glass backdrop-filter: blur(20px)
 * - "la pillola fissa nell' apice della curvatura dell' arco deve essere a filo con le pillole singolo e multiplo":
 *   [ 2x ] pill button at the horizontal apex of the arc curvature with left edge at 14px,
 *   aligning flush ("a filo") with the left edge of the top [ Singolo | Multiplo ] switcher
 * - High-contrast crisp labels (1x and 2x) rendered both as HTML spans and SVG text
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

  // Exact geometry: regular circular arc centered around the vertical midpoint of the capture dock
  // Box: width = 220, height = 280.
  const cx = 168;
  const cy = 140;
  const R = 95;
  const R_in = 80;
  const R_out = 110;
  const degPerOctave = 27.5;
  const maxDeg = 55;

  // Thin regular circular ribbon (thickness = 30px)
  const fanPath = "M 104.9 49.9 A 110 110 0 0 0 104.9 230.1 L 122.1 205.5 A 80 80 0 0 1 122.1 74.5 Z";
  // Regular semi-circle track
  const trackPath = "M 113.5 62.2 A 95 95 0 0 0 113.5 217.8";

  // Map zoom to angle (-27.5° = 1x, 0° = 2x, +27.5° = 4x)
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

  const currentAngle = Math.min(maxDeg, Math.max(-maxDeg, angleForZoom(zoom)));

  const handlePointer = (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 220;
    const scaleY = rect.height / 280;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;

    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;

    const rad = Math.atan2(dy, -dx);
    const deg = (rad * 180) / Math.PI;

    if (deg >= -60 && deg <= 60) {
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

  // Generate radial ticks between -55° and +55°
  // 8 subdivisions per octave (3.4375° step)
  const step = degPerOctave / 8;
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let i = -15; i <= 15; i++) {
    if (i === -8 || i === 0 || i === 8) continue;
    const d = i * step;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(i) === 4 || Math.abs(i) === 12;
    const tlen = isCyan ? 6 : 4;
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
  // Stop 1: 1x (-27.5°, i = -8)
  const rad1 = (-degPerOctave * Math.PI) / 180;
  const stop1 = {
    xIn: cx - (R - 7) * Math.cos(rad1),
    yIn: cy + (R - 7) * Math.sin(rad1),
    xOut: cx - (R + 7) * Math.cos(rad1),
    yOut: cy + (R + 7) * Math.sin(rad1),
    dotX: cx - R * Math.cos(rad1),
    dotY: cy + R * Math.sin(rad1),
  };

  // Stop 2: 2x (0°, i = 0) at the apex of the arc
  const stop2 = {
    xIn: cx - (R - 7),
    yIn: cy,
    xOut: cx - (R + 7),
    yOut: cy,
    dotX: cx - R,
    dotY: cy,
  };

  // Stop 3: Inferiore (+27.5°, i = +8)
  const rad3 = (degPerOctave * Math.PI) / 180;
  const stop3 = {
    xIn: cx - (R - 7) * Math.cos(rad3),
    yIn: cy + (R - 7) * Math.sin(rad3),
    xOut: cx - (R + 7) * Math.cos(rad3),
    yOut: cy + (R + 7) * Math.sin(rad3),
    dotX: cx - R * Math.cos(rad3),
    dotY: cy + R * Math.sin(rad3),
  };

  // End ticks at -55° and +55°
  const radTop = (-maxDeg * Math.PI) / 180;
  const endTop = {
    x1: cx - (R - 8) * Math.cos(radTop),
    y1: cy + (R - 8) * Math.sin(radTop),
    x2: cx - (R + 8) * Math.cos(radTop),
    y2: cy + (R + 8) * Math.sin(radTop),
  };

  const radBottom = (maxDeg * Math.PI) / 180;
  const endBottom = {
    x1: cx - (R - 8) * Math.cos(radBottom),
    y1: cy + (R - 8) * Math.sin(radBottom),
    x2: cx - (R + 8) * Math.cos(radBottom),
    y2: cy + (R + 8) * Math.sin(radBottom),
  };

  // Active glowing bead coordinates
  const currentRad = (currentAngle * Math.PI) / 180;
  const beadX = cx - R * Math.cos(currentRad);
  const beadY = cy + R * Math.sin(currentRad);

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: "220px", height: "280px" }}
      data-camera-controls
    >
      {/* Sfondo sfocato hardware-accelerated ("al centro sfocato") */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: `path("${fanPath}")`,
          WebkitClipPath: `path("${fanPath}")`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          backgroundColor: "rgba(20, 26, 36, 0.45)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 220 280"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Corpo scuro semitrasparente e bordo sottile della fascia sfocata */}
        <path
          d={fanPath}
          fill="rgba(24, 30, 42, 0.35)"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="1"
        />

        {/* Traccia sottile guida dell'arco regolare */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.30)"
          strokeWidth="1.4"
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
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <line
          x1={endBottom.x1}
          y1={endBottom.y1}
          x2={endBottom.x2}
          y2={endBottom.y2}
          stroke="#ffffff"
          strokeWidth="2.6"
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
          x={stop1.dotX + 8}
          y={stop1.dotY + 4}
          textAnchor="start"
          fill="#ffffff"
          stroke="rgba(10, 15, 25, 0.7)"
          strokeWidth="0.8"
          paintOrder="stroke fill"
          fontSize="12.5"
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
          x={stop2.dotX + 8}
          y={stop2.dotY + 4}
          textAnchor="start"
          fill="#ffffff"
          stroke="rgba(10, 15, 25, 0.7)"
          strokeWidth="0.8"
          paintOrder="stroke fill"
          fontSize="12.5"
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
          x1={52}
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
          strokeWidth="36"
          strokeLinecap="round"
          className="cursor-pointer pointer-events-auto touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </svg>

      {/* Pillola interattiva [ 2x ] all'apice dell'arco, a filo con le pillole Singolo/Multiplo */}
      <button
        type="button"
        onClick={() => { onZoom(2); hapticTick(); }}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(24,30,42,0.92)] border border-white/25 px-2.5 py-0.5 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "14px",
          top: `${cy - 12}px`,
        }}
        aria-label="Imposta zoom 2x"
      >
        <span className="text-[11px] font-bold text-white tracking-tight">
          2x
        </span>
      </button>

      {/* Etichette HTML nitide di supporto sovrapposte sui punti 1x e 2x */}
      <span
        className="absolute pointer-events-none select-none text-[12px] font-bold text-white tracking-tight"
        style={{
          left: `${stop1.dotX + 8}px`,
          top: `${stop1.dotY - 8}px`,
          textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
        }}
      >
        1x
      </span>
      <span
        className="absolute pointer-events-none select-none text-[12px] font-bold text-white tracking-tight"
        style={{
          left: `${stop2.dotX + 8}px`,
          top: `${stop2.dotY - 8}px`,
          textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
        }}
      >
        2x
      </span>
    </div>
  );
}
