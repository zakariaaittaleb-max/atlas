/**
 * ATLAS — indicateurs de gestion, par DAS et pour le Groupe.
 *
 * ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 * Le public n'est pas financier. Un écran qui affiche « EBITDA », « BFR » et
 * « OPEX » ne se lit pas : il se subit. Or les notions dont une équipe a
 * réellement besoin pour arbitrer sont peu nombreuses et toutes nommables en
 * français courant :
 *
 *   • ce que rapportent 100 dirhams vendus      → marge bénéficiaire
 *   • ce que coûte l'ensemble                   → total des coûts
 *   • ce que rapporte l'argent immobilisé       → retour sur investissement
 *   • ce qui entre et sort réellement en caisse → flux de trésorerie
 *   • ce qu'on doit, et à quel point c'est lourd→ crédit et taux d'endettement
 *   • à partir de quel volume on gagne          → seuil de rentabilité
 *   • ce que l'emprunt ajoute — ou retire       → effet de levier
 *
 * Le calcul sous-jacent ne change pas : c'est la MÊME comptabilité. Seul le nom
 * change, et avec lui la possibilité de discuter le chiffre en salle.
 *
 * ── L'EFFET DE LEVIER, ET POURQUOI IL MÉRITE SON PROPRE INDICATEUR ─────────
 * C'est la seule notion de la liste qui soit contre-intuitive, et c'est celle
 * qui décide du sort d'une équipe endettée. Emprunter à 6 % pour un actif qui
 * rapporte 10 % enrichit les actionnaires ; le même emprunt sur un actif à 4 %
 * les appauvrit — et d'autant plus vite qu'on a emprunté davantage. Un module
 * qui se contenterait d'afficher la dette ne le montrerait jamais.
 *
 * Module PUR : aucun accès base, aucun aléa.
 */

export interface UnitEconomics {
  revenueMad: number;
  variableCostsMad: number;
  fixedCostsMad: number;
  payrollMad: number;
  marketingMad: number;
  rdMad: number;
  channelCostMad: number;
  /** Amortissements et charges financières imputés à ce périmètre. */
  otherCostsMad: number;
  netIncomeMad: number;
  /** Capitaux immobilisés : outil de production et besoin de financement. */
  capitalEmployedMad: number;
  investmentMad: number;
}

export interface Indicators {
  totalCostsMad: number;
  operatingIncomeMad: number;
  /** Part du chiffre d'affaires qui reste en résultat, en %. */
  profitMarginPct: number;
  /** Ce que rapporte 100 DH immobilisés, en %. */
  roiPct: number;
  /** Combien coûtent 100 DH de chiffre d'affaires, en %. */
  costPerRevenuePct: number;
  cashGeneratedMad: number;
}

export function computeIndicators(u: UnitEconomics): Indicators {
  const totalCostsMad =
    u.variableCostsMad + u.fixedCostsMad + u.payrollMad +
    u.marketingMad + u.rdMad + u.channelCostMad + u.otherCostsMad;

  const operatingIncomeMad = u.revenueMad - totalCostsMad;

  return {
    totalCostsMad,
    operatingIncomeMad,
    profitMarginPct: u.revenueMad > 0 ? (u.netIncomeMad / u.revenueMad) * 100 : 0,
    // Sans capitaux immobilisés, le rendement n'est pas « infini » : il n'est
    // pas défini. Renvoyer zéro plutôt qu'un nombre absurde évite qu'un DAS
    // sans actif ne trône en tête du classement.
    roiPct: u.capitalEmployedMad > 0 ? (u.netIncomeMad / u.capitalEmployedMad) * 100 : 0,
    costPerRevenuePct: u.revenueMad > 0 ? (totalCostsMad / u.revenueMad) * 100 : 0,
    // Ce qui reste réellement en caisse : le résultat, moins ce qu'on a
    // réinvesti. C'est le chiffre qui dit si l'on peut payer les salaires le
    // mois prochain — pas le résultat comptable.
    cashGeneratedMad: u.netIncomeMad - u.investmentMad,
  };
}

// ---------------------------------------------------------------------------
// Seuil de rentabilité
// ---------------------------------------------------------------------------

