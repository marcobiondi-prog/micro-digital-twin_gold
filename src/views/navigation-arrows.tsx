import { ChevronLeft, ChevronRight } from "lucide-react";

export function NavigationArrows() {
  const handleBack = () => {
    window.history.back();
  };

  const handleForward = () => {
    window.history.forward();
  };

  return (
    <>
      {/* Back arrow */}
      <button
        onClick={handleBack}
        aria-label="Indietro"
        title="Indietro (freccia sinistra)"
        className="fixed left-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-white/40 p-3 text-white shadow-lg transition-all hover:bg-white/60 active:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        <ChevronLeft className="size-8" strokeWidth={3} />
      </button>

      {/* Forward arrow */}
      <button
        onClick={handleForward}
        aria-label="Avanti"
        title="Avanti (freccia destra)"
        className="fixed right-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-white/40 p-3 text-white shadow-lg transition-all hover:bg-white/60 active:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        <ChevronRight className="size-8" strokeWidth={3} />
      </button>
    </>
  );
}
