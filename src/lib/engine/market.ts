/**
 * ATLAS — marché : prix, compétitivité, répartition à somme nulle.
 *
 * Implémente `docs/02-economie.md` §2 et §8. C'est le module le plus sensible
 * du moteur : c'est lui qui garantit que les parts d'un pool somment à 100 %,
 * et c'est lui que les étudiants verront à la révélation.
 */

import { clamp, clamp01, clamp100, median } from './math';
import { param, type EngineParams } from './params';

// ===========================================================================
// Prix (doc 02 §2)
// ===========================================================================

/** `p = 0` → 60 % du prix marché · `p = 50` → prix marché · `p = 100` → 140 %. */
export function unitPrice(
  referenceUnitPriceMad: number,
  pricePosition: number,
  params: EngineParams,
): number {
  const floor = param(params, 'market.price_position_floor_factor');
  const span = param(params, 'market.price_position_span');
  return referenceUnitPriceMad * (floor + span * clamp100(pricePosition));
}

/**
 * Compétitivité prix, relative au pool : c'est l'écart au prix médian qui
 * compte, jamais le prix absolu. L'élasticité varie par DAS — un même geste de
 * prix ne produit pas le même effet selon le métier, et c'est une leçon en soi.
 */
export function priceCompetitiveness(
  unitPriceMad: number,
  poolMedianPriceMad: number,
  elasticity: number,
): number {
  if (poolMedianPriceMad <= 0) return 0.5;
  const gap = (poolMedianPriceMad - unitPriceMad) / poolMedianPriceMad;
  return clamp01(0.5 + elasticity * gap);
}

export function poolMedianPrice(prices: number[]): number {
  return median(prices.filter((p) => p > 0));
}

// ===========================================================================
// Compétitivité (doc 02 §8)
// ===========================================================================

export function competitivePressure(
  activeTeamsOnDas: number,
  vrioEntryBarrier: number,
  maxTeamsReference = 8,
): number {
  const normalized = clamp01(activeTeamsOnDas / maxTeamsReference);
  return normalized * (1 - clamp01(vrioEntryBarrier));
}

export interface CompetitivenessInput {
  perceivedQuality: number;
  notoriety: number;
  priceCompetitiveness: number;
  iaScore: number;
  competitivePressure: number;
  /** Coefficient de risque Ansoff, appliqué les deux premiers tours du DAS. */
  ansoffRiskCoefficient: number;
  roundsSinceLaunch: number;
  /** Malus de trésorerie : 0, 0,10 (surveillance) ou 0,20 (restructuration). */
  treasuryMalus: number;
}

export function competitivenessScore(
  input: CompetitivenessInput,
  params: EngineParams,
): number {
  const base =
    param(params, 'competitiveness.weight.quality') * (clamp100(input.perceivedQuality) / 100) +
    param(params, 'competitiveness.weight.notoriety') * (clamp100(input.notoriety) / 100) +
    param(params, 'competitiveness.weight.price') * clamp01(input.priceCompetitiveness) +
    param(params, 'competitiveness.weight.ia') * (clamp100(input.iaScore) / 100) +
    param(params, 'competitiveness.weight.pressure') * clamp01(input.competitivePressure);

  const ansoffFactor =
    input.roundsSinceLaunch < 2 ? 1 - clamp01(input.ansoffRiskCoefficient) : 1;

  // Le score doit rester strictement positif : une équipe à zéro casserait la
  // répartition proportionnelle et sortirait du jeu sans avoir été liquidée.
  return Math.max(base * ansoffFactor * (1 - clamp01(input.treasuryMalus)), 0.001);
}

// ===========================================================================
// Répartition à somme nulle (doc 02 §8)
// ===========================================================================

export interface ShareCandidate {
  teamId: string;
  competitiveness: number;
  /** Plafond issu de la couverture de distribution (doc 02 §6.2). */
  coverageCap: number;
  /** Exclue du pool pendant sa fenêtre d'océan bleu. */
  blueOcean: boolean;
}

