import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "@tanstack/react-router";

export function NavigationArrows() {
  const location = useLocation();
  const isIntro = location.pathname === "/" || location.pathname === "/scegli";

  if (!isIntro) return null;

  const handlePrev = () => {
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
    window.dispatchEvent(event);
  };

  const handleNext = () => {
    const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
    window.dispatchEvent(event);
  };

  return (
    <div className="fixed inset-x-0 bottom-32 z-50 flex justify-center gap-8">
      {/* Back arrow */}
      <button
        onClick={handlePrev}
        aria-label="Slide precedente"
        title="Slide precedente"
        className="rounded-full bg-white/40 p-3 text-white shadow-lg transition-all hover:bg-white/60 active:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        <ChevronLeft className="size-8" strokeWidth={3} />
      </button>

      {/* Forward arrow */}
      <button
        onClick={handleNext}
        aria-label="Slide successivo"
        title="Slide successivo"
        className="rounded-full bg-white/40 p-3 text-white shadow-lg transition-all hover:bg-white/60 active:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        <ChevronRight className="size-8" strokeWidth={3} />
      </button>
    </div>
  );
}
