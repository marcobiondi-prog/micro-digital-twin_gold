import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { zoomLabel, ZOOM_LENSES, ZOOM_MIN } from "@/lib/camera-zoom";
import { dialZoom, DIAL_PX, rulerTicks } from "@/lib/zoom-dial";

/**
 * Xperia-style zoom: the lens chips (the neighbouring stops on the sides, the live value in the larger centre chip)
 * answer a tap, and a sideways swipe on them opens a ruler of the zoom that slides under a fixed centre mark, like
 * the dial of the Xperia camera: swiping left brings the bigger numbers under the mark (zoom in), right zooms out.
 * The ruler is logarithmic, so every doubling (1→2, 2→4) takes the same swipe.
 */
export function ZoomDial({ zoom, max, onZoom, disabled = false, className = "", onRulerChange }: {
  zoom: number; max: number; onZoom: (value: number) => void; disabled?: boolean; className?: string;
  onRulerChange?: (active: boolean) => void;
}) {
  const [dialing, setDialing] = useState(false);
  const [shown, setShown] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; from: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    onRulerChange?.(shown || dialing);
  }, [shown, dialing, onRulerChange]);
  // A zoom changed elsewhere (a pinch, a tapped chip) shows the ruler for a moment too, so one sees where it is.
  const lastZoom = useRef(zoom);
  useEffect(() => {
    if (Math.abs(lastZoom.current - zoom) < 0.05) return;
    lastZoom.current = zoom;
    if (drag.current?.moved) return;
    setShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShown(false), 900);
  }, [zoom]);

  const lenses = ZOOM_LENSES.filter((l) => l <= max + 0.05);
  const lower = [...lenses].reverse().find((l) => l < zoom - 0.05);
  const higher = lenses.find((l) => l > zoom + 0.05);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: zoom, moved: false };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      window.clearTimeout(hideTimer.current);
      setDialing(true);
      setShown(true);
    }
    onZoom(dialZoom(d.from, dx, max));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    swallowClick.current = true;
    setDialing(false);
    // The ruler stays a moment after the finger lifts, then folds back into the chips.
    hideTimer.current = window.setTimeout(() => setShown(false), 900);
  };

  const side = (lens: number | undefined, label: string) => (
    <button type="button" className="ar-zoom-lens" disabled={disabled || lens === undefined}
      aria-label={lens === undefined ? label : `${label}: ${zoomLabel(lens)}`}
      onClick={() => lens !== undefined && onZoom(lens)}>{lens ?? "·"}</button>
  );

  return (
    <div className={`relative mx-auto w-fit ${className}`}>
      {shown && (
        <div className="zoom-ruler" data-dialing={dialing || undefined} aria-hidden="true">
          <div className="zoom-ruler-track" style={{ transform: `translateX(${-Math.log2(Math.max(ZOOM_MIN, zoom)) * DIAL_PX}px)` }}>
            {rulerTicks(max).map((t) => (
              <span key={t.value} className="zoom-ruler-tick" data-major={t.major || undefined} style={{ left: `${Math.log2(t.value) * DIAL_PX}px` }}>
                {t.label && <span className="zoom-ruler-label">{t.label}</span>}
              </span>
            ))}
          </div>
          <span className="zoom-ruler-mark" />
        </div>
      )}
      <div className="ar-zoom-lenses touch-none" role="group" aria-label="Zoom della fotocamera: tocca un numero o scorri di lato" data-camera-controls
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); e.preventDefault(); } }}>
        {side(lower, "Riduci zoom")}
        <button type="button" className="ar-zoom-lens" data-active disabled={disabled}
          aria-label={`Zoom ${zoomLabel(zoom)}: tocca per tornare a 1×`} onClick={() => onZoom(1)}>{zoomLabel(zoom)}</button>
        {side(higher, "Aumenta zoom")}
      </div>
    </div>
  );
}