/**
 * Volume à partir duquel l'activité couvre ses coûts fixes.
 *
 * `null` quand chaque unité vendue perd de l'argent : dans ce cas il n'existe
 * aucun volume qui sauve l'affaire, et vendre davantage aggrave la perte. C'est
 * un diagnostic à part entière, et l'écrire `null` plutôt qu'un très grand
 * nombre force l'écran à le dire au lieu d'afficher un chiffre rassurant.
 */
export function breakEvenUnits(
  unitPriceMad: number,
  unitVariableCostMad: number,
  fixedCostsMad: number,
): number | null {
  const contribution = unitPriceMad - unitVariableCostMad;
  if (contribution <= 0) return null;
  return fixedCostsMad / contribution;
}

// ---------------------------------------------------------------------------
// Endettement et levier
// ---------------------------------------------------------------------------

export interface LeverageView {
  /** Dette rapportée aux capitaux propres, en %. */
  debtRatioPct: number;
  /** Rendement de l'argent des actionnaires, en %. */
  returnOnEquityPct: number;
  /** Rendement de l'outil, indépendamment de son financement, en %. */
  returnOnAssetsPct: number;
  /** Coût moyen de la dette, en %. */
  costOfDebtPct: number;
  /**
   * Points de rendement que l'emprunt AJOUTE aux actionnaires — ou leur retire.
   * Négatif quand l'entreprise emprunte plus cher que ce que l'outil rapporte.
   */
  leverageEffectPts: number;
  favourable: boolean;
}

export function leverageView(
  netIncomeMad: number,
  operatingIncomeMad: number,
  equityMad: number,
  debtMad: number,
  interestMad: number,
): LeverageView {
  const assets = equityMad + debtMad;

  const returnOnEquityPct = equityMad > 0 ? (netIncomeMad / equityMad) * 100 : 0;
  const returnOnAssetsPct = assets > 0 ? (operatingIncomeMad / assets) * 100 : 0;
  const costOfDebtPct = debtMad > 0 ? (interestMad / debtMad) * 100 : 0;

  return {
    debtRatioPct: equityMad > 0 ? (debtMad / equityMad) * 100 : 0,
    returnOnEquityPct,
    returnOnAssetsPct,
    costOfDebtPct,
    // L'écart entre ce que rapporte l'outil et ce que coûte l'argent emprunté,
    // multiplié par le rapport dette/capitaux propres : c'est la formule du
    // levier, et elle dit pourquoi le même emprunt enrichit ou ruine.
    leverageEffectPts:
      equityMad > 0 ? (returnOnAssetsPct - costOfDebtPct) * (debtMad / equityMad) : 0,
    favourable: returnOnAssetsPct > costOfDebtPct,
  };
}

/**
 * La phrase qui accompagne le chiffre.
 *
 * Un indicateur qu'on ne sait pas lire ne sert à rien. Ces phrases sont dans le
 * moteur et non dans l'écran pour qu'elles restent testables — et pour qu'un
 * export Excel dise exactement la même chose que l'interface.
 */
export function readLeverage(view: LeverageView): string {
  if (view.debtRatioPct < 1) {
    return "Vous n'avez pas de dette : vos actionnaires financent tout, et gagnent exactement ce que l'outil rapporte.";
  }
  if (view.favourable) {
    return `Votre outil rapporte plus cher que votre argent ne coûte : l'emprunt ajoute ${view.leverageEffectPts.toFixed(1)} points au rendement de vos actionnaires. Emprunter davantage amplifierait ce gain — et la chute si le rendement passait sous ${view.costOfDebtPct.toFixed(1)} %.`;
  }
  return `Votre outil rapporte moins cher que votre argent ne coûte : l'emprunt retire ${Math.abs(view.leverageEffectPts).toFixed(1)} points à vos actionnaires. Chaque dirham emprunté en plus creuse l'écart.`;
}

export function readProfitMargin(marginPct: number): string {
  if (marginPct < 0) {
    return `Vous perdez ${Math.abs(marginPct).toFixed(1)} DH sur chaque 100 DH vendus. Vendre davantage aggrave la perte tant que la structure de coûts ne change pas.`;
  }
  if (marginPct < 3) {
    return `Il vous reste ${marginPct.toFixed(1)} DH sur 100 DH vendus. La marge est trop mince pour absorber un imprévu.`;
  }
  return `Il vous reste ${marginPct.toFixed(1)} DH sur chaque 100 DH vendus.`;
}
