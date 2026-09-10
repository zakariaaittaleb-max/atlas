/**
 * ATLAS — marché : prix, compétitivité, répartition à somme nulle.
 *
 * Implémente `docs/02-economie.md` §2 et §8. C'est le module le plus sensible
 * du moteur : c'est lui qui garantit que les parts d'un pool somment à 100 %,
 * et c'est lui que les étudiants verront à la révélation.
 */

import { clamp, clamp01, clamp100, median } from './math';
import { param, paramOr, type EngineParams } from './params';

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

/**
 * Risque d'entrée d'un mouvement d'Ansoff, en coefficient 0–1.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * Les quatre paramètres `ansoff.risk.*` existaient, la matrice était saisie à
 * l'écran d'organisation, et RIEN ne reliait le mouvement déclaré à son
 * coefficient : le moteur lisait `team_units.ansoff_risk_coefficient`, colonne
 * que seule la persistance des acquisitions alimente. Pour toute unité
 * fondatrice elle valait 0. Une équipe déclarait « diversification » — le
 * mouvement le plus risqué de la matrice — et n'en subissait aucun risque.
 *
 * Le coefficient s'applique les deux premiers tours du domaine
 * (`competitivenessScore`) : entrer sur un marché qu'on ne connaît pas coûte,
 * le temps d'apprendre.
 */
export function ansoffRisk(
  movement: string | null | undefined,
  params: EngineParams,
): number {
  if (!movement) return 0;
  return clamp01(paramOr(params, `ansoff.risk.${movement}`, 0));
}

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
  /** Sorti de l'atelier ce tour. */
  productionUnits: number;
  /** Intrants restés en magasin à la clôture, reportés au tour suivant. */
  inputStockEndUnits: number;
  /** Produits finis invendus, reportés au tour suivant. */
  finishedStockEndUnits: number;
  /** Vrai quand ce sont les intrants, et non la capacité, qui ont bridé. */
  limitedByInputs: boolean;
}

export interface SupplyState {
  /**
   * Intrants disponibles : stock d'ouverture plus livraisons du tour.
   * `null` = aucune contrainte d'approvisionnement (achat au comptant).
   */
  inputsAvailable: number | null;
  /** Produits finis en stock à l'ouverture, vendables sans rien produire. */
  finishedStockStart: number;
}

/**
 * Une rupture se paie deux fois : en chiffre d'affaires, et en réputation
 * (voir `nextNotoriety` et `perceivedQuality`).
 *
 * C'est l'arbitrage central du jeu : attaquer en prix sans capacité, c'est
 * acheter des parts de marché qu'on ne peut pas servir, et abîmer sa marque
 * en le faisant.
 *
 * ── LES DEUX ÉTAGES DE STOCK ───────────────────────────────────────────────
 * L'approvisionnement n'était qu'un levier de négociation : le volume engagé
 * jouait sur la remise et le risque de rupture, jamais sur la QUANTITÉ
 * disponible. Une équipe pouvait donc vendre sans avoir rien acheté.
 *
 * Désormais deux magasins se remplissent et se vident :
 *
 *   1. les INTRANTS, qui limitent ce que l'atelier peut produire. En acheter
 *      trop peu fait perdre des ventes ; trop, immobilise de la trésorerie ;
 *   2. les PRODUITS FINIS, qui se reportent d'un tour à l'autre. Ils
 *      s'accumulent quand la demande recule, et servent alors d'amortisseur au
 *      tour suivant.
 *
 * La production suit la DEMANDE, pas la capacité : un atelier ne tourne pas à
 * plein pour remplir un entrepôt. Produire à pleine capacité punirait
 * mécaniquement toute équipe ayant investi dans son outil, ce qui est
 * l'inverse de ce que le jeu enseigne.
 */
