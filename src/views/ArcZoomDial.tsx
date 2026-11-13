import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Curved radial arc zoom wheel for landscape mode.
 * Perfectly matches image_2.png and reference specifications:
 * - Large sweeping arc radius (R = 138px) with wide frosted glass blurred background (backdrop-filter: blur(24px))
 * - Real 1x and 2x prominent labels with glowing dots and stops
 * - Sferetta luminosa / 3D glass bead indicator sliding along the track
 * - [ 2x ] capsule pill badge seamlessly connected via cyan neon tick
 * - Dedicated touch track that NEVER blocks the shutter button or capture controls
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

  // Exact geometry measured from image_2.png (shutter at (228, 170), arc center at (282, 170))
  const cx = 282;
  const cy = 170;
  const R = 138;
  const R_in = 100;
  const R_out = 168;
  const degPerOctave = 26.3;

  const fanPath = "M 169.6 45.2 A 168.0 168.0 0 0 0 188.1 309.3 L 226.1 252.9 A 100.0 100.0 0 0 1 215.1 95.7 Z";
  const trackPath = "M 189.7 67.4 A 138.0 138.0 0 0 0 204.8 284.4";

  // Map zoom to angle (-26.3° = 1x, 0° = 2x, +26.3° = 4x)
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

  const currentAngle = Math.min(52, Math.max(-46, angleForZoom(zoom)));

  const handlePointer = (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 280;
    const scaleY = rect.height / 340;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;

    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;

    const rad = Math.atan2(dy, -dx);
    const deg = (rad * 180) / Math.PI;

    if (deg >= -52 && deg <= 60) {
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

  // Generate radial ticks between -44° and +52°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isCyan?: boolean }> = [];
  for (let d = -44; d <= 52; d += 2.5) {
    if (Math.abs(d - (-26.3)) < 1.6 || Math.abs(d) < 1.6 || Math.abs(d - 26.3) < 1.6) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const isCyan = Math.abs(d - (-36)) < 1.3 || Math.abs(d - (-14)) < 1.3 || Math.abs(d - 14) < 1.3 || Math.abs(d - 38) < 1.3;
    ticks.push({
      deg: d,
      x1: cx - (R - (isCyan ? 5 : 4)) * cos,
      y1: cy + (R - (isCyan ? 5 : 4)) * sin,
      x2: cx - (R + (isCyan ? 5 : 4)) * cos,
      y2: cy + (R + (isCyan ? 5 : 4)) * sin,
      isCyan,
    });
  }

  // Preset stop coordinates
  const rad1 = (-26.3 * Math.PI) / 180;
  const stop1 = {
    xIn: cx - (R - 7) * Math.cos(rad1),
    yIn: cy + (R - 7) * Math.sin(rad1),
    xOut: cx - (R + 7) * Math.cos(rad1),
    yOut: cy + (R + 7) * Math.sin(rad1),
    dotX: cx - R * Math.cos(rad1),
    dotY: cy + R * Math.sin(rad1),
    labelX: cx - (R - 15) * Math.cos(rad1),
    labelY: cy + (R - 15) * Math.sin(rad1),
  };

  const stop2 = {
    xIn: cx - (R - 7),
    yIn: cy,
    xOut: cx - (R + 7),
    yOut: cy,
    dotX: cx - R,
    dotY: cy,
    labelX: cx - (R - 15),
    labelY: cy,
  };

  const rad3 = (26.3 * Math.PI) / 180;
  const stop3 = {
    xIn: cx - (R - 7) * Math.cos(rad3),
    yIn: cy + (R - 7) * Math.sin(rad3),
    xOut: cx - (R + 7) * Math.cos(rad3),
    yOut: cy + (R + 7) * Math.sin(rad3),
    dotX: cx - R * Math.cos(rad3),
    dotY: cy + R * Math.sin(rad3),
  };

  // End ticks
  const radTop = (-48 * Math.PI) / 180;
  const endTop = {
    x1: cx - (R - 6) * Math.cos(radTop),
    y1: cy + (R - 6) * Math.sin(radTop),
    x2: cx - (R + 6) * Math.cos(radTop),
    y2: cy + (R + 6) * Math.sin(radTop),
  };

  const radBottom = (56 * Math.PI) / 180;
  const endBottom = {
    x1: cx - (R - 6) * Math.cos(radBottom),
    y1: cy + (R - 6) * Math.sin(radBottom),
    x2: cx - (R + 6) * Math.cos(radBottom),
    y2: cy + (R + 6) * Math.sin(radBottom),
  };

  // Active glowing bead coordinates
  const currentRad = (currentAngle * Math.PI) / 180;
  const beadX = cx - R * Math.cos(currentRad);
  const beadY = cy + R * Math.sin(currentRad);

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: "280px", height: "340px" }}
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
          backgroundColor: "rgba(20, 26, 36, 0.52)",
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 280 340"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="beadShine" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#d4f7f9" />
            <stop offset="100%" stopColor="#9ff0f5" />
          </radialGradient>
          <filter id="cyanGlowDial" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00e5ff" floodOpacity="0.95" />
          </filter>
          <filter id="dialSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="12" floodColor="#000000" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Corpo scuro semitrasparente e bordo della fascia sfocata */}
        <path
          d={fanPath}
          fill="rgba(22, 28, 40, 0.42)"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1"
          filter="url(#dialSoftShadow)"
        />

        {/* Traccia sottile guida dell'arco */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.22)"
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
            stroke={t.isCyan ? "#00e5ff" : "rgba(255, 255, 255, 0.45)"}
            strokeWidth={t.isCyan ? "1.8" : "1.2"}
            strokeLinecap="round"
            filter={t.isCyan ? "url(#cyanGlowDial)" : undefined}
          />
        ))}

        {/* Tacche bianche marcate alle estremità superiore e inferiore */}
        <line
          x1={endTop.x1}
          y1={endTop.y1}
          x2={endTop.x2}
          y2={endTop.y2}
          stroke="rgba(255, 255, 255, 0.95)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1={endBottom.x1}
          y1={endBottom.y1}
          x2={endBottom.x2}
          y2={endBottom.y2}
          stroke="rgba(255, 255, 255, 0.95)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Stop 1 (1x): Tacca ciano neon, pallino bianco ed etichetta 1x */}
        <line
          x1={stop1.xIn}
          y1={stop1.yIn}
          x2={stop1.xOut}
          y2={stop1.yOut}
          stroke="#00e5ff"
          strokeWidth="2.6"
          strokeLinecap="round"
          filter="url(#cyanGlowDial)"
        />
        <circle cx={stop1.dotX} cy={stop1.dotY} r={2.5} fill="#ffffff" />
        <text
          x={stop1.dotX + 8}
          y={stop1.dotY + 4}
          textAnchor="start"
          fill="#ffffff"
          fontSize="11.5"
          fontWeight="600"
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
          stroke="#00e5ff"
          strokeWidth="2.6"
          strokeLinecap="round"
          filter="url(#cyanGlowDial)"
        />
        <circle cx={stop2.dotX} cy={stop2.dotY} r={2.5} fill="#ffffff" />
        <text
          x={stop2.dotX + 8}
          y={stop2.dotY + 4}
          textAnchor="start"
          fill="#ffffff"
          fontSize="11.5"
          fontWeight="600"
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
          stroke="#00e5ff"
          strokeWidth="2.6"
          strokeLinecap="round"
          filter="url(#cyanGlowDial)"
        />
        <circle cx={stop3.dotX} cy={stop3.dotY} r={2.5} fill="#ffffff" />

        {/* Connettore ciano neon continuo verso la pillola [ 2x ] */}
        <line
          x1={114}
          y1={cy}
          x2={stop2.dotX - 2.5}
          y2={cy}
          stroke="#00e5ff"
          strokeWidth="2.4"
          strokeLinecap="round"
          filter="url(#cyanGlowDial)"
        />

        {/* Sferetta / bead luminosa che segue fluidamente lo zoom come un cursore di vetro */}
        <circle
          cx={beadX}
          cy={beadY}
          r={5.5}
          fill="url(#beadShine)"
          stroke="#00e5ff"
          strokeWidth="2.2"
          filter="url(#cyanGlowDial)"
        />

        {/* ZONA TOUCH DEDICATA: traccia trasparente larga 36px lungo l'arco
            Intercetta solo le dita che toccano la ghiera a sinistra, senza coprire lo shutter o i pulsanti */}
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

      {/* Pillola interattiva [ 2x ] collegata al connettore ciano neon */}
      <button
        type="button"
        onClick={() => { onZoom(2); hapticTick(); }}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(26,32,44,0.92)] border border-white/25 px-2.5 py-0.5 shadow-xl active:scale-95 transition-transform"
        style={{
          left: "74px",
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
