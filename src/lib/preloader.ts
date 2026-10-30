/**
 * The animated preloader of the index (/): drawn by an inline script while the page is still loading, before any
 * JavaScript bundle arrives, outside the part React owns (on <html>, not in <body>), and faded out once the app has
 * started (hidePreloader) — shown at least a moment so its animation reads, and gone after 8 s whatever happens.
 * Only on "/": every other page opens without it. Still with reduced motion.
 */
const CSS = `
#mdt-preloader{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:oklch(0.155 0.012 265);color:#f4f6f8;color-scheme:dark;transition:opacity .5s cubic-bezier(.22,1,.36,1),visibility .5s;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#mdt-preloader.out{opacity:0;visibility:hidden}
#mdt-preloader .glow{position:absolute;inset:-20%;background:radial-gradient(40% 30% at 30% 35%,oklch(0.72 0.15 190/.28),transparent 70%),radial-gradient(35% 28% at 72% 60%,oklch(0.65 0.14 250/.22),transparent 70%),radial-gradient(30% 25% at 55% 85%,oklch(0.72 0.17 45/.14),transparent 70%);animation:mdtp-drift 7s ease-in-out infinite alternate}
#mdt-preloader .box{position:relative;display:flex;flex-direction:column;align-items:center;gap:22px}
#mdt-preloader svg{width:132px;height:132px;overflow:visible}
#mdt-preloader .track{fill:none;stroke:rgb(255 255 255/.08);stroke-width:2}
#mdt-preloader .arc{fill:none;stroke:url(#mdtp-g);stroke-width:3;stroke-linecap:round;stroke-dasharray:70 220;transform-origin:66px 66px;animation:mdtp-spin 1.6s cubic-bezier(.5,.1,.5,.9) infinite}
#mdt-preloader .arc2{fill:none;stroke:oklch(0.72 0.15 190/.45);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:24 160;transform-origin:66px 66px;animation:mdtp-spin 2.4s linear infinite reverse}
#mdt-preloader .core{fill:oklch(0.72 0.15 190);transform-origin:66px 66px;animation:mdtp-breathe 1.6s ease-in-out infinite}
#mdt-preloader .halo{fill:oklch(0.72 0.15 190/.25);transform-origin:66px 66px;animation:mdtp-halo 1.6s ease-out infinite}
#mdt-preloader .dot{fill:#fff;opacity:0;animation:mdtp-twinkle 2.4s ease-in-out infinite}
#mdt-preloader .name{font-size:13px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;padding-left:.32em;opacity:0;animation:mdtp-in .8s .2s cubic-bezier(.22,1,.36,1) forwards}
#mdt-preloader .name b{color:oklch(0.72 0.15 190);font-weight:600}
#mdt-preloader .bar{width:120px;height:2px;border-radius:2px;background:rgb(255 255 255/.08);overflow:hidden}
#mdt-preloader .bar i{display:block;width:40%;height:100%;border-radius:2px;background:linear-gradient(90deg,transparent,oklch(0.72 0.15 190),transparent);animation:mdtp-run 1.2s ease-in-out infinite}
@keyframes mdtp-spin{to{transform:rotate(360deg)}}
@keyframes mdtp-breathe{0%,100%{transform:scale(.85)}50%{transform:scale(1.1)}}
@keyframes mdtp-halo{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.6);opacity:0}}
@keyframes mdtp-twinkle{0%,100%{opacity:0}50%{opacity:.9}}
@keyframes mdtp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes mdtp-run{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@keyframes mdtp-drift{from{transform:translate3d(-2%,-1%,0) rotate(0)}to{transform:translate3d(2%,1%,0) rotate(8deg)}}
@media (prefers-reduced-motion:reduce){#mdt-preloader *{animation:none!important}#mdt-preloader .name{opacity:1}#mdt-preloader .dot{opacity:.6}}
`;

// Data points around the ring, twinkling one after the other.
const DOTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2, r = 62;
  return `<circle class="dot" cx="${(66 + Math.cos(a) * r).toFixed(1)}" cy="${(66 + Math.sin(a) * r).toFixed(1)}" r="1.6" style="animation-delay:${(i * 0.3).toFixed(1)}s"/>`;
}).join("");

const HTML = `<style>${CSS}</style><div class="glow"></div><div class="box" role="status" aria-live="polite">`
  + `<svg viewBox="0 0 132 132" aria-hidden="true"><defs><linearGradient id="mdtp-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="oklch(0.72 0.15 190)"/><stop offset="1" stop-color="oklch(0.65 0.14 250)"/></linearGradient></defs>`
  + `<circle class="track" cx="66" cy="66" r="46"/><circle class="arc" cx="66" cy="66" r="46"/><circle class="arc2" cx="66" cy="66" r="34"/>${DOTS}<circle class="halo" cx="66" cy="66" r="8"/><circle class="core" cx="66" cy="66" r="7"/></svg>`
  + `<div class="name">Micro Digital <b>Twin</b></div><div class="bar"><i></i></div><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Caricamento…</span></div>`;

/** Runs in the page as it is parsed: draws the preloader on "/" and gives the app a way to take it away. */
export const preloaderScript = `(function(){try{
if(location.pathname!=="/")return;
var el=document.createElement("div");el.id="mdt-preloader";el.innerHTML=${JSON.stringify(HTML)};
document.documentElement.appendChild(el);
var t0=Date.now(),gone=false;
window.__mdtPreloaderDone=function(){if(gone)return;gone=true;var wait=Math.max(0,900-(Date.now()-t0));
setTimeout(function(){el.classList.add("out");setTimeout(function(){el.remove()},600)},wait)};
setTimeout(window.__mdtPreloaderDone,8000);
}catch(e){}})();`;

/** Once the app has started: fades the preloader out (nothing on pages without it). */
export function hidePreloader() {
  (window as unknown as { __mdtPreloaderDone?: () => void }).__mdtPreloaderDone?.();
}
