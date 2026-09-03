/** ATLAS — utilitaires numériques partagés par le moteur. */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clamp100(value: number): number {
  return clamp(value, 0, 100);
}

/** Ramène `value` sur 0–100 par rapport à une référence, plafonné. */
export function normalizeTo100(value: number, reference: number): number {
  if (reference <= 0) return 0;
  return clamp100((value / reference) * 100);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Le moteur n'utilise JAMAIS Math.random : une résolution doit être
 * reproductible à l'identique à partir de (session, tour, contexte). C'est ce
 * qui permet de rejouer un tour litigieux devant les étudiants et de tester le
 * moteur sans flakiness.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dérive une graine entière stable à partir d'une chaîne de contexte. */
export function seedFrom(...parts: (string | number)[]): number {
  const input = parts.join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Tirage uniforme dans [min, max] à partir d'un rng donné. */
export function uniform(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}
