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

  const handleClick = () => {
    const isFirstSlide = slideIndex === 0;
    const event = new KeyboardEvent("keydown", { key: isFirstSlide ? "ArrowRight" : "ArrowLeft" });
    window.dispatchEvent(event);
  };

  const isFirstSlide = slideIndex === 0;
  const Arrow = isFirstSlide ? ArrowRight : ArrowLeft;

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 flex justify-center">
      {/* Arrow button */}
      <button
        onClick={handleClick}
        aria-label={isFirstSlide ? "Slide successivo" : "Slide precedente"}
        title={isFirstSlide ? "Slide successivo" : "Slide precedente"}
        className="p-2 text-white transition-all hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Arrow className="size-12" strokeWidth={1.5} />
      </button>
    </div>
  );
}
