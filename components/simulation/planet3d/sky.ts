import * as THREE from "three";
import type { QualityProfile } from "../../../lib/qualityProfile";

/** v1.8.0 — colore del cielo in terza persona e della foschia atmosferica. Lo spazio (vista dall'alto) resta nel componente. */
export const SKY_COLOR = 0x9cc3e6;
/** v1.10.6 — Cielo: colore dello zenit e dell'orizzonte (il cielo in terza persona non è più un colore piatto). */
export const SKY_ZENITH = 0x4f83c0;
export const SKY_HORIZON = 0xd7e4ef;
/** v1.10.6 — Nuvole: quante per livello di qualità, a che altezza, quanto è grande l'area in cui vivono e quanto vento. */
export const CLOUD_COUNTS: Record<QualityProfile["level"], number> = { "2d": 0, basso: 0, medio: 8, alto: 14 };
export const CLOUD_HEIGHT = 7;
export const CLOUD_SPREAD = 22;
export const CLOUD_WIND = 0.12; // unità del mondo al secondo

export function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 24, 12);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color(SKY_ZENITH);
  const horizon = new THREE.Color(SKY_HORIZON);
  const haze = new THREE.Color(SKY_COLOR);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i); // +1 zenit, 0 orizzonte, -1 sotto
    if (t >= 0) c.copy(horizon).lerp(zenith, Math.pow(t, 0.7));
    else c.copy(horizon).lerp(haze, Math.min(1, -t * 2)); // sotto l'orizzonte: sfuma nella foschia del suolo
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(40);
  mesh.renderOrder = -10; // dietro a tutto
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

/**
 * v1.10.6 — Texture morbida di una nuvola: tre blob ellittici sfumati, generata una volta
 * con la sola matematica (niente immagini da caricare, niente canvas 2D).
 */
export function createCloudTexture(): THREE.Texture {
  const SIZE = 64;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const blobs = [
    { x: 0.5, y: 0.55, rx: 0.42, ry: 0.22, a: 1 },
    { x: 0.3, y: 0.5, rx: 0.2, ry: 0.14, a: 0.8 },
    { x: 0.68, y: 0.5, rx: 0.22, ry: 0.15, a: 0.85 },
  ];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let a = 0;
      for (const b of blobs) {
        const dx = (x + 0.5) / SIZE - b.x;
        const dy = (y + 0.5) / SIZE - b.y;
        const d = Math.sqrt((dx / b.rx) * (dx / b.rx) + (dy / b.ry) * (dy / b.ry));
        a = Math.max(a, b.a * Math.max(0, 1 - d));
      }
      const k = (y * SIZE + x) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = Math.round(Math.min(1, a * a) * 255); // falloff morbido ai bordi
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}
