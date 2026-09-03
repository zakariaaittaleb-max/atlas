/**
 * ATLAS — moteur d'alignement stratégique.
 *
 * Implémente `docs/01-moteur-alignement.md`. Fonctions pures, sans effet de
 * bord, sans accès base : tout entre par les arguments, tout sort par le retour.
 *
 * Le principe tient en une phrase : on mesure la distance entre ce qu'une
 * équipe DÉCLARE vouloir faire et ce qu'elle FAIT, pas la qualité de sa
 * performance.
 */

import { clamp100, mean } from './math';
import { param, paramOr, type EngineParams } from './params';
import {
  BUSINESS_AXES,
  CORPORATE_AXES,
  GENERIC_STRATEGIES,
  type AlignmentResult,
  type AxisDetail,
  type BusinessAlignment,
  type BusinessAxis,
  type BusinessDiagnosis,
  type BusinessVector,
  type CompanyValue,
  type CorporateAlignment,
  type CorporateAxis,
  type CorporateInput,
  type CorporateStrategy,
  type CorporateVector,
  type GenericStrategy,
  type NamedPenalty,
  type StructureType,
} from './types';

// ===========================================================================
// 1. Profils-cibles et poids — niveau business (doc 01 §3.1 et §3.2)
// ===========================================================================

export const BUSINESS_TARGETS: Record<GenericStrategy, BusinessVector> = {
  domination_couts: {
    price_position: 22,
    rd_intensity: 20,
    mkt_intensity: 30,
    quality: 55,
    cost_efficiency: 88,
    scale_index: 82,
    automation_level: 78,
    skill_intensity: 32,
    segment_breadth: 80,
    channel_control: 35,
    org_delegation: 30,
    org_layers: 68,
    axis_fit: 100,
    kpi_fit: 100,
    budget_fit: 100,
    key_roles_fit: 100,
  },
  differenciation: {
    price_position: 78,
    rd_intensity: 80,
    mkt_intensity: 75,
    quality: 85,
    cost_efficiency: 45,
    scale_index: 55,
    automation_level: 55,
    skill_intensity: 82,
    segment_breadth: 75,
    channel_control: 70,
    org_delegation: 62,
    org_layers: 45,
    axis_fit: 100,
    kpi_fit: 100,
    budget_fit: 100,
    key_roles_fit: 100,
  },
  focus_couts: {
    price_position: 30,
    rd_intensity: 20,
    mkt_intensity: 25,
    quality: 58,
    cost_efficiency: 78,
    scale_index: 30,
    automation_level: 62,
    skill_intensity: 38,
    segment_breadth: 22,
    channel_control: 45,
    org_delegation: 42,
    org_layers: 48,
    axis_fit: 100,
    kpi_fit: 100,
    budget_fit: 100,
    key_roles_fit: 100,
  },
  focus_differenciation: {
    price_position: 88,
    rd_intensity: 85,
    mkt_intensity: 60,
    quality: 90,
    cost_efficiency: 38,
    scale_index: 22,
    automation_level: 35,
    skill_intensity: 88,
    segment_breadth: 18,
    channel_control: 85,
    org_delegation: 78,
    org_layers: 24,
    axis_fit: 100,
    kpi_fit: 100,
    budget_fit: 100,
    key_roles_fit: 100,
  },
};

/**
 * Poids des axes, par stratégie. Somme égale à 1 pour chacune.
 *
 * Répartition assumée : **65 % aux décisions économiques, 35 % aux décisions
 * d'organisation**. En deçà de 35 %, structurer poste par poste, choisir ses
 * KPI et répartir ses budgets serait un exercice décoratif sans conséquence ;
 * au-delà, l'économie du DAS — prix, coûts, échelle — cesserait de décider du
 * résultat, ce qui serait tout aussi faux.
 */
