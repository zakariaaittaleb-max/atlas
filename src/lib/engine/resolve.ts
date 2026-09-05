/**
 * ATLAS — orchestration de la résolution d'un tour.
 *
 * Fonction pure : elle prend un instantané complet (`ResolutionInput`), rend
 * un résultat complet (`ResolutionOutput`), et n'écrit nulle part. La couche
 * serveur assemble l'entrée depuis Postgres et persiste la sortie en une seule
 * transaction. Une résolution litigieuse peut donc être rejouée à l'identique
 * à partir d'un fichier JSON, devant la classe si nécessaire.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LES SIX DÉCALAGES D'UN TOUR
 *
 * Plusieurs formules du cahier sont circulaires si on les prend au pied de la
 * lettre : la notoriété dépend des ruptures, qui dépendent des volumes, qui
 * dépendent de la notoriété. Chaque boucle est coupée par un décalage d'un
 * tour, et chacun se défend économiquement — ce ne sont pas des approximations
 * de commodité :
 *
 *   1. R&D → qualité              Un programme de R&D ne produit pas au trimestre
 *                                 où il est financé. (Choix explicite, doc 02 §7.1)
 *   2. CAPEX → capacité           Une ligne de production se construit avant de
 *                                 produire. (Choix explicite, doc 02 §3.1)
 *   3. Rupture → notoriété        Les clients jugent votre fiabilité sur ce
 *      et disponibilité perçue    qu'ils ont vécu, pas sur une pénurie qu'ils
 *                                 n'ont pas encore subie.
 *   4. Volume → indice d'échelle  Votre position d'échelle est celle que vous
 *                                 avez construite, pas celle que vous êtes sur
 *                                 le point de réaliser.
 *   5. CA par DAS → pondération   L'auditeur pondère les DAS selon leur poids
 *      du SAB                     connu, pas selon un résultat non encore publié.
 *   6. Trésorerie → malus de      Un banquier réagit aux comptes clos.
 *      compétitivité              (Choix explicite, doc 02 §10.2)
 *
 * Aucune de ces valeurs décalées n'est inventée : elles viennent toutes de
 * `PreviousDasState` / `TeamSnapshot`, donc de la base.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  VALUE_AFFINITY,
  computeAlignment,
  diagnoseBusiness,
  marginPremium,
  scoreCorporateAlignment,
  synergyEffect,
  verticalIntegrationIndex,
} from './alignment';
import { scoreGroupAlignment, type GroupAlignmentResult } from './group-alignment';
import { computeIndicators } from './indicators';
import {
  giacSupport, nextClimatSocial, nextSkillIndex, ofpptReimbursement,
  qualityLossFromCuts, safeHeadcountReduction, severancePerHead,
  consolidateClimate, consolidateHeadcount,
  standardisationLevel, trainingFocusEffects, turnoverRate, workloadIndex,
} from './hr';
import { coverageCappedShare, resolveDistribution, resolveProcurement } from './channels';
import {
  buildPnl,
  dasBaseValuation,
  depreciation,
  npcOffer,
  payrollCost,
  resolveTransfer,
  treasuryStatus,
} from './finance';
import { clamp, clamp01, clamp100, makeRng, median, seedFrom } from './math';
import {
  allocateMarketShares,
  ansoffRisk,
  applyShockRedistribution,
  competitivenessScore,
  competitivePressure,
  marketVolume,
  nextMarketSize,
  poolMedianPrice,
  priceCompetitiveness,
  resolveVolume,
  addressableShare,
  segmentPriceSensitivity,
  unitPrice,
} from './market';
import {
  applyAutomation,
  automationLevel,
  breakEvenVolume,
  capacityFromHeadcount,
  experienceCurveUnitCost,
  nextCapacity,
  nextNotoriety,
  nextQuality,
  perceivedQuality,
  utilisationEffects,
} from './operations';
import { organisationalAxes } from './organisation';
import { mitigateShock } from './shocks';
import { param, type EngineParams } from './params';
import type {
  AcquisitionOperation,
  DasSnapshot,
  ResolutionInput,
  ShockEffects,
  TeamDasSnapshot,
} from './snapshot';
import type {
  AlignmentResult,
  BusinessVector,
  GenericStrategy,
  InvariantFailure,
  PnlStatement,
  TreasuryStatus,
} from './types';

// ===========================================================================
// Sorties
// ===========================================================================

export interface DasMetricsOutput {
  teamId: string;
  dasId: string;
  quality: number;
  perceivedQuality: number;
  notoriety: number;
  inputQuality: number;
  pricePosition: number;
  unitPriceMad: number;
  priceCompetitiveness: number;
  competitivePressure: number;
  competitivenessScore: number;
  capacityUnits: number;
  effectiveCapacityUnits: number;
  volumeDemanded: number;
  volumeSold: number;
  volumeLost: number;
  stockoutRate: number;
  utilisationRate: number;
  cumulativeVolume: number;
  unitVariableCostMad: number;
  fixedCostMad: number;
  underabsorptionMad: number;
  automationLevel: number;
  distributionCoverage: number;
  avgDistributorMargin: number;
  channelControl: number;
  marketSizeMad: number;
  rawShare: number;
  marketSharePct: number;
  revenueMad: number;
  grossMarginMad: number;
  ebitdaMad: number;
  iaScore: number;
  sabScore: number;
  bestFitStrategy: GenericStrategy;
  bestFitScore: number;
  breakEvenVolume: number | null;

  // ── Lecture de gestion, par DAS ──────────────────────────────────────────
  //
  // Les mêmes chiffres, dits autrement. Le public n'est pas financier : un
  // écran qui affiche « EBITDA » et « BFR » ne se lit pas, il se subit. Ces
  // champs portent les notions dont une équipe a réellement besoin pour
  // arbitrer, et ils sont calculés ICI plutôt que dans la vue pour qu'un export
  // Excel dise exactement la même chose que l'interface.
  totalCostsMad: number;
  /** Ce qui reste sur 100 DH vendus, en %. */
  profitMarginPct: number;
  /** Ce que rapportent 100 DH immobilisés sur ce DAS, en %. */
  roiPct: number;
  /** Ce que coûtent 100 DH de chiffre d'affaires, en %. */
  costPerRevenuePct: number;
  /** Ce qui reste réellement en caisse, après réinvestissement. */
  cashGeneratedMad: number;
  capitalEmployedMad: number;
  investmentMad: number;

  // ── Océan bleu ───────────────────────────────────────────────────────────
  /** L'unité est-elle hors somme nulle CE TOUR-CI ? */
  blueOceanActive: boolean;
  /** Tours restants À LA CLÔTURE, à persister sur l'unité. */
  blueOceanRoundsLeft: number;
  /** Ticket d'entrée payé ce tour, qu'elle réussisse ou non. */
  blueOceanEntryCostMad: number;
  /** L'entrée a été tentée et a échoué : à dire au débriefing. */
  blueOceanFailed: boolean;
}

export interface TeamOutput {
  teamId: string;
  poolId: string;
  pnl: PnlStatement;
  alignment: AlignmentResult;
  climatSocial: number;
  headcount: number;
  centralisationIndex: number;
  sharedResourcesIndex: number;
  portfolioRelatedness: number;
  verticalIntegration: number;
  talentMix: number;
  synergySavingPct: number;
  coordinationCostPct: number;
  marginPremiumPct: number;
  treasuryStatus: TreasuryStatus;
  consecutiveNegativeTreasuryRounds: number;
  nextRoundCompetitivenessMalus: number;
}

export interface PoolDasSummary {
  poolId: string;
  dasId: string;
  marketSizeMad: number;
  unservedShare: number;
  teamIds: string[];
}

export interface TransferOutput {
  listingId: string;
  dasId: string;
  sellerTeamId: string;
  buyerTeamId: string | null;
  priceMad: number;
  integrationRatio: number;
  valueLossPct: number;
  marketShareTransferred: number;
  shareReleasedToPool: number;
}

/** Une acquisition dénouée : qui entre dans quel domaine, et à quel prix. */
export interface AcquisitionOutput {
  offerId: string;
  buyerTeamId: string;
  targetActorId: string;
  dasId: string;
  pricePaidMad: number;
  integrationRatio: number;
  valueLossPct: number;
  /** Part de marché effectivement récupérée, après perte d'intégration. */
  marketShareAcquired: number;
  /**
   * Ce que l'opération cherchait à faire.
   *
   * Une ENTRÉE crée une unité et lui transfère une position de marché. Une
   * INTÉGRATION ne crée rien : elle change le propriétaire d'un maillon que
   * l'équipe utilisait déjà, et n'a donc ni part de marché ni capacité à
   * transférer. Les confondre ferait apparaître un domaine fantôme au
   * portefeuille de qui rachète son grossiste.
   */
  operation: AcquisitionOperation;
  /**
   * Part du bénéfice d'intégration réellement captée, figée au rachat.
   *
   * Racheter un maillon sans budgéter l'intégration, c'est se retrouver
   * propriétaire d'une entreprise qu'on ne sait pas faire tourner. Ce
   * coefficient ne se rattrape pas au tour suivant par un chèque : c'est ce
   * qui fait du budget d'intégration une décision et non une formalité.
   */
  integrationQuality: number;
  /**
   * Chiffre d'affaires repris, qui devient l'historique du domaine acquis.
   *
   * Il était laissé à ZÉRO en base, alors que le poids réel de la cible était
   * bien chargé côté serveur. Un domaine acheté entrait donc au portefeuille
   * sans passé commercial, et le tour suivant en tirait quatre conséquences
   * fausses : il ne pesait rien dans le SAB pondéré, son rôle de portefeuille
   * devenait injugeable faute de part de chiffre d'affaires, il ne comptait
   * pas dans l'intégration verticale, et un océan bleu s'y déclarait
   * gratuitement — le ticket d'entrée étant proportionnel à un chiffre
   * d'affaires nul.
   */
  revenueAcquired: number;
  capacityAcquired: number;
  notorietyAcquired: number;
  qualityAcquired: number;
}

