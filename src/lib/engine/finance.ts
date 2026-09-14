/**
 * ATLAS — finance : compte de résultat, fiscalité marocaine, trésorerie.
 *
 * Implémente `docs/02-economie.md` §9, §10 et §11.
 *
 * ⚠️ Les taux fiscaux et sociaux viennent de `engine_parameters` et doivent
 * être revérifiés avant chaque session : ils changent par loi de finances.
 */

import { clamp, uniform } from './math';
import { param, type EngineParams } from './params';
import type { PnlStatement, TreasuryStatus } from './types';

// ===========================================================================
// Dette (doc 02 §9.1)
// ===========================================================================

/**
 * La banque n'est pas un distributeur automatique : la marge de risque monte
 * avec le levier, de +1,5 point sans dette à +7,5 points à un levier de 3.
 */
export function riskMargin(debtMad: number, equityMad: number, params: EngineParams): number {
  const base = param(params, 'finance.risk_margin_base');
  const perLeverage = param(params, 'finance.risk_margin_per_leverage');
  const maxLeverage = param(params, 'finance.max_leverage_for_margin');

  const leverage = equityMad > 0 ? debtMad / equityMad : maxLeverage;
  return base + perLeverage * clamp(leverage, 0, maxLeverage);
}

export function interestExpense(
  debtMad: number,
  equityMad: number,
  params: EngineParams,
  /**
   * Écart de taux imposé par un choc — resserrement ou détente monétaire.
   *
   * Le paramètre existait dans le catalogue de cartes depuis l'origine mais
   * n'était lu nulle part : « resserrement monétaire » et « détente monétaire »
   * ne faisaient rien. Le taux ne peut pas devenir négatif : une banque
   * centrale peut détendre, elle ne paie pas l'emprunteur.
   */
  rateDelta = 0,
  /**
   * Ce que la banque ajoute ou retranche à sa prime selon ce que le marché
   * pense du Groupe (voir `investorRateAdjustment`). Le taux total ne devient
   * jamais négatif.
   */
  spreadAdjustment = 0,
): number {
  const keyRate = param(params, 'finance.bam_key_rate');
  const effective = Math.max(keyRate + rateDelta, 0);
  return Math.max(debtMad, 0) *
    Math.max(effective + riskMargin(debtMad, equityMad, params) + spreadAdjustment, 0);
}

// ===========================================================================
// Fiscalité marocaine (doc 02 §9.2)
// ===========================================================================

export interface TaxResult {
  taxMad: number;
  effectiveRate: number;
  /** Vrai si l'équipe paie la cotisation minimale plutôt que l'IS de droit commun. */
  minimumContributionApplied: boolean;
}

/**
 * Impôt sur les sociétés.
 *
 * Une équipe déficitaire paie quand même la cotisation minimale : c'est la
 * mécanique qui interdit la stratégie « je perds de l'argent tranquillement ».
 */
export function corporateTax(
  taxableIncomeMad: number,
  grossRevenueMad: number,
  regime: 'droit_commun' | 'cfc_zai' | 'banque_assurance',
  params: EngineParams,
): TaxResult {
  const highThreshold = param(params, 'fiscal.is_high_threshold_mad');
  const rateStandard = param(params, 'fiscal.is_rate_standard');
  const rateHigh = param(params, 'fiscal.is_rate_high');
  const rateBank = param(params, 'fiscal.is_rate_bank_insurance');
  const minPct = param(params, 'fiscal.is_minimum_contribution_pct');
  const minFloor = param(params, 'fiscal.is_minimum_floor_mad');

  const rate =
    taxableIncomeMad > highThreshold
      ? regime === 'banque_assurance'
        ? rateBank
        : rateHigh
      : rateStandard;

  const scheduleTax = Math.max(taxableIncomeMad, 0) * rate;
  const minimumContribution = Math.max(grossRevenueMad * minPct, minFloor);
  const taxMad = Math.max(scheduleTax, minimumContribution);

  return {
    taxMad,
    effectiveRate: taxableIncomeMad > 0 ? taxMad / taxableIncomeMad : 0,
    minimumContributionApplied: minimumContribution > scheduleTax,
  };
}

// ===========================================================================
// Charges de personnel
// ===========================================================================