export const BUSINESS_WEIGHTS: Record<GenericStrategy, BusinessVector> = {
  domination_couts: {
    price_position: 0.104,
    rd_intensity: 0.052,
    mkt_intensity: 0.0195,
    quality: 0.0455,
    cost_efficiency: 0.13,
    scale_index: 0.117,
    automation_level: 0.078,
    skill_intensity: 0.052,
    segment_breadth: 0.039,
    channel_control: 0.013,
    org_delegation: 0.05,
    org_layers: 0.04,
    axis_fit: 0.07,
    kpi_fit: 0.09,
    budget_fit: 0.07,
    key_roles_fit: 0.03,
  },
  differenciation: {
    price_position: 0.091,
    rd_intensity: 0.117,
    mkt_intensity: 0.078,
    quality: 0.13,
    cost_efficiency: 0.039,
    scale_index: 0.013,
    automation_level: 0.026,
    skill_intensity: 0.0845,
    segment_breadth: 0.0195,
    channel_control: 0.052,
    org_delegation: 0.05,
    org_layers: 0.04,
    axis_fit: 0.08,
    kpi_fit: 0.09,
    budget_fit: 0.06,
    key_roles_fit: 0.03,
  },
  focus_couts: {
    price_position: 0.0975,
    rd_intensity: 0.039,
    mkt_intensity: 0.013,
    quality: 0.0585,
    cost_efficiency: 0.117,
    scale_index: 0.065,
    automation_level: 0.065,
    skill_intensity: 0.052,
    segment_breadth: 0.117,
    channel_control: 0.026,
    org_delegation: 0.05,
    org_layers: 0.04,
    axis_fit: 0.07,
    kpi_fit: 0.09,
    budget_fit: 0.07,
    key_roles_fit: 0.03,
  },
  focus_differenciation: {
    price_position: 0.091,
    rd_intensity: 0.078,
    mkt_intensity: 0.039,
    quality: 0.117,
    cost_efficiency: 0.026,
    scale_index: 0.013,
    automation_level: 0.0195,
    skill_intensity: 0.0845,
    segment_breadth: 0.117,
    channel_control: 0.065,
    org_delegation: 0.06,
    org_layers: 0.05,
    axis_fit: 0.07,
    kpi_fit: 0.08,
    budget_fit: 0.06,
    key_roles_fit: 0.03,
  },
};

// ===========================================================================
// 2. Profils-cibles et poids — niveau corporate (doc 01 §5.5)
// ===========================================================================

export const CORPORATE_TARGETS: Record<CorporateStrategy, CorporateVector> = {
  specialisation: {
    portfolio_breadth: 10,
    portfolio_relatedness: 85,
    centralisation_index: 75,
    shared_resources_index: 60,
    vertical_integration: 40,
    talent_mix: 60,
    values_fit: 75,
  },
  integration_verticale: {
    portfolio_breadth: 25,
    portfolio_relatedness: 80,
    centralisation_index: 80,
    shared_resources_index: 70,
    vertical_integration: 85,
    talent_mix: 55,
    values_fit: 70,
  },
  diversification_liee: {
    portfolio_breadth: 50,
    portfolio_relatedness: 65,
    centralisation_index: 55,
    shared_resources_index: 80,
    vertical_integration: 40,
    talent_mix: 60,
    values_fit: 70,
  },
  diversification_conglomerale: {
    portfolio_breadth: 75,
    portfolio_relatedness: 20,
    centralisation_index: 30,
    shared_resources_index: 20,
    vertical_integration: 20,
    talent_mix: 45,
    values_fit: 60,
  },
};

export const CORPORATE_WEIGHTS: Record<CorporateStrategy, CorporateVector> = {
  specialisation: {
    portfolio_breadth: 0.22,
    portfolio_relatedness: 0.2,
    centralisation_index: 0.14,
    shared_resources_index: 0.14,
    vertical_integration: 0.08,
    talent_mix: 0.1,
    values_fit: 0.12,
  },
  integration_verticale: {
    portfolio_breadth: 0.1,
    portfolio_relatedness: 0.14,
    centralisation_index: 0.16,
    shared_resources_index: 0.16,
    vertical_integration: 0.3,
    talent_mix: 0.06,
    values_fit: 0.08,
  },
  diversification_liee: {
    portfolio_breadth: 0.16,
    portfolio_relatedness: 0.2,
    centralisation_index: 0.12,
    shared_resources_index: 0.26,
    vertical_integration: 0.08,
    talent_mix: 0.08,
    values_fit: 0.1,
  },
  diversification_conglomerale: {
    portfolio_breadth: 0.18,
    portfolio_relatedness: 0.18,
    centralisation_index: 0.18,
    shared_resources_index: 0.2,
    vertical_integration: 0.06,
    talent_mix: 0.08,
    values_fit: 0.12,
  },
};

