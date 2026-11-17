import * as THREE from "three";
import type { RenderFrame } from "../../../types";
import { projectToSphere } from "../../../lib/sphereProjection";
import { creatureScale } from "../../../lib/worldScale";
import { restingRadius } from "./terrainSampling";
import type { SceneRefs } from "./types";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Positions (or hides) the selection ring for the currently selected
 * organism, if any. Searches the full (unsampled) organismsId array rather
 * than relying on the LOD-strided instance loop above, since the selected
 * organism might not have been included in this frame's rendered subset.
 */
export function updateSelectionRing(refs: SceneRefs, frame: RenderFrame, selectedId: number | null): void {
  if (selectedId === null) {
    refs.selectionRing.visible = false;
    return;
  }

  const { organismsId, organismsX, organismsY, organismsSize, planetWidth, planetHeight } = frame;
  let index = -1;
  for (let i = 0; i < organismsId.length; i++) {
    if (organismsId[i] === selectedId) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    refs.selectionRing.visible = false;
    return;
  }

  const point = projectToSphere(organismsX[index], organismsY[index], planetWidth, planetHeight, restingRadius(refs, organismsX[index], organismsY[index], 0.05));
  const normal = new THREE.Vector3(point.normalX, point.normalY, point.normalZ);
  refs.selectionRing.position.set(point.x, point.y, point.z);
  refs.selectionRing.quaternion.setFromUnitVectors(UP, normal);
  refs.selectionRing.rotateX(Math.PI / 2); // torus is authored flat on XY; align its face with the surface normal

  const baseScale = creatureScale(organismsSize[index]);
  const ringScale = baseScale * 2.2;
  refs.selectionRing.scale.set(ringScale, ringScale, ringScale);
  refs.selectionRing.visible = true;
}