export function payrollCost(
  headcount: number,
  avgMonthlySalaryMad: number,
  params: EngineParams,
): number {
  const charges = param(params, 'social.charges_patronales_pct');
  const smig = param(params, 'social.smig_monthly_mad');
  // Le plancher SMIG est revalidé ici, côté serveur, même si le client l'a
  // déjà appliqué pour le retour immédiat.
  const salary = Math.max(avgMonthlySalaryMad, smig);
  return Math.max(headcount, 0) * salary * 12 * (1 + charges);
}

// ===========================================================================
// Compte de résultat (doc 02 §9)
// ===========================================================================

export interface PnlInput {
  revenueMad: number;
  distributorMarginPct: number;
  cogsMad: number;
  /** Prime de marge issue de l'alignement, ±8 % (doc 01 §7.2). */
  marginPremiumPct: number;
  payrollMad: number;
  marketingMad: number;
  rdMad: number;
  overheadMad: number;
  /** Multiplicateur de synergie appliqué aux charges de structure (doc 01 §7.3). */
  overheadMultiplier: number;
  fixedProductionMad: number;
  consultingMad: number;
  depreciationMad: number;
  debtMad: number;
  equityMad: number;
  taxRegime: 'droit_commun' | 'cfc_zai' | 'banque_assurance';
  capexMad: number;
  treasuryStartMad: number;
  workingCapitalDays: number;
  previousWorkingCapitalMad: number;
  debtDrawnMad: number;
  debtRepaidMad: number;
  /** Levée de fonds propres décidée ce tour, brute de frais. */
  capitalRaisedMad?: number;
  /** Dividende voté sur l'exercice clos. */
  dividendMad?: number;
  /**
   * Frais et décote d'émission, en part du montant levé, tels que les
   * investisseurs les fixent (voir `equityIssueTerms`). Absent : frais de base.
   */
  equityIssueCostPct?: number;
  /** Ajustement de la prime de risque bancaire par l'attractivité. */
  investorSpreadAdjustment?: number;
  divestitureCashMad: number;
  /** Écart de taux imposé par un choc monétaire. Optionnel : 0 par défaut. */
  rateDelta?: number;
  /** Subvention directe, en part du chiffre d'affaires. */
  subsidyPctOfRevenue?: number;
  /**
   * Marge SUPPLÉMENTAIRE tirée des domaines en océan bleu.
   *
   * Sortir du calcul à somme nulle multiplie la marge par 2,5 — c'est la
   * promesse que l'écran fait à l'équipe. Elle est passée en MONTANT et non
   * en pourcentage : la fenêtre s'ouvre par domaine, alors que le résultat se
   * tient au niveau du groupe, et un pourcentage global l'étendrait à des
   * domaines qui n'ont rien tenté.
   */
  blueOceanMarginMad?: number;
  /**
   * Ticket d'entrée en océan bleu, payé que la tentative réussisse ou non.
   * C'est une exploration, pas un achat : elle passe en charge.
   */
  blueOceanEntryMad?: number;
}

