import * as THREE from "three";

export const SUN_ORBIT_POSITION: [number, number, number] = [6, 4, 8];

const sunDir = new THREE.Vector3();
const sunSide = new THREE.Vector3();

/**
 * v1.9.2 — Ampiezza dell'area coperta dalle ombre del sole: semi-lato della camera
 * ortografica dell'ombra. In orbita copre l'intero pianeta (le montagne si gettano
 * ombra addosso); in terza persona si restringe all'area locale, così le stesse
 * 2048x2048 pixel d'ombra si concentrano su pochi metri e restano nitide.
 */
export function setSunShadowExtent(sun: THREE.DirectionalLight, half: number): void {
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -half;
  sc.right = half;
  sc.top = half;
  sc.bottom = -half;
  sc.updateProjectionMatrix();
}

/** v1.8.0 — In terza persona il sole sta sopra chi guarda, un po' di lato, così il suolo è sempre illuminato. */
export function placeFollowSun(sun: THREE.DirectionalLight, cameraPosition: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): void {
  sunDir.copy(target).sub(cameraPosition);
  if (sunDir.lengthSq() < 1e-12) sunDir.set(0, 0, -1);
  sunDir.normalize();
  sunSide.crossVectors(up, sunDir);
  sun.position.copy(target).addScaledVector(up, 7).addScaledVector(sunDir, -2).addScaledVector(sunSide, 3);
}
