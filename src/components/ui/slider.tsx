import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/haptics";

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  /** Optional vibration pattern for the value being reached (e.g. stronger near a critical point). */
  hapticFor?: ((value: number) => number[]) | undefined;
};

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, onValueChange, hapticFor, "aria-label": ariaLabel, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center pointer-coarse:py-3", className)}
      {...props}
      onValueChange={(v) => {
        hapticTick(hapticFor ? hapticFor(v[0] ?? 0) : undefined);
        onValueChange?.(v);
      }}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {/* The name goes on the thumb, the element with role="slider", so screen readers announce it. */}
      <SliderPrimitive.Thumb data-slot="slider-thumb" aria-label={ariaLabel} className="relative block h-4 w-4 rounded-full pointer-coarse:h-6 pointer-coarse:w-6 after:absolute after:-inset-3 after:content-[''] border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