export function buildPnl(input: PnlInput, params: EngineParams): PnlStatement {
  const distributorMarginMad = input.revenueMad * clamp(input.distributorMarginPct, 0, 1);
  const netRevenueMad = input.revenueMad - distributorMarginMad;

  // La prime d'alignement joue sur la marge brute : une entreprise cohérente
  // exécute mieux — moins de gaspillage, meilleure acceptation du prix.
  const grossMarginMad =
    (netRevenueMad - input.cogsMad) * (1 + input.marginPremiumPct) +
    (input.blueOceanMarginMad ?? 0);

  const overheadMad = input.overheadMad * input.overheadMultiplier;

  const ebitdaMad =
    grossMarginMad -
    input.payrollMad -
    input.marketingMad -
    input.rdMad -
    overheadMad -
    input.fixedProductionMad -
    input.consultingMad -
    (input.blueOceanEntryMad ?? 0);

  const ebitMad = ebitdaMad - input.depreciationMad;
  const interestMad = interestExpense(
    input.debtMad, input.equityMad, params, input.rateDelta ?? 0,
    input.investorSpreadAdjustment ?? 0,
  );
  const pretaxIncomeMad = ebitMad - interestMad;

  const tax = corporateTax(pretaxIncomeMad, input.revenueMad, input.taxRegime, params);
  const netIncomeMad = pretaxIncomeMad - tax.taxMad;

  // La croissance consomme du cash : c'est la leçon financière la plus utile
  // du jeu, et elle n'existait pas dans la version papier.
  const workingCapitalMad = input.revenueMad * (input.workingCapitalDays / 360);
  const workingCapitalChangeMad = workingCapitalMad - input.previousWorkingCapitalMad;

  // ── Fonds propres : ce qui entre, ce qui sort ──────────────────────────
  //
  // Une levée n'est pas gratuite : les frais d'émission se prélèvent sur le
  // produit, donc l'équipe encaisse et capitalise le NET. Sans ce coût, lever
  // du capital serait un robinet sans contrepartie.
  const capitalRaisedMad = Math.max(input.capitalRaisedMad ?? 0, 0);
  const equityIssueCostMad =
    capitalRaisedMad * (input.equityIssueCostPct ?? param(params, 'finance.equity_issue_cost_pct'));
  const capitalNetMad = capitalRaisedMad - equityIssueCostMad;
  const dividendMad = Math.max(input.dividendMad ?? 0, 0);

  // ── On ne rembourse pas plus qu'on ne doit ─────────────────────────────
  //
  // La clôture de la dette était bornée à zéro, mais la trésorerie débitait le
  // remboursement BRUT. Rembourser 3,4 Md sur une dette de 2 Md faisait donc
  // sortir 1,4 Md de la caisse vers personne. Le remboursement est ramené à ce
  // qui est dû — dette d'ouverture et tirage du tour compris — avant de toucher
  // l'un comme l'autre.
  const debtRepaidMad = Math.min(
    Math.max(input.debtRepaidMad, 0),
    Math.max(input.debtMad, 0) + Math.max(input.debtDrawnMad, 0),
  );

  const selfFinancingMad = selfFinancingCapacity(netIncomeMad, input.depreciationMad);
  const freeCashFlowMad = freeCashFlow(selfFinancingMad, workingCapitalChangeMad, input.capexMad);

  const treasuryEndMad =
    input.treasuryStartMad +
    netIncomeMad +
    input.depreciationMad - // charge non décaissée
    input.capexMad -
    workingCapitalChangeMad +
    input.debtDrawnMad -
    debtRepaidMad +
    capitalNetMad -
    dividendMad +
    input.divestitureCashMad;

  // Le résultat s'accumule enfin dans les fonds propres : c'est lui qui, tour
  // après tour, élargit la capacité d'endettement d'une équipe rentable.
  const equityEndMad =
    input.equityMad + netIncomeMad - dividendMad + capitalNetMad;
  const debtOutstandingEndMad = Math.max(
    input.debtMad + input.debtDrawnMad - debtRepaidMad,
    0,
  );

  return {
    revenueMad: input.revenueMad,
    distributorMarginMad,
    netRevenueMad,
    cogsMad: input.cogsMad,
    grossMarginMad,
    payrollMad: input.payrollMad,
    marketingMad: input.marketingMad,
    rdMad: input.rdMad,
    overheadMad,
    fixedProductionMad: input.fixedProductionMad,
    consultingMad: input.consultingMad,
    ebitdaMad,
    depreciationMad: input.depreciationMad,
    ebitMad,
    interestMad,
    pretaxIncomeMad,
    corporateTaxMad: tax.taxMad,
    netIncomeMad,
    workingCapitalMad,
    workingCapitalChangeMad,
    capexMad: input.capexMad,
    treasuryStartMad: input.treasuryStartMad,
    treasuryEndMad,
    effectiveTaxRate: tax.effectiveRate,
    leverageRatio: input.equityMad > 0 ? input.debtMad / input.equityMad : 0,
    riskMargin: riskMargin(input.debtMad, input.equityMad, params),
    selfFinancingMad,
    freeCashFlowMad,
    capitalRaisedMad,
    equityIssueCostMad,
    dividendMad,
    equityEndMad,
    debtOutstandingEndMad,
  };
}

/** Amortissement linéaire du CAPEX historique. */
export function depreciation(
  capexHistoryMad: number[],
  params: EngineParams,
): number {
  const rounds = param(params, 'finance.amortization_rounds');
  return capexHistoryMad.slice(-rounds).reduce((acc, capex) => acc + capex / rounds, 0);
}

// ===========================================================================
// Paliers de détresse (doc 02 §10.2)
// ===========================================================================

export interface TreasuryOutcome {
  consecutiveNegativeRounds: number;
  status: TreasuryStatus;
  /** Malus de compétitivité à appliquer au tour SUIVANT. */
  nextRoundCompetitivenessMalus: number;
}

