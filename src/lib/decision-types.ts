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
 *
 * ── DEUX JEUX DE VALEURS, ET POURQUOI ──────────────────────────────────────
 * Chaque bloc de saisie porte ses valeurs COURANTES et ses valeurs
 * D'OUVERTURE DE TOUR. Les secondes sont la cible du bouton « Réinitialiser » :
 * une équipe qui a passé vingt minutes à empiler des hypothèses doit pouvoir
 * revenir à l'état dans lequel elle a pris le tour, sans se souvenir de ce
 * qu'elle a changé. Sans elles, « annuler » n'aurait aucune définition.
 */

import type { TreasuryStatus } from './engine/types';

/** Périmètre d'équipe de l'utilisateur courant. */
export interface TeamContext {
  userId: string;
  teamId: string;
  teamName: string;
  poolId: string | null;
  sessionId: string;
  /** Prénom saisi à la connexion. `null` tant que le membre n'en a pas donné. */
  displayName: string | null;
  /** Vrai quand c'est le facilitateur qui joue dans le groupe. */
  isFacilitator: boolean;
  isLiquidated: boolean;
}

export interface CorporateValues {
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
}

export interface DasDecisionValues {
  genericStrategy: string;
  pricePosition: number;
  servedSegments: string[];
  capexCapacityMad: number;
  capexAutomationMad: number;
  capexOwnNetworkMad: number;
  rdBudgetMad: number;
  marketingBudgetMad: number;
  declareBlueOcean: boolean;
}

export interface FinanceValues {
  opexMad: number;
  /** Crédit NET : positif on tire, négatif on rembourse. Un seul curseur. */
  netCreditMad: number;
  capitalRaisedMad: number;
  dividendMad: number;
  /**
   * Cash pooling : un montant SIGNÉ par domaine, de somme nulle.
   *
   * Dans la forme de décision et non à part, parce que c'est l'écran de finance
   * qui l'arbitre et que la neutralisation d'un module doit pouvoir le vider
   * comme n'importe quel autre champ.
   */
  cashTransfers: { dasId: string; transferMad: number }[];
}

/**
 * Ce que la banque et l'exercice clos autorisent, pour borner les curseurs.
 *
 * Calculé côté serveur et non à l'écran : la même règle borne la saisie et
 * l'écriture, sinon l'une des deux mentirait.
 */
export interface FinanceLimits {
  equityMad: number;
  debtOutstandingMad: number;
  /** Encours maximal accepté, tous critères confondus. */
  capacityTotalMad: number;
  /** Ce qui reste à tirer. */
  capacityAvailableMad: number;
  /** Le critère qui bloque : c'est lui qu'il faut desserrer. */
  capacityBinding: 'fonds_propres' | 'activite';
  capacityByEquityMad: number;
  capacityByRevenueMad: number;
  /** Plafond du dividende : le résultat net du dernier exercice clos. */
  dividendCeilingMad: number;
  /** Chiffre d'affaires du dernier exercice clos : l'assiette du plafond. */
  lastRevenueMad: number;
  /**
   * Ce que les investisseurs ont retenu du dernier tour résolu, 0–100.
   * `null` avant la première résolution : aucune opinion n'est encore formée.
   */
  investorScore: number | null;
  /** Le détail des cinq composantes, pour l'infobulle de l'écran finance. */
  investorComponents: { key: string; label: string; score: number; reading: string }[] | null;
  /** Frais et décote d'une levée ce tour, en part du montant levé — fixés sur `investorScore`. */
  equityIssueCostPct: number;
  /** Ce que les investisseurs acceptent de souscrire ce tour. */
  equityRaiseCapMad: number;
}

export interface ProcurementLine {
  supplierId: string;
  committedVolume: number;
}

export interface DistributionLine {
  distributorId: string;
  volumeShare: number;
}

/**
 * Ce qui reste à faire sur un domaine, volet par volet.
 *
 * Alimente le fil d'Ariane des écrans de saisie : le parcours attendu est
 * « je choisis un domaine, je le renseigne partout, je passe au suivant », et
 * il faut donc pouvoir constater d'un coup d'œil où l'on en est SUR CE
 * DOMAINE-LÀ — pas sur l'ensemble du portefeuille.
 */
export interface DasProgress {
  strategy: boolean;
  procurement: boolean;
  distribution: boolean;
  organisation: boolean;
  hr: boolean;
}

