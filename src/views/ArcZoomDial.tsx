import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Curved radial arc zoom wheel for landscape mode.
 * Perfectly replicates the design mockup in image.png.
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

  // Curvature center corresponds to the shutter center
  const cx = 150;
  const cy = 130;
  const R = 120;
  const degPerOctave = 34;

  // Map zoom to angle (-34° = 1x, 0° = 2x, +34° = 4x)
  const angleForZoom = (z: number) => {
    return (Math.log2(Math.max(ZOOM_MIN, z)) - 1) * degPerOctave;
  };

  const zoomForAngle = (deg: number) => {
    const raw = Math.pow(2, deg / degPerOctave + 1);
    const clamped = Math.min(max, Math.max(0.5, raw));
    // Snap to major stops (1x, 2x)
    if (Math.abs(clamped - 1) < 0.12) return 1;
    if (Math.abs(clamped - 2) < 0.14) return 2;
    if (Math.abs(clamped - 0.5) < 0.08) return 0.5;
    return Math.round(clamped * 10) / 10;
  };

  const currentAngle = Math.min(50, Math.max(-50, angleForZoom(zoom)));

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / 200;
    const scaleY = rect.height / 260;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;

    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;

    // Angle relative to -X direction (pointing leftward from shutter)
    const rad = Math.atan2(dy, -dx);
    const deg = (rad * 180) / Math.PI;

    if (deg >= -58 && deg <= 58) {
      const nextZoom = zoomForAngle(deg);
      if (Math.abs(nextZoom - lastHapticZoom.current) >= 0.1) {
        lastHapticZoom.current = nextZoom;
        hapticTick();
      }
      onZoom(nextZoom);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    handlePointer(e);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = false;
  };

  // Generate ticks between -50° and +50°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number }> = [];
  for (let d = -48; d <= 48; d += 2.6) {
    // Skip near stops to avoid tick clutter
    if (Math.abs(d - (-34)) < 1.8 || Math.abs(d) < 1.8 || Math.abs(d - 34) < 1.8) continue;
    const rad = (d * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    ticks.push({
      deg: d,
      x1: cx - (R - 3.5) * cos,
      y1: cy + (R - 3.5) * sin,
      x2: cx - (R + 3.5) * cos,
      y2: cy + (R + 3.5) * sin,
    });
  }

  // Pre-calculate stops
  const rad1 = (-34 * Math.PI) / 180;
  const stop1 = {
    xIn: cx - (R - 7) * Math.cos(rad1),
    yIn: cy + (R - 7) * Math.sin(rad1),
    xOut: cx - (R + 7) * Math.cos(rad1),
    yOut: cy + (R + 7) * Math.sin(rad1),
    dotX: cx - R * Math.cos(rad1),
    dotY: cy + R * Math.sin(rad1),
    labelX: cx - (R - 14) * Math.cos(rad1),
    labelY: cy + (R - 14) * Math.sin(rad1),
  };

  const rad2 = 0;
  const stop2 = {
    xIn: cx - (R - 7),
    yIn: cy,
    xOut: cx - (R + 7),
    yOut: cy,
    dotX: cx - R,
    dotY: cy,
    labelX: cx - (R - 14),
    labelY: cy,
  };

  const rad3 = (34 * Math.PI) / 180;
  const stop3 = {
    xIn: cx - (R - 7) * Math.cos(rad3),
    yIn: cy + (R - 7) * Math.sin(rad3),
    xOut: cx - (R + 7) * Math.cos(rad3),
    yOut: cy + (R + 7) * Math.sin(rad3),
    dotX: cx - R * Math.cos(rad3),
    dotY: cy + R * Math.sin(rad3),
  };

  // End ticks
  const radTop = (-52 * Math.PI) / 180;
  const endTop = {
    x1: cx - (R - 6) * Math.cos(radTop),
    y1: cy + (R - 6) * Math.sin(radTop),
    x2: cx - (R + 6) * Math.cos(radTop),
    y2: cy + (R + 6) * Math.sin(radTop),
  };

  const radBottom = (52 * Math.PI) / 180;
  const endBottom = {
    x1: cx - (R - 6) * Math.cos(radBottom),
    y1: cy + (R - 6) * Math.sin(radBottom),
    x2: cx - (R + 6) * Math.cos(radBottom),
    y2: cy + (R + 6) * Math.sin(radBottom),
  };

  // Active bead coordinates
  const currentRad = (currentAngle * Math.PI) / 180;
  const beadX = cx - R * Math.cos(currentRad);
  const beadY = cy + R * Math.sin(currentRad);

  return (
    <div
      className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none z-10 flex items-center justify-end ${className}`}
      style={{ width: "200px", height: "260px" }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox="0 0 200 260"
        className="w-full h-full overflow-visible touch-none cursor-pointer pointer-events-auto"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`Ghiera zoom: ${zoomLabel(zoom)}`}
        role="slider"
        aria-valuenow={zoom}
        aria-valuemin={0.5}
        aria-valuemax={max}
      >
        <defs>
          <filter id="cyanGlowRef" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00e5ff" floodOpacity="0.9" />
          </filter>
          <filter id="dialSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Wide smoked-glass curved background band */}
        <path
          d="M 80 32 A 120 120 0 0 0 80 228"
          fill="none"
          stroke="rgba(24, 30, 40, 0.52)"
          strokeWidth="46"
          strokeLinecap="round"
          filter="url(#dialSoftShadow)"
        />

        {/* Fine curved track guide */}
        <path
          d="M 80 32 A 120 120 0 0 0 80 228"
          fill="none"
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Minor radial ticks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ))}

        {/* End ticks */}
        <line
          x1={endTop.x1}
          y1={endTop.y1}
          x2={endTop.x2}
          y2={endTop.y2}
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1={endBottom.x1}
          y1={endBottom.y1}
          x2={endBottom.x2}
          y2={endBottom.y2}
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Stop 1 (1x): Cyan line, dot, label */}
        <line
          x1={stop1.xIn}
          y1={stop1.yIn}
          x2={stop1.xOut}
          y2={stop1.yOut}
          stroke="#00e5ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#cyanGlowRef)"
        />
        <circle cx={stop1.dotX} cy={stop1.dotY} r={2.5} fill="#ffffff" />
        <text
          x={stop1.labelX + 2}
          y={stop1.labelY + 4}
          textAnchor="start"
          fill="rgba(255, 255, 255, 0.85)"
          fontSize="11"
          fontWeight="600"
          className="pointer-events-none select-none"
        >
          1x
        </text>

        {/* Stop 2 (2x): Cyan line, dot, label */}
        <line
          x1={stop2.xIn}
          y1={stop2.yIn}
          x2={stop2.xOut}
          y2={stop2.yOut}
          stroke="#00e5ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#cyanGlowRef)"
        />
        <circle cx={stop2.dotX} cy={stop2.dotY} r={2.5} fill="#ffffff" />
        <text
          x={stop2.labelX + 2}
          y={stop2.labelY + 4}
          textAnchor="start"
          fill="rgba(255, 255, 255, 0.85)"
          fontSize="11"
          fontWeight="600"
          className="pointer-events-none select-none"
        >
          2x
        </text>

        {/* Stop 3 (Bottom): Cyan line, dot */}
        <line
          x1={stop3.xIn}
          y1={stop3.yIn}
          x2={stop3.xOut}
          y2={stop3.yOut}
          stroke="#00e5ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#cyanGlowRef)"
        />
        <circle cx={stop3.dotX} cy={stop3.dotY} r={2.5} fill="#ffffff" />

        {/* Active Pill at 2x stop (or current zoom position): connecting cyan line */}
        <line
          x1={cx - R - 20}
          y1={cy}
          x2={cx - R - 7}
          y2={cy}
          stroke="#00e5ff"
          strokeWidth="2.2"
          strokeLinecap="round"
          filter="url(#cyanGlowRef)"
        />

        {/* Interactive Glowing Bead on Track */}
        <circle
          cx={beadX}
          cy={beadY}
          r={5}
          fill="#ffffff"
          stroke="#00e5ff"
          strokeWidth="2"
          filter="url(#cyanGlowRef)"
        />
      </svg>

      {/* Pill Badge matching image.png at 2x position */}
      <button
        type="button"
        onClick={() => { onZoom(2); hapticTick(); }}
        className="absolute pointer-events-auto flex items-center justify-center rounded-full bg-[rgba(26,32,42,0.88)] border border-white/20 px-2.5 py-0.5 shadow-lg active:scale-95 transition-transform"
        style={{
          left: `${cx - R - 48}px`,
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
