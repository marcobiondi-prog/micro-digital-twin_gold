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
    const event = new KeyboardEvent("keydown", { key: slideIndex % 2 === 0 ? "ArrowRight" : "ArrowLeft" });
    window.dispatchEvent(event);
  };

  const isEven = slideIndex % 2 === 0;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center">
      {/* Custom arrow with long tail */}
      <button
        onClick={handleClick}
        aria-label={isEven ? "Slide successivo" : "Slide precedente"}
        title={isEven ? "Slide successivo" : "Slide precedente"}
        className="p-4 text-white transition-all hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ transform: isEven ? "scaleX(1)" : "scaleX(-1)" }}
        >
          {/* Long tail */}
          <line x1="2" y1="24" x2="35" y2="24" stroke="currentColor" strokeWidth="1.5" />
          {/* Arrow head */}
          <polyline
            points="35,24 42,17 42,31"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
