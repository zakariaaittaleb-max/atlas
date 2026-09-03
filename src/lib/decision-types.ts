/**
 * ATLAS — formes de données des écrans de saisie.
 *
 * Module SANS `server-only` : il est importé aussi bien par le chargeur serveur
 * que par les vues client. Les types y vivent seuls, jamais la logique d'accès.
 *
 * Cette séparation n'est pas cosmétique. Faire importer aux composants client un
 * type déclaré dans un module `server-only` fonctionne — les bundlers effacent
 * les imports de type — mais rend la frontière fragile : le jour où quelqu'un y
 * ajoute un import de valeur, la fuite est silencieuse. Le test
 * `boundaries.test.ts` refuse donc la dépendance, type ou pas.
 */

/** Périmètre d'équipe de l'utilisateur courant. */
export interface TeamContext {
  userId: string;
  teamId: string;
  teamName: string;
  poolId: string | null;
  sessionId: string;
  displayRole: string;
  isLiquidated: boolean;
}

export interface DasEntry {
  dasId: string;
  name: string;
  sectorKey: string;
  segments: { key: string; name: string }[];
  decision: {
    genericStrategy: string;
    pricePosition: number;
    servedSegments: string[];
    capexCapacityMad: number;
    capexAutomationMad: number;
    capexOwnNetworkMad: number;
    rdBudgetMad: number;
    marketingBudgetMad: number;
    declareBlueOcean: boolean;
  } | null;
  procurement: { supplierId: string; committedVolume: number }[];
  distribution: { distributorId: string; volumeShare: number }[];
  suppliers: ActorEntry[];
  distributors: ActorEntry[];
}

export interface ActorEntry {
  id: string;
  name: string;
  regionKey: string | null;
}

export interface DecisionContext {
  team: TeamContext;
  roundNumber: number;
  decisionsOpen: boolean;
  status: string;
  /** Trésorerie de clôture du tour précédent : l'assiette de tout engagement. */
  treasuryMad: number;
  headcount: number;
  avgSalaryMad: number;
  corporate: {
    corporateStrategy: string;
    structureType: string;
    centralPurchasing: boolean;
    centralIt: boolean;
    centralRd: boolean;
    centralHr: boolean;
    centralFinance: boolean;
    sharedProduction: boolean;
    sharedRd: boolean;
    value1: string;
    value2: string;
    vision: string | null;
    mission: string | null;
  } | null;
  hr: {
    hireOperateurs: number;
    hireTechniciens: number;
    hireExperts: number;
    hireCadres: number;
    avgSalaryBrutMad: number;
    trainingBudgetMad: number;
    restructuringCount: number;
  } | null;
  finance: {
    opexMad: number;
    debtDrawnMad: number;
    debtRepaidMad: number;
    taxRegime: string;
  } | null;
  debtOutstandingMad: number;
  das: DasEntry[];
  smigMad: number;
  chargesPatronalesPct: number;
}
