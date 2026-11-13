import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";

/**
 * Curved radial arc zoom wheel for landscape mode.
 * Wraps gracefully around the shutter button, matching the design mockup in image_2.png.
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
  const [active, setActive] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastHapticZoom = useRef(zoom);

  // Shutter is positioned to the right of the dial; curvature center is at the right edge.
  const cx = 115;
  const cy = 110;
  const R = 86;
  const degPerOctave = 28;

  // Map zoom to angle (-56° = 0.5x, -28° = 1x, 0° = 2x, +28° = 4x)
  const angleForZoom = (z: number) => {
    return (Math.log2(Math.max(ZOOM_MIN, z)) - 1) * degPerOctave;
  };

  const zoomForAngle = (deg: number) => {
    const raw = Math.pow(2, deg / degPerOctave + 1);
    const clamped = Math.min(max, Math.max(0.5, raw));
    // Snap to major stops
    if (Math.abs(clamped - 1) < 0.1) return 1;
    if (Math.abs(clamped - 2) < 0.12) return 2;
    if (Math.abs(clamped - 0.5) < 0.08) return 0.5;
    return Math.round(clamped * 10) / 10;
  };

  const currentAngle = Math.min(52, Math.max(-52, angleForZoom(zoom)));

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    // Shutter center relative to SVG: cx, cy scaled to rect
    const scaleX = rect.width / 115;
    const scaleY = rect.height / 220;
    const screenCx = rect.left + cx * scaleX;
    const screenCy = rect.top + cy * scaleY;

    const dx = e.clientX - screenCx;
    const dy = e.clientY - screenCy;

    // Angle relative to -X direction (leftward)
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

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragging.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    handlePointer(e);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    setActive(false);
  };

  // Generate radial ticks between -48° and +48°
  const ticks: Array<{ deg: number; x1: number; y1: number; x2: number; y2: number; isMajor: boolean; isCyan: boolean }> = [];
  for (let d = -48; d <= 48; d += 3.5) {
    const isStop1 = Math.abs(d - angleForZoom(1)) < 1.5;
    const isStop2 = Math.abs(d - angleForZoom(2)) < 1.5;
    const isMajor = isStop1 || isStop2 || Math.abs(d) < 1;
    const isCyan = isStop1 || isStop2;

    const rad = (d * Math.PI) / 180;
    const rIn = isMajor ? R - 6 : R - 3.5;
    const rOut = isMajor ? R + 6 : R + 3.5;

    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    ticks.push({
      deg: d,
      x1: cx - rIn * cos,
      y1: cy + rIn * sin,
      x2: cx - rOut * cos,
      y2: cy + rOut * sin,
      isMajor,
      isCyan,
    });
  }

  // Pre-calculate preset stop coordinates
  const rad1 = (angleForZoom(1) * Math.PI) / 180;
  const stop1 = {
    x: cx - R * Math.cos(rad1),
    y: cy + R * Math.sin(rad1),
    labelX: cx - (R - 14) * Math.cos(rad1),
    labelY: cy + (R - 14) * Math.sin(rad1),
  };

  const rad2 = (angleForZoom(2) * Math.PI) / 180;
  const stop2 = {
    x: cx - R * Math.cos(rad2),
    y: cy + R * Math.sin(rad2),
    labelX: cx - (R - 14) * Math.cos(rad2),
    labelY: cy + (R - 14) * Math.sin(rad2),
  };

  // Active bead on track
  const currentRad = (currentAngle * Math.PI) / 180;
  const currentCos = Math.cos(currentRad);
  const currentSin = Math.sin(currentRad);
  const beadX = cx - R * currentCos;
  const beadY = cy + R * currentSin;

  // Active pill badge position (offset to the left of the bead)
  const pillX = beadX - 28;
  const pillY = beadY;

  return (
    <div
      className={`relative select-none pointer-events-auto flex items-center justify-end ${className}`}
      style={{ width: "115px", height: "220px" }}
      data-camera-controls
    >
      <svg
        ref={svgRef}
        viewBox="0 0 115 220"
        className="w-full h-full overflow-visible touch-none cursor-pointer"
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
          <radialGradient id="arcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
          </radialGradient>
          <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00e5ff" floodOpacity="0.85" />
          </filter>
        </defs>

        {/* Outer curved translucent background band */}
        <path
          d="M 64 36 A 86 86 0 0 0 64 184"
          fill="none"
          stroke="rgba(18, 24, 32, 0.62)"
          strokeWidth="32"
          strokeLinecap="round"
        />

        {/* Curved guide track line */}
        <path
          d="M 64 36 A 86 86 0 0 0 64 184"
          fill="none"
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Radial ticks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isCyan ? "#00e5ff" : t.isMajor ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.35)"}
            strokeWidth={t.isCyan ? 2 : t.isMajor ? 1.5 : 1}
            strokeLinecap="round"
          />
        ))}

        {/* Preset Stop 1x: Dot & Label */}
        <circle cx={stop1.x} cy={stop1.y} r={2.5} fill="#ffffff" />
        <text
          x={stop1.labelX}
          y={stop1.labelY + 3.5}
          textAnchor="start"
          fill="rgba(255, 255, 255, 0.85)"
          fontSize="10"
          fontWeight="600"
          className="pointer-events-none select-none"
        >
          1x
        </text>

        {/* Preset Stop 2x: Dot & Label */}
        <circle cx={stop2.x} cy={stop2.y} r={2.5} fill="#ffffff" />
        <text
          x={stop2.labelX}
          y={stop2.labelY + 3.5}
          textAnchor="start"
          fill="rgba(255, 255, 255, 0.85)"
          fontSize="10"
          fontWeight="600"
          className="pointer-events-none select-none"
        >
          2x
        </text>

        {/* Connection tick from active pill to track */}
        <line
          x1={beadX - 11}
          y1={beadY}
          x2={beadX - 2}
          y2={beadY}
          stroke="#00e5ff"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#cyanGlow)"
        />

        {/* Active glowing bead on track */}
        <circle
          cx={beadX}
          cy={beadY}
          r={5}
          fill="#ffffff"
          stroke="#00e5ff"
          strokeWidth="2"
          filter="url(#cyanGlow)"
        />
      </svg>

      {/* Floating active zoom pill badge */}
      <div
        className="absolute pointer-events-none transition-transform duration-75 flex items-center justify-center rounded-full bg-[#161d26]/90 border border-white/25 px-2 py-0.5 shadow-md"
        style={{
          left: `${pillX - 16}px`,
          top: `${pillY - 11}px`,
        }}
      >
        <span className="text-[11px] font-bold text-white tabular-nums tracking-tight">
          {zoomLabel(zoom)}
        </span>
      </div>
    </div>
  );
}
