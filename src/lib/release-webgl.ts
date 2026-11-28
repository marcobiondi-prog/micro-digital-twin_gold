/**
 * Frees the WebGL contexts of the canvases inside an element (open shadow roots included) before it is taken away.
 * Switching between the 2D and the 3D map built a new map each time; Google's 3D element did not give its context back,
 * and after a few switches the browser had none left (phones allow only a handful): the map opened second failed
 * ("Mappa non disponibile" in 2D, the notice in 3D), whichever it was.
 */
export function releaseWebGL(root: Element | ShadowRoot | null | undefined): void {
  if (!root) return;
  const visit = (node: Element | ShadowRoot) => {
    node.querySelectorAll("canvas").forEach((c) => {
      for (const kind of ["webgl2", "webgl"] as const) {
        try {
          // getContext of the canvas's own kind returns the context it already has; another kind returns null.
          const gl = c.getContext(kind) as WebGLRenderingContext | null;
          if (gl) { gl.getExtension("WEBGL_lose_context")?.loseContext(); break; }
        } catch { /* not this kind */ }
      }
    });
    node.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) visit(el.shadowRoot); });
  };
  try { visit(root); if (root instanceof Element && root.shadowRoot) visit(root.shadowRoot); } catch { /* nothing to free */ }
}
