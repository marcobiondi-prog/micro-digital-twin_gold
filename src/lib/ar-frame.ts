// Browser-only composition of one AI-camera frame: video, optional thermal layer, then the 3D overlay.
// Kept free of Three.js so the caller can decide whether the perspective grid belongs in the frame.

export type ArFrameScene = {
  canvas: HTMLCanvasElement;
  render: (w: number, h: number, showGrid: boolean) => void;
};

export type ArFrameSource = {
  video: HTMLVideoElement;
  scene: ArFrameScene | null;
  /** Thermal overlay drawn on the video, below the 3D objects. */
  heat?: ((g: CanvasRenderingContext2D, w: number, h: number) => void) | undefined;
  /** Counter-rotate only the footage when the HUD uses a locked-host fallback. */
  rotation?: number;
  /** Digital zoom: centred crop factor (1 = none). */
  zoom?: number;
};

export function drawCameraVideo(g: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number, rotation = 0, zoom = 1) {
  const sideways = Math.abs(rotation) === 90;
  const w = sideways ? height : width, h = sideways ? width : height;
  // Digital zoom narrows the centred "fill" crop, so every consumer sees the same framing.
  const r = Math.max(w / video.videoWidth, h / video.videoHeight) * Math.max(1, zoom);
  const sw = w / r, sh = h / r;
  if (rotation) {
    g.save();
    g.translate(width / 2, height / 2);
    g.rotate(rotation * Math.PI / 180);
    g.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
    g.restore();
  } else g.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
}

/** Freeze the live raw crop/orientation for recognition without its grid. */
export function freezeCameraFrame(target: HTMLCanvasElement, video: HTMLVideoElement, rotation: number, zoom = 1): HTMLCanvasElement | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const frame = document.createElement("canvas");
  const scale = Math.min(1, 1536 / Math.max(target.width, target.height));
  frame.width = Math.max(1, Math.round(target.width * scale));
  frame.height = Math.max(1, Math.round(target.height * scale));
  const context = frame.getContext("2d");
  const preview = target.getContext("2d");
  if (!context || !preview) return null;
  drawCameraVideo(context, video, frame.width, frame.height, rotation, zoom);
  preview.drawImage(frame, 0, 0, target.width, target.height);
  return frame;
}

/**
 * Paints the canvas exactly as the preview shows it. `showGrid` is false for saved photos,
 * so the grid stays a guide on screen and never ends up in the picture.
 */
export function paintArFrame(canvas: HTMLCanvasElement, source: ArFrameSource, showGrid: boolean): boolean {
  const { video, scene, heat } = source;
  if (!video.videoWidth || !video.videoHeight) return false;
  // Canvas con le proporzioni dello schermo: fattore bilanciato a max 1.0 per massima fluidità, leggerezza e risparmio energetico
  const k = Math.min(1.0, window.devicePixelRatio || 1);
  const cw = Math.round((canvas.clientWidth || 360) * k);
  const ch = Math.round((canvas.clientHeight || 640) * k);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const g = canvas.getContext("2d");
  if (!g) return false;
  drawCameraVideo(g, video, cw, ch, source.rotation, source.zoom);
  heat?.(g, cw, ch);
  if (scene) {
    // La griglia segue l'inclinazione del telefono, ma solo dove viene mostrata a schermo.
    scene.render(cw, ch, showGrid);
    g.drawImage(scene.canvas, 0, 0, cw, ch);
  }
  return true;
}
