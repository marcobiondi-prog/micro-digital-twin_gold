/** Reference surface when the place has no mapped shape: the piazza the simulation was built on. */
export const REFERENCE_M2 = 4000;

/** Thousands always grouped with a dot, also for 4 digits ("4.000"), as Italian readers expect for m². */
export const grouped = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
