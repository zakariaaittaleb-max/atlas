/**
 * ATLAS — instantané d'un tour, entrée du moteur de résolution.
 *
 * Le moteur ne lit jamais la base : la couche serveur assemble cet instantané,
 * l'orchestrateur le transforme, et la couche serveur écrit le résultat. C'est
 * ce qui rend une résolution entièrement rejouable à partir d'un fichier JSON —
 * y compris devant une classe qui conteste un résultat.
 */

import type { PortfolioRole } from './group-alignment';
import type { Affinity, OrgSnapshot } from './organisation';
import type {
  AnsoffMovement,
  CompanyValue,
  CorporateStrategy,
  DasParameters,
  GenericStrategy,
  StructureType,
  TaxRegime,
  TreasuryStatus,
} from './types';
import type { DistributionLine, ProcurementLine } from './channels';

// ---------------------------------------------------------------------------
// Marché
// ---------------------------------------------------------------------------

export interface SegmentSnapshot {
  segmentKey: string;
  marketSharePct: number;
  qualityRequirement: number;
  priceSensitivity: number;
}

export interface DasSnapshot {
  dasId: string;
  sectorKey: string;
  parameters: DasParameters;
  previousMarketSizeMad: number;
  /** Tiré en amont de façon déterministe, dans [growth_min, growth_max]. */
  growthRate: number;
  /**
   * Chiffre d'affaires des concurrents NON JOUEURS encore indépendants.
   *
   * Un domaine ne contient pas que les équipes présentes dans la salle : il a
   * ses entreprises installées, que le facilitateur peut mettre en vente. Elles
   * existaient dans l'écosystème sans exister dans la répartition — les équipes
   * se partageaient 100 % d'un marché dont ces acteurs servaient déjà une part,
   * si bien que le marché était servi à plus de 100 % de sa taille.
   *
   * Elles prélèvent donc leur part EN PREMIER, et les équipes se disputent le
   * reste. Une cible rachetée sort de ce compte : sa part revient à l'équipe
   * qui l'a acquise, ce qui est précisément ce qu'on achète.
   */
  npcRevenueMad: number;
  segments: SegmentSnapshot[];
}

/** Effets cumulés des chocs actifs sur un DAS, déjà atténués par les réponses. */
export interface ShockEffects {
  /** Identifie la carte, pour que la réponse d'une équipe s'applique à elle. */
  shockId: string;
  dasId: string;
  marketSizePct: number;
  inputCostPct: number;
  capacityPct: number;
  /**
   * Seuil de qualité perçue en deçà duquel l'accès au marché se ferme.
   *
   * Était déclaré et agrégé mais JAMAIS lu : les cartes « norme qualité
   * obligatoire » et « rupture technologique » ne faisaient rien. Il est
   * désormais appliqué à la compétitivité — voir `resolve.ts`, étape 6.
   */
  qualityFloor: number | null;
  /**
   * Écart de taux de crédit, en points. Même histoire : déclaré, agrégé,
   * jamais lu, ce qui rendait inertes « resserrement monétaire » et
   * « détente monétaire ».
   */
  rateDelta: number;
  supplierPowerPct: number;
  distributorPowerPct: number;
  payrollPct: number;
  severancePct: number;
  capexCostPct: number;
  workingCapitalDaysDelta: number;
  priceElasticityDelta: number;
  notorietyPct: number;
  trainingSubsidyPct: number;
  subsidyPctOfRevenue: number;
  shareRedistributionPts: number;
  beneficiaryTeamIds: string[];
}

// ---------------------------------------------------------------------------
// État antérieur d'une équipe sur un DAS
// ---------------------------------------------------------------------------

export interface PreviousDasState {
  quality: number;
  notoriety: number;
  capacityUnits: number;
  cumulativeVolume: number;
  volumeSold: number;
  /**
   * Taux de rupture du tour précédent. Il alimente la notoriété et la
   * disponibilité perçue de CE tour — les clients jugent votre fiabilité sur
   * ce qu'ils ont vécu, pas sur une pénurie qu'ils n'ont pas encore subie.
   */
  stockoutRate: number;
  /**
   * Les deux magasins à l'ouverture du tour.
   *
   * Les intrants bornent ce que l'atelier peut produire ; les produits finis
   * se vendent sans rien produire. Zéro tant qu'aucun tour n'a été résolu —
   * une équipe démarre les entrepôts vides.
   */
  inputStockUnits: number;
  finishedStockUnits: number;
  revenueMad: number;
  cumulativeAutomationCapexMad: number;
  cumulativeNetworkCapexMad: number;
  /** Stratégie déclarée au tour précédent, pour détecter les changements (SAT). */
  declaredStrategy: GenericStrategy | null;
  /** Une dérive diagnostiquée au tour précédent rend le changement gratuit. */
  hadStrategicDrift: boolean;
}

