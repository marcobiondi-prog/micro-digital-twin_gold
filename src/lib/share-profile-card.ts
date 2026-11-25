/**
 * The professional profile card shared as a picture: drawn on a canvas in the app's look (the dark slate card, the
 * title, the coat of arms when it loads, the label · value rows, "MICRO DIGITAL TWIN" at the foot), then handed to the
 * phone's own share window with a plain-text copy beside it; where files cannot be shared the text alone goes, else the
 * picture is saved in Download and the text copied.
 */

export type CardData = { title: string; place: string | null; crest: string | null; rows: Array<[string, string]>; name: string };

const W = 1080;
const PAD = 72;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = window.setTimeout(() => res(null), 5000);
    img.onload = () => { window.clearTimeout(t); res(img); };
    img.onerror = () => { window.clearTimeout(t); res(null); };
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  // A single word too long (an email) is cut by characters.
  return out.flatMap((l) => {
    if (ctx.measureText(l).width <= max) return [l];
    const parts: string[] = [];
    let cur = "";
    for (const ch of l) { if (ctx.measureText(cur + ch).width > max && cur) { parts.push(cur); cur = ch; } else cur += ch; }
    if (cur) parts.push(cur);
    return parts;
  });
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = '"Figtree", "Inter", system-ui, sans-serif';

export async function drawProfileCard(d: CardData): Promise<Blob | null> {
  const crest = d.crest ? await loadImage(d.crest) : null;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;
  const inner = W - PAD * 2 - 64;
  // Lay out first, to know the height.
  measure.font = `600 30px ${FONT}`;
  type Row = { k: string; v: string[]; stacked: boolean };
  const rows: Row[] = d.rows.map(([k, v]) => {
    const stacked = v.length > 24;
    measure.font = `500 34px ${FONT}`;
    return { k, v: stacked ? wrap(measure, v, inner) : [v], stacked };
  });
  const rowH = (r: Row) => (r.stacked ? 44 + r.v.length * 46 + 30 : 96);
  const titleLines = (() => { measure.font = `600 54px ${FONT}`; return wrap(measure, d.title, W - PAD * 2 - (crest ? 230 : 40) - 70); })();
  const sub = !crest && d.place ? 48 : 0;
  const headH = Math.max(titleLines.length * 66 + sub, crest ? 230 : 0) + 40;
  const listH = rows.reduce((s, r) => s + rowH(r), 0) + 20;
  const H = PAD + headH + listH + 60 + 120;

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // Page: the night canvas with a soft turquoise glow on top.
  ctx.fillStyle = "#12161d";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 900);
  glow.addColorStop(0, "rgba(45,212,191,0.28)");
  glow.addColorStop(1, "rgba(45,212,191,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Card.
  rounded(ctx, 36, 36, W - 72, H - 72 - 90, 56);
  ctx.fillStyle = "#1d2129";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title with the check badge.
  let y = PAD + 30;
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(PAD + 24, y + 30, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD + 14, y + 31); ctx.lineTo(PAD + 22, y + 39); ctx.lineTo(PAD + 35, y + 22); ctx.stroke();
  ctx.fillStyle = "#f4f6f8";
  ctx.font = `600 54px ${FONT}`;
  ctx.textBaseline = "top";
  titleLines.forEach((l, i) => ctx.fillText(l, PAD + 70, y + i * 66));
  if (sub) { ctx.fillStyle = "#9aa3ae"; ctx.font = `500 32px ${FONT}`; ctx.fillText(d.place!, PAD + 70, y + titleLines.length * 66 + 4); }
  if (crest) {
    const ch = 150, cw = (crest.width / crest.height) * ch;
    const cx = W - PAD - 100 - cw / 2;
    try { ctx.drawImage(crest, cx, y - 10, cw, ch); } catch { /* tainted: skip */ }
    if (d.place) {
      ctx.font = `500 30px ${FONT}`;
      ctx.textAlign = "center";
      const pl = wrap(ctx, d.place, 220);
      pl.forEach((l, i) => ctx.fillText(l, W - PAD - 100, y + ch + 4 + i * 36));
      ctx.textAlign = "left";
    }
  }
  y = PAD + headH;
  // Rows box.
  rounded(ctx, PAD, y, W - PAD * 2, listH, 40);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  let ry = y + 10;
  rows.forEach((r, i) => {
    const h = rowH(r);
    if (i > 0) { ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(PAD + 32, ry, W - PAD * 2 - 64, 2); }
    ctx.textBaseline = "middle";
    if (r.stacked) {
      ctx.fillStyle = "#9aa3ae"; ctx.font = `400 30px ${FONT}`;
      ctx.fillText(r.k, PAD + 32, ry + 38);
      ctx.fillStyle = "#f4f6f8"; ctx.font = `500 34px ${FONT}`;
      r.v.forEach((l, j) => ctx.fillText(l, PAD + 32, ry + 86 + j * 46));
    } else {
      ctx.fillStyle = "#9aa3ae"; ctx.font = `400 30px ${FONT}`;
      ctx.fillText(r.k, PAD + 32, ry + h / 2);
      ctx.fillStyle = "#f4f6f8"; ctx.font = `500 34px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(r.v[0]!, W - PAD - 32, ry + h / 2);
      ctx.textAlign = "left";
    }
    ry += h;
  });
  // Foot: the app's name, TWIN in turquoise.
  ctx.textBaseline = "middle";
  ctx.font = `600 30px ${FONT}`;
  const words: Array<[string, string]> = [["M I C R O   D I G I T A L   ", "#f4f6f8"], ["T W I N", "#2dd4bf"]];
  const total = words.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
  let fx = (W - total) / 2;
  for (const [t, col] of words) { ctx.fillStyle = col; ctx.fillText(t, fx, H - 70); fx += ctx.measureText(t).width; }
  return await new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export function cardText(d: CardData): string {
  return [d.place ? `${d.title} · ${d.place}` : d.title, ...d.rows.map(([k, v]) => `${k}: ${v}`), "", "Micro Digital Twin"].join("\n");
}

const fileName = (name: string) => `scheda-${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profilo"}.png`;

/** Shares the card: picture and text through the phone's window, else the text, else saved and copied. */
export async function shareProfileCard(d: CardData): Promise<"shared" | "text" | "saved" | "cancelled"> {
  const text = cardText(d);
  const blob = await drawProfileCard(d);
  const file = blob ? new File([blob], fileName(d.name), { type: "image/png" }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (file && nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: `Scheda ${d.title.toLowerCase()} · ${d.name}`, text });
      return "shared";
    }
    if (nav.share) {
      await nav.share({ title: d.title, text });
      return "text";
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
  }
  if (blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(d.name);
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  try { await navigator.clipboard.writeText(text); } catch { /* not allowed */ }
  return "saved";
}