export interface DasEntry {
  dasId: string;
  /** La marque de l'équipe, ou le nom du secteur à défaut. */
  name: string;
  /** Le nom du secteur, toujours. */
  activityName: string;
  brandName: string | null;
  sectorKey: string;
  /** `listed_for_sale` : encore piloté, mais mis en vente ce tour. */
  status: 'active' | 'listed_for_sale';
  launchedRound: number;
  /** Entré par rachat ou acquisition, et non par la dotation initiale. */
  acquired: boolean;
  segments: { key: string; name: string }[];
  /** Valeurs affichées : celles du tour, ou celles reconduites de l'exercice clos. */
  decision: DasDecisionValues;
  /** Le tour a-t-il déjà reçu une décision écrite pour ce domaine ? */
  decisionRecorded: boolean;
  procurement: ProcurementLine[];
  /**
   * Ce qu'il faut savoir avant d'engager un volume d'achat.
   *
   * Un volume engagé ne se juge pas dans le vide : il se compare à ce qu'on a
   * écoulé, à ce qu'on n'a pas pu servir, et à ce qui dort déjà en magasin.
   * Tout vient du dernier exercice clos — zéro avant la première résolution.
   */
  supply: {
    purchasedLastRound: number;
    soldLastRound: number;
    /** Demande non servie : le vrai signal d'un sous-approvisionnement. */
    lostLastRound: number;
    inputStockUnits: number;
    finishedStockUnits: number;
    effectiveCapacityUnits: number;
  };
  distribution: DistributionLine[];
  /** L'état à l'ouverture du tour — cible du bouton « Réinitialiser ». */
  baseline: {
    decision: DasDecisionValues;
    procurement: ProcurementLine[];
    distribution: DistributionLine[];
  };
  progress: DasProgress;
  suppliers: ActorEntry[];
  distributors: ActorEntry[];
}

export interface ActorEntry {
  id: string;
  name: string;
  regionKey: string | null;
}

/**
 * Consolidation RH du groupe, DÉRIVÉE des saisies par domaine.
 *
 * Les recrutements se décident domaine par domaine — une conserverie et une
 * société de services n'ont ni la même pyramide ni la même politique salariale.
 * Le groupe n'en saisit donc rien : il en constate la somme, et c'est cette
 * somme qui alimente sa masse salariale.
 */
export interface HrRollup {
  headcountStart: number;
  hires: number;
  layoffs: number;
  headcountEnd: number;
  avgSalaryBrutMad: number;
  trainingBudgetMad: number;
  payrollMad: number;
  /** Domaines dont les RH ne sont pas encore renseignées ce tour. */
  pendingDas: { dasId: string; name: string }[];
}

export interface DecisionContext {
  team: TeamContext;
  roundNumber: number;
  decisionsOpen: boolean;
  status: string;
  /** Trésorerie de clôture du tour précédent : l'assiette de tout engagement. */
  treasuryMad: number;
  /** Solde des cessions et rachats conclus ce tour, compris dans `treasuryMad`. */
  dealCashMad: number;
  /** Palier de détresse à la clôture du tour précédent — `'sain'` par défaut avant la première résolution. */
  treasuryStatus: TreasuryStatus;
  headcount: number;
  avgSalaryMad: number;
  /** Valeurs affichées : celles du tour, ou celles reconduites de l'exercice clos. */
  corporate: CorporateValues;
  corporateRecorded: boolean;
  corporateBaseline: CorporateValues;
  finance: FinanceValues;
  financeRecorded: boolean;
  financeBaseline: FinanceValues;
  hr: HrRollup;
  debtOutstandingMad: number;
  das: DasEntry[];
  smigMad: number;
  chargesPatronalesPct: number;
  /** Bornes de la banque et de l'exercice clos. */
  financeLimits: FinanceLimits;
}

export const CORPORATE_DEFAULTS: CorporateValues = {
  corporateStrategy: 'specialisation',
  structureType: 'fonctionnelle',
  centralPurchasing: false,
  centralIt: false,
  centralRd: false,
  centralHr: false,
  centralFinance: true,
  sharedProduction: false,
  sharedRd: false,
  value1: 'fiabilite_service',
  value2: 'efficience_operationnelle',
  vision: null,
  mission: null,
};

export const FINANCE_DEFAULTS: FinanceValues = {
  opexMad: 0,
  netCreditMad: 0,
  capitalRaisedMad: 0,
  dividendMad: 0,
  cashTransfers: [],
};

export function dasDecisionDefaults(segments: { key: string }[]): DasDecisionValues {
  return {
    genericStrategy: 'domination_couts',
    pricePosition: 50,
    // Au moins un segment : sans marché adressable, il n'y a rien à calculer.
    servedSegments: segments.slice(0, 1).map((s) => s.key),
    capexCapacityMad: 0,
    capexAutomationMad: 0,
    capexOwnNetworkMad: 0,
    rdBudgetMad: 0,
    marketingBudgetMad: 0,
    declareBlueOcean: false,
  };
}
