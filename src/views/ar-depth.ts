import * as THREE from "three";

/**
 * Real walls and furniture hiding the AR objects (WebXR "depth-sensing", ARCore's Depth API).
 *
 * The session asks the depth on the CPU (Chrome on Android gives it so): every frame the phone's depth map, a small
 * picture of metres (about 160×90), is turned into a float texture, and a full-screen pass drawn before the objects
 * writes it into the depth buffer, so a post standing behind a real wall fails the depth test and is not drawn.
 * A small bias keeps things lying on the floor (shadows, the reticle) from flickering under the floor's own depth.
 */

/** Whether the depth is asked with the session, kept on this phone. */
const WANT_KEY = "mdt-ar-depth-v1", FLIP_KEY = "mdt-ar-depth-flip-v1";
// On by default (the objects must see the room around them); «Spegni profondità» keeps it off on this phone.
export function depthWanted(): boolean { try { return localStorage.getItem(WANT_KEY) !== "off"; } catch { return true; } }
export function setDepthWanted(on: boolean) { try { localStorage.setItem(WANT_KEY, on ? "on" : "off"); } catch { /* private mode */ } }
/** How the depth map is turned against the screen, to find the right one by trying: 0…3. */
export const FLIP_MODES = 4;
export function depthFlip(): number { try { const n = Number(localStorage.getItem(FLIP_KEY)); return n >= 0 && n < FLIP_MODES ? n : 0; } catch { return 0; } }
export function setDepthFlip(n: number) { try { localStorage.setItem(FLIP_KEY, String(n)); } catch { /* private mode */ } }

/** The depth asked with the session: CPU-side, as Chrome on ARCore gives it. */
export const DEPTH_INIT = {
  usagePreference: ["cpu-optimized"],
  dataFormatPreference: ["luminance-alpha", "float32"],
  // The newer spelling of the same two lists.
  usage: ["cpu-optimized"],
  dataFormat: ["luminance-alpha", "float32"],
};

/**
 * three.js asks XRWebGLBinding.getDepthInformation whenever the session has "depth-sensing", which throws on a
 * CPU-depth session and would stop the render loop: answered with null instead (three then skips its own GPU pass).
 */
export function patchGpuDepthQuery() {
  const B = (globalThis as unknown as { XRWebGLBinding?: { prototype: { getDepthInformation?: (v: unknown) => unknown }; __mdtDepth?: boolean } }).XRWebGLBinding;
  if (!B || B.__mdtDepth || !B.prototype.getDepthInformation) return;
  const orig = B.prototype.getDepthInformation;
  B.prototype.getDepthInformation = function (this: unknown, view: unknown) {
    try { return orig.call(this, view); } catch { return null; }
  };
  B.__mdtDepth = true;
}

type CpuDepth = {
  width: number; height: number; data: ArrayBuffer; rawValueToMeters: number;
  normDepthBufferFromNormView: { matrix: Float32Array };
};

const FRAG = /* glsl */ `
uniform sampler2D depthTex;
uniform mat4 uvT;
uniform mat4 proj;
uniform vec2 size;
uniform float bias;
uniform int flip;
void main() {
  // Normalized view coordinates start at the top left; the framebuffer's at the bottom left.
  vec2 uv = gl_FragCoord.xy / size;
  // flip 0: y from the top (the spec's reading); 1: as the framebuffer; 2 and 3: the same mirrored sideways.
  if (flip == 0 || flip == 2) uv.y = 1.0 - uv.y;
  if (flip >= 2) uv.x = 1.0 - uv.x;
  vec2 duv = (uvT * vec4(uv, 0.0, 1.0)).xy;
  float m = texture(depthTex, duv).r;
  if (m <= 0.0 || duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0) { gl_FragDepth = 1.0; return; }
  vec4 c = proj * vec4(0.0, 0.0, -(m + bias), 1.0);
  gl_FragDepth = clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0);
}`;

export class DepthOccluder {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private tex: THREE.DataTexture | null = null;
  private buf: Float32Array | null = null;
  private u = {
    depthTex: { value: null as THREE.Texture | null },
    uvT: { value: new THREE.Matrix4() },
    proj: { value: new THREE.Matrix4() },
    size: { value: new THREE.Vector2(1, 1) },
    bias: { value: 0.08 },
    flip: { value: depthFlip() },
  };
  setFlip(n: number) { this.u.flip.value = n; }
  /** Whether a depth map was given in the last frame. */
  live = false;
  /** Off by hand (the AI fan's «Profondità»). */
  enabled = true;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.u,
      vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: FRAG,
      colorWrite: false,
      depthWrite: true,
      // With the depth test off WebGL writes no depth at all: on, and always passing.
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r, _s, cam) => {
      const u = this.u;
      u.proj.value.copy(cam.projectionMatrix);
      const rt = r.getRenderTarget();
      const vp = (cam as THREE.Camera & { viewport?: THREE.Vector4 }).viewport;
      if (rt) u.size.value.set(rt.width, rt.height);
      else if (vp && vp.z > 0) u.size.value.set(vp.z, vp.w);
      else r.getDrawingBufferSize(u.size.value);
    };
  }

  /** Reads this frame's depth map; false when the phone gives none (no depth, or not yet). */
  update(frame: XRFrame, view: XRView | undefined, format: string | undefined): boolean {
    const get = (frame as XRFrame & { getDepthInformation?: (v: XRView) => CpuDepth | null }).getDepthInformation;
    let d: CpuDepth | null = null;
    if (view && get) { try { d = get.call(frame, view); } catch { d = null; } }
    if (!d || !d.width || !d.height) { this.live = false; this.mesh.visible = false; return false; }
    const n = d.width * d.height;
    const src = format === "float32" ? new Float32Array(d.data) : new Uint16Array(d.data);
    if (!this.buf || this.buf.length !== n) this.buf = new Float32Array(n);
    const k = d.rawValueToMeters;
    for (let i = 0; i < n; i++) this.buf[i] = (src[i] ?? 0) * k;
    if (!this.tex || this.tex.image.width !== d.width || this.tex.image.height !== d.height) {
      this.tex?.dispose();
      this.tex = new THREE.DataTexture(this.buf, d.width, d.height, THREE.RedFormat, THREE.FloatType);
      this.tex.minFilter = THREE.NearestFilter;
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.generateMipmaps = false;
      this.u.depthTex.value = this.tex;
    } else this.tex.image.data = this.buf;
    this.tex.needsUpdate = true;
    this.u.uvT.value.fromArray(d.normDepthBufferFromNormView.matrix);
    this.live = true;
    this.mesh.visible = this.enabled;
    return true;
  }

  dispose() {
    this.tex?.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}
