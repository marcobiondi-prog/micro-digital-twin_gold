import { useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const RATES = [1, 1.5, 2, 0.5];
const FRAMES = 8;

/**
 * The viewer's own video controls, shown with a tap on the video and hidden by another (or by themselves 3 s after it
 * starts playing): a big glass play / pause in the middle and, at the bottom, a strip of the video's frames to drag
 * along (its own gesture, so the row of photos does not slide), the time gone and the length, Audio on/off, the speed
 * (1× → 1,5× → 2× → 0,5×) and Ripeti.
 */
export function VideoPlayer({ src, autoPlay = false }: { src: string; autoPlay?: boolean }) {
  const v = useRef<HTMLVideoElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const frames = useRef<Array<HTMLCanvasElement | null>>([]);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [shown, setShown] = useState(true);
  const hide = useRef<number | undefined>(undefined);
  const poke = () => {
    setShown(true);
    window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => { if (v.current && !v.current.paused) setShown(false); }, 3000);
  };
  useEffect(() => () => window.clearTimeout(hide.current), []);
  useEffect(() => { if (v.current) v.current.playbackRate = rate; }, [rate]);
  // The strip's frames, drawn from a hidden copy of the video once its length is known.
  useEffect(() => {
    if (!d) return;
    let live = true;
    const probe = document.createElement("video");
    probe.muted = true; probe.preload = "auto"; probe.playsInline = true; probe.src = src;
    void (async () => {
      for (let k = 0; k < FRAMES && live; k++) {
        await new Promise<void>((done) => {
          const t0 = window.setTimeout(done, 2500);
          probe.onseeked = () => { window.clearTimeout(t0); done(); };
          probe.currentTime = ((k + 0.5) / FRAMES) * d;
        });
        const c = frames.current[k];
        if (live && c && probe.videoWidth) {
          c.width = 96; c.height = Math.round((96 * probe.videoHeight) / probe.videoWidth) || 54;
          try { c.getContext("2d")?.drawImage(probe, 0, 0, c.width, c.height); } catch { /* frame not drawable */ }
        }
      }
    })();
    return () => { live = false; probe.removeAttribute("src"); probe.load(); };
  }, [src, d]);
  const toggle = () => { const el = v.current; if (!el) return; if (el.paused) void el.play().catch(() => {}); else el.pause(); poke(); };
  const seekAt = (clientX: number) => {
    const el = v.current, box = strip.current?.getBoundingClientRect();
    if (!el || !box || !d) return;
    const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    el.currentTime = f * d; setT(f * d);
  };
  const glass = "bg-black/35 backdrop-blur-xl border border-white/10";
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget || e.target === v.current) { if (shown && !v.current?.paused) setShown(false); else poke(); } }}>
      <video ref={v} src={src} playsInline preload="metadata" autoPlay={autoPlay} muted={muted} loop={loop}
        onPlay={() => { setPlaying(true); poke(); }} onPause={() => { setPlaying(false); setShown(true); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setD(e.currentTarget.duration || 0)} onEnded={() => setShown(true)}
        className="relative z-0 block h-auto max-h-full w-auto max-w-full min-h-0 min-w-0 object-contain" />
      <div className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}>
        <button type="button" onClick={toggle} aria-label={playing ? "Pausa" : "Riproduci"} tabIndex={shown ? 0 : -1}
          className={`absolute left-1/2 top-[44%] grid size-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white ${glass} ${shown ? "pointer-events-auto" : ""}`}>
          {playing ? <Pause className="size-8 fill-white" aria-hidden="true" /> : <Play className="ml-1 size-8 fill-white" aria-hidden="true" />}
        </button>
        <div className={`absolute inset-x-3 bottom-10 rounded-[22px] p-2.5 text-white ${glass} ${shown ? "pointer-events-auto" : ""}`}>
          <div ref={strip} role="slider" aria-label="Posizione nel video" aria-valuemin={0} aria-valuemax={Math.round(d)} aria-valuenow={Math.round(t)} aria-valuetext={`${clock(t)} di ${clock(d)}`} tabIndex={shown ? 0 : -1}
            onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); seekAt(e.clientX); poke(); }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX); }}
            onKeyDown={(e) => { const el = v.current; if (!el) return; if (e.key === "ArrowRight") el.currentTime = Math.min(d, el.currentTime + 5); if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 5); }}
            className="relative flex h-9 touch-none overflow-hidden rounded-lg bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white">
            {Array.from({ length: FRAMES }, (_, k) => <canvas key={k} ref={(c) => { frames.current[k] = c; }} className="h-full min-w-0 flex-1 object-cover opacity-70" />)}
            <span className="absolute inset-y-0 left-0 bg-brand-turquoise/25" style={{ width: `${d ? (t / d) * 100 : 0}%` }} />
            <span className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgb(0_0_0/0.3)]" style={{ left: `${d ? (t / d) * 100 : 0}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-white/80"><span>{clock(t)}</span><span>{clock(d)}</span></div>
          <div className="mt-1.5 flex items-center justify-between">
            <button type="button" onClick={() => { setMuted((m) => !m); poke(); }} aria-pressed={!muted} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/12 px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white">
              {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}Audio
            </button>
            <button type="button" onClick={() => { setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]!); poke(); }} aria-label={`Velocità ${rate}×`} className="h-8 rounded-full bg-white/12 px-3 text-xs font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-white">{String(rate).replace(".", ",")}×</button>
            <button type="button" onClick={() => { setLoop((l) => !l); poke(); }} aria-pressed={loop} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white ${loop ? "bg-brand-turquoise text-black" : "bg-white/12"}`}>
              <Repeat className="size-4" aria-hidden="true" />Ripeti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
