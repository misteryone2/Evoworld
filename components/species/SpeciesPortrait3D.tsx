"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { computeCreatureAnatomy, type CreatureTraits } from "../../lib/creatureAnatomy";
import { buildCreatureModel, type CreatureModel } from "../../lib/creatureModel";

interface Props {
  traits: CreatureTraits;
  color: string;
  size?: number;
}

/**
 * v1.5.0 — Creature 3D. A species' "typical individual" as a real 3D
 * creature turning slowly on the spot: the same body plan the world view
 * draws (lib/creatureAnatomy.ts), built from the species' mean traits for
 * a living species or its frozen origin snapshot for an extinct one. The
 * model is rebuilt only when its proportions actually change (the traits
 * are rounded to a stable key first), not on every simulation frame.
 */
export function SpeciesPortrait3D({ traits, color, size = 96 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ pivot: THREE.Group; fit: (model: CreatureModel) => void } | null>(null);

  const key = [traits.speed, traits.carnivory, traits.vision, traits.evasion, traits.huntingSkill].map((v) => v.toFixed(2)).join("|") + color;
  // The traits object itself changes identity every frame; only the rounded values matter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableTraits = useMemo(() => traits, [key]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    const pivot = new THREE.Group();
    scene.add(pivot);

    // Centers the creature on the pivot and backs the camera off so it fits whatever its proportions.
    const fit = (model: CreatureModel) => {
      const box = new THREE.Box3().setFromObject(model.group);
      const center = box.getCenter(new THREE.Vector3());
      const extent = box.getSize(new THREE.Vector3());
      model.group.position.sub(center);
      const distance = Math.max(extent.x, extent.y, extent.z) * 2.1 + 1;
      camera.position.set(distance * 0.55, distance * 0.35, distance * 0.8);
      camera.lookAt(0, 0, 0);
    };
    stateRef.current = { pivot, fit };

    let frameId = 0;
    const loop = () => {
      pivot.rotation.y += 0.012;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      stateRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [size]);

  useEffect(() => {
    // Wait one tick of the mount effect ordering: the scene state exists once the first effect ran.
    const state = stateRef.current;
    if (!state) return;
    const model = buildCreatureModel(computeCreatureAnatomy(stableTraits), color);
    state.fit(model);
    state.pivot.add(model.group);
    return () => {
      state.pivot.remove(model.group);
      model.dispose();
    };
  }, [stableTraits, color, size]);

  return <div ref={mountRef} className="species-portrait-3d" style={{ width: size, height: size }} role="img" aria-label="Ritratto 3D della specie" />;
}
