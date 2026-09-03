/**
 * ATLAS — SAG : score d'alignement d'un DAS aux directives du Groupe.
 *
 * ── CE QUE CE MODULE MESURE, ET CE QU'IL NE MESURE PAS ─────────────────────
 *
 * Il ne mesure PAS l'obéissance. Un DAS qui applique une directive inadaptée à
 * son métier gagne du SAG et perd du SAB — sa propre cohérence se dégrade. Un
 * DAS qui s'en écarte fait l'inverse. Les deux sens coûtent, et c'est voulu :
 * la seule façon d'avoir les deux scores hauts est de fixer, au niveau groupe,
 * des directives qui conviennent réellement au portefeuille.
 *
 * C'est l'arbitrage central de la stratégie de groupe, et il n'existe que si
 * les deux étages sont saisis séparément. Une décision unique au niveau groupe
 * le rendait invisible.
 *
 * ── LES QUATRE COMPOSANTES ─────────────────────────────────────────────────
 *
 *   1. rôle          — l'investissement consenti correspond-il au rôle assigné ?
 *   2. mutualisation — le DAS adhère-t-il à ce que le groupe a ouvert, et
 *                      seulement quand la proximité le justifie ?
 *   3. siège         — accepte-t-il les fonctions centralisées, avec la
 *                      tolérance que sa stratégie rend légitime ?
 *   4. identité      — ses axes déclinent-ils les valeurs du groupe ?
 *
 * Module PUR : aucun accès base, aucun aléa.
 */

import { clamp100, mean } from './math';
import type { Affinity } from './organisation';
import type { CompanyValue, GenericStrategy } from './types';

export const PORTFOLIO_ROLES = ['moteur', 'relais', 'soutien', 'reserve'] as const;
export type PortfolioRole = (typeof PORTFOLIO_ROLES)[number];

/**
 * Intensité d'investissement attendue, exprimée en RATIO à la part de chiffre
 * d'affaires du DAS.
 *
 * Un DAS « moteur » qui pèse 30 % du CA doit capter environ 54 % de l'enveloppe
 * d'investissement (30 × 1,8). Une « réserve » qui pèse 30 % ne doit en capter
 * que 4,5 %. Un portefeuille où tout est moteur est un portefeuille qui
 * n'arbitre pas — et le score le dira, puisque les ratios ne peuvent pas tous
 * être tenus simultanément avec une enveloppe finie.
 */
export const ROLE_INVESTMENT_RATIO: Record<PortfolioRole, number> = {
  moteur: 1.8,
  relais: 1.0,
  soutien: 0.5,
  reserve: 0.15,
};

/** Les cinq fonctions que le siège peut piloter. */
export const HQ_FUNCTIONS = ['purchasing', 'it', 'rd', 'hr', 'finance'] as const;
export type HqFunction = (typeof HQ_FUNCTIONS)[number];

/**
 * Tolérance à la divergence, par stratégie du DAS et par fonction — de 0
 * (diverger est une faute pleine) à 1 (diverger est parfaitement légitime).
 *
 * C'est ce tableau qui empêche le SAG d'être une note de conformité. Un DAS de
 * niche différenciée qui garde la main sur sa R&D et son commercial ne fait pas
 * une erreur : il protège ce qui le distingue. Le même DAS qui refuse la
 * centrale d'achat renonce à une économie d'échelle qui ne lui coûtait rien.
 */
export const AUTONOMY_TOLERANCE: Record<GenericStrategy, Record<HqFunction, number>> = {
  domination_couts: { purchasing: 0.05, it: 0.10, rd: 0.25, hr: 0.15, finance: 0.05 },
  focus_couts: { purchasing: 0.15, it: 0.20, rd: 0.30, hr: 0.30, finance: 0.10 },
  differenciation: { purchasing: 0.30, it: 0.35, rd: 0.80, hr: 0.40, finance: 0.10 },
  focus_differenciation: { purchasing: 0.35, it: 0.45, rd: 0.90, hr: 0.55, finance: 0.10 },
};