export interface DasDecisionSnapshot {
  genericStrategy: GenericStrategy;
  pricePosition: number;
  servedSegments: string[];
  capexCapacityMad: number;
  capexAutomationMad: number;
  capexOwnNetworkMad: number;
  rdBudgetMad: number;
  marketingBudgetMad: number;
  declareBlueOcean: boolean;
}

/**
 * Ce qu'un DAS fait des directives du groupe.
 *
 * Les parts d'investissement et de chiffre d'affaires ne figurent pas ici :
 * elles se calculent à la résolution, une fois tous les DAS de l'équipe connus.
 */
export interface DasGroupStance {
  portfolioRole: PortfolioRole;
  hqPurchasing: boolean;
  hqIt: boolean;
  hqRd: boolean;
  hqHr: boolean;
  hqFinance: boolean;
  /** Ressources que le groupe a ouvertes à ce DAS, et l'adhésion effective. */
  sharedResources: {
    resourceKey: string;
    /** Proximité sectorielle moyenne aux autres DAS utilisateurs, 0–100. */
    proximity: number;
    adoptionLevel: number;
    standardised: boolean;
  }[];
}

/**
 * Décisions RH d'un DAS.
 *
 * Par DAS et non par groupe : une conserverie et une société de services n'ont
 * ni la même pyramide, ni la même productivité, ni la même sensibilité à la
 * formation. Une politique salariale unique pour les deux n'a pas de sens.
 */
export interface DasHrDecision {
  hireOperateurs: number;
  hireTechniciens: number;
  hireExperts: number;
  hireCadres: number;
  layoffs: number;
  /** Recrutements venus d'un autre DAS du même groupe : le marché interne. */
  internalTransfersIn: number;
  avgSalaryBrutMad: number;
  trainingBudgetMad: number;
  trainingFocus: 'technique' | 'management' | 'qualite' | 'polyvalence';
  claimOfppt: boolean;
  claimGiac: boolean;
  orderSkillsAudit: boolean;
  restructuring: 'aucune' | 'reorganisation' | 'externalisation' | 'fermeture_site';
}

export interface PreviousDasHr {
  headcount: number;
  climatSocial: number;
  skillIndex: number;
  avgSalaryBrutMad: number;
  /** Ancienneté moyenne, qui détermine le coût des indemnités de rupture. */
  seniorityYears: number;
  /**
   * Rotation subie à la clôture du tour précédent, 0–1.
   *
   * Elle était calculée, persistée et AFFICHÉE — « ce sont les plus qualifiés
   * qui partent », disait l'écran — sans que personne ne parte jamais. Les
   * départs sont désormais prélevés sur l'effectif de ce tour : un climat
   * dégradé vide l'atelier, et il faut recruter pour tenir la même charge.
   */
  turnoverRate: number;
  /**
   * Points de qualité perdus par les coupes d'effectif du tour précédent,
   * au-delà de ce que la standardisation autorisait.
   */
  qualityLossPts: number;
  /**
   * Rendement qualité de l'orientation de formation du tour précédent.
   *
   * 1 = neutre, soit aussi le cas d'une équipe qui n'a rien formé. C'est un
   * FACTEUR et non l'orientation elle-même : l'état RH doit porter ce que le
   * moteur a effectivement appliqué, budget compris, et non une étiquette
   * qu'il faudrait réinterpréter au tour suivant.
   */
  qualityFocusFactor: number;
}

