/**
 * ATLAS — ce qu'une cible devrait coûter, d'après ce qu'on en sait.
 *
 * ── LE PROBLÈME ────────────────────────────────────────────────────────────
 * Une offre d'acquisition refusée ne dit rien : la cible a un PRIX DE RÉSERVE,
 * et en deçà, personne n'acquiert. Les équipes enchérissaient donc à l'aveugle,
 * sans savoir si 200 M DH était une aumône ou une folie pour cette entreprise.
 *
 * ── CE QUE CE MODULE FAIT ──────────────────────────────────────────────────
 * Il reprend EXACTEMENT la règle du moteur (`load-snapshot.ts`, prix de
 * réserve) et l'applique non pas aux valeurs vraies, que l'équipe ignore, mais
 * aux INTERVALLES qu'elle connaît :
 *
 *   réserve = CA × multiple_sectoriel × facteur_type × 0,35
 *             × ( 1 − appétence_à_céder / 100 × 0,35 )
 *
 *   • sans due diligence : le CA de la fiche de marché (± 40 %), l'appétence
 *     inconnue (0 à 100) — une fourchette large, mais un ordre de grandeur ;
 *   • avec due diligence : le CA et l'appétence livrés, marge d'erreur du palier
 *     comprise — une fourchette serrée, et c'est ce qu'on achète.
 *
 * Le multiple sectoriel ne quitte jamais le serveur seul : il n'en sort que
 * fondu dans une fourchette.
 */

import type { FieldDisclosure } from '@/lib/consulting-types';

/** Part de la valorisation par les revenus que retient le prix de réserve. */
export const RESERVE_REVENUE_FACTOR = 0.35;
/** Décote maximale consentie par une cible pressée de vendre. */
export const APPETITE_DISCOUNT = 0.35;
/** Budget d'intégration de référence (doc 02 §11) : 20 % du prix payé. */
export const INTEGRATION_REFERENCE = 0.2;

export interface Interval {
  lower: number;
  upper: number;
}

export interface PriceGuide {
  minMad: number;
  maxMad: number;
  /** D'où vient l'estimation : la fiche de marché gratuite, ou une étude payée. */
  source: 'place' | 'due_diligence';
  /** Palier de la due diligence, quand elle fonde l'estimation. */
  tier: string | null;
  /** Passifs non déclarés, livrés par le seul palier approfondi. */
  liabilitiesMad: Interval | null;
}

/**
 * Un maillon de filière ne se valorise pas comme l'industriel qu'il sert : même
 * coefficient que le moteur.
 */
export function typeFactor(actorType: string): number {
  if (actorType === 'distributeur') return 0.65;
  if (actorType === 'fournisseur') return 0.8;
  return 1;
}

const clampAppetite = (value: number) => Math.min(Math.max(value, 0), 100);

/** Le prix de réserve le plus bas et le plus haut compatibles avec ce qu'on sait. */
export function reserveRange(
  revenue: Interval,
  appetite: Interval,
  multiple: number,
  actorType: string,
): Interval {
  const base = multiple * typeFactor(actorType) * RESERVE_REVENUE_FACTOR;
  return {
    // Le plancher suppose le CA le plus bas ET la cible la plus pressée.
    lower: Math.max(revenue.lower, 0) * base * (1 - (clampAppetite(appetite.upper) / 100) * APPETITE_DISCOUNT),
    upper: Math.max(revenue.upper, 0) * base * (1 - (clampAppetite(appetite.lower) / 100) * APPETITE_DISCOUNT),
  };
}

/** L'intervalle qu'un champ livré autorise ; `fallback` s'il est retenu ou absent. */
export function intervalOf(field: FieldDisclosure | undefined, fallback: Interval): Interval {
  if (!field) return fallback;
  switch (field.mode) {
    case 'exact':
      return { lower: field.value, upper: field.value };
    case 'estimate':
    case 'band':
      return { lower: field.lower, upper: field.upper };
    default:
      return fallback;
  }
}

/**
 * La fourchette de prix d'une cible.
 *
 * `publicRevenue` est la fiche de marché, `null` pour un maillon de filière qui
 * n'en a pas : sans due diligence, il n'y a alors rien d'honnête à afficher.
 */
export function priceGuide({
  multiple, actorType, publicRevenue, study,
}: {
  multiple: number;
  actorType: string;
  publicRevenue: Interval | null;
  study: { tier: string; fields: FieldDisclosure[] } | null;
}): PriceGuide | null {
  if (study) {
    const field = (key: string) => study.fields.find((f) => f.key === key);
    const revenue = intervalOf(field('revenue_mad'), publicRevenue ?? { lower: 0, upper: 0 });
    if (revenue.upper <= 0) return null;
    const range = reserveRange(revenue, intervalOf(field('divest_appetite'), { lower: 0, upper: 100 }), multiple, actorType);
    const liabilities = field('hidden_liabilities_mad');
    return {
      minMad: range.lower,
      maxMad: range.upper,
      source: 'due_diligence',
      tier: study.tier,
      liabilitiesMad:
        liabilities && liabilities.mode !== 'withheld' ? intervalOf(liabilities, { lower: 0, upper: 0 }) : null,
    };
  }

  if (!publicRevenue || publicRevenue.upper <= 0) return null;
  const range = reserveRange(publicRevenue, { lower: 0, upper: 100 }, multiple, actorType);
  return { minMad: range.lower, maxMad: range.upper, source: 'place', tier: null, liabilitiesMad: null };
}
