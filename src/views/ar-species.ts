import * as THREE from "three";
import { buildBroadleaf, dots, drawn, type BroadleafSpec } from "@/views/ar-broadleaf";

/**
 * Broadleaved trees and shrubs with a model of their own, built by views/ar-broadleaf from a card each: hackberry,
 * southern magnolia, horse chestnut, maple, birch, deciduous oaks (pedunculate, downy…), weeping willow, Lombardy
 * poplar and oleander. Each card draws its own bark and leaves (canvas, nothing to download) and sets its crown's
 * outline, proportions, trunk, branches, colours and flowers or fruits.
 */

// ── Outlines (0 at the crown's foot, 1 at its top) ──────────────────────────────────────────────────────────────
/** A dome widest at m, closing at the top (f = 1), its foot `foot` wide; `below` sets how fast it narrows downwards. */
const dome = (m: number, below: number, _above: number, foot = 0.5) => (f: number) => {
  if (f <= 0) return foot; if (f >= 1) return 0;
  const d = (f - m) / (f < m ? below : 1 - m);
  return Math.max(f < m ? foot : 0, Math.sqrt(Math.max(0, 1 - d * d)));
};
export const OUTLINES = {
  celtis: dome(0.42, 0.55, 0.6, 0.6),
  magnolia: (f: number) => (f <= 0 ? 0.7 : f >= 1 ? 0 : Math.min(1, 0.7 + 0.3 * Math.sqrt(f / 0.3)) * Math.pow(1 - f, 0.6) / Math.pow(0.7, 0.6)),
  horseChestnut: dome(0.45, 0.6, 0.57, 0.62),
  maple: dome(0.45, 0.55, 0.58, 0.6),
  birch: (f: number) => (f <= 0 ? 0.45 : f >= 1 ? 0 : Math.sin(Math.PI * Math.pow(f, 0.8)) * 0.98 + 0.02),
  oak: dome(0.38, 0.5, 0.64, 0.7),
  willow: dome(0.42, 0.55, 0.58, 0.6),
  poplar: (f: number) => (f <= 0 ? 0.5 : f >= 1 ? 0 : Math.min(1, 0.5 + 0.5 * Math.sqrt(f / 0.25)) * Math.pow(1 - f, 0.75) / Math.pow(0.75, 0.75)),
  oleander: dome(0.55, 0.6, 0.48, 0.75),
};