export interface ShareAllocation {
  shares: Record<string, number>;
  /**
   * Part du marché que personne n'a pu servir, faute de couverture de
   * distribution suffisante. Économiquement réelle : c'est du chiffre
   * d'affaires que le pool laisse collectivement sur la table.
   */
  unservedShare: number;
  blueOceanTeams: string[];
}

/**
 * Répartition proportionnelle au score, sous contrainte de couverture.
 *
 * L'algorithme est un remplissage par paliers : on répartit au prorata, on fige
 * les équipes qui butent sur leur plafond, on redistribue l'excédent entre les
 * autres, et on recommence. Sans cette itération, une redistribution naïve
 * pourrait repousser une équipe au-dessus de son propre plafond.
 */
export function allocateMarketShares(
  candidates: ShareCandidate[],
  /**
   * Brutalité du partage. 1 = strictement proportionnel au score : dix points
   * d'avance en compétitivité donnent dix points de part. Au-delà, le mieux
   * placé rafle davantage — c'est la molette de difficulté « winner takes more ».
   *
   * L'exposant s'applique ICI et non dans `competitivenessScore` : le score
   * reste affiché brut aux équipes, seule la règle de partage se durcit.
   */
  exponent = 1,
): ShareAllocation {
  const blueOceanTeams = candidates.filter((c) => c.blueOcean).map((c) => c.teamId);
  const contenders = candidates
    .filter((c) => !c.blueOcean)
    .map((c) => ({
      ...c,
      competitiveness: Math.pow(Math.max(c.competitiveness, 0), Math.max(exponent, 0.1)),
    }));

  const shares: Record<string, number> = {};
  for (const team of blueOceanTeams) {
    // Hors somme nulle : le marché est considéré vierge, la part est calculée
    // à part et n'entre pas dans la répartition du pool.
    shares[team] = 0;
  }

  if (contenders.length === 0) {
    return { shares, unservedShare: 0, blueOceanTeams };
  }

  const capped = new Set<string>();
  let remaining = 1;

  // Au plus une itération par équipe : chaque passe fige au moins une équipe.
  for (let pass = 0; pass <= contenders.length; pass += 1) {
    const free = contenders.filter((c) => !capped.has(c.teamId));
    if (free.length === 0 || remaining <= 1e-12) break;

    const totalScore = free.reduce((acc, c) => acc + c.competitiveness, 0);
    if (totalScore <= 0) break;

    let cappedThisPass = false;
    for (const candidate of free) {
      const proposed = remaining * (candidate.competitiveness / totalScore);
      const cap = clamp01(candidate.coverageCap);
      if (proposed > cap) {
        shares[candidate.teamId] = cap;
        capped.add(candidate.teamId);
        remaining -= cap;
        cappedThisPass = true;
      }
    }

    if (!cappedThisPass) {
      // Plus personne ne bute : on distribue le reliquat et on s'arrête.
      const stillFree = contenders.filter((c) => !capped.has(c.teamId));
      const freeScore = stillFree.reduce((acc, c) => acc + c.competitiveness, 0);
      for (const candidate of stillFree) {
        shares[candidate.teamId] = remaining * (candidate.competitiveness / freeScore);
      }
      remaining = 0;
      break;
    }
  }

  // Ce qui reste après que toutes les équipes ont buté sur leur plafond est
  // un marché que personne n'a su servir.
  const allocated = contenders.reduce((acc, c) => acc + (shares[c.teamId] ?? 0), 0);
  const unservedShare = clamp01(1 - allocated);

  for (const candidate of contenders) {
    if (shares[candidate.teamId] === undefined) shares[candidate.teamId] = 0;
  }

  return { shares, unservedShare, blueOceanTeams };
}

