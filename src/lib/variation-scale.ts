/**
 * ATLAS — décider en variation, pas en valeur absolue.
 *
 * Une équipe ne sait pas si « 5 300 000 000 DH de marketing » est beaucoup :
 * elle n'a aucun repère. Elle sait en revanche parfaitement ce que veut dire
 * « je double mon effort commercial ». Chaque champ chiffré se pilote donc en
 * ÉCART par rapport au tour précédent, avec le montant affiché à côté — le
 * pourcentage porte l'intention, le montant garde la décision arbitrable.
 *
 * ── L'ÉCHELLE EST RELATIVE À LA FAMILLE ────────────────────────────────────
 * Le point qui fait tout tenir : les bornes ne sont pas les mêmes partout,
 * parce que la réalité ne l'est pas. Un budget marketing peut tripler d'un
 * exercice à l'autre ; un salaire brut moyen ne bouge que de quelques points,
 * et le baisser est de toute façon illégal au Maroc hors accord collectif.
 *
 * Les LIBELLÉS se calculent donc sur la position dans la fourchette autorisée,
 * jamais sur le pourcentage brut. « +20 % » est une hausse maximale sur les
 * salaires et une faible hausse sur le marketing — et c'est ce que le mot doit
 * dire, sans quoi l'échelle mentirait sur l'un des deux.
 *
 * Module pur : le composant `"use client"` et le clamp serveur s'en servent
 * tous les deux.
 */

/** Familles de champs, chacune avec sa réalité économique. */
export type VariationFamily =
  | 'investissement'
  | 'innovation'
  | 'marketing'
  | 'formation'
  | 'salaire'
  | 'recrutement'
  | 'depart'
  | 'siege'
  | 'credit'
  | 'budget_direction'
  | 'poste'
  | 'achat_volume'
  | 'indice';

export interface VariationBounds {
  /** Écart minimal autorisé, en points de pourcentage. Jamais sous −100. */
  min: number;
  /** Écart maximal autorisé, en points de pourcentage. */
  max: number;
}

/**
 * Bornes par défaut, calées sur ce qu'on observe en entreprise.
 *
 * Elles ne sont pas décoratives : ce sont elles qui rendent la décision
 * crédible. Ouvrir les salaires à +300 % ferait de la politique salariale un
 * levier magique, alors que c'est justement le poste le plus rigide du compte
 * de résultat.
 */
export const DEFAULT_BOUNDS: Readonly<Record<VariationFamily, VariationBounds>> = {
  // Un plan d'investissement se coupe net ou se triple ; c'est le poste le
  // plus discrétionnaire du budget.
  investissement: { min: -100, max: 200 },
  // La R&D se pilote dans la durée : la couper à zéro détruit la compétence
  // qu'on a mis des années à constituer.
  innovation: { min: -50, max: 150 },
  marketing: { min: -100, max: 200 },
  formation: { min: -100, max: 150 },
  // Le poste le plus rigide : inflation et augmentations annuelles, pas
  // davantage. Une baisse de salaire suppose un accord collectif.
  salaire: { min: -5, max: 20 },
  recrutement: { min: -100, max: 300 },
  depart: { min: -100, max: 300 },
  // Les frais de siège sont des engagements longs — baux, systèmes, encadrement.
  siege: { min: -30, max: 50 },
  credit: { min: -100, max: 300 },
  budget_direction: { min: -50, max: 100 },
  poste: { min: -50, max: 100 },
  achat_volume: { min: -100, max: 200 },
  // Un indice de 0 à 100 (position prix, délégation, adhésion) : on le déplace
  // de quelques dizaines de points, pas d'un facteur trois.
  indice: { min: -40, max: 40 },
};

export const FAMILY_LABELS: Readonly<Record<VariationFamily, string>> = {
  investissement: 'Investissements',
  innovation: 'Recherche & développement',
  marketing: 'Marketing',
  formation: 'Formation',
  salaire: 'Rémunération',
  recrutement: 'Recrutements',
  depart: 'Départs',
  siege: 'Frais de siège',
  credit: 'Financement',
  budget_direction: 'Budgets par direction',
  poste: 'Postes de l’organigramme',
  achat_volume: 'Volumes d’achat',
  indice: 'Curseurs de positionnement',
};

