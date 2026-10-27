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
    <div className="fixed inset-x-0 bottom-80 z-50 flex justify-center pointer-events-none">
      <div className="text-white">
        <Arrow className="size-14" strokeWidth={1.5} />
      </div>
    </div>
  );
}
