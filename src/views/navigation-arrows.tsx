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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isFirstSlide = slideIndex === 0;
    const event = new KeyboardEvent("keydown", { key: isFirstSlide ? "ArrowRight" : "ArrowLeft", bubbles: true });
    window.dispatchEvent(event);
  };

  const isFirstSlide = slideIndex === 0;
  const Arrow = isFirstSlide ? ArrowRight : ArrowLeft;

  return (
    <div className="fixed inset-x-0 bottom-48 z-[999999999] pointer-events-auto flex justify-center">
      {/* Arrow button */}
      <button
        onClick={handleClick}
        aria-label={isFirstSlide ? "Slide successivo" : "Slide precedente"}
        title={isFirstSlide ? "Slide successivo" : "Slide precedente"}
        className="p-8 text-white bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer pointer-events-auto"
      >
        <Arrow className="size-14" strokeWidth={1.5} />
      </button>
    </div>
  );
}