/** Pénalités catégorielles structure × stratégie corporate (doc 01 §5.6). */
export const STRUCTURE_PENALTIES: Record<CorporateStrategy, Record<StructureType, number>> = {
  specialisation: { fonctionnelle: 0, divisionnelle: -8, matricielle: -15 },
  integration_verticale: { fonctionnelle: -4, divisionnelle: 0, matricielle: -10 },
  diversification_liee: { fonctionnelle: -18, divisionnelle: -5, matricielle: 0 },
  diversification_conglomerale: { fonctionnelle: -22, divisionnelle: 0, matricielle: -16 },
};

const STRUCTURE_PENALTY_EXPLANATIONS: Record<string, string> = {
  'specialisation:divisionnelle':
    "Des divisions autonomes pour un seul métier : vous dupliquez des fonctions sans raison.",
  'specialisation:matricielle':
    "Deux lignes hiérarchiques pour un métier unique : le coût de coordination est sans objet.",
  'integration_verticale:fonctionnelle':
    "Une organisation par fonction pilote mal une filière où chaque maillon a son propre cycle.",
  'integration_verticale:matricielle':
    "La matrice croise des expertises ; une filière intégrée se pilote par maillon.",
  'diversification_liee:fonctionnelle':
    "Une direction commerciale unique ne peut pas porter des métiers différents.",
  'diversification_liee:divisionnelle':
    "Des divisions étanches ne captent pas les synergies qui justifient votre diversification.",
  'diversification_conglomerale:fonctionnelle':
    "Une organisation fonctionnelle ne tient pas sur des métiers sans rien en commun.",
  'diversification_conglomerale:matricielle':
    "La matrice sert à partager des ressources. Sans rien à partager, c'est un coût pur.",
};

/** Affinité valeur × stratégie générique (doc 01 §5.4) : −1, 0 ou +1. */
export const VALUE_AFFINITY: Record<CompanyValue, Record<GenericStrategy, number>> = {
  excellence_produit: {
    domination_couts: -1,
    differenciation: 1,
    focus_couts: -1,
    focus_differenciation: 1,
  },
  innovation: {
    domination_couts: -1,
    differenciation: 1,
    focus_couts: 0,
    focus_differenciation: 1,
  },
  proximite_client: {
    domination_couts: 0,
    differenciation: 1,
    focus_couts: 0,
    focus_differenciation: 1,
  },
  accessibilite_prix: {
    domination_couts: 1,
    differenciation: -1,
    focus_couts: 1,
    focus_differenciation: -1,
  },
  efficience_operationnelle: {
    domination_couts: 1,
    differenciation: 0,
    focus_couts: 1,
    focus_differenciation: -1,
  },
  responsabilite_sociale: {
    domination_couts: 0,
    differenciation: 1,
    focus_couts: 0,
    focus_differenciation: 1,
  },
  ancrage_territorial: {
    domination_couts: 0,
    differenciation: 0,
    focus_couts: 1,
    focus_differenciation: 1,
  },
  fiabilite_service: {
    domination_couts: 1,
    differenciation: 1,
    focus_couts: 1,
    focus_differenciation: 1,
  },
};

// ===========================================================================
// 3. Fonction de pénalité — tolérance puis raideur (doc 01 §3.3)
// ===========================================================================

