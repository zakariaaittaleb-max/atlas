/**
 * ATLAS — types du domaine moteur.
 *
 * Ce module ne contient AUCUNE logique et AUCUN accès base : uniquement les
 * formes de données que manipulent les fonctions pures du moteur. Il est
 * importable partout, y compris côté client, contrairement au reste de
 * `lib/engine` qui est strictement serveur.
 */

// ---------------------------------------------------------------------------
// Vocabulaire stratégique
// ---------------------------------------------------------------------------

export const GENERIC_STRATEGIES = [
  'domination_couts',
  'differenciation',
  'focus_couts',
  'focus_differenciation',
] as const;
export type GenericStrategy = (typeof GENERIC_STRATEGIES)[number];

export const CORPORATE_STRATEGIES = [
  'specialisation',
  'integration_verticale',
  'diversification_liee',
  'diversification_conglomerale',
] as const;
export type CorporateStrategy = (typeof CORPORATE_STRATEGIES)[number];

export const STRUCTURE_TYPES = ['fonctionnelle', 'divisionnelle', 'matricielle'] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const COMPANY_VALUES = [
  'excellence_produit',
  'innovation',
  'proximite_client',
  'accessibilite_prix',
  'efficience_operationnelle',
  'responsabilite_sociale',
  'ancrage_territorial',
  'fiabilite_service',
] as const;
export type CompanyValue = (typeof COMPANY_VALUES)[number];

export const ANSOFF_MOVEMENTS = [
  'penetration',
  'developpement_marche',
  'developpement_produit',
  'diversification',
] as const;
export type AnsoffMovement = (typeof ANSOFF_MOVEMENTS)[number];

export type TreasuryStatus = 'sain' | 'surveillance' | 'restructuration' | 'liquidation';

export type TaxRegime = 'droit_commun' | 'cfc_zai' | 'banque_assurance';

// ---------------------------------------------------------------------------
// Axes d'alignement
// ---------------------------------------------------------------------------

export const BUSINESS_AXES = [
  'price_position',
  'rd_intensity',
  'mkt_intensity',
  'quality',
  'cost_efficiency',
  'scale_index',
  'automation_level',
  'skill_intensity',
  'segment_breadth',
  'channel_control',
  // --- Axes d'ORGANISATION (doc 01 §4bis) ---------------------------------
  // Ajoutés parce qu'une équipe pouvait déclarer une différenciation et
  // l'organiser comme une usine low-cost sans que rien ne le relève.
  'org_delegation',
  'org_layers',
  'axis_fit',
  'kpi_fit',
  'budget_fit',
  'key_roles_fit',
] as const;
export type BusinessAxis = (typeof BUSINESS_AXES)[number];

/** Vecteur observé ou cible, chaque axe normalisé sur 0–100. */
export type BusinessVector = Record<BusinessAxis, number>;

export const CORPORATE_AXES = [
  'portfolio_breadth',
  'portfolio_relatedness',
  'centralisation_index',
  'shared_resources_index',
  'vertical_integration',
  'talent_mix',
  'values_fit',
] as const;
export type CorporateAxis = (typeof CORPORATE_AXES)[number];

export type CorporateVector = Record<CorporateAxis, number>;

/** Une ligne du rapport d'audit : ce que l'équipe visait, ce qu'elle a fait. */
export interface AxisDetail {
  axis: string;
  observed: number;
  target: number;
  /** observed − target, signé, pour que l'audit puisse dire « trop » ou « pas assez ». */
  gap: number;
  weight: number;
  /** Points d'IA perdus sur cet axe. Toujours ≥ 0. */
  penaltyPts: number;
}

export interface BusinessAlignment {
  score: number;
  details: AxisDetail[];
}

export interface BusinessDiagnosis {
  declared: GenericStrategy;
  declaredFit: number;
  bestFit: number;
  bestStrategy: GenericStrategy;
  /** Les décisions ne correspondent à aucune stratégie cohérente. */
  stuckInTheMiddle: boolean;
  /** Les décisions correspondent à une autre stratégie que celle déclarée. */
  strategicDrift: boolean;
  details: AxisDetail[];
}

export interface NamedPenalty {
  key: string;
  points: number;
  explanation: string;
}

export interface CorporateAlignment {
  score: number;
  details: AxisDetail[];
  penalties: NamedPenalty[];
}

export interface AlignmentResult {
  sabGlobal: number;
  /**
   * Conformité moyenne des DAS aux directives du groupe, pondérée par le
   * chiffre d'affaires. `null` quand aucune directive n'a été saisie — le
   * poids du SAG est alors redistribué, jamais compté comme un zéro.
   */
  sagGlobal: number | null;
  sac: number;
  sat: number;
  iaRaw: number;
  iaFinal: number;
  stuckInTheMiddle: boolean;
  strategicDrift: boolean;
  driftDeclared: GenericStrategy | null;
  driftActual: GenericStrategy | null;
  penalties: NamedPenalty[];
  perDas: Record<string, BusinessDiagnosis>;
  corporateDetails: AxisDetail[];
}

