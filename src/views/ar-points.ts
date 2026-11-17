import * as THREE from "three";

const S = new THREE.Vector3();

/**
 * three.js draws a point's size in world units without the object's own scale, so the mist of a misting pole or the
 * water of a sprinkler stayed full size when the object was made smaller (the «Modellino», two fingers): huge drops
 * round a tiny pole. Each frame the size follows the object's world scale. Points drawn at a fixed pixel size
 * (sizeAttenuation off, as the map's 3D sets them) are left alone.
 */
export function pointsFollowScale(points: THREE.Points): THREE.Points {
  const m = points.material as THREE.PointsMaterial;
  const base = m.size;
  const prev = points.onBeforeRender.bind(points);
  points.onBeforeRender = (...args) => {
    prev(...args);
    if (!m.sizeAttenuation) return;
    S.setFromMatrixScale(points.matrixWorld);
    m.size = base * ((S.x + S.y + S.z) / 3);
  };
  return points;
}