/**
 * Convertit un écart normalisé `d ∈ [0,1]` en pénalité `∈ [0,1]`.
 *
 * Trois zones :
 *
 *  1. `d ≤ band` (10 pts) — gratuit. Le monde réel est bruité, une équipe ne
 *     doit pas être punie pour trois points d'écart.
 *  2. `band < d < saturation` (10 → 45 pts) — croissance convexe. L'exposant
 *     > 1 fait qu'un écart concentré sur un axe coûte plus cher que le même
 *     écart total réparti sur plusieurs axes : c'est le cœur du message.
 *  3. `d ≥ saturation` (45 pts) — pénalité maximale. Au-delà de 45 points
 *     d'écart, un axe est aussi faux qu'il peut l'être ; continuer à graduer
 *     n'apporte rien et diluerait le signal.
 *
 * Le point de saturation est ce qui rend le diagnostic de « milieu de gué »
 * opérant : sans lui, une équipe contredisant sa stratégie sur tous les axes
 * gardait un score supérieur à 90.
 */
export function penaltyFn(d: number, params: EngineParams): number {
  const band = param(params, 'alignment.tolerance_band');
  const saturation = param(params, 'alignment.saturation_gap');
  const exponent = param(params, 'alignment.penalty_exponent');
  if (d <= band) return 0;
  if (d >= saturation) return 1;
  return Math.pow((d - band) / (saturation - band), exponent);
}

/** Écart normalisé entre une valeur observée et sa cible, toutes deux sur 0–100. */
function normalizedGap(observed: number, target: number): number {
  return Math.abs(observed - target) / 100;
}

// ===========================================================================
// 4. Alignement business (doc 01 §3.4)
// ===========================================================================

/** Lit une cible, en laissant le facilitateur la surcharger en base. */
function businessTarget(
  params: EngineParams,
  strategy: GenericStrategy,
  axis: BusinessAxis,
): number {
  return paramOr(params, `alignment.target.${strategy}.${axis}`, BUSINESS_TARGETS[strategy][axis]);
}

function businessWeight(
  params: EngineParams,
  strategy: GenericStrategy,
  axis: BusinessAxis,
): number {
  return paramOr(params, `alignment.weight.${strategy}.${axis}`, BUSINESS_WEIGHTS[strategy][axis]);
}

export function scoreBusinessAlignment(
  observed: BusinessVector,
  strategy: GenericStrategy,
  params: EngineParams,
): BusinessAlignment {
  const details: AxisDetail[] = [];
  let totalPenalty = 0;

  for (const axis of BUSINESS_AXES) {
    const target = businessTarget(params, strategy, axis);
    const weight = businessWeight(params, strategy, axis);
    const value = clamp100(observed[axis]);
    const d = normalizedGap(value, target);
    const penalty = weight * penaltyFn(d, params);
    totalPenalty += penalty;
    details.push({
      axis,
      observed: value,
      target,
      gap: value - target,
      weight,
      penaltyPts: penalty * 100,
    });
  }

  return { score: clamp100(100 * (1 - totalPenalty)), details };
}

// ===========================================================================
// 5. Les deux diagnostics critiques (doc 01 §4)
// ===========================================================================

/**
 * Compare le vecteur observé aux QUATRE profils, pas seulement au profil
 * déclaré. C'est ce qui permet de distinguer deux fautes très différentes :
 *
 *  - le « milieu de gué » : les décisions ne correspondent à aucune stratégie
 *    cohérente. Faute de gestion, lourdement sanctionnée.
 *  - la « dérive » : les décisions sont cohérentes, mais avec une AUTRE
 *    stratégie que celle annoncée. Faute de lucidité, sanctionnée plus
 *    légèrement, et effaçable en re-déclarant au tour suivant.
 */