// ---------------------------------------------------------------------------
// Entrées corporate
// ---------------------------------------------------------------------------

export interface CorporateInput {
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
  /** DAS actifs de l'équipe, par clé de secteur. */
  activeSectors: string[];
  /** Part des fournisseurs communs à au moins deux DAS, 0–1. */
  sharedSupplierRatio: number;
  /** Part des distributeurs communs à au moins deux DAS, 0–1. */
  sharedDistributorRatio: number;
  /** Maillons amont/aval contrôlés, 0–100. */
  verticalIntegration: number;
  /** Part des experts et cadres dans l'effectif, 0–100. */
  talentMix: number;
  /** Stratégie générique du DAS pesant le plus de chiffre d'affaires. */
  dominantStrategy: GenericStrategy;
}

// ---------------------------------------------------------------------------
// Économie
// ---------------------------------------------------------------------------

export interface DasParameters {
  dasId: string;
  sectorKey: string;
  referenceUnitPriceMad: number;
  referenceUnitCostMad: number;
  fixedCostBaseMad: number;
  priceElasticity: number;
  learningRate: number;
  valuationMultiple: number;
  workingCapitalDays: number;
  vrioEntryBarrier: number;
  unitCapacityCostMad: number;
  capacityDepreciation: number;
  capacityFromHeadcount: boolean;
  headcountProductivity: number | null;
  /**
   * Volume cumulé auquel `referenceUnitCostMad` s'applique — l'origine de la
   * courbe d'expérience. Fixé au provisioning à la dotation initiale, de sorte
   * que toutes les équipes démarrent exactement au coût de référence.
   */
  referenceCumulativeVolumeUnits: number;
}

export interface SupplierOffer {
  actorId: string;
  priceIndex: number;
  reliability: number;
  qualityContribution: number;
  capacityUnits: number;
  switchingCost: number;
  minimumVolume: number;
  /**
   * L'équipe a racheté ce fournisseur — intégration amont.
   *
   * Ce n'est pas une remise de plus : c'est la disparition d'un intermédiaire.
   * La marge que le fournisseur prenait revient à l'acheteur, son pouvoir de
   * négociation cesse d'exister contre son propre propriétaire, et le coût de
   * changement n'a plus d'objet. En échange, l'équipe immobilise du capital
   * dans un maillon qu'elle doit désormais faire tourner.
   */
  ownedByTeam?: boolean;
  /**
   * Part du bénéfice d'intégration réellement captée, figée au rachat.
   *
   * Racheter sans budgéter l'intégration laisse propriétaire d'une entreprise
   * qu'on ne sait pas faire tourner. 1 = intégration réussie.
   */
  integrationQuality?: number;
}

export interface DistributorOffer {
  actorId: string;
  coveragePct: number;
  requiredMarginPct: number;
  negotiatingStrength: number;
  serviceLevel: number;
  minimumVolume: number;
  /**
   * L'équipe a racheté ce distributeur — intégration aval.
   *
   * Sa couverture cesse d'être celle d'un TIERS : elle rejoint le réseau
   * propre, ce qui remonte le contrôle du canal — et donc l'axe `channel_control`
   * du domaine ET l'intégration verticale du groupe. La marge qu'il exigeait
   * ne sort plus de la maison ; il reste le coût de le faire fonctionner.
   */
  ownedByTeam?: boolean;
  /** Part du bénéfice d'intégration réellement captée, figée au rachat. */
  integrationQuality?: number;
}

export interface ProcurementResult {
  actorId: string;
  bargainingPower: number;
  discountObtained: number;
  effectivePriceIndex: number;
  supplyDisruption: number;
}

export interface DistributionResult {
  actorId: string;
  bargainingPower: number;
  effectiveMarginPct: number;
  coverageContributed: number;
}

export interface PnlStatement {
  revenueMad: number;
  distributorMarginMad: number;
  netRevenueMad: number;
  cogsMad: number;
  grossMarginMad: number;
  payrollMad: number;
  marketingMad: number;
  rdMad: number;
  overheadMad: number;
  fixedProductionMad: number;
  consultingMad: number;
  ebitdaMad: number;
  depreciationMad: number;
  ebitMad: number;
  interestMad: number;
  pretaxIncomeMad: number;
  corporateTaxMad: number;
  netIncomeMad: number;
  workingCapitalMad: number;
  workingCapitalChangeMad: number;
  capexMad: number;
  treasuryStartMad: number;
  treasuryEndMad: number;
  effectiveTaxRate: number;
  leverageRatio: number;
  riskMargin: number;
}

export interface InvariantFailure {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}
