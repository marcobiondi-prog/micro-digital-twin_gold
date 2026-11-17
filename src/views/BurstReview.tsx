import { Check, X } from "lucide-react";

/** src: where it was shot — "ar" in the AR view, "ai" in Rileva (shown as a tag on each photo). */
export type BurstShot = { id: number; file: File; thumb: string; src?: "ar" | "ai" };
/** What the thumbnail and the sheet need of a shot (the in-app camera's file is still a promise while it encodes). */
export type BurstPreview = Pick<BurstShot, "id" | "thumb" | "src">;

/**
 * The multiple shot's thumbnail (its last photo, the count in a turquoise badge) and its review sheet — shared by the
 * AI camera (Rileva) and its AR view. The sheet rises from the bottom over the dimmed camera: a grid of the shots
 * scrolling in its own box (3 columns upright, 6 sideways), a tap sets one aside (greyed with ✕) and another keeps it,
 * "Scarta tutte" in red and the white "Aggiungi n", which hands the kept ones over.
 */
export function BurstThumb({ shots, open, onToggle }: { shots: readonly BurstPreview[]; open: boolean; onToggle: () => void }) {
  const last = shots[shots.length - 1];
  if (!last) return null;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      aria-label={`${shots.length} foto del multiplo · ${open ? "chiudi" : "rivedi"}`}
      className="pointer-events-auto relative size-11 shrink-0 rounded-xl ring-2 ring-white/80 shadow-lg active:scale-95">
      <img src={last.thumb} alt="" className="size-full rounded-xl object-cover" />
      <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#00e5ff] px-1 text-[11px] font-bold text-black">{shots.length}</span>
    </button>
  );
}

export function BurstReviewSheet({ shots, discarded, onToggleShot, onClose, onAdd, onDiscardAll, fixed = false }: {
  shots: readonly BurstPreview[]; discarded: ReadonlySet<number>; onToggleShot: (id: number) => void;
  onClose: () => void; onAdd: () => void; onDiscardAll: () => void; fixed?: boolean;
}) {
  const kept = shots.filter((s) => !discarded.has(s.id)).length;
  return (
    <div className={`${fixed ? "fixed" : "absolute"} pointer-events-auto inset-0 z-[70] flex flex-col justify-end`} data-camera-controls role="dialog" aria-modal="true" aria-label="Scatti del multiplo">
      <button type="button" tabIndex={-1} aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-in fade-in-0 duration-200" />
      <div className="relative mx-auto flex max-h-[85%] w-full max-w-xl flex-col rounded-t-[28px] bg-[oklch(0.25_0.02_255)] text-white shadow-[0_-12px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/10 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <span className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/30" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <div>
            <p className="text-base font-semibold">{shots.length} {shots.length === 1 ? "scatto" : "scatti"}</p>
            <p className="text-xs text-white/65">{discarded.size ? `${discarded.size} da scartare · tocca di nuovo per tenerli` : "Tocca una foto per scartarla"}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-full bg-white/10 px-4 text-sm font-semibold">Chiudi</button>
        </div>
        {/* The grid scrolls inside its own box: laid straight in the sheet's flex column its rows were squeezed and the
            photos piled on one another once there were many. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3" data-map-gestures>
          <div className="grid grid-cols-3 content-start gap-1.5 landscape:grid-cols-6">
            {shots.map((s, i) => {
              const off = discarded.has(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={off}
                  aria-label={`Foto ${i + 1}${off ? " · da scartare, tocca per tenerla" : " · tocca per scartarla"}`}
                  onClick={() => onToggleShot(s.id)}
                  className="relative block aspect-square h-auto w-full overflow-hidden rounded-xl bg-black/40">
                  <img src={s.thumb} alt="" className={`size-full object-cover transition ${off ? "scale-90 opacity-35 grayscale" : ""}`} />
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 text-[10px] font-bold">{i + 1}</span>
                  {s.src && <span className={`absolute right-1 top-1 rounded-full px-1.5 py-px text-[10px] font-bold ${s.src === "ar" ? "bg-violet-500 text-white" : "bg-[#00e5ff] text-black"}`}>{s.src === "ar" ? "AR" : "AI"}</span>}
                  {off && <span className="absolute inset-0 grid place-items-center"><span className="grid size-9 place-items-center rounded-full bg-black/75 ring-1 ring-white/40"><X className="size-5" aria-hidden="true" /></span></span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pt-1">
          <button type="button" onClick={onDiscardAll} className="h-11 flex-1 rounded-full bg-white/10 text-sm font-semibold text-red-300">Scarta tutte</button>
          <button type="button" onClick={onAdd} disabled={!kept}
            className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-white text-sm font-bold text-black disabled:opacity-40">
            <Check className="size-4" aria-hidden="true" />Aggiungi {kept}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A 160 px JPEG thumbnail of a photo file. */
export async function burstThumbOf(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = 160 / Math.max(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.7);
}
