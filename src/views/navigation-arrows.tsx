import { ArrowRight, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";

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

  const isEven = slideIndex % 2 === 0;
  const Arrow = isEven ? ArrowRight : ArrowLeft;

  return (
    <div aria-hidden="true" className="intro-navigation-arrow pointer-events-none flex h-[clamp(1.75rem,8dvh,3.5rem)] w-full shrink-0 justify-center">
      <div className="text-white">
        <Arrow className="size-[clamp(1.75rem,8dvh,3.5rem)]" strokeWidth={1.5} />
      </div>
    </div>
  );
}
