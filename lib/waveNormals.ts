/**
 * v1.9.5 — Onde procedurali condivise. Normal map tileabile 64x64 generata
 * una volta sola (somma di onde sinusoidali incrociate): la usa l'oceano in
 * orbita (components/simulation/Planet3DView.tsx) e la superficie dell'acqua
 * della scena locale (components/simulation/localScene.ts). L'animazione non
 * costa nulla: si sposta l'offset della texture, mai un pixel ricalcolato.
 */
import * as THREE from "three";

export const WAVE_TEXTURE_SIZE = 64;

export function createWaveNormalTexture(size: number = WAVE_TEXTURE_SIZE): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = y / size;
      const v = x / size;
      const dx = Math.cos((u * 2 + v) * Math.PI * 2) * 0.35 + Math.cos((u + v) * Math.PI * 8) * 0.12;
      const dy = Math.cos((v * 2 - u) * Math.PI * 2) * 0.35 + Math.cos((u - v) * Math.PI * 8) * 0.12;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