/** Conformité d'un DAS aux directives du groupe, prête à persister. */
export interface GroupAlignmentOutput extends GroupAlignmentResult {
  teamId: string;
  dasId: string;
}

/** État RH d'un DAS à la clôture, prêt à persister. */
export interface DasHrOutput {
  teamId: string;
  dasId: string;
  headcount: number;
  climatSocial: number;
  productivity: number;
  standardisationLevel: number;
  automationLevel: number;
  turnoverRate: number;
  payrollMad: number;
  workloadIndex: number;
  overstaffingPct: number;
  skillIndex: number;
  severancePaidMad: number;
  subsidiesMad: number;
  safeReduction: number;
  qualityLossPts: number;
}

export interface ResolutionOutput {
  ok: boolean;
  dasMetrics: DasMetricsOutput[];
  dasHr: DasHrOutput[];
  groupAlignment: GroupAlignmentOutput[];
  teams: TeamOutput[];
  poolSummaries: PoolDasSummary[];
  transfers: TransferOutput[];
  acquisitions: AcquisitionOutput[];
  invariantFailures: InvariantFailure[];
}

// ===========================================================================
// Étapes intermédiaires
// ===========================================================================

interface UnitWorkspace {
  teamId: string;
  poolId: string;
  unit: TeamDasSnapshot;
  das: DasSnapshot;
  // Phase A
  inputPriceIndex: number;
  inputQuality: number;
  supplyDisruption: number;
  capacityUnits: number;
  effectiveCapacity: number;
  automation: number;
  unitVariableCostMad: number;
  fixedProductionCostMad: number;
  quality: number;
  notoriety: number;
  perceived: number;
  unitPriceMad: number;
  coverage: number;
  avgDistributorMargin: number;
  channelControl: number;
  distributionServiceLevel: number;
  // Océan bleu, arrêté en phase A : il conditionne la répartition (phase D).
  blueOceanActive: boolean;
  blueOceanRoundsLeft: number;
  blueOceanEntryCostMad: number;
  blueOceanFailed: boolean;
  // Phase C
  vector: BusinessVector;
  // Phase D
  priceCompetitiveness: number;
  pressure: number;
  competitiveness: number;
  rawShare: number;
  marketShare: number;
  // Phase E
  marketSizeMad: number;
  volumeDemanded: number;
  volumeSold: number;
  volumeLost: number;
  stockoutRate: number;
  utilisationRate: number;
  underabsorptionMad: number;
  subcontractingCostMad: number;
  revenueMad: number;
  cogsMad: number;
}

/**
 * Cumul des cartes actives sur un DAS, atténué par les réponses d'une équipe.
 *
 * ── L'ATTÉNUATION S'APPLIQUE CARTE PAR CARTE, AVANT LE CUMUL ───────────────
 * Une équipe répond à UNE carte, pas au climat général du tour. L'appliquer
 * après le cumul mélangerait la sécheresse qu'elle a couverte et le
 * resserrement monétaire qu'elle a subi de plein fouet.
 *
 * `mitigation` absente — ou vide — laisse le cumul intact : c'est le cas du
 * marché lui-même, qui est PARTAGÉ par tout le pool et ne peut pas rétrécir
 * différemment selon l'équipe qui le regarde.
 */
function shocksFor(
  dasId: string,
  shocks: ShockEffects[],
  mitigation?: Map<string, number>,
): ShockEffects {
  const relevant = shocks
    .filter((s) => s.dasId === dasId)
    .map((s) => {
      const effectiveness = mitigation?.get(s.shockId) ?? 0;
      return effectiveness > 0 ? mitigateShock(s, effectiveness) : s;
    });

  /**
   * Les pourcentages s'ADDITIONNENT plutôt que de se composer : deux cartes à
   * +20 % donnent +40 %, pas +44 %. Choix de lisibilité — au débriefing, le
   * facilitateur doit pouvoir refaire le calcul de tête.
   */
  const sum = (key: keyof ShockEffects): number =>
    relevant.reduce((acc, s) => acc + (Number(s[key]) || 0), 0);

  return {
    // Le cumul n'est plus UNE carte : il n'a pas d'identité propre, et la
    // laisser vide vaut mieux que d'usurper celle de la première.
    shockId: '',
    dasId,
    marketSizePct: relevant.reduce((acc, s) => acc + s.marketSizePct, 0),
    inputCostPct: relevant.reduce((acc, s) => acc + s.inputCostPct, 0),
    capacityPct: relevant.reduce((acc, s) => acc + s.capacityPct, 0),
    qualityFloor: relevant.reduce<number | null>(
      (acc, s) => (s.qualityFloor === null ? acc : Math.max(acc ?? 0, s.qualityFloor)),
      null,
    ),
    rateDelta: sum('rateDelta'),
    supplierPowerPct: sum('supplierPowerPct'),
    distributorPowerPct: sum('distributorPowerPct'),
    payrollPct: sum('payrollPct'),
    severancePct: sum('severancePct'),
    capexCostPct: sum('capexCostPct'),
    workingCapitalDaysDelta: sum('workingCapitalDaysDelta'),
    priceElasticityDelta: sum('priceElasticityDelta'),
    notorietyPct: sum('notorietyPct'),
    trainingSubsidyPct: sum('trainingSubsidyPct'),
    subsidyPctOfRevenue: sum('subsidyPctOfRevenue'),
    shareRedistributionPts: sum('shareRedistributionPts'),
    beneficiaryTeamIds: relevant.flatMap((s) => s.beneficiaryTeamIds),
  };
}

// ===========================================================================
// Orchestration
// ===========================================================================