export interface TeamDasSnapshot {
  /**
   * Cash pooling : ce que le groupe injecte dans ce domaine (positif) ou y
   * prélève (négatif), ce tour. La somme sur les domaines vaut zéro.
   */
  cashTransferMad: number;
  dasId: string;
  decision: DasDecisionSnapshot;
  previous: PreviousDasState;
  procurement: ProcurementLine[];
  distribution: DistributionLine[];
  /** Nombre de fournisseurs alternatifs disposant d'une capacité suffisante. */
  supplierAlternatives: number;
  launchedRound: number;
  /**
   * Mouvement d'Ansoff déclaré pour ce domaine. Le coefficient de risque en
   * est DÉRIVÉ par le moteur (`ansoffRisk`) : le transmettre séparément
   * ouvrait la porte à deux valeurs contradictoires, et c'est exactement ce
   * qui s'est produit — la colonne d'état restait à 0 pendant que l'équipe
   * déclarait une diversification.
   */
  ansoffMovement: AnsoffMovement | null;
  blueOcean: boolean;
  blueOceanRoundsLeft: number;
  /**
   * CAPEX capacité engagé au tour PRÉCÉDENT : c'est lui qui entre en service
   * ce tour-ci (doc 02 §3.1).
   */
  commissionedCapexMad: number;
  /**
   * Budget R&D du tour PRÉCÉDENT : son effet sur la qualité est différé
   * d'un tour (doc 02 §7.1).
   */
  previousRdBudgetMad: number;
  technologyPartnerBonus: number;
  /**
   * Déclinaison des directives du groupe par CE DAS — rôle assigné, fonctions
   * effectivement déléguées au siège, adhésion aux ressources mutualisées.
   *
   * `null` quand rien n'a été saisi : une session provisionnée avant
   * l'introduction des directives ne doit pas être notée sur une décision
   * qu'on ne lui a jamais demandée (voir `computeAlignment`).
   */
  groupStance: DasGroupStance | null;
  /** Décisions RH propres à ce DAS. `null` si l'équipe n'en a saisi aucune. */
  hr: DasHrDecision | null;
  /** État RH du DAS à la clôture de l'exercice précédent. */
  previousHr: PreviousDasHr;
  /**
   * Conception organisationnelle de CE DAS.
   *
   * Elle est par DAS et non par groupe : une équipe qui exploite l'agro-industrie
   * et le numérique ne les structure pas de la même façon — l'un est industriel
   * et se pilote de près, l'autre est un métier de compétences où la décision
   * doit descendre au terrain.
   *
   * `null` tant que l'équipe n'a rien conçu : le moteur ne peut alors conclure
   * ni à la cohérence ni à l'incohérence, et note zéro sur les axes concernés.
   */
  organisation: OrgSnapshot | null;
}

// ---------------------------------------------------------------------------
// Équipe
// ---------------------------------------------------------------------------

export interface CorporateDecisionSnapshot {
  corporateStrategy: CorporateStrategy;
  structureType: StructureType;
  centralPurchasing: boolean;
  centralIt: boolean;
  centralRd: boolean;
  centralHr: boolean;
  centralFinance: boolean;
  sharedProduction: boolean;
  sharedRd: boolean;
  values: [CompanyValue, CompanyValue];
  sharedSupplierRatio: number;
  sharedDistributorRatio: number;
}

export interface HrSnapshot {
  headcountStart: number;
  hireOperateurs: number;
  hireTechniciens: number;
  hireExperts: number;
  hireCadres: number;
  avgSalaryBrutMad: number;
  trainingBudgetMad: number;
  restructuringCount: number;
  /** Part des experts et cadres dans l'effectif de départ, 0–100. */
  previousExpertShare: number;
}

export interface FinanceSnapshot {
  opexMad: number;
  debtDrawnMad: number;
  debtRepaidMad: number;
  /** Levée de fonds propres décidée ce tour. */
  capitalRaisedMad: number;
  /** Dividende voté sur l'exercice clos. */
  dividendMad: number;
  taxRegime: TaxRegime;
  treasuryStartMad: number;
  equityMad: number;
  debtOutstandingMad: number;
  /** CAPEX des tours précédents, du plus ancien au plus récent. */
  capexHistoryMad: number[];
  previousWorkingCapitalMad: number;
  consultingSpendMad: number;
  /**
   * Ce que les investisseurs ont retenu du tour précédent.
   *
   * Optionnels : absents avant la première résolution, et dans les jeux
   * d'essai antérieurs à l'indice. Absents, les conditions de financement
   * restent celles de base.
   */
  investorAttractiveness?: number | null;
  previousRevenueMad?: number | null;
  /** Résultat de l'exercice clos : l'assiette du dividende voté ce tour. */
  previousNetIncomeMad?: number;
  previousDividendMad?: number;
  /**
   * Cessions et acquisitions CONCLUES en cours de tour (migration 0050). Le
   * produit d'une cession entre en trésorerie ; un rachat, prix et budget
   * d'intégration compris, est un investissement. Absents : aucune opération.
   */
  dealProceedsMad?: number;
  dealInvestmentMad?: number;
}

