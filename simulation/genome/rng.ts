import type { GenomeRng, GenomeRngState, RngTrace, SemVer } from "./types";

const ENGINE_VERSION: SemVer = "0.0.0-gen1";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stateNumber(state: GenomeRngState): number {
  return state.state >>> 0;
}

function makeState(
  rootSeed: number | string,
  namespace: string,
  salt: string,
  algorithmVersion: SemVer,
): GenomeRngState {
  const seedNum =
    typeof rootSeed === "number" ? rootSeed >>> 0 : hashString(String(rootSeed));
  const derived = hashString(`${seedNum}:${namespace}:${salt}`) >>> 0;
  return {
    algorithm: "mulberry32-derived",
    algorithmVersion,
    rootSeed,
    namespace,
    salt,
    state: derived || 0x9e3779b9,
    drawCount: 0,
  };
}

class DerivedRng implements GenomeRng {
  private s: GenomeRngState;
  private readonly engineVersion: SemVer;

  constructor(state: GenomeRngState, engineVersion: SemVer = ENGINE_VERSION) {
    this.s = { ...state };
    this.engineVersion = engineVersion;
  }

  next(): number {
    this.s = { ...this.s, state: (this.s.state + 0x6d2b79f5) >>> 0, drawCount: this.s.drawCount + 1 };
    let t = Math.imul(this.s.state ^ (this.s.state >>> 15), 1 | this.s.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi < lo) throw new Error(`invalid int range ${min}-${max}`);
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("cannot pick from empty array");
    return items[Math.floor(this.next() * items.length)];
  }

  getState(): GenomeRngState {
    return { ...this.s };
  }

  fork(namespace: string, salt = ""): GenomeRng {
    const child = makeState(this.s.rootSeed, `${this.s.namespace}/${namespace}`, salt, this.s.algorithmVersion);
    return new DerivedRng(child, this.engineVersion);
  }

  snapshot(stateBefore?: GenomeRngState): RngTrace {
    const before = stateBefore ?? this.s;
    return {
      algorithm: this.s.algorithm,
      algorithmVersion: this.s.algorithmVersion,
      rootSeed: this.s.rootSeed,
      namespace: this.s.namespace,
      salt: this.s.salt,
      stateBefore: String(before.state >>> 0),
      stateAfter: String(this.s.state >>> 0),
      drawCount: this.s.drawCount - (stateBefore ? stateBefore.drawCount : 0),
      engineVersion: this.engineVersion,
    };
  }

  toStringState(): string {
    return `${this.s.algorithm}:${this.s.algorithmVersion}:${this.s.rootSeed}:${this.s.namespace}:${this.s.salt}:${this.s.state >>> 0}:${this.s.drawCount}`;
  }
}

export function createRng(
  rootSeed: number | string,
  namespace = "genome",
  salt = "",
  algorithmVersion: SemVer = "1.0.0",
): GenomeRng {
  return new DerivedRng(makeState(rootSeed, namespace, salt, algorithmVersion));
}

export function rngFromState(state: GenomeRngState): GenomeRng {
  return new DerivedRng({ ...state });
}

export function stableHash(value: unknown): string {
  return hashString(canonicalize(value)).toString(16).padStart(8, "0");
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return Number.isFinite(value) ? `n:${value}` : `n:${String(value)}`;
  if (typeof value === "bigint") return `bi:${value.toString()}`;
  if (typeof value === "string") return `s:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `b:${value}`;
  if (Array.isArray(value)) return `a:[${value.map(canonicalize).join(",")}]`;
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return `m:{${entries.map(([k, v]) => `${canonicalize(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  if (value instanceof Set) {
    const items = Array.from(value.values()).map(canonicalize).sort();
    return `set:{${items.join(",")}}`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `o:{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
  }
  return `x:${String(value)}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortDeep(obj[k]);
    return out;
  }
  return value;
}

export function deriveDrawRng(root: GenomeRng, namespace: string, salt = ""): GenomeRng {
  return root.fork(namespace, salt);
}

// Ensure mulberry32 referenced for potential future use; deterministic helper.
void mulberry32;
void stateNumber;
