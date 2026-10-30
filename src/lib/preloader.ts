/**
 * The animated preloader of the index (/): drawn by an inline script while the page is still loading, before any
 * JavaScript bundle arrives, outside the part React owns (on <html>, not in <body>), and faded out once the app has
 * started (hidePreloader) — shown at least 1.8 s so the tree forms, and gone after 8 s whatever happens.
 * Only on "/": every other page opens without it. Still with reduced motion.
 */
const CSS = `
#mdt-preloader{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:oklch(0.155 0.012 265);color:#f4f6f8;color-scheme:dark;transition:opacity .5s cubic-bezier(.22,1,.36,1),visibility .5s;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#mdt-preloader.out{opacity:0;visibility:hidden}
#mdt-preloader .glow{position:absolute;inset:0;background:radial-gradient(50% 32% at 50% 44%,oklch(0.72 0.15 190/.16),transparent 70%)}
#mdt-preloader .box{position:relative;display:flex;flex-direction:column;align-items:center}
#mdt-preloader svg{width:260px;max-width:72vw;overflow:visible}
#mdt-preloader .real{fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:900;stroke-dashoffset:900;animation:mdtp-draw 3s cubic-bezier(.22,1,.36,1) infinite}
#mdt-preloader .p{fill:oklch(0.72 0.15 190);opacity:0;animation:mdtp-pt 3s infinite}
#mdt-preloader .mid{stroke:rgb(255 255 255/.15);stroke-dasharray:3 5}
#mdt-preloader .lbl{font:600 9px ui-sans-serif,system-ui,sans-serif;letter-spacing:.2em;fill:rgb(255 255 255/.5);text-anchor:middle}
#mdt-preloader .scan{stroke:oklch(0.72 0.15 190);stroke-width:2;filter:drop-shadow(0 0 6px oklch(0.72 0.15 190));animation:mdtp-scan 3s ease-in-out infinite}
#mdt-preloader .name{margin-top:22px;font-size:13px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;padding-left:.32em}
#mdt-preloader .name b{color:oklch(0.72 0.15 190);font-weight:600}
#mdt-preloader .sub{margin-top:8px;font-size:12px;color:rgb(255 255 255/.55);letter-spacing:.04em}
@keyframes mdtp-draw{0%{stroke-dashoffset:900}50%,100%{stroke-dashoffset:0}}
@keyframes mdtp-pt{0%,30%{opacity:0;transform:translate(var(--dx),var(--dy))}60%,100%{opacity:1;transform:none}}
@keyframes mdtp-scan{0%{transform:translateX(-120px);opacity:0}20%{opacity:1}60%{transform:translateX(0);opacity:1}70%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){#mdt-preloader *{animation:none!important}#mdt-preloader .real{stroke-dashoffset:0}#mdt-preloader .p{opacity:1}#mdt-preloader .scan{opacity:0}}
`;

/**
 * The same tree, real on the left (a white line drawing that draws itself) and digital on the right (a cloud of points
 * flying into its shape), while a scan line passes from one to the other.
 */
function treePoints(): string {
  const inCrown = (x: number, y: number) => { const dx = (x - 65) / 40, dy = (y - 75) / 48; return dx * dx + dy * dy < 1; };
  let out = "", i = 0;
  for (let y = 28; y <= 170; y += 7) {
    for (let x = 22; x <= 110; x += 7) {
      const trunk = Math.abs(x - 65) < 4 && y > 118;
      if (!inCrown(x, y) && !trunk) continue;
      out += `<circle class="p" cx="${x + 130}" cy="${y}" r="2" style="animation-delay:${((i % 17) * 0.03).toFixed(2)}s;--dx:${Math.round(Math.sin(i) * 30)}px;--dy:${Math.round(Math.cos(i * 1.7) * 30)}px"/>`;
      i++;
    }
  }
  return out;
}

const HTML = `<style>${CSS}</style><div class="glow"></div><div class="box" role="status" aria-live="polite">`
  + `<svg viewBox="0 0 260 190" aria-hidden="true"><line class="mid" x1="130" y1="10" x2="130" y2="175"/>`
  + `<path class="real" d="M 65 170 L 65 120 M 65 140 L 50 125 M 65 132 L 82 118 M 65 120 C 25 120 20 80 40 66 C 30 40 60 22 72 34 C 90 18 112 40 104 62 C 122 78 108 120 65 120"/>`
  + `${treePoints()}<line class="scan" x1="130" y1="20" x2="130" y2="175"/>`
  + `<text class="lbl" x="65" y="188">REALE</text><text class="lbl" x="195" y="188">DIGITALE</text></svg>`
  + `<div class="name">Micro Digital <b>Twin</b></div><div class="sub">Creo il gemello digitale del luogo…</div>`
  + `<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Caricamento…</span></div>`;

/** Runs in the page as it is parsed: draws the preloader on "/" and gives the app a way to take it away. */
export const preloaderScript = `(function(){try{
if(location.pathname!=="/")return;
var el=document.createElement("div");el.id="mdt-preloader";el.innerHTML=${JSON.stringify(HTML)};
document.documentElement.appendChild(el);
var t0=Date.now(),gone=false;
window.__mdtPreloaderDone=function(){if(gone)return;gone=true;var wait=Math.max(0,1800-(Date.now()-t0));
setTimeout(function(){el.classList.add("out");setTimeout(function(){el.remove()},600)},wait)};
setTimeout(window.__mdtPreloaderDone,8000);
}catch(e){}})();`;

/** Once the app has started: fades the preloader out (nothing on pages without it). */
export function hidePreloader() {
  (window as unknown as { __mdtPreloaderDone?: () => void }).__mdtPreloaderDone?.();
}
