/**
 * ATLAS — code couleur des DAS.
 *
 * Chaque domaine garde la MÊME teinte partout où il apparaît (stratégie,
 * cession, cabinet, projecteur) sans qu'aucune table ne la stocke : elle est
 * dérivée de son nom, qui ne change pas en cours de session. Un domaine créé
 * après coup obtient sa teinte au premier rendu, sans migration.
 */

/** Hash déterministe, stable d'un rendu serveur à l'autre. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Angle d'or : les teintes successives d'un hash croissant restent
 * perceptuellement écartées au lieu de se regrouper par tranches de `% 360`.
 */
const GOLDEN_ANGLE = 137.508;

export function dasHue(seed: string): number {
  return (hashSeed(seed) * GOLDEN_ANGLE) % 360;
}

export interface DasColor {
  /** Le point plein — puce, bordure de carte active. */
  dot: string;
  /** Texte sur fond clair. */
  text: string;
  /** Fond très clair, pour un badge ou un liseré. */
  subtle: string;
  /** Bordure assortie au fond clair. */
  border: string;
}

/** oklch : luminosité et chroma fixes, seule la teinte varie — la palette reste harmonieuse. */
export function dasColor(seed: string): DasColor {
  const hue = dasHue(seed);
  return {
    dot: `oklch(0.62 0.13 ${hue})`,
    text: `oklch(0.42 0.11 ${hue})`,
    subtle: `oklch(0.96 0.025 ${hue})`,
    border: `oklch(0.82 0.06 ${hue})`,
  };
}
