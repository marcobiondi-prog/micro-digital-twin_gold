/** Like the tutorial: past 50 px the page turns. */
export const MIN_SWIPE = 50;

/** The tab a horizontal swipe leads to: left goes to the next one, right to the previous; it stops at the ends. A mostly vertical move changes nothing. */
export function simTabSwipeStep(index: number, total: number, dx: number, dy: number): number {
  if (total < 2 || Math.abs(dx) < MIN_SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return index;
  return Math.min(total - 1, Math.max(0, index + (dx < 0 ? 1 : -1)));
}

const OWN_GESTURE = "input, textarea, select, canvas, iframe, [role='slider'], [data-map-gestures], [data-no-tab-swipe], [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

/** True when a touch started on something that uses sideways moves itself (sliders, maps, rows that scroll sideways). */
export function startsOnOwnGesture(target: EventTarget | null, boundary: Element): boolean {
  let el = target instanceof Element ? target : null;
  if (el?.closest(OWN_GESTURE)) return true;
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true;
    el = el.parentElement;
  }
  return false;
}
