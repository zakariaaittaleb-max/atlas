/**
 * ATLAS — formes de données de l'écran d'organisation.
 *
 * Module client-safe : ni `server-only`, ni logique d'accès. Le chargeur
 * serveur et la vue client s'y réfèrent tous les deux, ce qui évite de faire
 * dépendre un composant `"use client"` d'un module serveur — dépendance que
 * `boundaries.test.ts` refuse, type ou pas.
 */

export interface DirectionRef {
  key: string;
  name: string;
  description: string;
  displayOrder: number;
}

export interface KpiRef {
  key: string;
  directionKey: string;
  name: string;
  description: string;
  unit: string;
  higherIsBetter: boolean;
}

export interface AxisRef {
  key: string;
  name: string;
  description: string;
}

export interface PositionDraft {
  directionKey: string;
  title: string;
  hierarchyLevel: number;
  headcount: number;
  budgetMad: number;
  isKeyPosition: boolean;
}

/**
 * Ce que le groupe a ouvert à ce DAS, et ce que ce DAS en fait.
 *
 * `proximity` est calculée serveur : c'est la proximité sectorielle moyenne de
 * ce DAS aux AUTRES utilisateurs de la plateforme. Elle est affichée à l'équipe
 * parce que c'est elle qui rend la décision arbitrable — adhérer à une
 * plateforme partagée avec un métier étranger coûte de la coordination sans
 * rapporter d'économie.
 */
export interface SharedResourceOffer {
  resourceKey: string;
  label: string;
  proximity: number;
  adoptionLevel: number;
  standardised: boolean;
}

export interface DasDirectives {
  portfolioRole: 'moteur' | 'relais' | 'soutien' | 'reserve';
  ansoffMovement:
    | 'penetration' | 'developpement_marche' | 'developpement_produit' | 'diversification';
  hqPurchasing: boolean;
  hqIt: boolean;
  hqRd: boolean;
  hqHr: boolean;
  hqFinance: boolean;
}

export interface DasHr {
  hireOperateurs: number;
  hireTechniciens: number;
  hireExperts: number;
  hireCadres: number;
  layoffs: number;
  internalTransfersIn: number;
  avgSalaryBrutMad: number;
  trainingBudgetMad: number;
  trainingFocus: 'technique' | 'management' | 'qualite' | 'polyvalence';
  claimOfppt: boolean;
  claimGiac: boolean;
  orderSkillsAudit: boolean;
  restructuring: 'aucune' | 'reorganisation' | 'externalisation' | 'fermeture_site';
}

/**
 * Ce que l'équipe doit VOIR avant de décider.
 *
 * Le cahier des charges est explicite : « pour faire ces choix on a besoin de
 * voir des KPI ». Ces indicateurs viennent du dernier exercice clos — on décide
 * en regardant d'où l'on part.
 */
export interface DasHrState {
  headcount: number;
  climatSocial: number;
  productivity: number;
  standardisationLevel: number;
  automationLevel: number;
  turnoverRate: number;
  payrollMad: number;
  workloadIndex: number;
  skillIndex: number;
  /** Effectif retirable sans perte de qualité, grâce à la standardisation. */
  safeReduction: number;
}

export interface DasOrganisation {
  dasId: string;
  dasName: string;
  /** Tour dont provient la conception affichée — elle persiste d'un tour à l'autre. */
  inheritedFromRound: number | null;
  structureType: 'fonctionnelle' | 'divisionnelle' | 'matricielle' | 'processus';
  delegationLevel: number;
  vision: string | null;
  mission: string | null;
  axisKeys: string[];
  budgets: { directionKey: string; budgetMad: number }[];
  kpis: { directionKey: string; kpiKey: string }[];
  positions: PositionDraft[];
  /** Déclinaison des directives du groupe. Jamais `null` : un défaut neutre. */
  directives: DasDirectives;
  /** Ressources ouvertes par le groupe à ce DAS. Vide si le groupe n'a rien ouvert. */
  sharedOffers: SharedResourceOffer[];
  hr: DasHr;
  /**
   * Les grandeurs RH du tour PRÉCÉDENT : la référence des curseurs de
   * variation. Zéro quand il n'y a pas de tour précédent — c'est alors la
   * dotation qui sert de repère (voir `variation-references.ts`).
   */
  hrPrevious: {
    hireOperateurs: number;
    hireTechniciens: number;
    hireExperts: number;
    hireCadres: number;
    layoffs: number;
    internalTransfersIn: number;
    avgSalaryBrutMad: number;
    trainingBudgetMad: number;
  };
  /** État RH du dernier exercice clos. `null` avant la première résolution. */
  hrState: DasHrState | null;
}

/**
 * Directives ARRÊTÉES AU NIVEAU DU GROUPE, affichées en lecture seule sur
 * l'écran d'un DAS.
 *
 * Les montrer est indispensable : sans elles, une équipe déciderait de déléguer
 * ou non ses achats au siège sans savoir si le siège les a centralisés. La
 * divergence deviendrait accidentelle, alors que tout l'intérêt est qu'elle soit
 * un choix assumé.
 */
export interface GroupDirectivesRef {
  corporateStrategy: string | null;
  centralPurchasing: boolean;
  centralIt: boolean;
  centralRd: boolean;
  centralHr: boolean;
  centralFinance: boolean;
  value1: string | null;
  value2: string | null;
  vision: string | null;
  mission: string | null;
}

export interface OrgContext {
  roundNumber: number;
  decisionsOpen: boolean;
  teamName: string;
  /** `null` si l'équipe n'a pas encore arrêté sa stratégie de groupe. */
  group: GroupDirectivesRef | null;
  directions: DirectionRef[];
  kpis: KpiRef[];
  axes: AxisRef[];
  das: DasOrganisation[];
  /** Marge brute attendue : l'assiette effectivement répartissable. */
  operatingBudgetMad: number;
  headcount: number;
}
