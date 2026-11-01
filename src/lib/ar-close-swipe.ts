/** Deliberate upward or leftward swipes; taps, right/down and diagonals stay inert. */
export function isArCloseSwipe(dx: number, dy: number) {
  return (dy <= -64 && -dy >= Math.abs(dx) * 1.5) ||
    (dx <= -64 && -dx >= Math.abs(dy) * 1.5);
}

/** Android's back-gesture strip along each side of the screen (about its default width, in CSS px ≈ dp). */
export const BACK_EDGE_PX = 32;

/**
 * A sideways swipe that closes like Android's back gesture: it starts inside the strip along the left or right edge of
 * the screen and moves inwards (from the left edge to the right, from the right edge to the left), clearly sideways.
 * Screen coordinates, since the system's strip belongs to the screen, not to a turned camera surface.
 */
export function isEdgeBackSwipe(startX: number, width: number, dx: number, dy: number) {
  const sideways = Math.abs(dx) >= 64 && Math.abs(dx) >= Math.abs(dy) * 1.5;
  if (!sideways) return false;
  return (startX <= BACK_EDGE_PX && dx > 0) || (startX >= width - BACK_EDGE_PX && dx < 0);
}

/**
 * The cameras close sideways only from Android's back strip at the screen's edges (swipes across the middle of the
 * preview — zoom dial, pages, tutorial — never close), or upward from the lower quarter of the preview.
 */
export function isCameraCloseGesture(dx: number, dy: number, startY: number, height: number, edge?: { startX: number; width: number; dx: number; dy: number }) {
  const up = dy <= -64 && -dy >= Math.abs(dx) * 1.5 && startY >= height * 0.75;
  return up || (!!edge && isEdgeBackSwipe(edge.startX, edge.width, edge.dx, edge.dy));
}