/**
 * Adhésion attendue à une ressource mutualisée, selon la proximité moyenne des
 * autres DAS qui s'en servent.
 *
 * Mutualiser entre métiers proches produit des économies ; entre métiers
 * étrangers, cela produit surtout de la coordination. La cible n'est donc pas
 * « adhérer à tout » : en dessous de 40 de proximité, la bonne décision est de
 * s'abstenir, et le score doit récompenser l'abstention.
 */
export function expectedAdoption(proximity: number): number {
  return clamp100(-15 + 1.15 * clamp100(proximity));
}

export interface SharedResourceOffer {
  resourceKey: string;
  /** Proximité sectorielle moyenne aux autres DAS utilisateurs, 0–100. */
  proximity: number;
  /** Degré d'adhésion effectif de ce DAS, 0–100. */
  adoptionLevel: number;
}

export interface GroupDirectives {
  /** Fonctions que le groupe déclare piloter au siège. */
  central: Record<HqFunction, boolean>;
  /** Les deux valeurs communiquées par le groupe. */
  values: [CompanyValue, CompanyValue];
}

export interface DasStance {
  portfolioRole: PortfolioRole;
  /** Fonctions que ce DAS délègue effectivement au siège. */
  hq: Record<HqFunction, boolean>;
  /** Stratégie générique déclarée du DAS — elle fonde la tolérance. */
  declaredStrategy: GenericStrategy;
  /** Axes stratégiques du DAS, du plus prioritaire au moins prioritaire. */
  axes: { key: string; priority: number; affinity: Affinity }[];
  /** Part de l'enveloppe d'investissement du groupe captée par ce DAS, 0–1. */
  investmentShare: number;
  /** Part du chiffre d'affaires du groupe réalisée par ce DAS, 0–1. */
  revenueShare: number;
  /** Ressources que le groupe a ouvertes à ce DAS. */
  offers: SharedResourceOffer[];
}

// ---------------------------------------------------------------------------
// 1. Rôle dans le portefeuille
// ---------------------------------------------------------------------------

/**
 * Écart entre l'investissement consenti et celui qu'appelle le rôle assigné.
 *
 * L'écart est mesuré en LOGARITHME du ratio, parce qu'un ratio est
 * multiplicatif : investir moitié moins que prévu et deux fois plus sont deux
 * fautes symétriques. Une différence arithmétique aurait puni le sur-
 * investissement bien plus que la famine, sans raison.
 */
export function roleFit(stance: DasStance): number {
  const target = ROLE_INVESTMENT_RATIO[stance.portfolioRole];

  // Un DAS sans chiffre d'affaires n'a pas de part de référence : on ne peut
  // rien conclure de son intensité, et inventer un score serait mentir.
  if (stance.revenueShare <= 0) return 50;

  const observed = stance.investmentShare / stance.revenueShare;

  // Le plancher évite un logarithme infini quand un DAS n'investit rien : ne
  // rien investir dans un moteur est une faute lourde, pas une faute infinie.
  const ratio = Math.max(observed, 0.02) / target;
  const distance = Math.abs(Math.log(ratio));

  // ln(2) ≈ 0,69 : investir du simple au double coûte 30 points.
  return clamp100(100 - distance * 43);
}

// ---------------------------------------------------------------------------
// 2. Mutualisation
// ---------------------------------------------------------------------------

/**
 * Adhésion aux ressources ouvertes par le groupe, jugée à l'aune de la proximité.
 *
 * Un DAS auquel le groupe n'a rien ouvert n'a rien à décider : il obtient 100.
 * Le lui reprocher reviendrait à sanctionner une unité pour une inaction du
 * siège — et l'inaction du siège est déjà mesurée par le SAC.
 */
