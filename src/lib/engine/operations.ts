/**
 * ATLAS — opérations : capacité, coût unitaire, qualité, notoriété.
 *
 * Implémente `docs/02-economie.md` §3, §4 et §7. Ce module contient les
 * mécaniques qui rendent les décisions industrielles réellement coûteuses :
 * la courbe d'expérience, l'arbitrage variable/fixe de l'automatisation, et la
 * double sanction de la rupture de stock.
 */

import { clamp, clamp100 } from './math';
import { param, type EngineParams } from './params';

// ===========================================================================
// Capacité (doc 02 §3)
// ===========================================================================

/**
 * La capacité financée au tour t n'est disponible qu'au tour t+1.
 * Délai volontaire : il oblige à anticiper la demande plutôt qu'à y réagir.
 */
export function nextCapacity(
  previousCapacity: number,
  capexCommissionedMad: number,
  unitCapacityCostMad: number,
  params: EngineParams,
): number {
  const depreciation = param(params, 'capacity.depreciation_per_round');
  const added = unitCapacityCostMad > 0 ? capexCommissionedMad / unitCapacityCostMad : 0;
  return Math.max(previousCapacity * (1 - depreciation) + added, 0);
}

/** Sur les DAS de service, la capacité vient des personnes, pas des machines. */
export function capacityFromHeadcount(headcount: number, productivity: number): number {
  return Math.max(headcount * productivity, 0);
}

export interface UtilisationResult {
  utilisationRate: number;
  underabsorptionMad: number;
  subcontractedUnits: number;
  subcontractingCostMad: number;
}

/**
 * Surcapacité et surchauffe coûtent toutes les deux : l'optimum est une plage,
 * pas un maximum. C'est ce qui interdit la stratégie « j'investis toujours plus ».
 */
export function utilisationEffects(
  volumeProduced: number,
  capacity: number,
  fixedCostMad: number,
  unitVariableCostMad: number,
  params: EngineParams,
): UtilisationResult {
  if (capacity <= 0) {
    return {
      utilisationRate: 0,
      underabsorptionMad: fixedCostMad * param(params, 'capacity.underuse_penalty_factor'),
      subcontractedUnits: 0,
      subcontractingCostMad: 0,
    };
  }

  const utilisationRate = volumeProduced / capacity;
  const underThreshold = param(params, 'capacity.underuse_threshold');
  const overThreshold = param(params, 'capacity.overuse_threshold');

  let underabsorptionMad = 0;
  if (utilisationRate < underThreshold) {
    const factor = param(params, 'capacity.underuse_penalty_factor');
    underabsorptionMad = fixedCostMad * ((underThreshold - utilisationRate) / underThreshold) * factor;
  }

  let subcontractedUnits = 0;
  let subcontractingCostMad = 0;
  if (utilisationRate > overThreshold) {
    const multiplier = param(params, 'capacity.subcontracting_multiplier');
    subcontractedUnits = volumeProduced - capacity * overThreshold;
    subcontractingCostMad = subcontractedUnits * unitVariableCostMad * (multiplier - 1);
  }

  return { utilisationRate, underabsorptionMad, subcontractedUnits, subcontractingCostMad };
}

// ===========================================================================
// Courbe d'expérience et automatisation (doc 02 §4)
// ===========================================================================

/** Exposant d'apprentissage : λ = −ln(taux) / ln(2). */
export function learningExponent(learningRate: number): number {
  return -Math.log(learningRate) / Math.log(2);
}

/**
 * Coût unitaire de base après effet d'apprentissage.
 *
 * C'est la mécanique qui rend la domination par les coûts jouable : le leader
 * en volume creuse un avantage que les suiveurs ne rattrapent qu'en volume,
 * donc en agressivité prix, donc en marge sacrifiée. Boucle vertueuse pour
 * l'un, vicieuse pour les autres — et parfaitement lisible au débriefing.
 */
export function experienceCurveUnitCost(
  referenceUnitCostMad: number,
  cumulativeVolume: number,
  referenceCumulativeVolume: number,
  learningRate: number,
  params: EngineParams,
): number {
  const floorRatio = param(params, 'learning.cost_floor_ratio');
  if (referenceCumulativeVolume <= 0 || cumulativeVolume <= 0) return referenceUnitCostMad;

  const lambda = learningExponent(learningRate);
  const ratio = cumulativeVolume / referenceCumulativeVolume;
  const cost = referenceUnitCostMad * Math.pow(ratio, -lambda);

  // L'apprentissage n'est pas infini.
  return Math.max(cost, referenceUnitCostMad * floorRatio);
}

export interface CostStructure {
  unitVariableCostMad: number;
  fixedProductionCostMad: number;
}

/**
 * L'automatisation troque du coût variable contre du coût fixe.
 * Automatiser à fond avec de faibles volumes est ruineux ; automatiser en
 * position de leader est décisif. **Le même investissement est bon ou mauvais
 * selon la stratégie.**
 */
export function applyAutomation(
  baseUnitCostMad: number,
  baseFixedCostMad: number,
  automationLevel: number,
  purchasePriceIndex: number,
  params: EngineParams,
): CostStructure {
  const a = clamp100(automationLevel) / 100;
  const variableReduction = param(params, 'automation.variable_cost_reduction');
  const fixedIncrease = param(params, 'automation.fixed_cost_increase');

  return {
    unitVariableCostMad: baseUnitCostMad * (1 - variableReduction * a) * purchasePriceIndex,
    fixedProductionCostMad: baseFixedCostMad * (1 + fixedIncrease * a),
  };
}