// ── Barks ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Long ridges that split and join, in a base colour with dark furrows and pale crests. */
const ridged = (key: string, base: string, furrow: string, crest: string, n = 30) => drawn(key, 128, 256, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 256); g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    g.strokeStyle = r() < 0.55 ? furrow : crest; g.lineWidth = 1 + r() * 3;
    g.beginPath(); let x = r() * 136 - 4; g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 14) { x += (r() - 0.5) * 7; g.lineTo(x, y); }
    g.stroke();
  }
}, true);
/** Smooth bark with faint horizontal wrinkles (hackberry, beech-like). */
const smooth = (key: string, base: string, wrinkle: string) => drawn(key, 128, 256, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"; g.fillRect(r() * 128, r() * 256, 20 + r() * 50, 8 + r() * 20); }
  g.strokeStyle = wrinkle; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const y = r() * 256, x = r() * 100; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y + (r() - 0.5) * 4, x + 20 + r() * 20, y); g.stroke(); }
}, true);
/** Birch: chalk white, black horizontal lenticels and dark diamond scars. */
const birchBark = drawn("birch-bark", 128, 256, (g, r) => {
  g.fillStyle = "#e9e6dd"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,28,26,${0.55 + r() * 0.4})`; g.fillRect(r() * 128, r() * 256, 6 + r() * 22, 1.5 + r() * 2.5); }
  for (let i = 0; i < 6; i++) {
    const x = r() * 128, y = r() * 256; g.fillStyle = "rgba(25,22,20,0.8)";
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 7, y); g.lineTo(x, y + 10); g.lineTo(x - 7, y); g.closePath(); g.fill();
  }
}, true);

// ── Leaves (a twig of leaves, white-ish so each instance tints it) ───────────────────────────────────────────────
type LeafPath = (g: CanvasRenderingContext2D, len: number, r: () => number) => void;
function twig(key: string, shape: LeafPath, opts: { leaves?: number; len?: [number, number]; spread?: number; whorl?: number; stems?: number } = {}) {
  return drawn(key, 128, 128, (g, r) => {
    const stems = opts.stems ?? 1, n = opts.leaves ?? 8, [l0, l1] = opts.len ?? [20, 30], spread = opts.spread ?? 1;
    for (let s = 0; s < stems; s++) {
      const x0 = stems === 1 ? 64 : 34 + s * (60 / Math.max(1, stems - 1)), a0 = -Math.PI / 2 + (stems === 1 ? 0 : (s - (stems - 1) / 2) * 0.35);
      const ex = x0 + Math.cos(a0) * 112, ey = 127 + Math.sin(a0) * 112;
      g.strokeStyle = "rgb(110,95,80)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, 127); g.lineTo(ex, ey); g.stroke();
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 0.6), px = x0 + (ex - x0) * f, py = 127 + (ey - 127) * f;
        const sides = opts.whorl ? Array.from({ length: opts.whorl }, (_, j) => (j - (opts.whorl! - 1) / 2) * 0.9) : [k % 2 ? 1 : -1];
        for (const side of sides) {
          g.save(); g.translate(px, py); g.rotate(a0 + Math.PI / 2 + side * (0.9 + r() * 0.35) * spread);
          const v = 170 + Math.floor(r() * 75); g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath(); shape(g, l0 + r() * (l1 - l0), r); g.fill();
          g.strokeStyle = "rgba(95,95,95,0.4)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -(l0 + l1) * 0.42); g.stroke();
          g.restore();
        }
      }
    }
  });
}
const oval = (wk: number, toothed = false): LeafPath => (g, len, r) => {
  const w = len * wk; g.moveTo(0, 0);
  if (!toothed) { g.bezierCurveTo(w, -len * 0.2, w * 0.8, -len * 0.8, 0, -len); g.bezierCurveTo(-w * 0.8, -len * 0.8, -w, -len * 0.2, 0, 0); return; }
  for (let i = 0; i <= 10; i++) { const t = i / 10, x = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * (i % 2 ? 1.08 : 0.94); g.lineTo(x, -len * t); }
  for (let i = 10; i >= 0; i--) { const t = i / 10, x = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * (i % 2 ? 1.08 : 0.94); g.lineTo(-x, -len * t); }
  void r;
};
const lobedOak: LeafPath = (g, len) => {
  g.moveTo(0, 0);
  const side = (s: number) => { for (let i = 0; i <= 12; i++) { const t = i / 12, lobe = 0.75 + 0.25 * Math.cos(t * Math.PI * 9); g.lineTo(s * Math.sin(Math.PI * Math.pow(t, 0.75)) * len * 0.34 * lobe, -len * t); } };
  side(1); g.lineTo(0, -len); for (let i = 12; i >= 0; i--) { const t = i / 12, lobe = 0.75 + 0.25 * Math.cos(t * Math.PI * 9); g.lineTo(-Math.sin(Math.PI * Math.pow(t, 0.75)) * len * 0.34 * lobe, -len * t); }
};
const palmate = (lobes: number, sharp: number): LeafPath => (g, len) => {
  g.moveTo(0, 2);
  for (let i = 0; i < lobes; i++) {
    const ang = -1.4 + (2.8 * i) / (lobes - 1), L = len * (i === 0 || i === lobes - 1 ? 0.6 : 1);
    const l = ang - 0.3, rr = ang + 0.3;
    g.lineTo(Math.sin(l) * L * sharp, -Math.cos(l) * L * sharp);
    g.lineTo(Math.sin(ang) * L, -Math.cos(ang) * L);
    g.lineTo(Math.sin(rr) * L * sharp, -Math.cos(rr) * L * sharp);
  }
};
/** Horse chestnut: 5–7 long leaflets fanning from one point. */
const digitate: LeafPath = (g, len) => {
  for (let i = 0; i < 7; i++) {
    const ang = -1.35 + (2.7 * i) / 6, L = len * (i === 0 || i === 6 ? 0.6 : i === 1 || i === 5 ? 0.85 : 1);
    g.save(); g.rotate(ang); const w = L * 0.22;
    g.moveTo(0, 0); g.bezierCurveTo(w, -L * 0.3, w, -L * 0.9, 0, -L); g.bezierCurveTo(-w, -L * 0.9, -w, -L * 0.3, 0, 0);
    g.restore();
  }
};
const triangular: LeafPath = (g, len) => { const w = len * 0.42; g.moveTo(0, 0); g.lineTo(w, -len * 0.25); g.quadraticCurveTo(w * 0.6, -len * 0.7, 0, -len); g.quadraticCurveTo(-w * 0.6, -len * 0.7, -w, -len * 0.25); g.closePath(); };

// ── The cards ────────────────────────────────────────────────────────────────────────────────────────────────────
export const SPECIES: Record<string, BroadleafSpec> = {
  /** Bagolaro (Celtis australis): smooth elephant-grey bark, broad round crown, toothed pointed leaves, a long-lived street tree. */
  celtis: {
    radius: OUTLINES.celtis, width: [0.7, 1.1, 0.9], clear: [0.24, 0.32],
    trunk: { r: 0.034, lean: 0.03 }, branches: { count: [9, 16], steep: 0.07 },
    body: { scale: 0.66, color: "#30472a" }, surface: 0.45, leaves: { size: 0.9 },
    color: [0.24, 0.42, 0.33], alt: { color: [0.2, 0.25, 0.5], share: 0.1 },
    bark: smooth("celtis-bark", "#8f8c85", "rgba(60,58,54,0.45)"), leaf: twig("celtis-leaf", oval(0.3, true), { leaves: 9, len: [20, 28] }),
  },
  /** Magnolia (Magnolia grandiflora): dense dark glossy pyramid down low, big leathery leaves, big white flowers. */
  magnolia: {
    radius: OUTLINES.magnolia, width: [0.5, 0.85, 0.65], clear: [0.06, 0.12],
    trunk: { r: 0.03, leader: 0.85 }, branches: { count: [10, 18], steep: 0.04 },
    body: { scale: 0.76, color: "#1b2b18" }, surface: 0.55, leaves: { size: 1.15, roughness: 0.45 },
    color: [0.3, 0.45, 0.15], alt: { color: [0.08, 0.35, 0.38], share: 0.08 },
    bark: smooth("magnolia-bark", "#6f6d66", "rgba(40,38,35,0.4)"), leaf: twig("magnolia-leaf", oval(0.36), { leaves: 6, len: [30, 40] }),
    extras: ({ g, r, onOutline, H }) => {
      const pts = Array.from({ length: Math.round(14 + H * 2) }, () => onOutline(0.1 + r() * 0.8, r() * Math.PI * 2, 0.98 + r() * 0.05));
      dots(g, pts, Math.max(0.09, H * 0.012), "#f4f1e6", "sphere", 0.7);
    },
  },
  /** Ippocastano (Aesculus hippocastanum): broad dense dome, digitate leaves, upright white flower candles in spring. */
  horseChestnut: {
    radius: OUTLINES.horseChestnut, width: [0.65, 1, 0.8], clear: [0.2, 0.28],
    trunk: { r: 0.036, lean: 0.02 }, branches: { count: [9, 16], steep: 0.05, droop: 0.04 },
    body: { scale: 0.72, color: "#243a1d" }, surface: 0.5, leaves: { size: 1.25 },
    color: [0.27, 0.42, 0.27],
    bark: ridged("aesculus-bark", "#5c534a", "rgba(35,30,26,0.55)", "rgba(130,120,108,0.3)", 22), leaf: twig("aesculus-leaf", digitate, { leaves: 3, len: [32, 40], spread: 0.8 }),
    extras: ({ g, r, onOutline, H }) => {
      const pts = Array.from({ length: Math.round(20 + H * 3) }, () => onOutline(0.2 + r() * 0.7, r() * Math.PI * 2, 0.97 + r() * 0.06));
      dots(g, pts, Math.max(0.05, H * 0.006), (i) => (i % 5 ? "#f2eee2" : "#f0d9d0"), "cone", 1.3);
    },
  },
  /** Acero (Acer platanoides / campestre / pseudoplatanus): rounded crown, palmate pointed leaves, a few turning red. */
  maple: {
    radius: OUTLINES.maple, width: [0.6, 1, 0.8], clear: [0.2, 0.3],
    trunk: { r: 0.03 }, branches: { count: [9, 15], steep: 0.07 },
    body: { scale: 0.66, color: "#2e4a24" }, surface: 0.45, leaves: { size: 1.1 },
    color: [0.25, 0.48, 0.36], alt: { color: [0.06, 0.55, 0.42], share: 0.05 },
    bark: ridged("acer-bark", "#6d675e", "rgba(40,36,32,0.5)", "rgba(150,140,128,0.3)", 26), leaf: twig("acer-leaf", palmate(5, 0.5), { leaves: 5, len: [26, 32] }),
  },
  /** Betulla (Betula pendula): white trunk, light airy crown with drooping tips, small triangular leaves. */
  birch: {
    radius: OUTLINES.birch, width: [0.35, 0.6, 0.45], clear: [0.25, 0.35],
    trunk: { r: 0.022, leader: 0.9, sway: 0.01, stems: [1, 2], splay: 0.15, flare: 1.15 }, branches: { count: [8, 14], steep: 0.05, droop: 0.03 },
    body: { scale: 0.3, color: "#4d6e33" }, surface: 0.5, leaves: { count: 0.7, size: 1.4, hanging: 0.04 },
    color: [0.22, 0.5, 0.42],
    bark: birchBark, barkRepeat: [1, 2], leaf: twig("betula-leaf", triangular, { leaves: 12, len: [20, 28], stems: 2 }),
  },
  /** Farnia, roverella (deciduous Quercus): stout trunk, wide irregular crown on heavy crooked limbs, lobed leaves. */
  oak: {
    radius: OUTLINES.oak, width: [0.8, 1.3, 1], clear: [0.22, 0.3],
    trunk: { r: 0.045, lean: 0.04 }, branches: { count: [7, 12], steep: 0.04 },
    body: { scale: 0.6, color: "#2b4220" }, surface: 0.38, leaves: { size: 1 },
    color: [0.24, 0.4, 0.3], alt: { color: [0.13, 0.35, 0.36], share: 0.06 },
    bark: ridged("oak-bark", "#4a4038", "rgba(25,20,16,0.6)", "rgba(110,100,90,0.3)", 34), leaf: twig("quercus-leaf", lobedOak, { leaves: 7, len: [24, 32] }),
  },
  /** Salice piangente (Salix babylonica): a rounded crown pouring long curtains of narrow leaves down to the ground. */
  weepingWillow: {
    radius: OUTLINES.willow, width: [0.85, 1.3, 1], clear: [0.3, 0.36],
    trunk: { r: 0.035, lean: 0.06, stems: [1, 2], splay: 0.12 }, branches: { count: [8, 14], steep: 0.08, droop: 0.12 },
    body: { scale: 0.36, color: "#5d7a32" }, surface: 0.45, leaves: { count: 1.1, size: 1.5, hanging: 0.32 },
    color: [0.2, 0.5, 0.42],
    bark: ridged("salix-bark", "#6a6152", "rgba(35,30,24,0.55)", "rgba(140,130,110,0.3)", 30), leaf: twig("salix-leaf", oval(0.16), { leaves: 14, len: [28, 38], spread: 0.55, stems: 3 }),
  },
  /** Pioppo cipressino (Populus nigra 'Italica'): a tall narrow column of upright branches, small diamond leaves. */
  lombardyPoplar: {
    radius: OUTLINES.poplar, width: [0.15, 0.3, 0.22], clear: [0.04, 0.1],
    trunk: { r: 0.022, leader: 0.92 }, branches: { count: [12, 18], steep: 0.14 },
    body: { scale: 0.7, color: "#2d4a24" }, surface: 0.65, leaves: { size: 0.75 },
    color: [0.24, 0.48, 0.32], alt: { color: [0.2, 0.25, 0.48], share: 0.08 },
    bark: ridged("populus-bark", "#56504a", "rgba(28,24,20,0.6)", "rgba(120,112,100,0.3)", 34), leaf: twig("populus-leaf", triangular, { leaves: 10, len: [16, 22] }),
  },
  /** Oleandro (Nerium oleander): a shrub of many stems, narrow leathery leaves in whorls, pink, white or red flowers. */
  oleander: {
    radius: OUTLINES.oleander, width: [0.8, 1.3, 1], clear: [0, 0.04],
    trunk: { r: 0.012, stems: [5, 8], splay: 0.4, leader: 0.75, flare: 1 }, branches: { count: [6, 10], steep: 0.12 },
    body: { scale: 0.5, color: "#2d4526" }, surface: 0.55, leaves: { count: 1.2, size: 2.2 },
    color: [0.3, 0.4, 0.22],
    bark: ridged("nerium-bark", "#7b766a", "rgba(50,46,40,0.4)", "rgba(150,145,130,0.3)", 12), leaf: twig("nerium-leaf", oval(0.17), { leaves: 5, len: [32, 42], whorl: 3, stems: 2 }),
    extras: ({ g, r, onOutline, H }) => {
      const tone = ["#f08bb4", "#f7f2ec", "#e0505e"][Math.floor(r() * 3)]!;
      const pts = Array.from({ length: Math.round(40 + H * 18) }, () => onOutline(0.25 + r() * 0.75, r() * Math.PI * 2, 0.95 + r() * 0.1));
      dots(g, pts, Math.max(0.04, H * 0.022), tone);
    },
  },
};

export type SpeciesModel = keyof typeof SPECIES;
export function realSpecies(kind: SpeciesModel, def: { h: number; w: number }, seed = 1): THREE.Group {
  return buildBroadleaf(SPECIES[kind]!, def, seed);
}