export function diagnoseBusiness(
  observed: BusinessVector,
  declared: GenericStrategy,
  params: EngineParams,
): BusinessDiagnosis {
  const scores = GENERIC_STRATEGIES.map((strategy) => ({
    strategy,
    result: scoreBusinessAlignment(observed, strategy, params),
  }));

  const declaredEntry = scores.find((s) => s.strategy === declared);
  if (!declaredEntry) {
    throw new Error(`Stratégie générique inconnue : « ${declared} »`);
  }

  const best = scores.reduce((a, b) => (b.result.score > a.result.score ? b : a));

  const stuckThreshold = param(params, 'alignment.stuck_threshold');
  const driftThreshold = param(params, 'alignment.drift_gap_threshold');

  const stuckInTheMiddle = best.result.score < stuckThreshold;
  // Une équipe déjà au milieu de gué n'est pas en plus « en dérive » : elle
  // n'exécute aucune stratégie alternative cohérente vers laquelle dériver.
  const strategicDrift =
    !stuckInTheMiddle && best.result.score - declaredEntry.result.score > driftThreshold;

  return {
    declared,
    declaredFit: declaredEntry.result.score,
    bestFit: best.result.score,
    bestStrategy: best.strategy,
    stuckInTheMiddle,
    strategicDrift,
    details: declaredEntry.result.details,
  };
}

// ===========================================================================
// 6. Alignement corporate (doc 01 §5)
// ===========================================================================

/** Indice de centralisation : part des cinq fonctions pilotées au siège. */
export function centralisationIndex(input: CorporateInput): number {
  const flags = [
    input.centralPurchasing,
    input.centralIt,
    input.centralRd,
    input.centralHr,
    input.centralFinance,
  ];
  return (flags.filter(Boolean).length / flags.length) * 100;
}

/**
 * Mutualisation EFFECTIVE, distincte de la centralisation : on peut centraliser
 * les achats sans que les DAS achètent les mêmes choses. Seul le partage réel
 * compte.
 */
export function sharedResourcesIndex(input: CorporateInput): number {
  if (input.activeSectors.length < 2) return 0;
  return (
    100 *
    mean([
      input.sharedSupplierRatio,
      input.sharedDistributorRatio,
      input.sharedRd ? 1 : 0,
      input.sharedProduction ? 1 : 0,
    ])
  );
}

/** Proximité moyenne deux à deux des DAS du portefeuille. */
export function portfolioRelatedness(
  sectors: string[],
  proximity: (a: string, b: string) => number,
): number {
  if (sectors.length < 2) return 100; // un seul métier est parfaitement « lié » à lui-même
  const pairs: number[] = [];
  for (let i = 0; i < sectors.length; i += 1) {
    for (let j = i + 1; j < sectors.length; j += 1) {
      pairs.push(proximity(sectors[i], sectors[j]));
    }
  }
  return clamp100(mean(pairs));
}

export function valuesFit(values: [CompanyValue, CompanyValue], dominant: GenericStrategy): number {
  const affinities = values.map((v) => VALUE_AFFINITY[v][dominant]);
  return ((mean(affinities) + 1) / 2) * 100;
}

export function buildCorporateVector(
  input: CorporateInput,
  proximity: (a: string, b: string) => number,
): CorporateVector {
  const dasCount = input.activeSectors.length;
  return {
    // 1 DAS → 0 ; 8 DAS → 100
    portfolio_breadth: clamp100(((Math.max(dasCount, 1) - 1) / 7) * 100),
    portfolio_relatedness: portfolioRelatedness(input.activeSectors, proximity),
    centralisation_index: centralisationIndex(input),
    shared_resources_index: sharedResourcesIndex(input),
    vertical_integration: clamp100(input.verticalIntegration),
    talent_mix: clamp100(input.talentMix),
    values_fit: valuesFit(input.values, input.dominantStrategy),
  };
}

function corporateTarget(
  params: EngineParams,
  strategy: CorporateStrategy,
  axis: CorporateAxis,
): number {
  return paramOr(
    params,
    `alignment.target.${strategy}.${axis}`,
    CORPORATE_TARGETS[strategy][axis],
  );
}

function corporateWeight(
  params: EngineParams,
  strategy: CorporateStrategy,
  axis: CorporateAxis,
): number {
  return paramOr(
    params,
    `alignment.weight.${strategy}.${axis}`,
    CORPORATE_WEIGHTS[strategy][axis],
  );
}

/**
 * Pénalités structurelles absolues (doc 01 §5.7).
 *
 * Elles ne dépendent PAS de ce que l'équipe déclare : ce sont des contraintes
 * d'organisation. Une structure fonctionnelle avec cinq métiers ne tient pas,
 * qu'on l'appelle spécialisation ou conglomérat.
 */
