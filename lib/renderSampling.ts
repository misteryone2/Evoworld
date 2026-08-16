/**
 * v1.0.2 — LOD adattivo. When a population grows far beyond what's usefully
 * distinguishable on screen anyway, rendering every single organism with
 * full per-instance detail costs real per-frame CPU time (writing an
 * instance matrix + color per organism into the InstancedMesh buffers —
 * see Planet3DView.tsx), which scales linearly with population. On a phone
 * that cost adds up fast once a world grows into the tens of thousands.
 *
 * This never touches the simulation itself (World.step() has no population
 * cap and never will — the engine scales to whatever the hardware running
 * the worker can handle); it only controls how many of those organisms the
 * renderer actually bothers drawing each frame, via deterministic striding
 * (every Nth organism) rather than random sampling, so the same subset is
 * shown/hidden consistently frame to frame instead of flickering as a
 * different random sample gets picked each tick.
 */

/**
 * Stride to apply when iterating organisms for rendering: 1 (render
 * everyone) while the population is at or below the target, otherwise the
 * smallest integer stride that brings the rendered count down to roughly
 * targetRenderCount.
 */
export function computeRenderStride(populationCount: number, targetRenderCount: number): number {
  if (targetRenderCount <= 0) return 1;
  if (populationCount <= targetRenderCount) return 1;
  return Math.ceil(populationCount / targetRenderCount);
}

/** How many organisms will actually get a rendered instance for a given population and stride (accounts for the remainder from integer striding). */
export function estimateRenderedCount(populationCount: number, stride: number): number {
  if (stride <= 1) return populationCount;
  return Math.ceil(populationCount / stride);
}
