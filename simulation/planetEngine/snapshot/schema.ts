/**
 * CONTRACT / SCHEMA
 *
 * Environment Snapshot versioning. Version 1 is the headless bridge to
 * ecology/GENOME; it is additive and never mutates shared types.
 */

import type { EnvironmentSnapshot } from "../contracts";

export const ENVIRONMENT_SNAPSHOT_VERSION = 1;

export function isEnvironmentSnapshot(value: unknown): value is EnvironmentSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<EnvironmentSnapshot>;
  return (
    candidate.version === ENVIRONMENT_SNAPSHOT_VERSION &&
    typeof candidate.engineVersion === "string" &&
    typeof candidate.tick === "number" &&
    typeof candidate.timeS === "number" &&
    typeof candidate.sample === "function" &&
    typeof candidate.toLegacyCell === "function"
  );
}

export function assertEnvironmentSnapshot(value: unknown): EnvironmentSnapshot {
  if (!isEnvironmentSnapshot(value)) throw new Error("Invalid Environment Snapshot v1");
  return value;
}