export interface TeamSnapshot {
  teamId: string;
  poolId: string;
  isLiquidated: boolean;
  corporate: CorporateDecisionSnapshot;
  hr: HrSnapshot;
  finance: FinanceSnapshot;
  units: TeamDasSnapshot[];
  previousClimatSocial: number;
  previousTreasuryStatus: TreasuryStatus;
  previousConsecutiveNegativeRounds: number;
  /** Nombre de tours consécutifs où le SAB progresse, pour le score temporel. */
  consecutiveImprovingRounds: number;
  previousCorporateStrategy: CorporateStrategy | null;
  /**
   * Structure du tour précédent. Elle seule permet de FACTURER une
   * réorganisation : la colonne `structure_transition_cost_mad` était lue par
   * le moteur et écrite par personne, si bien que changer de structure était
   * gratuit en trésorerie.
   */
  previousStructureType: StructureType | null;
  /**
   * Ce que l'équipe a répondu aux cartes du tour.
   *
   * `impactFactor` est l'arbitrage du facilitateur, qui a lu le plan de
   * l'équipe : 0 l'événement a été évité, 1 il s'applique tel quel, 3 il a
   * frappé trois fois plus fort. `costMad` est le budget que l'équipe a engagé
   * sur sa réponse — il se paie dans tous les cas, y compris si la carte
   * s'avère bénigne. C'est le prix de l'assurance, et c'est l'arbitrage.
   */
  shockResponses: { shockId: string; impactFactor: number; costMad: number }[];
}

// ---------------------------------------------------------------------------
// Marché de cession
// ---------------------------------------------------------------------------

export interface BidSnapshot {
  bidderTeamId: string;
  offerMad: number;
  integrationBudgetMad: number;
}

export interface ListingSnapshot {
  listingId: string;
  sellerTeamId: string;
  dasId: string;
  bids: BidSnapshot[];
  /** Le vendeur retire son annonce plutôt que de céder au prix proposé. */
  withdrawn: boolean;
  /** Choix du vendeur, saisi avant le verrouillage du tour. */
  sellerChoice: 'npc' | 'best_bid' | 'withdraw';
}

// ---------------------------------------------------------------------------
// Entrée complète
// ---------------------------------------------------------------------------

/**
 * Offre scellée pour racheter une entreprise non joueuse, et entrer ainsi dans
 * un domaine qu'on n'exploite pas encore.
 */
/**
 * Ce qu'une offre d'acquisition cherche à faire.
 *
 * `entree_das` fait ENTRER dans un domaine qu'on n'exploite pas : on hérite
 * d'une part de marché constituée. Les deux autres INTÈGRENT un maillon de sa
 * propre filière — on n'y gagne aucune part de marché, on y gagne de ne plus
 * payer d'intermédiaire et de contrôler son approvisionnement ou son canal.
 */
export type AcquisitionOperation = 'entree_das' | 'integration_amont' | 'integration_aval';

export interface AcquisitionOfferSnapshot {
  offerId: string;
  bidderTeamId: string;
  targetActorId: string;
  dasId: string;
  operation: AcquisitionOperation;
  offerMad: number;
  integrationBudgetMad: number;
  /** Ce que la cible pèse réellement — connu du seul moteur. */
  targetMarketShare: number;
  targetCapacityUnits: number;
  targetRevenueMad: number;
  targetNotoriety: number;
  targetQuality: number;
  /**
   * Prix plancher en deçà duquel la cible refuse. Dérivé de sa valorisation et
   * de son appétence à céder : une entreprise en bonne santé se vend cher.
   */
  reservePriceMad: number;
}

export interface ResolutionInput {
  sessionId: string;
  roundNumber: number;
  das: DasSnapshot[];
  teams: TeamSnapshot[];
  shocks: ShockEffects[];
  listings: ListingSnapshot[];
  acquisitionOffers: AcquisitionOfferSnapshot[];
  /**
   * Affinité de chaque direction avec chaque stratégie générique, agrégée
   * depuis le catalogue de KPI en base. Transmise plutôt que codée en dur :
   * le facilitateur doit pouvoir la retoucher entre deux promotions sans
   * redéploiement, comme pour `engine_parameters`.
   */
  directionAffinity: Record<string, Affinity>;
  /** Proximité sectorielle 0–100, issue de `sector_proximity`. */
  proximity: (sectorA: string, sectorB: string) => number;
}