/**
 * Seuils des libellés, en FRACTION de la fourchette autorisée.
 *
 * Exprimés en fraction et non en points de pourcentage : c'est ce qui permet à
 * « hausse moyenne » de vouloir dire quelque chose aussi bien sur une
 * fourchette de ±5 % que de ±300 %.
 */
export interface VariationThresholds {
  /** En dessous, on considère la valeur inchangée. */
  flat: number;
  faible: number;
  moyenne: number;
  forte: number;
}

export const DEFAULT_THRESHOLDS: VariationThresholds = {
  flat: 0.04,
  faible: 0.25,
  moyenne: 0.5,
  forte: 0.75,
};

export interface VariationScale {
  bounds: VariationBounds;
  thresholds: VariationThresholds;
}

export const DEFAULT_SCALES: Readonly<Record<VariationFamily, VariationScale>> =
  Object.fromEntries(
    (Object.keys(DEFAULT_BOUNDS) as VariationFamily[]).map((family) => [
      family,
      { bounds: DEFAULT_BOUNDS[family], thresholds: DEFAULT_THRESHOLDS },
    ]),
  ) as Record<VariationFamily, VariationScale>;

/**
 * Le mot qui accompagne un écart.
 *
 * « Supprimé » est réservé à −100 % exactement : c'est le seul cas où le poste
 * disparaît vraiment, et le distinguer d'une « très forte baisse » évite qu'une
 * équipe croie avoir tout coupé alors qu'il reste 10 %.
 */
export function variationLabel(pct: number, scale: VariationScale): string {
  const { bounds, thresholds } = scale;

  if (pct <= -100) return 'Supprimé';

  if (pct < 0) {
    const t = bounds.min === 0 ? 0 : pct / bounds.min;
    if (t <= thresholds.flat) return 'Inchangé';
    if (t <= thresholds.faible) return 'Faible baisse';
    if (t <= thresholds.moyenne) return 'Baisse moyenne';
    if (t <= thresholds.forte) return 'Forte baisse';
    if (t < 1) return 'Très forte baisse';
    return 'Baisse maximale';
  }

  if (pct === 0) return 'Inchangé';

  const t = bounds.max === 0 ? 0 : pct / bounds.max;
  if (t <= thresholds.flat) return 'Inchangé';
  if (t <= thresholds.faible) return 'Faible hausse';
  if (t <= thresholds.moyenne) return 'Hausse moyenne';
  if (t <= thresholds.forte) return 'Forte hausse';
  if (t < 1) return 'Très forte hausse';
  return 'Hausse maximale';
}

/** Ramène un écart dans la fourchette autorisée. */
export function clampVariation(pct: number, bounds: VariationBounds): number {
  const floor = Math.max(bounds.min, -100);
  return Math.min(Math.max(pct, floor), bounds.max);
}

/**
 * Montant obtenu en appliquant un écart à une référence.
 *
 * Arrondi à l'entier : les montants d'Atlas sont en dirhams, et un budget à
 * 4,7 centimes près n'apporte rien.
 */
export function valueFromVariation(reference: number, pct: number): number {
  return Math.max(Math.round(reference * (1 + pct / 100)), 0);
}

/**
 * Écart correspondant à un montant saisi à la main.
 *
 * Une référence nulle n'a pas d'écart définissable — c'est l'appelant qui doit
 * alors fournir une référence de repli (voir `referenceOr`).
 */
export function variationFromValue(reference: number, value: number): number {
  if (reference <= 0) return 0;
  return ((value - reference) / reference) * 100;
}

/**
 * La référence à utiliser, avec son repli.
 *
 * Le piège : une équipe qui a mis un poste à zéro au tour précédent aurait une
 * référence nulle, et −100 % à +300 % de zéro vaut zéro — elle ne pourrait
 * plus jamais y revenir. On retombe donc sur la référence de dotation, celle
 * du premier tour.
 */
export function referenceOr(previous: number, endowment: number): number {
  return previous > 0 ? previous : endowment;
}
