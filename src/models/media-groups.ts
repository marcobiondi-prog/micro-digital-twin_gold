import { mediaTime } from "@/models/media-time";

/** Photos and videos listed in the simulation are folded in groups of this many. */
export const MEDIA_GROUP = 20;
export const groupsOf = <T,>(list: T[], size = MEDIA_GROUP) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, g) => list.slice(g * size, g * size + size));
/**
 * Groups by upload: the first 20 files loaded make Gruppo 1, the next 20 Gruppo 2, and so on, so a group never changes
 * once full and every 20th upload starts a new one. Returned newest group first, each with its files newest first.
 */
export function uploadGroups<T extends { id: string; path?: string | undefined }>(list: T[], size = MEDIA_GROUP) {
  // Oldest first by the time in the file's name; a file without one keeps its place among the oldest.
  const oldest = list.map((it, i) => ({ it, t: mediaTime(it) ?? 0, i: list.length - i }))
    .sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.it);
  return groupsOf(oldest, size).map((files, g) => ({ n: g + 1, files: [...files].reverse(), full: files.length === size })).reverse();
}