/** Point mort en volume. Affiché en permanence : c'est lui qui force le débat. */
export function breakEvenVolume(
  totalFixedCostMad: number,
  unitPriceMad: number,
  distributorMarginPct: number,
  unitVariableCostMad: number,
): number | null {
  const contribution = unitPriceMad * (1 - distributorMarginPct) - unitVariableCostMad;
  if (contribution <= 0) return null; // aucun volume ne rend l'activité rentable
  return totalFixedCostMad / contribution;
}

// ===========================================================================
// Qualité et notoriété (doc 02 §7)
// ===========================================================================

/**
 * L'effet de la R&D est DIFFÉRÉ d'un tour : `rdBudgetPreviousRound`.
 * Une équipe qui coupe sa R&D pour sauver sa trésorerie ne le paie qu'au tour
 * suivant — quand il est trop tard pour corriger.
 */
export function nextQuality(
  previousQuality: number,
  rdBudgetPreviousRoundMad: number,
  /**
   * Assiette de mesure de l'effort : le chiffre d'affaires du DAS. L'effort de
   * R&D se juge en INTENSITÉ, pas en montant absolu — 50 M DH sont un effort
   * considérable pour une PME et une somme dérisoire pour un groupe. Mesurer
   * en absolu faisait saturer la qualité à 100 sur les grands DAS.
   */
  revenueBaseMad: number,
  technologyPartnerBonus: number,
  params: EngineParams,
): number {
  const obsolescence = param(params, 'quality.obsolescence_per_round');
  const coefficient = param(params, 'quality.rd_coefficient');
  const reference = param(params, 'quality.rd_reference_intensity');

  const decayed = previousQuality * (1 - obsolescence);
  const intensity = revenueBaseMad > 0 ? rdBudgetPreviousRoundMad / revenueBaseMad : 0;
  const effort = reference > 0 ? Math.min(intensity / reference, 2) : 0;
  // Rendement décroissant : plus on est haut, plus il est cher de monter.
  const gain = coefficient * effort * (1 - decayed / 100);

  return clamp100(decayed + gain + technologyPartnerBonus);
}

/**
 * C'est la qualité PERÇUE qui entre dans la compétitivité, pas la qualité
 * intrinsèque. Un excellent produit livré en retard par un fournisseur peu
 * fiable est perçu comme un mauvais produit.
 */
export function perceivedQuality(
  productQuality: number,
  inputQuality: number,
  stockoutRate: number,
  distributionServiceLevel: number,
  params: EngineParams,
): number {
  return clamp100(
    param(params, 'quality.weight.product') * productQuality +
      param(params, 'quality.weight.inputs') * inputQuality +
      param(params, 'quality.weight.availability') * (100 - 100 * clamp(stockoutRate, 0, 1)) +
      param(params, 'quality.weight.service') * distributionServiceLevel,
  );
}

/**
 * L'oubli (8 %/tour) est supérieur à l'obsolescence de la qualité (4 %/tour) :
 * une marque se perd plus vite qu'un produit. Arrêter le marketing un tour se
 * voit immédiatement.
 */
export function nextNotoriety(
  previousNotoriety: number,
  marketingBudgetMad: number,
  /** Même raison qu'en R&D : l'effort marketing se juge en intensité. */
  revenueBaseMad: number,
  stockoutRate: number,
  params: EngineParams,
): number {
  const decay = param(params, 'notoriety.decay_per_round');
  const coefficient = param(params, 'notoriety.mkt_coefficient');
  const reference = param(params, 'notoriety.mkt_reference_intensity');
  const stockoutPenalty = param(params, 'stockout.notoriety_penalty');

  const decayed = previousNotoriety * (1 - decay);
  const intensity = revenueBaseMad > 0 ? marketingBudgetMad / revenueBaseMad : 0;
  const effort = reference > 0 ? Math.min(intensity / reference, 2) : 0;
  const gain = coefficient * effort * (1 - decayed / 100);

  return clamp100(decayed + gain - stockoutPenalty * clamp(stockoutRate, 0, 1));
}

/** Niveau d'automatisation cumulé, dérivé du CAPEX technologique par unité de capacité. */
export function automationLevel(
  cumulativeAutomationCapexMad: number,
  capacityUnits: number,
  unitCapacityCostMad: number,
): number {
  if (capacityUnits <= 0 || unitCapacityCostMad <= 0) return 0;
  // Référence : automatiser intégralement coûte l'équivalent de la capacité elle-même.
  const fullAutomationCost = capacityUnits * unitCapacityCostMad;
  return clamp100((cumulativeAutomationCapexMad / fullAutomationCost) * 100);
}

// ===========================================================================
// Climat social (doc 00 §3.6)
// ===========================================================================

export function nextClimateSocial(
  previousClimate: number,
  headcountStart: number,
  recruitmentCount: number,
  restructuringCount: number,
  trainingBudgetMad: number,
  params: EngineParams,
): number {
  const shockThreshold = param(params, 'social.recruitment_shock_threshold_pct');
  const recruitmentMalus = param(params, 'climate.recruitment_shock_malus');
  const restructuringMalus = param(params, 'climate.restructuring_malus');
  const trainingBonus = param(params, 'climate.training_bonus');

  const recruitmentRatio = headcountStart > 0 ? recruitmentCount / headcountStart : 0;

  return clamp100(
    previousClimate -
      (recruitmentRatio > shockThreshold ? recruitmentMalus : 0) -
      (restructuringCount > 0 ? restructuringMalus : 0) +
      (trainingBudgetMad > 0 ? trainingBonus : 0),
  );
}