/**
 * Paliers progressifs, jamais de couperet. Une équipe ne doit jamais passer
 * deux heures à regarder les autres jouer : à chaque palier, le facilitateur
 * est alerté et peut offrir une étude ou déclencher une opportunité ciblée.
 */
export function treasuryStatus(
  treasuryEndMad: number,
  previousConsecutiveNegative: number,
  params: EngineParams,
): TreasuryOutcome {
  const consecutive = treasuryEndMad < 0 ? previousConsecutiveNegative + 1 : 0;

  if (consecutive === 0) {
    return { consecutiveNegativeRounds: 0, status: 'sain', nextRoundCompetitivenessMalus: 0 };
  }
  if (consecutive === 1) {
    return {
      consecutiveNegativeRounds: 1,
      status: 'surveillance',
      nextRoundCompetitivenessMalus: param(params, 'treasury.surveillance_malus'),
    };
  }
  if (consecutive === 2) {
    return {
      consecutiveNegativeRounds: 2,
      status: 'restructuration',
      nextRoundCompetitivenessMalus: param(params, 'treasury.restructuring_malus'),
    };
  }
  return {
    consecutiveNegativeRounds: consecutive,
    status: 'liquidation',
    nextRoundCompetitivenessMalus: param(params, 'treasury.restructuring_malus'),
  };
}

// ===========================================================================
// Capacité d'endettement, capacité d'autofinancement, flux libre
//
// Ces trois grandeurs sont ce qu'un directeur financier regarde avant
// d'arbitrer, et elles n'existaient pas : l'écran demandait un montant de
// crédit sans jamais dire combien la banque accepterait d'en prêter.
// ===========================================================================

export interface DebtCapacity {
  /** Encours maximal que la banque accepte, tous critères confondus. */
  totalMad: number;
  /** Ce qui reste à tirer, une fois la dette en cours déduite. */
  availableMad: number;
  /** Le critère qui BLOQUE — c'est lui qu'il faut desserrer. */
  binding: 'fonds_propres' | 'activite';
  /** Plafond adossé aux fonds propres, pour l'expliquer à l'écran. */
  byEquityMad: number;
  /** Plafond adossé au volume d'activité. */
  byRevenueMad: number;
}

/**
 * Ce que la banque accepte de prêter, et pourquoi.
 *
 * Deux critères, et c'est le plus contraignant qui l'emporte — comme un comité
 * de crédit procède :
 *
 *   • le GEARING : on ne prête pas plus de deux fois les fonds propres. Un
 *     actionnaire qui ne met rien ne trouve pas de banquier ;
 *   • le VOLUME D'ACTIVITÉ : l'encours total reste dans une fraction du chiffre
 *     d'affaires. C'est le critère qui punit la perte de parts de marché — un
 *     groupe qui rétrécit voit sa ligne de crédit rétrécir avec lui.
 *
 * ── POURQUOI PAS UN MULTIPLE D'EBITDA ──────────────────────────────────────
 * C'était le premier essai, et c'est le critère du métier : dette ≤ 3,5 × EBITDA.
 * Branché sur Atlas, il rendait ZÉRO pour toutes les équipes, à tous les tours.
 * La raison est structurelle : dans ce jeu la masse salariale absorbe près des
 * trois quarts de la marge brute, si bien que l'EBITDA vaut environ 1 % du
 * chiffre d'affaires. Aucun encours d'intérêt pédagogique ne passe un multiple
 * de trois et demi sur une telle base — le curseur de crédit n'aurait jamais pu
 * bouger vers la droite.
 *
 * Le rapport dette/EBITDA reste affiché comme INDICATEUR, avec son seuil de
 * 3,5 : il dit quelque chose de vrai sur la soutenabilité, il ne peut
 * simplement pas servir de plafond ici.
 */
export function debtCapacity(
  equityMad: number,
  revenueMad: number,
  debtOutstandingMad: number,
  params: EngineParams,
): DebtCapacity {
  const gearing = param(params, 'finance.debt_capacity_gearing_max');
  const share = param(params, 'finance.debt_capacity_revenue_share');

  const byEquityMad = Math.max(equityMad, 0) * gearing;
  const byRevenueMad = Math.max(revenueMad, 0) * share;
  const totalMad = Math.min(byEquityMad, byRevenueMad);

  return {
    totalMad,
    availableMad: Math.max(totalMad - Math.max(debtOutstandingMad, 0), 0),
    binding: byRevenueMad <= byEquityMad ? 'activite' : 'fonds_propres',
    byEquityMad,
    byRevenueMad,
  };
}