export function absolutePenalties(
  input: CorporateInput,
  vector: CorporateVector,
): NamedPenalty[] {
  const penalties: NamedPenalty[] = [];
  const dasCount = input.activeSectors.length;

  if (input.structureType === 'fonctionnelle' && dasCount >= 4) {
    penalties.push({
      key: 'fonctionnelle_portefeuille_large',
      points: -15,
      explanation: `Structure fonctionnelle avec ${dasCount} DAS : une direction unique par fonction ne peut pas piloter autant de métiers.`,
    });
  }

  if (input.structureType === 'matricielle' && dasCount <= 1) {
    penalties.push({
      key: 'matricielle_sans_objet',
      points: -12,
      explanation:
        "Structure matricielle sur un seul DAS : vous payez une double hiérarchie sans rien à croiser.",
    });
  }

  if (input.structureType === 'divisionnelle' && dasCount <= 1) {
    penalties.push({
      key: 'divisionnelle_sans_objet',
      points: -8,
      explanation: "Structure divisionnelle sur un seul DAS : vous dupliquez des fonctions support.",
    });
  }

  if (vector.centralisation_index >= 80 && vector.portfolio_relatedness <= 30) {
    penalties.push({
      key: 'siege_omniscient',
      points: -10,
      explanation:
        "Un siège qui décide de tout sur des métiers étrangers les uns aux autres décide mal, et lentement.",
    });
  }

  if (vector.shared_resources_index >= 70 && vector.portfolio_relatedness <= 30) {
    penalties.push({
      key: 'mutualisation_sterile',
      points: -12,
      explanation:
        "Vous mutualisez des ressources entre des métiers qui n'ont rien en commun : cela produit de la coordination, pas des économies.",
    });
  }

  if (input.corporateStrategy === 'integration_verticale' && vector.vertical_integration < 30) {
    penalties.push({
      key: 'integration_proclamee',
      points: -14,
      explanation:
        "Vous déclarez une intégration verticale sans contrôler de maillon amont ni aval : l'intention n'est pas une stratégie.",
    });
  }

  return penalties;
}

export function scoreCorporateAlignment(
  input: CorporateInput,
  proximity: (a: string, b: string) => number,
  params: EngineParams,
): CorporateAlignment {
  const vector = buildCorporateVector(input, proximity);
  const strategy = input.corporateStrategy;

  const details: AxisDetail[] = [];
  let totalPenalty = 0;

  for (const axis of CORPORATE_AXES) {
    const target = corporateTarget(params, strategy, axis);
    const weight = corporateWeight(params, strategy, axis);
    const value = clamp100(vector[axis]);
    const d = normalizedGap(value, target);
    const penalty = weight * penaltyFn(d, params);
    totalPenalty += penalty;
    details.push({
      axis,
      observed: value,
      target,
      gap: value - target,
      weight,
      penaltyPts: penalty * 100,
    });
  }

  const penalties: NamedPenalty[] = [];

  const structurePoints = STRUCTURE_PENALTIES[strategy][input.structureType];
  if (structurePoints !== 0) {
    const key = `${strategy}:${input.structureType}`;
    penalties.push({
      key: `structure_${key}`,
      points: structurePoints,
      explanation: STRUCTURE_PENALTY_EXPLANATIONS[key] ?? 'Structure incohérente avec la stratégie déclarée.',
    });
  }

  penalties.push(...absolutePenalties(input, vector));

  const penaltyPoints = penalties.reduce((acc, p) => acc + p.points, 0);
  const score = clamp100(100 * (1 - totalPenalty) + penaltyPoints);

  return { score, details, penalties };
}

// ===========================================================================
// 7. Score temporel et composition finale (doc 01 §6)
// ===========================================================================

export function scoreTemporalAlignment(
  strategyChangesThisRound: number,
  consecutiveImprovingRounds: number,
  params: EngineParams,
): number {
  const changeMalus = param(params, 'alignment.sat_change_malus');
  const improvementBonus = param(params, 'alignment.sat_improvement_bonus');
  return clamp100(
    100 - changeMalus * strategyChangesThisRound + improvementBonus * consecutiveImprovingRounds,
  );
}

