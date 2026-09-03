/**
 * ATLAS — lecture de gestion, côté écran.
 *
 * Module client-safe : ni `server-only`, ni logique d'accès, pour que la vue et
 * le chargeur serveur s'y réfèrent tous les deux sans franchir la frontière que
 * `boundaries.test.ts` fait respecter.
 */

export interface DasResult {
  dasId: string;
  dasName: string;
  revenueMad: number;
  totalCostsMad: number;
  operatingIncomeMad: number;
  profitMarginPct: number;
  roiPct: number;
  costPerRevenuePct: number;
  cashGeneratedMad: number;
  capitalEmployedMad: number;
  investmentMad: number;
  breakEvenUnits: number | null;
  volumeSold: number;
}

export interface GroupResult {
  revenueMad: number;
  totalCostsMad: number;
  netIncomeMad: number;
  profitMarginPct: number;
  roiPct: number;
  cashGeneratedMad: number;
  /** Ce que l'entreprise doit encore. */
  debtOutstandingMad: number;
  /** Dette rapportée aux capitaux propres, en %. */
  debtRatioPct: number;
  /** Coût moyen de l'argent emprunté, en %. */
  costOfDebtPct: number;
  /** Rendement de l'outil, indépendamment de son financement. */
  returnOnAssetsPct: number;
  /** Rendement pour les actionnaires. */
  returnOnEquityPct: number;
  /** Points que l'emprunt ajoute — ou retire — aux actionnaires. */
  leverageEffectPts: number;
  leverageFavourable: boolean;
  /** La phrase qui explique le levier, écrite par le moteur. */
  leverageNote: string;
  marginNote: string;
  taxPaidMad: number;
  treasuryEndMad: number;
}

export interface ResultsContext {
  /** Tour dont proviennent ces résultats. `null` si aucun n'est encore publié. */
  roundNumber: number | null;
  das: DasResult[];
  group: GroupResult | null;
}

/**
 * L'argent en permanence sous les yeux — barre du haut et jauge de l'écran
 * finance.
 *
 * Déclaré ICI et non dans `server/money-bar.ts` : une vue client ne peut pas
 * importer un module `server-only`, fût-ce pour un simple type. Les imports de
 * type sont effacés au bundling, mais la dépendance reste fragile — le jour où
 * quelqu'un y ajoute un import de valeur, la fuite est silencieuse.
 * `boundaries.test.ts` refuse donc la dépendance, type ou pas.
 */
export interface MoneyBar {
  availableMad: number;
  engagedMad: number;
  payrollMad: number;
  /** Part engagée sur les écrans de DAS — investissements, R&D, marketing. */
  dasEngagedMad: number;
  debtOutstandingMad: number;
  /** Crédit pris ce tour, déjà compté dans le disponible. */
  drawnThisRoundMad: number;
}
