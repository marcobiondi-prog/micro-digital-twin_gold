/** File kinds for the phone's share window, kept apart from ExportSheet so the history loads without it. */
export const MIME: Record<string, string> = {
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", geojson: "application/geo+json", zip: "application/zip",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", "3gp": "video/3gpp",
};

/**
 * What Chrome's share window takes, file by file (its own lists): a file of any other kind makes the phone refuse the
 * whole share with "NotAllowedError: Permission denied", and canShare() does not tell beforehand.
 */
const SHARE_EXT = new Set(["avif", "bmp", "css", "csv", "ehtml", "flac", "gif", "htm", "html", "ico", "jfif", "jpeg", "jpg", "m4a", "m4v", "mp3", "mp4", "mpeg", "mpg", "oga", "ogg", "ogm", "ogv", "opus", "pdf", "pjp", "pjpeg", "png", "shtm", "shtml", "svg", "svgz", "text", "tif", "tiff", "txt", "wav", "weba", "webm", "webp", "xbm"]);
const SHARE_MIME = new Set(["application/pdf", "audio/flac", "audio/mp3", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/x-m4a", "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/tiff", "image/webp", "image/x-icon", "text/comma-separated-values", "text/css", "text/csv", "text/html", "text/plain", "video/mp4", "video/mpeg", "video/ogg", "video/webm"]);
const EXT_OF: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf", "text/csv": "csv", "text/plain": "txt" };
/** The file as the share window takes it, or null when it cannot go (a .mov or .heic video or photo, say). */
export function forShare(name: string, blob: Blob): File | null {
  let ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  // The map data is plain text: it goes as "….geojson.txt", which a map program still reads once renamed.
  if (ext === "geojson" || ext === "json") { name += ".txt"; ext = "txt"; }
  let type = MIME[ext] ?? blob.type.split(";")[0]!.trim();
  if (!SHARE_EXT.has(ext)) {
    const e = EXT_OF[blob.type.split(";")[0]!.trim()];
    if (!e) return null;
    name = `${name}.${e}`; ext = e; type = blob.type.split(";")[0]!.trim();
  }
  if (ext === "txt" || ext === "text") type = "text/plain";
  if (ext === "jpg" || ext === "jpeg") type = "image/jpeg";
  return SHARE_MIME.has(type) ? new File([blob], name, { type }) : null;
}
/** The zone a gallery photo was tagged with ("Lotto A - foto.jpg" → "Lotto A"). */
export const zoneOfName = (name: string) => { const m = /^(.{1,24}?) - /.exec(name.replace(/^\d{6,}-/, "").replace(/^(\d+-[a-z0-9]{5}-)/, "").replace(/_/g, " ")); return m ? m[1]!.trim() : null; };
