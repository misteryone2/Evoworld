import type { SimulationSpeed } from "../../types";

/**
 * SimulationClock drives how many simulation ticks should run per real
 * elapsed millisecond. It is completely independent of rendering: the UI
 * layer (or the worker's own loop) asks the clock how many ticks to advance
 * given a time delta, and the clock does not know anything about React,
 * canvas, or the DOM.
 */
export class SimulationClock {
  private speed: SimulationSpeed = 1;
  private accumulatorMs = 0;

  /** Simulated milliseconds represented by a single tick at speed = 1. */
  static readonly MS_PER_TICK = 100;

  setSpeed(speed: SimulationSpeed): void {
    this.speed = speed;
  }

  getSpeed(): SimulationSpeed {
    return this.speed;
  }

  isPaused(): boolean {
    return this.speed === 0;
  }

  /**
   * Given how many real milliseconds elapsed, returns how many simulation
   * ticks should be run now. Uses an accumulator so fractional ticks are not
   * lost between calls, keeping speed accurate over time regardless of the
   * calling framerate.
   */
  ticksForElapsed(elapsedMs: number): number {
    if (this.speed === 0) return 0;
    this.accumulatorMs += elapsedMs * this.speed;
    const ticks = Math.floor(this.accumulatorMs / SimulationClock.MS_PER_TICK);
    this.accumulatorMs -= ticks * SimulationClock.MS_PER_TICK;
    return ticks;
  }

  reset(): void {
    this.accumulatorMs = 0;
  }
}
