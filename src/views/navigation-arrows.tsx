import { ArrowRight } from "lucide-react";

export function NavigationArrows() {
  const handleNext = () => {
    const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
    window.dispatchEvent(event);
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center">
      {/* Forward arrow */}
      <button
        onClick={handleNext}
        aria-label="Slide successivo"
        title="Slide successivo"
        className="text-white transition-all hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        <ArrowRight className="size-6" strokeWidth={1.5} />
      </button>
    </div>
  );
}
