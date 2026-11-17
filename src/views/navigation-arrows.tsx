import { ArrowRight, ArrowLeft } from "lucide-react";
import { useState, useEffect, useLayoutEffect, useRef } from "react";

export function NavigationArrows() {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        setSlideIndex((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  // On phones held upright the arrow is fixed to the screen: it sits a little under the hello's last line
  // ([data-intro-lead]) whatever the screen's height, never on it, and never down on the dots.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const phone = window.matchMedia("(orientation: portrait) and (max-width: 640px)");
    const place = () => {
      const el = ref.current;
      const lead = document.querySelector<HTMLElement>("[data-intro-lead]");
      if (!el) return;
      if (!phone.matches || !lead) { el.style.top = ""; return; }
      let y = lead.offsetHeight;
      for (let n: HTMLElement | null = lead; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
      const half = el.offsetHeight / 2;
      el.style.top = `${Math.min(y + 18 + half, window.innerHeight * 0.86)}px`;
    };
    place();
    const late = window.setTimeout(place, 700);
    window.addEventListener("resize", place);
    phone.addEventListener("change", place);
    return () => { window.clearTimeout(late); window.removeEventListener("resize", place); phone.removeEventListener("change", place); };
  }, []);

  const isEven = slideIndex % 2 === 0;
  const Arrow = isEven ? ArrowRight : ArrowLeft;

  return (
    <div ref={ref} aria-hidden="true" className="intro-navigation-arrow pointer-events-none flex h-[clamp(1.75rem,8dvh,3.5rem)] w-full shrink-0 justify-center">
      <div className="text-white">
        <Arrow className="size-[clamp(1.75rem,8dvh,3.5rem)]" strokeWidth={1.5} />
      </div>
    </div>
  );
}