export function resolveRound(
  input: ResolutionInput,
  params: EngineParams,
): ResolutionOutput {
  const dasById = new Map(input.das.map((d) => [d.dasId, d]));
  const activeTeams = input.teams.filter((t) => !t.isLiquidated);

  // ─────────────────────────────────────────────────────────────────────────
  // ÉTAPE 1 — Chocs PESTEL : taille de marché et contraintes du tour
  // ─────────────────────────────────────────────────────────────────────────
  const marketSizeByDas = new Map<string, number>();
  for (const das of input.das) {
    const shock = shocksFor(das.dasId, input.shocks);
    marketSizeByDas.set(
      das.dasId,
      nextMarketSize(das.previousMarketSizeMad, das.growthRate, shock.marketSizePct),
    );
  }

  // Ce que chaque équipe a répondu, carte par carte.
  //
  // La table sert PARTOUT où un choc frappe une équipe en particulier : coûts,
  // capacité, seuil de qualité, RH, trésorerie. Elle ne sert PAS à la taille
  // du marché, calculée plus haut : le marché est partagé par tout le pool, et
  // ne peut pas rétrécir différemment selon l'équipe qui le regarde.
  const mitigationByTeam = new Map<string, Map<string, number>>(
    activeTeams.map((t) => [
      t.teamId,
      new Map(t.shockResponses.map((r) => [r.shockId, r.effectiveness])),
    ]),
  );
  const teamShock = (teamId: string, dasId: string): ShockEffects =>
    shocksFor(dasId, input.shocks, mitigationByTeam.get(teamId));

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE A — Par équipe et par DAS : amont, capacité, coûts, qualité, canal
  // ─────────────────────────────────────────────────────────────────────────
  const workspaces: UnitWorkspace[] = [];

  for (const team of activeTeams) {
    for (const unit of team.units) {
      const das = dasById.get(unit.dasId);
      if (!das) continue;
      const shock = teamShock(team.teamId, das.dasId);

      // Étape 2 — Approvisionnement.
      // La graine inclut l'équipe, le DAS et le tour : deux équipes ne subissent
      // pas la même rupture, et rejouer le tour redonne le même résultat.
      const rng = makeRng(seedFrom(input.sessionId, input.roundNumber, team.teamId, unit.dasId));

      // ── Océan bleu : la déclaration devient un état ────────────────────
      //
      // La case « déclarer un océan bleu » était écrite en base et lue par
      // PERSONNE. Rien ne la transformait en état d'unité, si bien que le
      // code de répartition qui l'attend — hors somme nulle — n'a jamais été
      // atteint, et que ni le ticket d'entrée, ni le risque d'échec, ni la
      // marge multipliée n'existaient. L'écran promettait les trois.
      //
      // Une fenêtre déjà ouverte court jusqu'à son terme ; on n'en ouvre une
      // nouvelle que si l'équipe le redemande ET que la tentative réussit.
      const inWindow = unit.blueOcean && unit.blueOceanRoundsLeft > 0;
      const attempts = unit.decision.declareBlueOcean && !inWindow;

      // Le tirage précède l'usage de `rng` par l'approvisionnement : le
      // consommer ici de façon inconditionnelle garderait la suite du flux
      // identique d'un cas à l'autre, ce qui rend les tests comparables.
      const entryRoll = rng();
      const entrySucceeds =
        attempts && entryRoll >= param(params, 'blue_ocean.failure_probability');

      const blueOceanActive = inWindow || entrySucceeds;
      const blueOceanRoundsLeft = entrySucceeds
        ? param(params, 'blue_ocean.rounds')
        : Math.max(unit.blueOceanRoundsLeft - 1, 0);

      // Le ticket se paie que l'entrée réussisse ou non : c'est une
      // exploration, pas un achat. Il est proportionnel au chiffre d'affaires
      // du domaine — sortir un métier de son marché coûte à proportion de ce
      // métier.
      const blueOceanEntryCostMad = attempts
        ? unit.previous.revenueMad * param(params, 'blue_ocean.entry_cost_pct')
        : 0;
      // Un choc sur le pouvoir des fournisseurs passe par le MÊME point
      // d'ancrage que la molette de difficulté « écosystème » : ce sont deux
      // sources d'un seul effet, et les faire converger évite qu'elles se
      // contredisent. Au-dessus de 1, l'amont négocie plus durement.
      const supplierParams: EngineParams = {
        ...params,
        'ecosystem.power_multiplier':
          param(params, 'ecosystem.power_multiplier') * (1 + shock.supplierPowerPct),
      };

      const procurement = resolveProcurement(
        unit.procurement,
        unit.supplierAlternatives,
        rng,
        supplierParams,
      );

      // Étape 3 — Capacité. Le CAPEX du tour précédent entre en service ici.
      const rawCapacity = das.parameters.capacityFromHeadcount
        ? capacityFromHeadcount(
            team.hr.headcountStart,
            das.parameters.headcountProductivity ?? 1,
          )
        : nextCapacity(
            unit.previous.capacityUnits,
            unit.commissionedCapexMad,
            // Un choc sur le coût de l'investissement renchérit l'unité de
            // capacité : le même CAPEX achète moins d'outil.
            das.parameters.unitCapacityCostMad * (1 + shock.capexCostPct),
            params,
          );

      const capacityUnits = Math.max(rawCapacity * (1 + shock.capacityPct), 0);
      const effectiveCapacity = capacityUnits * (1 - clamp01(procurement.disruption));

      // Étape 4 — Coût unitaire : apprentissage, puis automatisation.
      const automation = automationLevel(
        unit.previous.cumulativeAutomationCapexMad + unit.decision.capexAutomationMad,
        capacityUnits,
        das.parameters.unitCapacityCostMad,
      );

      const baseUnitCost = experienceCurveUnitCost(
        das.parameters.referenceUnitCostMad,
        unit.previous.cumulativeVolume,
        das.parameters.referenceCumulativeVolumeUnits,
        das.parameters.learningRate,
        params,
      );

      const costs = applyAutomation(
        baseUnitCost,
        das.parameters.fixedCostBaseMad,
        automation,
        procurement.priceIndex * (1 + shock.inputCostPct),
        params,
      );

      // Étape 5 — Qualité et notoriété.
      // Le taux de rupture utilisé est celui du tour PRÉCÉDENT (décalage 3).
      //
      // L'assiette de mesure de l'effort est le CA du tour précédent : R&D et
      // marketing se jugent en intensité, pas en montant absolu. Au premier
      // tour, on retombe sur la capacité valorisée, faute d'historique.
      const effortBaseMad =
        unit.previous.revenueMad > 0
          ? unit.previous.revenueMad
          : Math.max(capacityUnits * das.parameters.referenceUnitPriceMad, 1);

      const quality = nextQuality(
        unit.previous.quality,
        unit.previousRdBudgetMad,
        effortBaseMad,
        unit.technologyPartnerBonus,
        params,
      );
      const notoriety = nextNotoriety(
        unit.previous.notoriety,
        unit.decision.marketingBudgetMad,
        effortBaseMad,
        unit.previous.stockoutRate,
        params,
      );

      // Étape 8 (anticipée) — Distribution : la couverture est nécessaire au
      // plafonnement des parts, et le contrôle du canal à l'alignement.
      const distributorParams: EngineParams = {
        ...params,
        'ecosystem.power_multiplier':
          param(params, 'ecosystem.power_multiplier') * (1 + shock.distributorPowerPct),
      };

      const distribution = resolveDistribution(
        unit.distribution,
        notoriety,
        unit.previous.cumulativeNetworkCapexMad + unit.decision.capexOwnNetworkMad,
        Math.max(unit.previous.volumeSold, capacityUnits),
        distributorParams,
      );

      // La notoriété est modulée AVANT d'entrer dans la compétitivité : une
      // campagne sectorielle ou un scandale de branche jouent sur la marque,
      // pas sur le produit.
      const shockedNotoriety = clamp100(notoriety * (1 + shock.notorietyPct));

      const perceived = perceivedQuality(
        quality,
        procurement.inputQuality,
        unit.previous.stockoutRate,
        distribution.serviceLevel,
        params,
      );

      workspaces.push({
        teamId: team.teamId,
        poolId: team.poolId,
        unit,
        das,
        inputPriceIndex: procurement.priceIndex,
        inputQuality: procurement.inputQuality,
        supplyDisruption: procurement.disruption,
        capacityUnits,
        effectiveCapacity,
        automation,
        unitVariableCostMad: costs.unitVariableCostMad,
        fixedProductionCostMad: costs.fixedProductionCostMad,
        quality,
        notoriety: shockedNotoriety,
        perceived,
        unitPriceMad: unitPrice(
          das.parameters.referenceUnitPriceMad,
          unit.decision.pricePosition,
          params,
        ),
        coverage: distribution.coverage,
        avgDistributorMargin: distribution.avgMarginPct,
        channelControl: distribution.channelControl,
        distributionServiceLevel: distribution.serviceLevel,
        blueOceanActive,
        blueOceanRoundsLeft,
        blueOceanEntryCostMad,
        blueOceanFailed: attempts && !entrySucceeds,
        vector: {} as BusinessVector,
        priceCompetitiveness: 0,
        pressure: 0,
        competitiveness: 0,
        rawShare: 0,
        marketShare: 0,
        marketSizeMad: marketSizeByDas.get(das.dasId) ?? 0,
        volumeDemanded: 0,
        volumeSold: 0,
        volumeLost: 0,
        stockoutRate: 0,
        utilisationRate: 0,
        underabsorptionMad: 0,
        subcontractingCostMad: 0,
        revenueMad: 0,
        cogsMad: 0,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE B — Médianes de marché (pool × DAS)
  //
  // L'efficience et l'échelle n'ont de sens que par comparaison avec les
  // concurrents du même marché : on ne peut pas les évaluer avant d'avoir
  // calculé les coûts de tout le monde.
  // ─────────────────────────────────────────────────────────────────────────
  const groupKey = (poolId: string, dasId: string) => `${poolId}::${dasId}`;
  const groups = new Map<string, UnitWorkspace[]>();
  for (const w of workspaces) {
    const key = groupKey(w.poolId, w.unit.dasId);
    const list = groups.get(key);
    if (list) list.push(w);
    else groups.set(key, [w]);
  }

  const medians = new Map<string, { unitCost: number; volume: number; price: number }>();
  for (const [key, list] of groups) {
    medians.set(key, {
      unitCost: median(list.map((w) => w.unitVariableCostMad)),
      volume: median(list.map((w) => Math.max(w.unit.previous.volumeSold, 1))),
      price: poolMedianPrice(list.map((w) => w.unitPriceMad)),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE C — Alignement stratégique (doc 01)
  // ─────────────────────────────────────────────────────────────────────────
  const smig = param(params, 'social.smig_monthly_mad');
  const trainingReference = param(params, 'skill.training_reference_per_head_mad');

  const alignmentByTeam = new Map<string, AlignmentResult>();
  // Un enregistrement par couple (équipe, DAS) : le SAG est par DAS, alors que
  // l'IA est par équipe. Les mélanger reproduirait la confusion d'étages que
  // les directives ont précisément pour objet de lever.
  const groupAlignmentByTeam: GroupAlignmentOutput[] = [];
  const corporateByTeam = new Map<
    string,
    ReturnType<typeof scoreCorporateAlignment> & {
      centralisation: number;
      shared: number;
      relatedness: number;
      talentMix: number;
      verticalIntegration: number;
    }
  >();

  for (const team of activeTeams) {
    const teamUnits = workspaces.filter((w) => w.teamId === team.teamId);

    const hires =
      team.hr.hireOperateurs + team.hr.hireTechniciens + team.hr.hireExperts + team.hr.hireCadres;
    const headcount = Math.max(team.hr.headcountStart + hires - team.hr.restructuringCount, 0);
    const expertHeadcount =
      (team.hr.previousExpertShare / 100) * team.hr.headcountStart +
      team.hr.hireExperts +
      team.hr.hireCadres;
    const talentMix = headcount > 0 ? clamp100((expertHeadcount / headcount) * 100) : 0;

    const salaryTerm = clamp((team.hr.avgSalaryBrutMad / smig - 1) / 2, 0, 1);
    const trainingTerm =
      headcount > 0 ? clamp(team.hr.trainingBudgetMad / headcount / trainingReference, 0, 1) : 0;
    const skillIntensity = clamp100(
      100 * (0.4 * salaryTerm + 0.3 * trainingTerm + 0.3 * (talentMix / 100)),
    );

    // Vecteur observé, DAS par DAS.
    for (const w of teamUnits) {
      const declaredStrategy = w.unit.decision.genericStrategy;
      const key = groupKey(w.poolId, w.unit.dasId);
      const med = medians.get(key)!;

      const costRatio = med.unitCost > 0 ? w.unitVariableCostMad / med.unitCost : 1;
      const volumeRatio =
        med.volume > 0 ? Math.max(w.unit.previous.volumeSold, 0) / med.volume : 1;

      // Dénominateur d'intensité : le CA du tour précédent. Au premier tour il
      // est nul, on retombe alors sur une assiette de capacité valorisée —
      // sans quoi toute intensité serait infinie.
      const revenueBase =
        w.unit.previous.revenueMad > 0
          ? w.unit.previous.revenueMad
          : Math.max(w.capacityUnits * w.unitPriceMad, 1);

      w.vector = {
        price_position: w.unit.decision.pricePosition,
        rd_intensity: clamp100((w.unit.decision.rdBudgetMad / revenueBase / 0.12) * 100),
        mkt_intensity: clamp100((w.unit.decision.marketingBudgetMad / revenueBase / 0.12) * 100),
        quality: w.quality,
        cost_efficiency: clamp100(100 * (1.5 - costRatio)),
        scale_index: clamp100(50 * volumeRatio),
        automation_level: w.automation,
        skill_intensity: skillIntensity,
        segment_breadth: clamp100(((w.unit.decision.servedSegments.length - 1) / 4) * 100),
        channel_control: w.channelControl,

        // --- Axes d'organisation -------------------------------------------
        // Sans conception organisationnelle, l'équipe n'a pas fait l'exercice :
        // on note zéro sur les axes de cohérence plutôt que d'inventer un
        // alignement sur une décision non prise. La délégation et la
        // profondeur, elles, retombent sur une valeur neutre — ne rien décider
        // revient à hériter d'une organisation moyenne, pas absurde.
        ...organisationalAxes(w.unit.organisation, declaredStrategy, input.directionAffinity),
      };
    }

    const perDas = Object.fromEntries(
      teamUnits.map((w) => [
        w.unit.dasId,
        diagnoseBusiness(w.vector, w.unit.decision.genericStrategy, params),
      ]),
    );

    // Pondération du SAB par le CA du tour précédent (décalage 5).
    const revenueByDas = Object.fromEntries(
      teamUnits.map((w) => [w.unit.dasId, Math.max(w.unit.previous.revenueMad, 0)]),
    );

    const dominantUnit = teamUnits.reduce<typeof teamUnits[number] | null>(
      (best, w) =>
        best === null || w.unit.previous.revenueMad > best.unit.previous.revenueMad ? w : best,
      null,
    );

    // L'intégration verticale se MESURE sur les décisions du tour : réseau
    // propre en aval, approvisionnement sous contrat en amont. Elle était
    // auparavant une constante héritée, ce qui rendait la stratégie
    // d'intégration verticale impossible à satisfaire.
    const verticalIntegration = verticalIntegrationIndex(
      teamUnits.map((w) => ({
        weight: Math.max(w.unit.previous.revenueMad, 0),
        channelControl: w.channelControl,
        committedVolume: w.unit.procurement.reduce(
          (acc, l) => acc + (l.supplier.ownedByTeam ? 0 : l.committedVolume), 0),
        ownedVolume: w.unit.procurement.reduce(
          (acc, l) => acc + (l.supplier.ownedByTeam ? l.committedVolume : 0), 0),
        expectedVolume: Math.max(w.unit.previous.volumeSold, w.capacityUnits),
      })),
      params,
    );

    const corporateInput = {
      corporateStrategy: team.corporate.corporateStrategy,
      structureType: team.corporate.structureType,
      centralPurchasing: team.corporate.centralPurchasing,
      centralIt: team.corporate.centralIt,
      centralRd: team.corporate.centralRd,
      centralHr: team.corporate.centralHr,
      centralFinance: team.corporate.centralFinance,
      sharedProduction: team.corporate.sharedProduction,
      sharedRd: team.corporate.sharedRd,
      values: team.corporate.values,
      activeSectors: teamUnits.map((w) => w.das.sectorKey),
      sharedSupplierRatio: team.corporate.sharedSupplierRatio,
      sharedDistributorRatio: team.corporate.sharedDistributorRatio,
      verticalIntegration,
      talentMix,
      dominantStrategy: dominantUnit?.unit.decision.genericStrategy ?? 'domination_couts',
    };

    const corporate = scoreCorporateAlignment(corporateInput, input.proximity, params);

    // ─────────────────────────────────────────────────────────────────────
    // SAG — conformité de chaque DAS aux directives du groupe
    //
    // Les parts d'investissement et de chiffre d'affaires ne peuvent se
    // calculer qu'ICI : elles sont RELATIVES au portefeuille, et un DAS ne
    // sait pas seul quelle fraction de l'enveloppe il capte. C'est ce qui
    // rend le rôle mesurable — « moteur » n'a de sens que par comparaison.
    //
    // L'investissement retenu est le CAPEX + R&D + marketing du tour : les
    // trois postes par lesquels un groupe finance effectivement une unité.
    // Retenir le seul CAPEX aurait rendu un DAS de services structurellement
    // sous-doté, quel que soit le soin qu'on y met.
    const investmentByDas = new Map(
      teamUnits.map((w) => [
        w.unit.dasId,
        Math.max(
          w.unit.decision.capexCapacityMad +
            w.unit.decision.capexAutomationMad +
            w.unit.decision.capexOwnNetworkMad +
            w.unit.decision.rdBudgetMad +
            w.unit.decision.marketingBudgetMad,
          0,
        ),
      ]),
    );
    const totalInvestment = [...investmentByDas.values()].reduce((a, b) => a + b, 0);
    const totalRevenueForSag = Object.values(revenueByDas).reduce((a, b) => a + b, 0);

    const groupDirectives = {
      central: {
        purchasing: team.corporate.centralPurchasing,
        it: team.corporate.centralIt,
        rd: team.corporate.centralRd,
        hr: team.corporate.centralHr,
        finance: team.corporate.centralFinance,
      },
      values: team.corporate.values,
    };

    const sagByDas: Record<string, number> = {};
    for (const w of teamUnits) {
      const stance = w.unit.groupStance;
      if (!stance) continue;

      const result = scoreGroupAlignment(
        groupDirectives,
        {
          portfolioRole: stance.portfolioRole,
          hq: {
            purchasing: stance.hqPurchasing,
            it: stance.hqIt,
            rd: stance.hqRd,
            hr: stance.hqHr,
            finance: stance.hqFinance,
          },
          declaredStrategy: w.unit.decision.genericStrategy,
          axes: w.unit.organisation?.strategicAxes ?? [],
          investmentShare:
            totalInvestment > 0
              ? (investmentByDas.get(w.unit.dasId) ?? 0) / totalInvestment
              : 0,
          revenueShare:
            totalRevenueForSag > 0
              ? (revenueByDas[w.unit.dasId] ?? 0) / totalRevenueForSag
              : 0,
          offers: stance.sharedResources.map((r) => ({
            resourceKey: r.resourceKey,
            proximity: r.proximity,
            adoptionLevel: r.adoptionLevel,
          })),
        },
        VALUE_AFFINITY,
      );

      sagByDas[w.unit.dasId] = result.sag;
      groupAlignmentByTeam.push({
        teamId: team.teamId,
        dasId: w.unit.dasId,
        ...result,
      });
    }

    // Changements de stratégie déclarée ce tour, et ceux qui résolvent une
    // dérive diagnostiquée au tour précédent — ceux-là sont gratuits.
    let changes = 0;
    let driftResolving = 0;
    for (const w of teamUnits) {
      const previous = w.unit.previous.declaredStrategy;
      if (previous !== null && previous !== w.unit.decision.genericStrategy) {
        changes += 1;
        if (w.unit.previous.hadStrategicDrift) driftResolving += 1;
      }
    }
    if (
      team.previousCorporateStrategy !== null &&
      team.previousCorporateStrategy !== team.corporate.corporateStrategy
    ) {
      changes += 1;
    }

    const alignment = computeAlignment(
      {
        perDas,
        revenueByDas,
        corporate,
        sagByDas: Object.keys(sagByDas).length > 0 ? sagByDas : undefined,
        strategyChangesThisRound: changes,
        consecutiveImprovingRounds: team.consecutiveImprovingRounds,
        driftResolvingChanges: driftResolving,
      },
      params,
    );

    alignmentByTeam.set(team.teamId, alignment);

    const centralisation =
      (([
        team.corporate.centralPurchasing,
        team.corporate.centralIt,
        team.corporate.centralRd,
        team.corporate.centralHr,
        team.corporate.centralFinance,
      ].filter(Boolean).length /
        5) *
        100);

    const relatednessDetail = corporate.details.find((d) => d.axis === 'portfolio_relatedness');
    const sharedDetail = corporate.details.find((d) => d.axis === 'shared_resources_index');

    corporateByTeam.set(team.teamId, {
      ...corporate,
      centralisation,
      shared: sharedDetail?.observed ?? 0,
      relatedness: relatednessDetail?.observed ?? 100,
      talentMix,
      verticalIntegration,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE D — Compétitivité et répartition à somme nulle
  // ─────────────────────────────────────────────────────────────────────────
  const poolSummaries: PoolDasSummary[] = [];
  const teamById = new Map(activeTeams.map((t) => [t.teamId, t]));

  for (const [key, list] of groups) {
    const [poolId, dasId] = key.split('::');
    const med = medians.get(key)!;
    const shock = shocksFor(dasId, input.shocks);
    const das = dasById.get(dasId)!;

    for (const w of list) {
      const team = teamById.get(w.teamId)!;
      const ia = alignmentByTeam.get(w.teamId)?.iaFinal ?? param(params, 'alignment.initial_ia');

      // Un choc peut rendre les clients plus — ou moins — sensibles au prix.
      // La bascule vers la marque propre en est l'exemple : le marché ne
      // rétrécit pas, il arbitre différemment, et la prime à la marque s'érode.
      // Le plancher évite qu'une élasticité négative n'inverse la logique.
      // La sensibilité au prix des segments SERVIS module l'élasticité de
      // branche : servir la restauration collective, qui n'achète que le prix,
      // ou le premium bio, qui ne le regarde pas, ne peut pas produire la même
      // réaction au même geste de prix.
      const servedForPrice = das.segments.filter((seg) =>
        w.unit.decision.servedSegments.includes(seg.segmentKey),
      );
      const elasticity = Math.max(
        (das.parameters.priceElasticity +
          teamShock(w.teamId, w.unit.dasId).priceElasticityDelta) *
          segmentPriceSensitivity(servedForPrice, das.segments),
        0.1,
      );

      w.priceCompetitiveness = priceCompetitiveness(
        w.unitPriceMad,
        med.price,
        elasticity,
      );
      w.pressure = competitivePressure(list.length, das.parameters.vrioEntryBarrier);

      // Malus de trésorerie hérité du tour précédent (décalage 6).
      const treasuryMalus =
        team.previousTreasuryStatus === 'surveillance'
          ? param(params, 'treasury.surveillance_malus')
          : team.previousTreasuryStatus === 'restructuration' ||
              team.previousTreasuryStatus === 'liquidation'
            ? param(params, 'treasury.restructuring_malus')
            : 0;

      w.competitiveness = competitivenessScore(
        {
          perceivedQuality: w.perceived,
          notoriety: w.notoriety,
          priceCompetitiveness: w.priceCompetitiveness,
          iaScore: ia,
          competitivePressure: w.pressure,
          // Dérivé du mouvement DÉCLARÉ, et non d'une colonne d'état que
          // seule la persistance des acquisitions alimentait.
          ansoffRiskCoefficient: ansoffRisk(w.unit.ansoffMovement, params),
          roundsSinceLaunch: input.roundNumber - w.unit.launchedRound,
          treasuryMalus,
        },
        params,
      );

      // ── Seuil de qualité réglementaire ──────────────────────────────────
      //
      // Une norme obligatoire ne réduit pas la demande : elle FERME l'accès au
      // marché à ceux qui ne l'atteignent pas. On n'annule pas la
      // compétitivité — une équipe à zéro sortirait de la répartition sans
      // avoir été liquidée, et le pool ne sommerait plus à 100 %. On l'effondre
      // progressivement en dessous du seuil, ce qui laisse un tour pour réagir.
      const floor = teamShock(w.teamId, w.unit.dasId).qualityFloor;
      if (floor !== null && w.perceived < floor) {
        const shortfall = (floor - w.perceived) / Math.max(floor, 1);
        w.competitiveness *= Math.max(1 - shortfall * 1.8, 0.05);
      }
    }

    const allocation = allocateMarketShares(
      list.map((w) => ({
        teamId: w.teamId,
        competitiveness: w.competitiveness,
        coverageCap: coverageCappedShare(1, w.coverage, params),
        blueOcean: w.blueOceanActive,
      })),
      param(params, 'market.competitiveness_exponent'),
    );

    let shares = allocation.shares;
    if (shock.shareRedistributionPts > 0 && shock.beneficiaryTeamIds.length > 0) {
      shares = applyShockRedistribution(
        shares,
        shock.beneficiaryTeamIds.filter((id) => id in shares),
        shock.shareRedistributionPts,
      );
    }

    for (const w of list) {
      w.rawShare = allocation.shares[w.teamId] ?? 0;
      w.marketShare = shares[w.teamId] ?? 0;

      // Océan bleu : hors du pool, l'équipe se taille une part sur un marché
      // vierge plutôt que d'en disputer une.
      if (w.blueOceanActive) {
        w.marketShare = clamp01(w.competitiveness);
        w.rawShare = w.marketShare;
      }
    }

    poolSummaries.push({
      poolId,
      dasId,
      marketSizeMad: marketSizeByDas.get(dasId) ?? 0,
      unservedShare: allocation.unservedShare,
      teamIds: list.map((w) => w.teamId),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE E — Volumes, chiffre d'affaires, coût des ventes
  // ─────────────────────────────────────────────────────────────────────────
  for (const w of workspaces) {
    const volumeOfMarket = marketVolume(w.marketSizeMad, w.das.parameters.referenceUnitPriceMad);

    // Les segments servis déterminent la part du DAS réellement adressée, et
    // leur exigence de qualité la rabote encore : on ne vend ni sur un segment
    // qu'on ne sert pas, ni du haut de gamme avec un produit moyen.
    const servedSegments = w.das.segments.filter((s) =>
      w.unit.decision.servedSegments.includes(s.segmentKey),
    );
    const segmentFactor = addressableShare(w.perceived, servedSegments, params);

    const volume = resolveVolume(
      volumeOfMarket,
      w.marketShare * segmentFactor,
      w.effectiveCapacity,
      w.unitPriceMad,
    );

    w.volumeDemanded = volume.volumeDemanded;
    w.volumeSold = volume.volumeSold;
    w.volumeLost = volume.volumeLost;
    w.stockoutRate = volume.stockoutRate;
    w.revenueMad = volume.revenueMad;

    const utilisation = utilisationEffects(
      w.volumeSold,
      w.capacityUnits,
      w.fixedProductionCostMad,
      w.unitVariableCostMad,
      params,
    );
    w.utilisationRate = utilisation.utilisationRate;
    w.underabsorptionMad = utilisation.underabsorptionMad;
    w.subcontractingCostMad = utilisation.subcontractingCostMad;
    w.cogsMad = w.volumeSold * w.unitVariableCostMad + utilisation.subcontractingCostMad;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE E bis — Ressources humaines, DAS par DAS
  //
  // ── POURQUOI CE BLOC A ÉTÉ REMONTÉ ICI ───────────────────────────────────
  // Il vivait APRÈS le compte de résultat, ce qui en faisait une écriture
  // d'état sans conséquence financière. Deux décisions coûteuses étaient donc
  // gratuites :
  //
  //   • LES INDEMNITÉS DE LICENCIEMENT. Elles étaient calculées ici au barème
  //     de l'article 53, affichées à l'équipe avant qu'elle ne tranche, puis
  //     jamais débitées : le compte de résultat lisait `hr_metrics`, dont la
  //     colonne n'était alimentée par personne et valait 0. Licencier libérait
  //     la masse salariale sans jamais coûter le cash annoncé — soit
  //     l'inverse exact de ce que l'écran enseigne.
  //   • LES SUBVENTIONS OFPPT ET GIAC. Calculées, persistées, jamais créditées.
  //
  // Le bloc ne dépend que de la demande (phase E) et de la capacité (phase A) :
  // rien n'empêchait de le placer avant le résultat, où ses montants comptent.
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * État RH d'un DAS à la clôture de l'exercice.
   *
   * L'enchaînement suit la chaîne du module `hr.ts` : la demande crée une
   * charge, l'effectif et les gains de standardisation l'absorbent, le reste
   * pèse sur le climat, qui pèse sur la rotation et la compétence — donc sur la
   * productivité du tour SUIVANT. La boucle est lente, et c'est ce qui la rend
   * enseignable.
   */
  /**
   * Le MARCHÉ INTERNE est à somme nulle : qui arrive quelque part est parti
   * d'ailleurs.
   *
   * ── LE DÉFAUT CORRIGÉ ────────────────────────────────────────────────────
   * `internalTransfersIn` n'avait aucune contrepartie sortante. Un domaine
   * gagnait des gens, aucun autre n'en perdait, et la consolidation d'équipe
   * excluait délibérément ces transferts de la masse salariale — puisqu'il
   * s'agit de personnes DÉJÀ payées. Résultat : de l'effectif gratuit, qui
   * allégeait la charge de travail et remontait le climat sans coûter un
   * dirham, sur autant de domaines qu'on voulait.
   *
   * Les départs sont donc prélevés sur les AUTRES domaines de l'équipe, au
   * prorata de leur effectif. Débaucher un expert pour le numérique le retire
   * bel et bien de l'agro-industrie, et l'arbitrage redevient un arbitrage.
   */
  const transfersOutByUnit = new Map<string, number>();
  for (const team of activeTeams) {
    const units = workspaces.filter((w) => w.teamId === team.teamId);
    const totalIn = units.reduce((acc, w) => acc + (w.unit.hr?.internalTransfersIn ?? 0), 0);
    if (totalIn <= 0) continue;

    for (const w of units) {
      // Un domaine ne se prélève pas sur lui-même : l'assiette exclut ce qu'il
      // reçoit, sans quoi une mutation interne se compenserait elle-même.
      const receives = w.unit.hr?.internalTransfersIn ?? 0;
      const others = units.filter((o) => o !== w);
      const pool = others.reduce((acc, o) => acc + Math.max(o.unit.previousHr.headcount, 0), 0);
      if (pool <= 0) continue;

      for (const source of others) {
        const share = Math.max(source.unit.previousHr.headcount, 0) / pool;
        const key = `${source.teamId}::${source.unit.dasId}`;
        transfersOutByUnit.set(key, (transfersOutByUnit.get(key) ?? 0) + receives * share);
      }
    }
  }

  const dasHrStates: DasHrOutput[] = workspaces.map((w) => {
    const prev = w.unit.previousHr;
    const d = w.unit.hr;
    const shock = teamShock(w.teamId, w.unit.dasId);

    const hires = d
      ? d.hireOperateurs + d.hireTechniciens + d.hireExperts + d.hireCadres +
        d.internalTransfersIn
      : 0;
    const layoffs = d?.layoffs ?? 0;
    // Ce que les autres domaines de l'équipe sont venus chercher ici.
    const transfersOut = transfersOutByUnit.get(`${w.teamId}::${w.unit.dasId}`) ?? 0;
    const headcount = Math.max(prev.headcount + hires - layoffs - transfersOut, 1);

    const salary = d?.avgSalaryBrutMad ?? prev.avgSalaryBrutMad;
    const payrollMad =
      payrollCost(headcount, salary, params) * (1 + shock.payrollPct);

    // Ce que le DAS a mutualisé PUIS standardisé. C'est le seul chemin par
    // lequel un effectif peut être réduit sans perte de qualité.
    const standardisation = clamp100(
      standardisationLevel(w.unit.groupStance?.sharedResources ?? []) *
        trainingFocusEffects(w.unit.hr?.trainingFocus).standardisation,
    );

    // La productivité de référence est celle DE CE DAS, dérivée de son propre
    // rapport capacité/effectif — et non une constante globale. Une conserverie
    // et une société de services n'ont pas la même, et une valeur unique
    // saturait la charge à 200 sur les métiers capitalistiques : l'indicateur
    // affichait « surcharge maximale » quoi que l'équipe décide, donc
    // n'informait plus rien.
    const dasProductivity =
      prev.headcount > 0 && w.capacityUnits > 0
        ? w.capacityUnits / prev.headcount
        : param(params, 'hr.base_productivity');

    const load = workloadIndex({
      demandUnits: w.volumeDemanded,
      headcount,
      baseProductivity: dasProductivity,
      standardisationLevel: standardisation,
      automationLevel: w.automation,
      skillIndex: prev.skillIndex,
    });

    const trainingBudget = d?.trainingBudgetMad ?? 0;
    const trainingIntensity = payrollMad > 0 ? trainingBudget / payrollMad : 0;
    // Ce que l'orientation choisie fait du même budget. Les quatre options
    // avaient jusqu'ici rigoureusement le même effet : aucun.
    const focus = trainingFocusEffects(d?.trainingFocus);

    const climat = nextClimatSocial({
      previousClimat: prev.climatSocial,
      workloadIndex: load,
      hiringRatio: prev.headcount > 0 ? hires / prev.headcount : 0,
      layoffRatio: prev.headcount > 0 ? layoffs / prev.headcount : 0,
      trainingIntensity,
      trainingFocusClimat: focus.climat,
      salaryRatio: prev.avgSalaryBrutMad > 0 ? salary / prev.avgSalaryBrutMad : 1,
      // Le saut d'automatisation du tour : c'est lui qui inquiète, pas le
      // niveau absolu. Une usine automatisée depuis dix ans ne provoque plus
      // d'angoisse ; celle qui s'automatise brusquement, si.
      automationDelta: Math.max(
        w.automation -
          automationLevel(
            w.unit.previous.cumulativeAutomationCapexMad,
            w.capacityUnits,
            w.das.parameters.unitCapacityCostMad,
          ),
        0,
      ),
      restructuring: d?.restructuring ?? 'aucune',
    }, params);

    const turnover = turnoverRate(climat, prev.skillIndex, params);

    const skill = nextSkillIndex({
      previousSkill: prev.skillIndex,
      trainingIntensity,
      focusMultiplier: focus.skill,
      skillsAuditOrdered: d?.orderSkillsAudit ?? false,
      hiringRatio: prev.headcount > 0 ? hires / prev.headcount : 0,
      internalHiringRatio:
        prev.headcount > 0 ? (d?.internalTransfersIn ?? 0) / prev.headcount : 0,
      turnoverRate: turnover,
    }, params);

    // Les indemnités se paient d'AVANCE, en trésorerie, alors que l'économie
    // de masse salariale n'arrive qu'après. C'est tout l'enseignement.
    const severanceMad =
      layoffs *
      severancePerHead(salary, prev.seniorityYears) *
      (1 + shock.severancePct);

    const subsidiesMad =
      (d?.claimOfppt
        ? ofpptReimbursement(trainingBudget, payrollMad, params)
        : 0) +
      (d?.claimGiac ? giacSupport(d.orderSkillsAudit, payrollMad, params) : 0) +
      trainingBudget * shock.trainingSubsidyPct;

    return {
      teamId: w.teamId,
      dasId: w.unit.dasId,
      headcount,
      climatSocial: climat,
      productivity: headcount > 0 ? w.volumeSold / headcount : 0,
      standardisationLevel: standardisation,
      automationLevel: w.automation,
      turnoverRate: turnover,
      payrollMad,
      workloadIndex: load,
      overstaffingPct: Math.max(100 - load, 0),
      skillIndex: skill,
      severancePaidMad: severanceMad,
      subsidiesMad,
      /** Ce que la standardisation autorisait de retirer sans perdre en qualité. */
      safeReduction: safeHeadcountReduction(
        prev.headcount, standardisation, w.automation, params,
      ),
      qualityLossPts: qualityLossFromCuts(
        layoffs,
        safeHeadcountReduction(prev.headcount, standardisation, w.automation, params),
        prev.headcount,
      ),
    };
  });

  // Ce que la RH de chaque DAS coûte — ou rapporte — à la trésorerie du groupe.
  const hrCashByTeam = new Map<string, { severanceMad: number; subsidiesMad: number }>();
  for (const state of dasHrStates) {
    const acc = hrCashByTeam.get(state.teamId) ?? { severanceMad: 0, subsidiesMad: 0 };
    acc.severanceMad += state.severancePaidMad;
    acc.subsidiesMad += state.subsidiesMad;
    hrCashByTeam.set(state.teamId, acc);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE F — Compte de résultat et trésorerie
  // ─────────────────────────────────────────────────────────────────────────
  const teamOutputs: TeamOutput[] = [];
  const pnlByTeam = new Map<string, PnlStatement>();

  for (const team of activeTeams) {
    const teamUnits = workspaces.filter((w) => w.teamId === team.teamId);
    const alignment = alignmentByTeam.get(team.teamId)!;
    const corporate = corporateByTeam.get(team.teamId)!;

    const hrCash = hrCashByTeam.get(team.teamId) ?? { severanceMad: 0, subsidiesMad: 0 };
    const teamHrStates = dasHrStates.filter((h) => h.teamId === team.teamId);

    const revenueMad = teamUnits.reduce((acc, w) => acc + w.revenueMad, 0);
    const cogsMad = teamUnits.reduce((acc, w) => acc + w.cogsMad, 0);
    const fixedProductionMad = teamUnits.reduce(
      (acc, w) => acc + w.fixedProductionCostMad + w.underabsorptionMad,
      0,
    );
    const marketingMad = teamUnits.reduce((acc, w) => acc + w.unit.decision.marketingBudgetMad, 0);
    const rdMad = teamUnits.reduce((acc, w) => acc + w.unit.decision.rdBudgetMad, 0);
    const capexMad =
      teamUnits.reduce(
        (acc, w) =>
          acc +
          w.unit.decision.capexCapacityMad +
          w.unit.decision.capexAutomationMad +
          w.unit.decision.capexOwnNetworkMad,
        0,
      );


    const distributorMarginPct =
      revenueMad > 0
        ? teamUnits.reduce((acc, w) => acc + w.revenueMad * w.avgDistributorMargin, 0) / revenueMad
        : 0;

    const hires =
      team.hr.hireOperateurs + team.hr.hireTechniciens + team.hr.hireExperts + team.hr.hireCadres;
    const headcount = Math.max(team.hr.headcountStart + hires - team.hr.restructuringCount, 0);

    // ── Coût de réorganisation ─────────────────────────────────────────────
    //
    // Il était lu depuis `structure_transition_cost_mad` — colonne qu'AUCUNE
    // écriture n'alimentait, et qui valait donc 0 pour toujours. Changer de
    // structure ne coûtait rien en trésorerie : une équipe pouvait basculer de
    // fonctionnelle à matricielle chaque tour et repartir en sens inverse le
    // suivant, ne payant jamais que la pénalité d'alignement.
    //
    // Le coût est désormais DÉRIVÉ du changement lui-même, et assis sur la
    // masse salariale : cabinets, doublons transitoires, mois de flottement —
    // une réorganisation se paie en personnel, non en pourcentage d'un chiffre
    // d'affaires qu'on ne connaît pas encore quand on la décide.
    const structureChanged =
      team.previousStructureType !== null &&
      team.previousStructureType !== team.corporate.structureType;

    const structureTransitionCostMad = structureChanged
      ? payrollCost(headcount, team.hr.avgSalaryBrutMad, params) *
        param(params, 'structure.transition_cost_pct_of_payroll')
      : 0;

    const synergy = synergyEffect(
      corporate.shared,
      corporate.relatedness,
      corporate.centralisation,
      teamUnits.length,
      params,
    );

    // Le BFR moyen est pondéré par le CA de chaque DAS : le BTP immobilise
    // beaucoup plus que le tourisme, et un portefeuille mixte se situe entre
    // les deux.
    // Les chocs monétaires, salariaux et de délais de paiement sont des faits
    // de branche : ils s'appliquent à l'équipe entière, pondérés par le poids
    // de chaque DAS. Un groupe dont un seul DAS subit l'encadrement des délais
    // de paiement n'en ressent qu'une fraction — celle que ce DAS pèse.
    const weightedShock = (pick: (s: ShockEffects) => number): number =>
      revenueMad > 0
        ? teamUnits.reduce(
            (acc, w) =>
              acc + (w.revenueMad / revenueMad) * pick(teamShock(team.teamId, w.unit.dasId)),
            0,
          )
        : 0;

    const workingCapitalDays =
      (revenueMad > 0
        ? teamUnits.reduce(
            (acc, w) => acc + (w.revenueMad / revenueMad) * w.das.parameters.workingCapitalDays,
            0,
          )
        : 60) + weightedShock((s) => s.workingCapitalDaysDelta);

    const pnl = buildPnl(
      {
        revenueMad,
        distributorMarginPct,
        cogsMad,
        marginPremiumPct: marginPremium(alignment.iaFinal, params),
        // Les indemnités viennent des décisions RH de chaque DAS — le seul
        // endroit où elles sont réellement calculées, au barème de l'article
        // 53 et sur l'ancienneté du domaine. Le choc de branche leur est déjà
        // appliqué par DAS : le réappliquer ici le compterait deux fois.
        // Les subventions OFPPT et GIAC viennent en DÉDUCTION : elles
        // remboursent de la formation, qui est dans cette même ligne.
        payrollMad:
          payrollCost(headcount, team.hr.avgSalaryBrutMad, params) *
            (1 + weightedShock((s) => s.payrollPct)) +
          hrCash.severanceMad +
          team.hr.trainingBudgetMad * (1 - weightedShock((s) => s.trainingSubsidyPct)) -
          hrCash.subsidiesMad,
        marketingMad,
        rdMad,
        overheadMad: team.finance.opexMad,
        overheadMultiplier: synergy.opexMultiplier,
        fixedProductionMad,
        consultingMad: team.finance.consultingSpendMad,
        depreciationMad: depreciation(team.finance.capexHistoryMad, params),
        debtMad: team.finance.debtOutstandingMad,
        equityMad: team.finance.equityMad,
        taxRegime: team.finance.taxRegime,
        capexMad: capexMad + structureTransitionCostMad,
        treasuryStartMad: team.finance.treasuryStartMad,
        workingCapitalDays,
        previousWorkingCapitalMad: team.finance.previousWorkingCapitalMad,
        debtDrawnMad: team.finance.debtDrawnMad,
        debtRepaidMad: team.finance.debtRepaidMad,
        // Répondre à une crise se paie, y compris quand la carte s'avère
        // bénigne : c'est le prix de l'assurance, et c'est l'arbitrage que
        // la war room propose. Le coût était calculé puis jamais débité.
        divestitureCashMad:
          revenueMad * weightedShock((s) => s.subsidyPctOfRevenue) -
          team.shockResponses.reduce((acc, r) => acc + r.costMad, 0),
        rateDelta: weightedShock((s) => s.rateDelta),
        // La marge d'océan bleu se calcule PAR DOMAINE : la fenêtre s'ouvre
        // sur un métier, pas sur le groupe. Un pourcentage global l'aurait
        // étendue à des domaines qui n'ont rien tenté.
        blueOceanMarginMad: teamUnits.reduce(
          (acc, w) =>
            acc +
            (w.blueOceanActive
              ? Math.max(w.revenueMad - w.cogsMad, 0) *
                (param(params, 'blue_ocean.margin_multiplier') - 1)
              : 0),
          0,
        ),
        blueOceanEntryMad: teamUnits.reduce((acc, w) => acc + w.blueOceanEntryCostMad, 0),
      },
      params,
    );

    pnlByTeam.set(team.teamId, pnl);

    const treasury = treasuryStatus(
      pnl.treasuryEndMad,
      team.previousConsecutiveNegativeRounds,
      params,
    );

    teamOutputs.push({
      teamId: team.teamId,
      poolId: team.poolId,
      pnl,
      alignment,
      // Le climat et l'effectif du groupe sont la CONSOLIDATION de ses
      // domaines, non un second calcul. Deux modèles coexistaient, et le plus
      // grossier alimentait le cockpit et le Balanced Scorecard.
      climatSocial: consolidateClimate(teamHrStates, team.previousClimatSocial),
      headcount: consolidateHeadcount(teamHrStates, headcount),
      centralisationIndex: corporate.centralisation,
      sharedResourcesIndex: corporate.shared,
      portfolioRelatedness: corporate.relatedness,
      verticalIntegration: corporate.verticalIntegration,
      talentMix: corporate.talentMix,
      synergySavingPct: synergy.savingPct,
      coordinationCostPct: synergy.coordinationCostPct,
      marginPremiumPct: marginPremium(alignment.iaFinal, params),
      treasuryStatus: treasury.status,
      consecutiveNegativeTreasuryRounds: treasury.consecutiveNegativeRounds,
      nextRoundCompetitivenessMalus: treasury.nextRoundCompetitivenessMalus,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE G bis — Acquisitions externes
  //
  // Racheter une entreprise non joueuse, c'est ENTRER dans un domaine d'un
  // coup, avec une part de marché constituée. C'est le moyen de contourner la
  // barrière VRIO qui pénalise l'entrée tardive — à un prix, et en héritant
  // d'une organisation qu'on n'a pas construite.
  //
  // L'enchère est SCELLÉE : la meilleure offre l'emporte, à condition d'égaler
  // le prix de réserve de la cible. Une entreprise en bonne santé ne se brade
  // pas parce qu'une seule équipe s'y intéresse.
  // ─────────────────────────────────────────────────────────────────────────
  const acquisitions: AcquisitionOutput[] = [];
  const offersByTarget = new Map<string, typeof input.acquisitionOffers>();

  for (const offer of input.acquisitionOffers) {
    offersByTarget.set(offer.targetActorId, [
      ...(offersByTarget.get(offer.targetActorId) ?? []),
      offer,
    ]);
  }

  for (const [targetActorId, offers] of offersByTarget) {
    const best = offers.reduce((winner, offer) =>
      offer.offerMad > winner.offerMad ? offer : winner,
    );

    // En deçà du prix de réserve, la cible refuse : personne n'acquiert.
    if (best.offerMad < best.reservePriceMad) continue;

    const outcome = resolveTransfer(
      best.offerMad,
      best.integrationBudgetMad,
      best.targetMarketShare,
      best.targetNotoriety,
      params,
    );

    // Une intégration de filière ne transfère NI part de marché NI capacité :
    // le maillon servait déjà l'équipe, il change seulement de propriétaire.
    // Ce qu'elle transfère, c'est le droit de ne plus payer d'intermédiaire —
    // et ce droit est amputé de ce que l'intégration a raté.
    const integre = best.operation !== 'entree_das';

    acquisitions.push({
      offerId: best.offerId,
      buyerTeamId: best.bidderTeamId,
      targetActorId,
      dasId: best.dasId,
      operation: best.operation,
      integrationQuality: 1 - outcome.valueLossPct,
      pricePaidMad: best.offerMad,
      integrationRatio: outcome.integrationRatio,
      valueLossPct: outcome.valueLossPct,
      marketShareAcquired: integre ? 0 : outcome.marketShareTransferred,
      // Le chiffre d'affaires suit la part de marché : on rachète une
      // position commerciale, amputée de ce que l'intégration détruit.
      revenueAcquired: integre ? 0 : best.targetRevenueMad * (1 - outcome.valueLossPct),
      // La capacité et la qualité subissent la même érosion que la part de
      // marché : mal intégrer, c'est perdre des équipes, des clients et du
      // savoir-faire au même rythme.
      capacityAcquired: integre ? 0 : best.targetCapacityUnits * (1 - outcome.valueLossPct),
      notorietyAcquired: integre ? 0 : outcome.notorietyTransferred,
      qualityAcquired: integre ? 0 : best.targetQuality * (1 - outcome.valueLossPct * 0.5),
    });

    // Le prix sort de la trésorerie de l'acquéreur, budget d'intégration compris.
    const buyer = teamOutputs.find((t) => t.teamId === best.bidderTeamId);
    if (buyer) {
      const cost = best.offerMad + best.integrationBudgetMad;
      buyer.pnl.capexMad += cost;
      buyer.pnl.treasuryEndMad -= cost;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE G — Cessions de DAS
  // ─────────────────────────────────────────────────────────────────────────
  const transfers: TransferOutput[] = [];

  for (const listing of input.listings) {
    if (listing.withdrawn || listing.sellerChoice === 'withdraw') continue;

    const w = workspaces.find(
      (x) => x.teamId === listing.sellerTeamId && x.unit.dasId === listing.dasId,
    );
    if (!w) continue;

    const sellerOutput = teamOutputs.find((t) => t.teamId === listing.sellerTeamId);
    const ebitda = w.revenueMad * (1 - w.avgDistributorMargin) - w.cogsMad;

    const baseValuation = dasBaseValuation(
      ebitda,
      w.das.parameters.valuationMultiple,
      w.das.growthRate,
      w.capacityUnits,
      w.das.parameters.unitCapacityCostMad * 0.4,
      w.marketShare,
      w.marketSizeMad * 0.1,
    );

    const rng = makeRng(seedFrom(input.sessionId, input.roundNumber, listing.listingId, 'npc'));
    const npc = npcOffer(baseValuation, sellerOutput?.treasuryStatus ?? 'sain', rng, params);

    const bestBid = listing.bids.reduce<typeof listing.bids[number] | null>(
      (best, bid) => (best === null || bid.offerMad > best.offerMad ? bid : best),
      null,
    );

    const takesBid =
      listing.sellerChoice === 'best_bid' && bestBid !== null && bestBid.offerMad > 0;

    const price = takesBid ? bestBid!.offerMad : npc;
    const buyerTeamId = takesBid ? bestBid!.bidderTeamId : null;
    const integrationBudget = takesBid ? bestBid!.integrationBudgetMad : 0;

    const transfer = resolveTransfer(
      price,
      integrationBudget,
      w.marketShare,
      w.notoriety,
      params,
    );

    transfers.push({
      listingId: listing.listingId,
      dasId: listing.dasId,
      sellerTeamId: listing.sellerTeamId,
      buyerTeamId,
      priceMad: price,
      integrationRatio: transfer.integrationRatio,
      valueLossPct: transfer.valueLossPct,
      // L'acheteur non joueur emporte le DAS hors du pool : rien n'est
      // transféré à une équipe, la part entière retourne au marché.
      marketShareTransferred: buyerTeamId ? transfer.marketShareTransferred : 0,
      shareReleasedToPool: buyerTeamId ? transfer.shareReleasedToPool : w.marketShare,
    });
  }

  // Encaissements et décaissements de cession, répercutés sur la trésorerie.
  for (const transfer of transfers) {
    const seller = teamOutputs.find((t) => t.teamId === transfer.sellerTeamId);
    if (seller) seller.pnl.treasuryEndMad += transfer.priceMad;

    if (transfer.buyerTeamId) {
      const buyer = teamOutputs.find((t) => t.teamId === transfer.buyerTeamId);
      const bid = input.listings
        .find((l) => l.listingId === transfer.listingId)
        ?.bids.find((b) => b.bidderTeamId === transfer.buyerTeamId);
      if (buyer) {
        buyer.pnl.treasuryEndMad -= transfer.priceMad + (bid?.integrationBudgetMad ?? 0);
      }
    }
  }

  // Le statut de trésorerie est réévalué APRÈS les cessions : c'est tout
  // l'intérêt de vendre un DAS quand on est en difficulté.
  for (const output of teamOutputs) {
    const team = teamById.get(output.teamId)!;
    const treasury = treasuryStatus(
      output.pnl.treasuryEndMad,
      team.previousConsecutiveNegativeRounds,
      params,
    );
    output.treasuryStatus = treasury.status;
    output.consecutiveNegativeTreasuryRounds = treasury.consecutiveNegativeRounds;
    output.nextRoundCompetitivenessMalus = treasury.nextRoundCompetitivenessMalus;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sortie
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Lecture de gestion d'un DAS.
   *
   * Les capitaux employés sont approchés par la VALEUR DE L'OUTIL : capacité
   * installée × coût unitaire de capacité, plus le besoin de financement du
   * cycle. C'est une approximation assumée — la comptabilité d'Atlas ne tient
   * pas de bilan par DAS — mais elle est cohérente d'un DAS à l'autre, ce qui
   * est la seule chose qu'un ratio de rendement exige pour être comparable.
   */
  const dasIndicators = (w: UnitWorkspace, grossMargin: number) => {
    const investmentMad =
      w.unit.decision.capexCapacityMad +
      w.unit.decision.capexAutomationMad +
      w.unit.decision.capexOwnNetworkMad;

    const capitalEmployedMad =
      w.capacityUnits * w.das.parameters.unitCapacityCostMad +
      w.revenueMad * (w.das.parameters.workingCapitalDays / 360);

    const indicators = computeIndicators({
      revenueMad: w.revenueMad,
      variableCostsMad: w.cogsMad,
      fixedCostsMad: w.fixedProductionCostMad + w.underabsorptionMad,
      payrollMad: 0,
      marketingMad: w.unit.decision.marketingBudgetMad,
      rdMad: w.unit.decision.rdBudgetMad,
      channelCostMad: w.revenueMad * w.avgDistributorMargin,
      otherCostsMad: 0,
      // Approché par la marge après charges commerciales : le résultat NET
      // n'existe qu'au niveau du groupe, où l'impôt et la dette se calculent.
      netIncomeMad:
        grossMargin - w.fixedProductionCostMad - w.underabsorptionMad -
        w.unit.decision.marketingBudgetMad - w.unit.decision.rdBudgetMad,
      capitalEmployedMad,
      investmentMad,
    });

    return {
      totalCostsMad: indicators.totalCostsMad,
      profitMarginPct: indicators.profitMarginPct,
      roiPct: indicators.roiPct,
      costPerRevenuePct: indicators.costPerRevenuePct,
      cashGeneratedMad: indicators.cashGeneratedMad,
      capitalEmployedMad,
      investmentMad,
    };
  };


  const dasMetrics: DasMetricsOutput[] = workspaces.map((w) => {
    const diagnosis = alignmentByTeam.get(w.teamId)?.perDas[w.unit.dasId];
    const grossMargin =
      w.revenueMad * (1 - w.avgDistributorMargin) - w.cogsMad;

    return {
      teamId: w.teamId,
      dasId: w.unit.dasId,
      quality: w.quality,
      perceivedQuality: w.perceived,
      notoriety: w.notoriety,
      inputQuality: w.inputQuality,
      pricePosition: w.unit.decision.pricePosition,
      unitPriceMad: w.unitPriceMad,
      priceCompetitiveness: w.priceCompetitiveness,
      competitivePressure: w.pressure,
      competitivenessScore: w.competitiveness,
      capacityUnits: w.capacityUnits,
      effectiveCapacityUnits: w.effectiveCapacity,
      volumeDemanded: w.volumeDemanded,
      volumeSold: w.volumeSold,
      volumeLost: w.volumeLost,
      stockoutRate: w.stockoutRate,
      utilisationRate: w.utilisationRate,
      cumulativeVolume: w.unit.previous.cumulativeVolume + w.volumeSold,
      unitVariableCostMad: w.unitVariableCostMad,
      fixedCostMad: w.fixedProductionCostMad,
      underabsorptionMad: w.underabsorptionMad,
      automationLevel: w.automation,
      distributionCoverage: w.coverage,
      avgDistributorMargin: w.avgDistributorMargin,
      channelControl: w.channelControl,
      blueOceanActive: w.blueOceanActive,
      blueOceanRoundsLeft: w.blueOceanRoundsLeft,
      blueOceanEntryCostMad: w.blueOceanEntryCostMad,
      blueOceanFailed: w.blueOceanFailed,
      marketSizeMad: w.marketSizeMad,
      rawShare: w.rawShare,
      marketSharePct: w.marketShare,
      revenueMad: w.revenueMad,
      grossMarginMad: grossMargin,
      ebitdaMad: grossMargin - w.fixedProductionCostMad - w.underabsorptionMad,
      ...dasIndicators(w, grossMargin),
      // Recopié depuis l'alignement : c'est la seule voie par laquelle l'IA
      // atteint la projection de pool, la table `alignment_scores` restant
      // strictement privée à l'équipe.
      iaScore: alignmentByTeam.get(w.teamId)?.iaFinal ?? 0,
      sabScore: diagnosis?.declaredFit ?? 0,
      bestFitStrategy: diagnosis?.bestStrategy ?? w.unit.decision.genericStrategy,
      bestFitScore: diagnosis?.bestFit ?? 0,
      breakEvenVolume: breakEvenVolume(
        w.fixedProductionCostMad,
        w.unitPriceMad,
        w.avgDistributorMargin,
        w.unitVariableCostMad,
      ),
    };
  });

  const invariantFailures = checkInvariants(dasMetrics, teamOutputs, poolSummaries, transfers);

  return {
    ok: invariantFailures.length === 0,
    dasMetrics,
    dasHr: dasHrStates,
    groupAlignment: groupAlignmentByTeam,
    teams: teamOutputs,
    poolSummaries,
    transfers,
    acquisitions,
    invariantFailures,
  };
}

// ===========================================================================
// Invariants (doc 02 §14)
//
// Une résolution qui en viole un est ANNULÉE en transaction, journalisée dans
// `resolution_runs`, et signalée au facilitateur. Jamais d'écriture partielle :
// mieux vaut un tour à rejouer qu'un classement faux projeté en salle.
// ===========================================================================

export function checkInvariants(
  dasMetrics: DasMetricsOutput[],
  teams: TeamOutput[],
  poolSummaries: PoolDasSummary[],
  transfers: TransferOutput[],
): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const EPS = 1e-6;

  // 1 — Σ parts + part non servie = 1, par pool et par DAS.
  for (const summary of poolSummaries) {
    const metrics = dasMetrics.filter(
      (m) => m.dasId === summary.dasId && summary.teamIds.includes(m.teamId),
    );
    // Les équipes en océan bleu sont hors du pool : leur part se prend sur un
    // marché vierge et n'entre pas dans la somme.
    //
    // Le commentaire l'annonçait déjà, mais la soustraction portait sur une
    // constante nulle — un `blueOceanTotal = 0` qui ne retirait rien. Le
    // défaut est resté invisible tant que l'océan bleu lui-même était inerte :
    // aucune équipe n'ayant jamais quitté le pool, la somme tombait juste par
    // accident. Le voilà exact, et le filtre est explicite.
    const contenders = metrics.filter(
      (m) => !m.blueOceanActive && (m.rawShare > 0 || m.marketSharePct > 0),
    );
    const total = contenders.reduce((acc, m) => acc + m.marketSharePct, 0) + summary.unservedShare;

    if (contenders.length > 0 && Math.abs(total - 1) > 1e-4) {
      failures.push({
        code: 'share_sum',
        message: `Pool ${summary.poolId}, DAS ${summary.dasId} : les parts somment à ${total.toFixed(6)} au lieu de 1.`,
        context: { poolId: summary.poolId, dasId: summary.dasId, total },
      });
    }
  }

  // 2 — Aucune part hors de [0, 1].
  for (const m of dasMetrics) {
    if (m.marketSharePct < -EPS || m.marketSharePct > 1 + EPS) {
      failures.push({
        code: 'share_range',
        message: `Équipe ${m.teamId}, DAS ${m.dasId} : part de marché de ${m.marketSharePct}.`,
        context: { teamId: m.teamId, dasId: m.dasId, share: m.marketSharePct },
      });
    }
  }

  // 3 — On ne vend jamais plus qu'on ne peut produire.
  for (const m of dasMetrics) {
    if (m.volumeSold > m.effectiveCapacityUnits + 1e-3) {
      failures.push({
        code: 'volume_exceeds_capacity',
        message: `Équipe ${m.teamId}, DAS ${m.dasId} : ${m.volumeSold} unités vendues pour ${m.effectiveCapacityUnits} de capacité.`,
        context: { teamId: m.teamId, dasId: m.dasId },
      });
    }
  }

  // 4 — Tous les scores 0–100 sont bien dans l'intervalle.
  const bounded: (keyof DasMetricsOutput)[] = [
    'quality',
    'perceivedQuality',
    'notoriety',
    'automationLevel',
    'channelControl',
  ];
  for (const m of dasMetrics) {
    for (const key of bounded) {
      const value = m[key] as number;
      if (value < -EPS || value > 100 + EPS) {
        failures.push({
          code: 'score_range',
          message: `Équipe ${m.teamId}, DAS ${m.dasId} : ${String(key)} vaut ${value}, hors de [0, 100].`,
          context: { teamId: m.teamId, dasId: m.dasId, key: String(key), value },
        });
      }
    }
  }

  // 5 — L'IA reste dans [0, 100].
  for (const t of teams) {
    if (t.alignment.iaFinal < -EPS || t.alignment.iaFinal > 100 + EPS) {
      failures.push({
        code: 'ia_range',
        message: `Équipe ${t.teamId} : IA de ${t.alignment.iaFinal}.`,
        context: { teamId: t.teamId },
      });
    }
  }

  // 6 — Un DAS cédé a exactement un vendeur, et au plus un acheteur distinct.
  const seenListings = new Set<string>();
  for (const transfer of transfers) {
    if (seenListings.has(transfer.listingId)) {
      failures.push({
        code: 'duplicate_transfer',
        message: `Annonce ${transfer.listingId} dénouée plusieurs fois.`,
        context: { listingId: transfer.listingId },
      });
    }
    seenListings.add(transfer.listingId);

    if (transfer.buyerTeamId === transfer.sellerTeamId) {
      failures.push({
        code: 'self_transfer',
        message: `Équipe ${transfer.sellerTeamId} : cession à elle-même sur le DAS ${transfer.dasId}.`,
        context: { listingId: transfer.listingId },
      });
    }
  }

  // 7 — Les nombres produits sont finis. Un NaN qui atteint la base est
  // beaucoup plus coûteux à diagnostiquer qu'une résolution refusée.
  for (const t of teams) {
    for (const [key, value] of Object.entries(t.pnl)) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        failures.push({
          code: 'non_finite',
          message: `Équipe ${t.teamId} : ${key} vaut ${value} dans le compte de résultat.`,
          context: { teamId: t.teamId, key },
        });
      }
    }
  }

  return failures;
}
