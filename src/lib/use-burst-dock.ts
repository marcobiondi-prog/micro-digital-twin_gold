import { useCallback, useEffect, useRef } from "react";
import { hapticTick } from "@/lib/haptics";

/**
 * Shared hook for Mac Dock (Genius/Fisheye) magnification effect and adaptive haptic feedback
 * on photo burst carousels (both AI camera ArCamera and standard camera SystemCamera).
 * Magnification is centered on the horizontal center of the viewport (window.innerWidth / 2).
 */
export function useBurstDock(active: boolean, count: number) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const lastCenteredIdRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef(0);
  const lastScrollLeftRef = useRef(0);

  const updateDockEffect = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const targetCenterX = rect.width >= window.innerWidth * 0.75
      ? window.innerWidth / 2
      : (rect.left + rect.width / 2);
    const items = container.querySelectorAll<HTMLElement>("[data-burst-item]");
    const maxRadius = 140;

    let closestId: number | null = null;
    let minDistance = Infinity;

    items.forEach((item, index) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenterX = itemRect.left + itemRect.width / 2;
      const dist = Math.abs(targetCenterX - itemCenterX);
      if (dist < minDistance) {
        minDistance = dist;
        const rawId = item.getAttribute("data-burst-id");
        closestId = rawId !== null ? Number(rawId) : index;
      }
      if (dist < maxRadius) {
        const factor = (1 + Math.cos((dist / maxRadius) * Math.PI)) / 2;
        const scale = 0.88 + 0.44 * factor;
        const lift = -14 * factor;
        item.style.transform = `scale(${scale.toFixed(3)}) translateY(${lift.toFixed(1)}px)`;
        item.style.zIndex = factor > 0.25 ? "25" : "10";
      } else {
        item.style.transform = "scale(0.88) translateY(0px)";
        item.style.zIndex = "1";
      }
    });

    // Feedback adattivo allo scrolling: vibrazione tattile ogni volta che una nuova foto
    // passa esattamente al centro dello schermo. L'impulso si adatta alla velocità dello scorrimento.
    if (closestId !== null && minDistance < 36 && closestId !== lastCenteredIdRef.current) {
      lastCenteredIdRef.current = closestId;
      const now = performance.now();
      const dt = Math.max(1, now - lastScrollTimeRef.current);
      const dx = Math.abs(container.scrollLeft - lastScrollLeftRef.current);
      const velocity = dx / dt; // px / ms
      lastScrollTimeRef.current = now;
      lastScrollLeftRef.current = container.scrollLeft;

      // Scorrimento veloce -> click tattile secco e corto (10-12ms)
      // Scorrimento lento o arresto sul centro -> detent tattile pieno e morbido (15-18ms)
      const pulseDuration = Math.round(Math.max(10, Math.min(18, 18 - velocity * 4)));
      hapticTick(pulseDuration);
    }
  }, []);

  useEffect(() => {
    if (active && count > 0) {
      const id = requestAnimationFrame(updateDockEffect);
      return () => cancelAnimationFrame(id);
    }
  }, [active, count, updateDockEffect]);

  useEffect(() => {
    if (!active || count === 0) return;
    const onResize = () => updateDockEffect();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [active, count, updateDockEffect]);

  return { carouselRef, updateDockEffect };
}