export interface ComputeAlignmentInput {
  /** Diagnostic par DAS, indexé par `dasId`. */
  perDas: Record<string, BusinessDiagnosis>;
  /** Chiffre d'affaires par DAS, pour la pondération du SAB global. */
  revenueByDas: Record<string, number>;
  corporate: CorporateAlignment;
  /**
   * SAG par DAS — conformité aux directives du groupe. Indexé par `dasId`.
   *
   * Optionnel : une session provisionnée avant l'introduction des directives
   * n'en a aucun. Dans ce cas le poids du SAG est redistribué sur les trois
   * autres étages plutôt que compté comme un zéro — sanctionner une équipe
   * pour une décision qu'on ne lui a jamais demandée serait injuste.
   */
  sagByDas?: Record<string, number>;
  strategyChangesThisRound: number;
  consecutiveImprovingRounds: number;
  /**
   * Changements de stratégie qui résolvent une dérive diagnostiquée au tour
   * précédent : ceux-là sont gratuits (doc 01 §6.1).
   */
  driftResolvingChanges?: number;
}

export function computeAlignment(
  input: ComputeAlignmentInput,
  params: EngineParams,
): AlignmentResult {
  const dasIds = Object.keys(input.perDas);

  // SAB global pondéré par le chiffre d'affaires : une incohérence sur le DAS
  // principal pèse plus qu'une incohérence sur un DAS marginal.
  const totalRevenue = dasIds.reduce((acc, id) => acc + Math.max(input.revenueByDas[id] ?? 0, 0), 0);
  const sabGlobal =
    dasIds.length === 0
      ? param(params, 'alignment.initial_ia')
      : totalRevenue > 0
        ? dasIds.reduce(
            (acc, id) =>
              acc + ((input.revenueByDas[id] ?? 0) / totalRevenue) * input.perDas[id].declaredFit,
            0,
          )
        : mean(dasIds.map((id) => input.perDas[id].declaredFit));

  const billableChanges = Math.max(
    input.strategyChangesThisRound - (input.driftResolvingChanges ?? 0),
    0,
  );
  const sat = scoreTemporalAlignment(billableChanges, input.consecutiveImprovingRounds, params);

  // SAG global : même pondération par le chiffre d'affaires que le SAB. Une
  // divergence sur le DAS principal pèse plus qu'une divergence marginale.
  const sagEntries = dasIds.filter((id) => input.sagByDas?.[id] !== undefined);
  const sagGlobal =
    sagEntries.length === 0
      ? null
      : totalRevenue > 0
        ? sagEntries.reduce(
            (acc, id) =>
              acc + ((input.revenueByDas[id] ?? 0) / totalRevenue) * (input.sagByDas![id]),
            0,
          ) / Math.max(
            sagEntries.reduce((acc, id) => acc + (input.revenueByDas[id] ?? 0), 0) / totalRevenue,
            1e-9,
          )
        : mean(sagEntries.map((id) => input.sagByDas![id]));

  const wSabBase = param(params, 'alignment.weight.sab');
  const wSagBase = param(params, 'alignment.weight.sag');
  const wSacBase = param(params, 'alignment.weight.sac');
  const wSatBase = param(params, 'alignment.weight.sat');

  // Faute de directives saisies, le poids du SAG est REDISTRIBUÉ au prorata
  // sur les autres étages. Le compter comme un zéro punirait le silence.
  const redistribute = sagGlobal === null;
  const others = wSabBase + wSacBase + wSatBase;
  const scale = redistribute && others > 0 ? (others + wSagBase) / others : 1;

  const wSab = wSabBase * scale;
  const wSac = wSacBase * scale;
  const wSat = wSatBase * scale;
  const wSag = redistribute ? 0 : wSagBase;

  const iaRaw =
    wSab * sabGlobal +
    wSag * (sagGlobal ?? 0) +
    wSac * input.corporate.score +
    wSat * sat;

  // Les diagnostics sont déclenchés dès qu'un seul DAS est touché : une
  // incohérence quelque part contamine la lecture de l'ensemble.
  const stuckDas = dasIds.filter((id) => input.perDas[id].stuckInTheMiddle);
  const driftDas = dasIds.filter((id) => input.perDas[id].strategicDrift);

  const stuck = stuckDas.length > 0;
  const drift = driftDas.length > 0;

  const iaFinal = clamp100(
    iaRaw -
      (stuck ? param(params, 'alignment.stuck_malus') : 0) -
      (drift ? param(params, 'alignment.drift_malus') : 0),
  );

  const penalties: NamedPenalty[] = [...input.corporate.penalties];
  if (stuck) {
    penalties.push({
      key: 'milieu_de_gue',
      points: -param(params, 'alignment.stuck_malus'),
      explanation:
        "Vos décisions ne correspondent à aucune stratégie cohérente : ni assez bon marché pour gagner sur les coûts, ni assez distinctif pour justifier un premium.",
    });
  }
  if (drift) {
    const first = input.perDas[driftDas[0]];
    penalties.push({
      key: 'derive_strategique',
      points: -param(params, 'alignment.drift_malus'),
      explanation: `Vous déclarez « ${first.declared} » mais vos décisions exécutent « ${first.bestStrategy} ». Re-déclarer au tour prochain efface ce malus sans coût de transition.`,
    });
  }

  const driftSource = drift ? input.perDas[driftDas[0]] : null;

  return {
    sabGlobal,
    sagGlobal,
    sac: input.corporate.score,
    sat,
    iaRaw,
    iaFinal,
    stuckInTheMiddle: stuck,
    strategicDrift: drift,
    driftDeclared: driftSource?.declared ?? null,
    driftActual: driftSource?.bestStrategy ?? null,
    penalties,
    perDas: input.perDas,
    corporateDetails: input.corporate.details,
  };
}