export function resolveVolume(
  marketVolume: number,
  marketShare: number,
  effectiveCapacity: number,
  unitPriceMad: number,
  supply: SupplyState = { inputsAvailable: null, finishedStockStart: 0 },
): VolumeResult {
  const volumeDemanded = Math.max(marketVolume * clamp01(marketShare), 0);
  const capacity = Math.max(effectiveCapacity, 0);
  const finishedStockStart = Math.max(supply.finishedStockStart, 0);

  // Ce qu'il reste à produire une fois l'entrepôt écoulé.
  const toProduce = Math.max(volumeDemanded - finishedStockStart, 0);

  const inputCeiling =
    supply.inputsAvailable === null ? Infinity : Math.max(supply.inputsAvailable, 0);
  const productionUnits = Math.min(toProduce, capacity, inputCeiling);

  const offer = finishedStockStart + productionUnits;
  const volumeSold = Math.min(volumeDemanded, offer);
  const volumeLost = volumeDemanded - volumeSold;

  return {
    volumeDemanded,
    volumeSold,
    volumeLost,
    stockoutRate: volumeDemanded > 0 ? volumeLost / volumeDemanded : 0,
    revenueMad: volumeSold * unitPriceMad,
    productionUnits,
    inputStockEndUnits:
      supply.inputsAvailable === null
        ? 0
        : Math.max(supply.inputsAvailable - productionUnits, 0),
    finishedStockEndUnits: Math.max(offer - volumeSold, 0),
    // La distinction compte pour le débriefing : manquer de capacité et
    // manquer de matière se corrigent par des décisions opposées.
    limitedByInputs: inputCeiling < Math.min(toProduce, capacity),
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

export interface SegmentLike {
  qualityRequirement: number;
  marketSharePct: number;
}

/**
 * Part du marché du DAS que l'équipe adresse RÉELLEMENT.
 *
 * ── CE QUE CETTE FONCTION CORRIGE ──────────────────────────────────────────
 * Elle normalisait auparavant par la part servie (`effective / total`), ce qui
 * ANNULAIT exactement l'effet qu'elle devait produire : servir un seul segment
 * à 10 % du marché donnait le même volume que servir les cinq. Or les deux
 * cahiers sont formels — « servir un segment de plus élargit le marché
 * adressable » (doc 03 §2, doc 00 §3).
 *
 * La conséquence était une faute d'équilibrage, pas seulement de fidélité :
 * restreindre ses segments ne coûtait AUCUN volume et rapportait des points
 * d'alignement sur l'axe B9 des stratégies de concentration. La concentration
 * était donc strictement dominante, et l'arbitrage central de Porter — un
 * marché plus étroit contre une offre mieux ajustée — n'existait pas.
 *
 * Deux effets, désormais distincts :
 *   • L'ÉTENDUE — la somme des parts servies. Cinq segments → 100 % du DAS ;
 *     la seule niche premium → 10 %.
 *   • L'EXIGENCE — un segment dont l'exigence de qualité n'est pas satisfaite
 *     ne compte que pour moitié (doc 03 §2 : « la part de marché de l'équipe
 *     SUR CE SEGMENT est divisée par deux »).
 *
 * Le résultat multiplie la part de marché issue de la répartition à somme
 * nulle : on ne vend pas sur un segment qu'on ne sert pas, et le volume
 * correspondant reste simplement non servi.
 */
export function addressableShare(
  perceivedQuality: number,
  servedSegments: SegmentLike[],
  params: EngineParams,
): number {
  const divisor = param(params, 'segment.quality_shortfall_divisor');

  const effective = servedSegments.reduce((acc, s) => {
    const meets = perceivedQuality >= s.qualityRequirement;
    return acc + s.marketSharePct * (meets ? 1 : 1 / divisor);
  }, 0);

  return clamp(effective, 0, 1);
}

/**
 * Facteur de sensibilité au prix des segments servis, relatif au DAS entier.
 *
 * `sensibilité_prix` figure au référentiel de chaque segment (doc 03 §2) et
 * n'était lue par personne : servir la restauration collective — qui n'achète
 * que le prix — ou le premium bio — qui ne le regarde pas — produisait
 * exactement la même réaction à un geste de prix. La moitié de l'intérêt du
 * choix de segments disparaissait.
 *
 * Le facteur est RELATIF à la sensibilité moyenne du DAS, et non absolu :
 * l'élasticité de branche est déjà calibrée sur le marché complet (2,0 pour
 * l'agro-industrie, dont les segments pèsent 1,48 en moyenne). Multiplier par
 * la sensibilité brute l'aurait gonflée de moitié sur tout le jeu. Servir tout
 * le marché rend donc 1, et l'élasticité de branche reste ce qu'elle était.
 */
export function segmentPriceSensitivity(
  servedSegments: { marketSharePct: number; priceSensitivity: number }[],
  allSegments: { marketSharePct: number; priceSensitivity: number }[],
): number {
  const weighted = (list: { marketSharePct: number; priceSensitivity: number }[]) => {
    const total = list.reduce((acc, s) => acc + s.marketSharePct, 0);
    if (total <= 0) return 0;
    return list.reduce((acc, s) => acc + s.marketSharePct * s.priceSensitivity, 0) / total;
  };

  const reference = weighted(allSegments);
  if (reference <= 0) return 1;

  const served = weighted(servedSegments);
  // Un DAS sans segment servi ne vend rien : le facteur n'a pas d'usage, et
  // rendre 1 évite d'introduire un zéro dans une multiplication d'élasticité.
  if (served <= 0) return 1;

  return served / reference;
}