/**
 * Choc PESTEL : redistribution non linéaire de points de part de marché à
 * l'intérieur du pool. La somme est conservée par construction — on ne fait que
 * déplacer, jamais créer.
 */
export function applyShockRedistribution(
  shares: Record<string, number>,
  beneficiaries: string[],
  pointsToRedistribute: number,
): Record<string, number> {
  const teamIds = Object.keys(shares);
  const losers = teamIds.filter((id) => !beneficiaries.includes(id));
  if (beneficiaries.length === 0 || losers.length === 0) return { ...shares };

  const pts = clamp01(pointsToRedistribute / 100);
  const loserTotal = losers.reduce((acc, id) => acc + shares[id], 0);
  // On ne peut pas prendre plus que ce que les perdants possèdent.
  const actualTransfer = Math.min(pts, loserTotal);

  const next: Record<string, number> = {};
  for (const id of losers) {
    const contribution = loserTotal > 0 ? shares[id] / loserTotal : 0;
    next[id] = shares[id] - actualTransfer * contribution;
  }

  const beneficiaryTotal = beneficiaries.reduce((acc, id) => acc + shares[id], 0);
  for (const id of beneficiaries) {
    // Répartition au prorata de la position ; à égalité parfaite, uniforme.
    const weight = beneficiaryTotal > 0 ? shares[id] / beneficiaryTotal : 1 / beneficiaries.length;
    next[id] = shares[id] + actualTransfer * weight;
  }

  return next;
}

// ===========================================================================
// Volumes et chiffre d'affaires (doc 02 §3.2)
// ===========================================================================

export interface VolumeResult {
  volumeDemanded: number;
  volumeSold: number;
  volumeLost: number;
  stockoutRate: number;
  revenueMad: number;
}

/**
 * Une rupture se paie deux fois : en chiffre d'affaires, et en réputation
 * (voir `nextNotoriety` et `perceivedQuality`).
 *
 * C'est l'arbitrage central du jeu : attaquer en prix sans capacité, c'est
 * acheter des parts de marché qu'on ne peut pas servir, et abîmer sa marque
 * en le faisant.
 */
export function resolveVolume(
  marketVolume: number,
  marketShare: number,
  effectiveCapacity: number,
  unitPriceMad: number,
): VolumeResult {
  const volumeDemanded = Math.max(marketVolume * clamp01(marketShare), 0);
  const volumeSold = Math.min(volumeDemanded, Math.max(effectiveCapacity, 0));
  const volumeLost = volumeDemanded - volumeSold;

  return {
    volumeDemanded,
    volumeSold,
    volumeLost,
    stockoutRate: volumeDemanded > 0 ? volumeLost / volumeDemanded : 0,
    revenueMad: volumeSold * unitPriceMad,
  };
}

export function marketVolume(marketSizeMad: number, referenceUnitPriceMad: number): number {
  return referenceUnitPriceMad > 0 ? marketSizeMad / referenceUnitPriceMad : 0;
}

export function nextMarketSize(
  previousMarketSizeMad: number,
  growthRate: number,
  shockPct = 0,
): number {
  return Math.max(previousMarketSizeMad * (1 + growthRate + shockPct), 0);
}

/**
 * Contrainte d'exigence de segment : on ne vend pas du haut de gamme avec un
 * produit moyen, quel que soit le budget marketing.
 */
export function segmentQualityPenalty(
  perceivedQuality: number,
  servedSegments: { qualityRequirement: number; marketSharePct: number }[],
  params: EngineParams,
): number {
  const divisor = param(params, 'segment.quality_shortfall_divisor');
  const total = servedSegments.reduce((acc, s) => acc + s.marketSharePct, 0);
  if (total <= 0) return 1;

  const effective = servedSegments.reduce((acc, s) => {
    const meets = perceivedQuality >= s.qualityRequirement;
    return acc + s.marketSharePct * (meets ? 1 : 1 / divisor);
  }, 0);

  return clamp(effective / total, 0, 1);
}
