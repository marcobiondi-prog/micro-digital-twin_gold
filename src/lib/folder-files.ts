/**
 * Photos and videos from a folder of the computer: a folder picked with the browser's folder input, or files and
 * folders dragged onto the page (read recursively through webkitGetAsEntry). Only images and videos are kept, by
 * type or, when the browser gives no type, by extension.
 */
const MEDIA_EXT = /\.(jpe?g|png|webp|heic|heif|gif|avif|bmp|tiff?|mp4|mov|webm|m4v|3gp|avi|mkv)$/i;

export function isMediaFile(f: File): boolean {
  return f.type.startsWith("image/") || f.type.startsWith("video/") || (!f.type && MEDIA_EXT.test(f.name));
}

export function mediaOnly(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter(isMediaFile);
}

type Entry = { isFile: boolean; isDirectory: boolean; file?: (ok: (f: File) => void, ko: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (e: Entry[]) => void, ko: (e: unknown) => void) => void } };

async function readEntry(entry: Entry, out: File[], depth = 0): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File | null>((ok) => entry.file!(ok, () => ok(null)));
    if (f) out.push(f);
  } else if (entry.isDirectory && entry.createReader && depth < 8) {
    const reader = entry.createReader();
    // readEntries answers in pages: read until it gives nothing more.
    for (;;) {
      const batch = await new Promise<Entry[]>((ok) => reader.readEntries(ok, () => ok([])));
      if (!batch.length) break;
      for (const e of batch) await readEntry(e, out, depth + 1);
    }
  }
}

/** The files of a drop, folders opened recursively. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((i) => ((i as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null))
    .filter((e): e is Entry => !!e);
  if (!entries.length) return mediaOnly(dt.files);
  const out: File[] = [];
  for (const e of entries) await readEntry(e, out);
  return mediaOnly(out);
}