/**
 * Capacité d'autofinancement : ce que l'exploitation dégage réellement.
 *
 * Résultat net plus les charges qui n'ont pas été décaissées. Les
 * amortissements en sont la seule ici — Atlas ne modélise ni provisions ni
 * résultat de cession comptable, et la formule ne fait donc pas semblant.
 */
export function selfFinancingCapacity(netIncomeMad: number, depreciationMad: number): number {
  return netIncomeMad + depreciationMad;
}

/**
 * Flux de trésorerie libre : la CAF, moins ce que la croissance immobilise.
 *
 * C'est le seul chiffre qui répond à « pouvons-nous nous payer ce plan ? ».
 * Négatif, il dit que le tour se finance par la dette ou par le matelas, pas
 * par l'activité.
 */
export function freeCashFlow(
  selfFinancingMad: number,
  workingCapitalChangeMad: number,
  capexMad: number,
): number {
  return selfFinancingMad - workingCapitalChangeMad - capexMad;
}

/** Couverture des intérêts : combien de fois l'EBIT paie la charge financière. */
export function interestCoverage(ebitMad: number, interestMad: number): number | null {
  if (interestMad <= 0) return null;
  return ebitMad / interestMad;
}

// ===========================================================================
// Valorisation d'un DAS pour cession (doc 02 §11)
// ===========================================================================

export function dasBaseValuation(
  ebitdaMad: number,
  valuationMultiple: number,
  growthRate: number,
  capacityUnits: number,
  residualUnitValueMad: number,
  marketShare: number,
  positionPremiumMad: number,
): number {
  if (ebitdaMad > 0) {
    return ebitdaMad * valuationMultiple * (1 + 2 * growthRate);
  }
  // Activité déficitaire : on ne valorise plus un flux, on valorise des actifs
  // et une position.
  return capacityUnits * residualUnitValueMad + marketShare * positionPremiumMad;
}

/**
 * Offre de l'acheteur non joueur.
 *
 * Structurellement inférieure à ce qu'un concurrent rationnel proposerait :
 * c'est un plancher de liquidité, pas une bonne affaire. Vendre au NPC, c'est
 * renoncer à la valeur pour survivre.
 */
export function npcOffer(
  baseValuationMad: number,
  sellerStatus: TreasuryStatus,
  rng: () => number,
  params: EngineParams,
): number {
  const discount =
    sellerStatus === 'surveillance'
      ? param(params, 'divest.npc_discount_surveillance')
      : sellerStatus === 'restructuration' || sellerStatus === 'liquidation'
        ? param(params, 'divest.npc_discount_distress')
        : 0;

  const baseFactor = param(params, 'divest.npc_base_factor');
  const span = param(params, 'divest.npc_random_span');

  return Math.max(baseValuationMad * (1 - discount) * uniform(rng, baseFactor, baseFactor + span), 0);
}

export interface TransferOutcome {
  integrationRatio: number;
  valueLossPct: number;
  marketShareTransferred: number;
  notorietyTransferred: number;
  /** Part détruite par l'intégration, redistribuée au pool. */
  shareReleasedToPool: number;
}

/**
 * Racheter sans budgéter l'intégration détruit jusqu'à 45 % de ce qu'on vient
 * de payer. C'est la même fonction continue que le M&A, réutilisée ici.
 */
export function resolveTransfer(
  pricePaidMad: number,
  integrationBudgetMad: number,
  sellerMarketShare: number,
  sellerNotoriety: number,
  params: EngineParams,
): TransferOutcome {
  const referencePct = param(params, 'divest.integration_reference_pct');
  const floor = param(params, 'divest.value_loss_floor');
  const ceiling = param(params, 'divest.value_loss_ceiling');
  const base = param(params, 'divest.value_loss_base');
  const slope = param(params, 'divest.value_loss_slope');

  const reference = referencePct * pricePaidMad;
  const integrationRatio = reference > 0 ? integrationBudgetMad / reference : 0;
  const valueLossPct = clamp(base - slope * integrationRatio, floor, ceiling);

  const marketShareTransferred = sellerMarketShare * (1 - valueLossPct);

  return {
    integrationRatio,
    valueLossPct,
    marketShareTransferred,
    notorietyTransferred: sellerNotoriety * (1 - valueLossPct),
    shareReleasedToPool: sellerMarketShare - marketShareTransferred,
  };
}
