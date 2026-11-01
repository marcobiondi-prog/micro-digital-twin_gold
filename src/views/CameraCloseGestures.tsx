import { useRef, type ReactNode } from "react";
import { isCameraCloseGesture } from "@/lib/ar-close-swipe";

/**
 * Observe the preview itself: a sideways close only from Android's back strip at the screen's edges, an upward one
 * from the lower quarter. A second finger turns the gesture into a pinch (zoom) and cancels any close swipe in progress.
 */
export function CameraCloseGestures({ onClose, children, rotation = 0, onPinch }: {
  onClose: () => void; children: ReactNode; rotation?: number;
  /** Ratio of the current finger distance to the distance when the pinch started; `start` marks a new pinch. */
  onPinch?: ((ratio: number, start: boolean) => void) | undefined;
}) {
  const startRef = useRef<{ id: number; x: number; y: number; top: number; height: number; sx: number; sy: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<number | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const release = (id: number) => {
    touches.current.delete(id);
    if (touches.current.size < 2) pinchStart.current = null;
  };
  const localPoint = (x: number, y: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    if (rotation === 90) return { x: y - rect.top, y: rect.right - x, height: rect.width };
    if (rotation === -90) return { x: rect.bottom - y, y: x - rect.left, height: rect.width };
    if (rotation === 180) return { x: rect.right - x, y: rect.bottom - y, height: rect.height };
    return { x: x - rect.left, y: y - rect.top, height: rect.height };
  };
  // The sideways close is Android's back gesture: measured on the screen, from its edge strips only.
  const edgeOf = (start: { sx: number; sy: number }, event: { clientX: number; clientY: number }) =>
    ({ startX: start.sx, width: window.innerWidth, dx: event.clientX - start.sx, dy: event.clientY - start.sy });
  return <div className="absolute inset-0 touch-none" data-camera-gestures
    onPointerDownCapture={(event) => {
      const target = event.target;
      const onControl = target instanceof Element && !!target.closest("button, a, input, [data-camera-scroll], [data-camera-controls]") && !target.closest("[data-camera-center-capture]");
      if (event.pointerType === "touch" && !onControl && onPinch) {
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.current.size === 2) {
          // Two fingers: a pinch, never a close swipe.
          startRef.current = null;
          pinchStart.current = spread();
          onPinch(1, true);
          return;
        }
      }
      if (event.pointerType !== "touch" || !event.isPrimary || onControl) {
        startRef.current = null;
        return;
      }
      const point = localPoint(event.clientX, event.clientY, event.currentTarget);
      startRef.current = { id: event.pointerId, x: point.x, y: point.y, top: 0, height: point.height, sx: event.clientX, sy: event.clientY };
    }}
    onPointerMoveCapture={(event) => {
      if (touches.current.has(event.pointerId)) {
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinchStart.current && touches.current.size >= 2) {
          event.preventDefault();
          onPinch?.(spread() / pinchStart.current, false);
          return;
        }
      }
      const start = startRef.current;
      if (!start || start.id !== event.pointerId) return;
      const point = localPoint(event.clientX, event.clientY, event.currentTarget);
      if (!isCameraCloseGesture(point.x - start.x, point.y - start.y, start.y - start.top, start.height, edgeOf(start, event))) return;
      startRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}
    onPointerUpCapture={(event) => {
      const pinching = pinchStart.current !== null;
      release(event.pointerId);
      const start = startRef.current;
      startRef.current = null;
      if (pinching) return;
      const point = localPoint(event.clientX, event.clientY, event.currentTarget);
      if (!start || start.id !== event.pointerId || !isCameraCloseGesture(point.x - start.x, point.y - start.y, start.y - start.top, start.height, edgeOf(start, event))) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}
    onPointerCancelCapture={(event) => { release(event.pointerId); startRef.current = null; }}
  >{children}</div>;
}