export function mutualisationFit(offers: SharedResourceOffer[]): number {
  if (offers.length === 0) return 100;

  return clamp100(
    mean(
      offers.map((o) =>
        100 - Math.abs(clamp100(o.adoptionLevel) - expectedAdoption(o.proximity)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// 3. Fonctions pilotées au siège
// ---------------------------------------------------------------------------

/**
 * Accord entre ce que le groupe centralise et ce que le DAS délègue.
 *
 * Deux divergences distinctes, punies différemment :
 *   • le groupe centralise, le DAS refuse → l'économie d'échelle est perdue ;
 *     la tolérance de la stratégie du DAS s'applique.
 *   • le groupe ne centralise pas, le DAS délègue quand même → le siège
 *     assume une charge qu'il n'a pas prévue ; toujours une faute, mais moitié
 *     moindre : c'est un excès de zèle, pas une désertion.
 */
export function hqFit(directives: GroupDirectives, stance: DasStance): number {
  const penalties = HQ_FUNCTIONS.map((fn) => {
    const central = directives.central[fn];
    const delegated = stance.hq[fn];
    if (central === delegated) return 0;

    if (central && !delegated) {
      const tolerance = AUTONOMY_TOLERANCE[stance.declaredStrategy][fn];
      return 100 * (1 - tolerance);
    }
    return 50;
  });

  return clamp100(100 - mean(penalties));
}

// ---------------------------------------------------------------------------
// 4. Identité
// ---------------------------------------------------------------------------

/**
 * Profil stratégique implicite des valeurs du groupe, ramené sur 0–100.
 *
 * `VALUE_AFFINITY` code −1 / 0 / +1 ; on en fait une moyenne par stratégie puis
 * on la déplie sur l'échelle des affinités de catalogue, pour que les deux
 * profils soient comparables terme à terme.
 */
export function valuesProfile(
  values: [CompanyValue, CompanyValue],
  valueAffinity: Record<CompanyValue, Record<GenericStrategy, number>>,
): Affinity {
  const strategies: GenericStrategy[] = [
    'domination_couts', 'differenciation', 'focus_couts', 'focus_differenciation',
  ];

  const profile = {} as Affinity;
  for (const s of strategies) {
    const raw = mean(values.map((v) => valueAffinity[v]?.[s] ?? 0));
    profile[s] = clamp100(50 + raw * 50);
  }
  return profile;
}

/**
 * Profil stratégique implicite des axes du DAS.
 *
 * Pondéré 3/2/1 par rang, comme dans `strategicAxisFit` : déclarer trois
 * priorités n'est un arbitrage que si la première pèse davantage.
 */
export function axesProfile(axes: DasStance['axes']): Affinity | null {
  if (axes.length === 0) return null;

  const sorted = [...axes].sort((a, b) => a.priority - b.priority);
  const weights = [3, 2, 1];
  const total = sorted.reduce((acc, _, i) => acc + (weights[i] ?? 1), 0);

  const strategies: GenericStrategy[] = [
    'domination_couts', 'differenciation', 'focus_couts', 'focus_differenciation',
  ];

  const profile = {} as Affinity;
  for (const s of strategies) {
    profile[s] =
      sorted.reduce((acc, a, i) => acc + (weights[i] ?? 1) * (a.affinity[s] ?? 50), 0) / total;
  }
  return profile;
}

/**
 * Distance entre l'identité déclarée par le groupe et sa déclinaison par le DAS.
 *
 * Un DAS sans axe renseigné obtient 50 : on ne sait pas s'il décline ou s'il
 * s'écarte. Le sanctionner à zéro confondrait le silence et la contradiction.
 */
export function identityFit(
  directives: GroupDirectives,
  stance: DasStance,
  valueAffinity: Record<CompanyValue, Record<GenericStrategy, number>>,
): number {
  const das = axesProfile(stance.axes);
  if (!das) return 50;

  const group = valuesProfile(directives.values, valueAffinity);
  const strategies = Object.keys(group) as GenericStrategy[];

  return clamp100(100 - mean(strategies.map((s) => Math.abs(group[s] - das[s]))));
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

/**
 * Poids des quatre composantes.
 *
 * Le rôle pèse le plus : c'est l'arbitrage d'allocation, celui que le groupe
 * fait vraiment. L'identité pèse le moins — non qu'elle importe peu, mais
 * parce qu'elle est la plus déclarative, et qu'on ne veut pas qu'un score se
 * gagne en écrivant.
 */
export const SAG_WEIGHTS = {
  role: 0.32,
  mutualisation: 0.26,
  hq: 0.26,
  identity: 0.16,
} as const;

export interface GroupAlignmentResult {
  sag: number;
  roleFit: number;
  mutualisationFit: number;
  hqFit: number;
  identityFit: number;
  /** La phrase du débriefing : dans quel sens ça diverge, et pourquoi. */
  divergenceNote: string;
}

export function scoreGroupAlignment(
  directives: GroupDirectives,
  stance: DasStance,
  valueAffinity: Record<CompanyValue, Record<GenericStrategy, number>>,
): GroupAlignmentResult {
  const role = roleFit(stance);
  const mutual = mutualisationFit(stance.offers);
  const hq = hqFit(directives, stance);
  const identity = identityFit(directives, stance, valueAffinity);

  const sag = clamp100(
    SAG_WEIGHTS.role * role +
      SAG_WEIGHTS.mutualisation * mutual +
      SAG_WEIGHTS.hq * hq +
      SAG_WEIGHTS.identity * identity,
  );

  return {
    sag,
    roleFit: role,
    mutualisationFit: mutual,
    hqFit: hq,
    identityFit: identity,
    divergenceNote: explain(directives, stance, { role, mutual, hq, identity }),
  };
}

/**
 * Nomme la divergence la plus coûteuse, en points de SAG perdus.
 *
 * On classe par points RÉELLEMENT perdus (écart × poids), et non par score
 * brut : une composante à 60 qui pèse 0,32 coûte davantage qu'une composante à
 * 40 qui pèse 0,16, et c'est celle-là qu'il faut traiter d'abord.
 */
function explain(
  directives: GroupDirectives,
  stance: DasStance,
  scores: { role: number; mutual: number; hq: number; identity: number },
): string {
  const worst = [
    { key: 'role', lost: (100 - scores.role) * SAG_WEIGHTS.role },
    { key: 'mutual', lost: (100 - scores.mutual) * SAG_WEIGHTS.mutualisation },
    { key: 'hq', lost: (100 - scores.hq) * SAG_WEIGHTS.hq },
    { key: 'identity', lost: (100 - scores.identity) * SAG_WEIGHTS.identity },
  ].sort((a, b) => b.lost - a.lost)[0];

  if (worst.lost < 3) {
    return 'Ce DAS décline fidèlement les directives du groupe.';
  }

  switch (worst.key) {
    case 'role': {
      const target = ROLE_INVESTMENT_RATIO[stance.portfolioRole];
      const observed =
        stance.revenueShare > 0 ? stance.investmentShare / stance.revenueShare : 0;
      return observed < target
        ? `Ce DAS est déclaré « ${stance.portfolioRole} » mais reçoit moins d'investissement que son rôle ne l'exige : le rôle est affiché, pas financé.`
        : `Ce DAS est déclaré « ${stance.portfolioRole} » mais capte plus d'investissement que son rôle ne le justifie, au détriment du reste du portefeuille.`;
    }
    case 'mutual': {
      const trop = stance.offers.filter(
        (o) => o.adoptionLevel > expectedAdoption(o.proximity) + 20,
      );
      return trop.length > 0
        ? "Ce DAS adhère à des ressources mutualisées avec des métiers trop éloignés : il en paie la coordination sans en tirer d'économie."
        : "Le groupe a ouvert des ressources que ce DAS n'utilise pas : la plateforme est payée, la synergie ne vient pas.";
    }
    case 'hq': {
      const refus = HQ_FUNCTIONS.filter((fn) => directives.central[fn] && !stance.hq[fn]);
      return refus.length > 0
        ? `Ce DAS garde la main sur des fonctions que le groupe a centralisées (${refus.join(', ')}) : l'économie d'échelle annoncée n'existe pas.`
        : "Ce DAS délègue au siège des fonctions que le groupe n'a pas centralisées : la charge arrive sans que personne l'ait budgétée.";
    }
    default:
      return "Les axes stratégiques de ce DAS ne déclinent pas les valeurs affichées par le groupe : l'identité est proclamée en haut et contredite en bas.";
  }
}
