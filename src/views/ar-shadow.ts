import * as THREE from "three";

/**
 * Real cast shadows in the AR view: the objects put down throw their shadow on the real floor. A light of no
 * brightness of its own only casts (so the scene's lighting is unchanged), from the direction ARCore estimates for
 * the strongest real light when it gives one, else from a high sun; an invisible floor of ShadowMaterial at the
 * floor's height receives it, darkening only where the shadow falls. The shadow's box follows the objects put down.
 */
const DEFAULT_DIR = new THREE.Vector3(0.35, 0.85, 0.25).normalize();

export class ArShadows {
  private light: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private dir = DEFAULT_DIR.clone();
  private center = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.light = new THREE.DirectionalLight("#ffffff", 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.0008;
    this.light.shadow.normalBias = 0.02;
    this.light.shadow.radius = 4;
    scene.add(this.light, this.light.target);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ color: "#000000", opacity: 0.38, depthWrite: false }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    this.ground.renderOrder = -10;
    scene.add(this.ground);
  }

  /** Once a frame: where the objects are, the floor's height and, when ARCore gives it, the real light's direction. */
  update(objects: Iterable<THREE.Object3D>, floorY: number | null, lightDir?: THREE.Vector3 | null) {
    let n = 0;
    this.center.set(0, 0, 0);
    const list: THREE.Object3D[] = [];
    for (const o of objects) { this.center.add(o.position); list.push(o); n++; }
    const on = n > 0 && floorY !== null;
    this.ground.visible = on;
    this.light.castShadow = on;
    if (!on) return;
    this.center.divideScalar(n);
    this.center.y = floorY!;
    let reach = 4;
    for (const o of list) reach = Math.max(reach, Math.hypot(o.position.x - this.center.x, o.position.z - this.center.z) + 6 * o.scale.x);
    reach = Math.min(reach, 30);
    // A light lower than about 10° would stretch shadows across the whole room: kept no lower than that.
    if (lightDir && lightDir.lengthSq() > 1e-6) {
      this.dir.copy(lightDir).normalize();
      if (this.dir.y < 0.18) { this.dir.y = 0.18; this.dir.normalize(); }
    } else this.dir.copy(DEFAULT_DIR);
    const cam = this.light.shadow.camera;
    cam.left = -reach; cam.right = reach; cam.top = reach; cam.bottom = -reach;
    cam.near = 0.5; cam.far = reach * 4 + 30;
    cam.updateProjectionMatrix();
    this.light.position.copy(this.center).addScaledVector(this.dir, reach * 2 + 12);
    this.light.target.position.copy(this.center);
    this.light.target.updateMatrixWorld();
    this.ground.position.set(this.center.x, floorY! + 0.003, this.center.z);
  }
}

/** Every solid piece of an object casts its shadow (see-through veils and the small foot shadows do not). */
export function castShadows(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined;
    const veil = !!mat && mat.transparent && !mat.depthWrite;
    m.castShadow = !veil && !(mat instanceof THREE.MeshBasicMaterial);
  });
}