// ===========================================================================
// 8. Effets économiques de l'alignement (doc 01 §7)
// ===========================================================================

/**
 * Prime de marge — la parade à la frustration du jeu à somme nulle.
 *
 * Une équipe très bien alignée peut perdre des parts de marché et rester la
 * plus profitable de son pool. Elle a de quoi financer sa reconquête, et le
 * débriefing a autre chose à raconter que « ils ont mis plus de marketing ».
 */
export function marginPremium(ia: number, params: EngineParams): number {
  const max = param(params, 'alignment.margin_premium_max');
  const pivot = param(params, 'alignment.margin_premium_pivot');
  const span = 100 - pivot;
  const raw = max * ((ia - pivot) / span);
  return Math.min(Math.max(raw, -max), max);
}

export interface SynergyEffect {
  savingPct: number;
  coordinationCostPct: number;
  hqOverheadPct: number;
  /** Multiplicateur net à appliquer aux charges de structure. */
  opexMultiplier: number;
}

/**
 * Synergies et coûts de coordination.
 *
 * Mutualiser des activités PROCHES produit des économies ; mutualiser des
 * activités ÉTRANGÈRES produit de la bureaucratie. C'est la démonstration
 * chiffrée de la différence entre diversification liée et conglomérale — et
 * elle est économique, pas seulement scorée.
 */
export function synergyEffect(
  sharedResourcesIdx: number,
  relatedness: number,
  centralisationIdx: number,
  dasCount: number,
  params: EngineParams,
): SynergyEffect {
  const m = sharedResourcesIdx / 100;
  const p = relatedness / 100;

  const savingPct = m * p * param(params, 'alignment.synergy_saving_max');
  const coordinationCostPct = m * (1 - p) * param(params, 'alignment.coordination_cost_max');
  const hqOverheadPct =
    (centralisationIdx / 100) * dasCount * param(params, 'alignment.hq_overhead_per_das');

  return {
    savingPct,
    coordinationCostPct,
    hqOverheadPct,
    opexMultiplier: Math.max(1 - savingPct + coordinationCostPct + hqOverheadPct, 0.5),
  };
}
