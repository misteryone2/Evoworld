import * as THREE from "three";
import type { CreatureAnatomy } from "./creatureAnatomy";

/** Radius of the unit cone geometry used for tail, jaw and spikes. */
const CONE_BASE_RADIUS = 0.35;
const Q_TIP_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const Q_TIP_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

export interface CreatureModel {
  /** The creature's parts in its own space: +Z forward, +Y up, resting on y = 0. */
  group: THREE.Group;
  /** Frees every geometry and material this model created. */
  dispose: () => void;
}

/**
 * v1.5.0 — Creature 3D. Builds one creature as a plain (non-instanced)
 * THREE.Group from its anatomy — the same torso/head/eyes/tail/jaw/spikes
 * placement the world view draws with instancing (see
 * components/simulation/Planet3DView.tsx), for places that show a single
 * creature up close, like a species portrait.
 */
export function buildCreatureModel(anatomy: CreatureAnatomy, color: THREE.ColorRepresentation): CreatureModel {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const base = new THREE.Color(color);
  const bodyColor = base.clone();
  if (anatomy.aggression > 0.15) bodyColor.lerp(new THREE.Color(1, 0.35, 0.27), anatomy.aggression * 0.35);

  const material = (c: THREE.ColorRepresentation, roughness = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0.1 });
    materials.push(m);
    return m;
  };

  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const cone = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 8);
  geometries.push(sphere, cone);

  const lift = anatomy.bodyHalfHeight * 0.8;
  const add = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    name: string,
    pos: [number, number, number],
    scale: [number, number, number],
    rotation?: THREE.Quaternion,
  ) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    if (rotation) mesh.quaternion.copy(rotation);
    group.add(mesh);
  };

  const bodyMat = material(bodyColor);
  add(sphere, bodyMat, "body", [0, lift, 0], [anatomy.bodyHalfWidth, anatomy.bodyHalfHeight, anatomy.bodyHalfLength]);
  add(sphere, material(bodyColor), "head", [0, lift + anatomy.headY, anatomy.headZ], [anatomy.headRadius, anatomy.headRadius, anatomy.headRadius]);

  const eyeMat = material(0x0b0f14, 0.25);
  for (const side of [-1, 1]) {
    add(sphere, eyeMat, "eye", [side * anatomy.eyeX, lift + anatomy.eyeY, anatomy.eyeZ], [anatomy.eyeRadius, anatomy.eyeRadius, anatomy.eyeRadius]);
  }

  const tailColor = bodyColor.clone().multiplyScalar(0.82);
  add(
    cone,
    material(tailColor),
    "tail",
    [0, lift, anatomy.tailZ],
    [anatomy.tailRadius / CONE_BASE_RADIUS, anatomy.tailLength, anatomy.tailRadius / CONE_BASE_RADIUS],
    Q_TIP_BACK,
  );

  if (anatomy.jawVisible) {
    add(
      cone,
      material(0xc8553d, 0.5),
      "jaw",
      [0, lift + anatomy.jawY, anatomy.jawZ],
      [anatomy.jawRadius / CONE_BASE_RADIUS, anatomy.jawLength, anatomy.jawRadius / CONE_BASE_RADIUS],
      Q_TIP_FORWARD,
    );
  }

  if (anatomy.spikes.length > 0) {
    const spikeMat = material(bodyColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3), 0.5);
    for (const spike of anatomy.spikes) {
      add(
        cone,
        spikeMat,
        "spike",
        [0, lift + anatomy.bodyHalfHeight * 0.95 + spike.height * 0.45, spike.z],
        [spike.radius / CONE_BASE_RADIUS, spike.height, spike.radius / CONE_BASE_RADIUS],
      );
    }
  }

  return {
    group,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
