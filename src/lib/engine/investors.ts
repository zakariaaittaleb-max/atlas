/**
 * ATLAS — ce que les investisseurs pensent du Groupe.
 *
 * ── LE PROBLÈME QUE CE MODULE RÈGLE ────────────────────────────────────────
 * Deux décisions de haut de bilan existaient sans contrepartie :
 *   • le DIVIDENDE sortait de la trésorerie et des fonds propres, et c'était
 *     tout. Distribuer n'était qu'une perte : aucune équipe rationnelle ne
 *     l'aurait fait, et le levier « rétention des bénéfices » n'arbitrait rien ;
 *   • la LEVÉE DE FONDS PROPRES coûtait 2 % de frais, quelle que soit la santé
 *     de l'entreprise. Un groupe en perte, surendetté et incohérent levait au
 *     même prix qu'un champion : un robinet presque gratuit.
 *
 * Or ces deux gestes ne parlent pas à la banque, ils parlent aux ACTIONNAIRES.
 * Il manquait donc l'interlocuteur : un indice d'attractivité, recalculé à
 * chaque résolution, qui dit ce que le marché des capitaux pense du Groupe —
 * et qui fixe les conditions auxquelles il accepte de le financer.
 *
 * ── CE QUI LE FORME ────────────────────────────────────────────────────────
 * Cinq composantes, chacune sur 0–100, pondérées (paramètres `investors.*`) :
 *   • RENTABILITÉ — le rendement des capitaux propres, jugé contre le coût des
 *     fonds propres. Un actionnaire compare à ce qu'il gagnerait ailleurs ;
 *   • CROISSANCE — l'évolution du chiffre d'affaires ;
 *   • SOLIDITÉ — l'endettement et l'état de la trésorerie ;
 *   • DISTRIBUTION — la politique de dividende, jugée selon le profil : une
 *     entreprise qui croît vite et rentablement est pardonnée de tout garder,
 *     une entreprise mûre est attendue au guichet. Et une BAISSE du dividende
 *     est un signal que le marché sanctionne, quoi qu'on en pense ;
 *   • COHÉRENCE — l'indice d'alignement : un investisseur finance une histoire
 *     qu'il comprend.
 *
 * Les investisseurs ont de la mémoire : l'indice publié mêle le constat du
 * tour à l'opinion du tour précédent. Une bonne année ne fait pas oublier trois
 * mauvaises.
 *
 * ── CE QU'IL CHANGE, AU TOUR SUIVANT ───────────────────────────────────────
 *   • le COÛT d'une levée : frais d'émission de base, plus une décote qui
 *     grandit quand l'attractivité baisse ;
 *   • son PLAFOND : ce que les investisseurs acceptent de souscrire, en part des
 *     fonds propres ;
 *   • la PRIME DE RISQUE demandée par la banque, qui lit elle aussi le marché.
 *
 * Fonctions pures, sans accès base : le moteur, l'écran de saisie et la route
 * d'écriture appellent LES MÊMES, pour qu'aucun des trois ne mente aux autres.
 */

import { clamp } from './math';
import { param, type EngineParams } from './params';
import type { TreasuryStatus } from './types';

export interface InvestorInput {
  netIncomeMad: number;
  /** Fonds propres d'OUVERTURE : le rendement se mesure sur ce qui était investi. */
  equityOpenMad: number;
  equityEndMad: number;
  revenueMad: number;
  /** `null` au premier exercice : pas de croissance mesurable. */
  previousRevenueMad: number | null;
  debtEndMad: number;
  treasuryStatus: TreasuryStatus;
  /** Indice d'alignement final, 0–100. */
  iaScore: number;
  /** Dividende versé ce tour. */
  dividendMad: number;
  /** Dividende versé au tour précédent : le repère des actionnaires. */
  previousDividendMad: number;
  /** Résultat de l'exercice clos, sur lequel le dividende est voté. */
  distributableIncomeMad: number;
  /** Indice publié au tour précédent. `null` avant la première résolution. */
  previousScore: number | null;
}

export type InvestorComponentKey =
  | 'rentabilite'
  | 'croissance'
  | 'solidite'
  | 'distribution'
  | 'coherence';

export interface InvestorComponent {
  key: InvestorComponentKey;
  label: string;
  /** Poids dans l'indice, 0–1. */
  weight: number;
  /** Note de la composante, 0–100. */
  score: number;
  /** Ce que le marché en retient, en une phrase. */
  reading: string;
}

export interface InvestorView {
  /** Indice publié, mémoire des investisseurs comprise. */
  score: number;
  /** Constat du seul tour, avant mémoire. */
  rawScore: number;
  components: InvestorComponent[];
  /** Dividende rapporté au résultat distribuable. `null` sans résultat à distribuer. */
  payoutRatio: number | null;
  /** Rendement des capitaux propres d'ouverture. `null` sans fonds propres. */
  returnOnEquity: number | null;
  /** Croissance du chiffre d'affaires. `null` au premier exercice. */
  revenueGrowth: number | null;
  /** Dette de clôture rapportée aux fonds propres de clôture. */
  gearing: number | null;
  /** Le dividende a baissé de plus que le seuil toléré. */
  dividendCut: boolean;
}

/**
 * Interpolation linéaire par morceaux.
 *
 * Les seuils se lisent dans le code comme un barème : « à 0 % de rendement,
 * 30 points ; au coût des fonds propres, 70 ». Une sigmoïde aurait la même
 * forme et aucune lisibilité au débriefing.
 */
function piecewise(x: number, points: readonly (readonly [number, number])[]): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function investorAttractiveness(input: InvestorInput, params: EngineParams): InvestorView {
  const costOfEquity = param(params, 'investors.cost_of_equity');
  const matureGrowth = param(params, 'investors.mature_growth_threshold');

  // ── Rentabilité ───────────────────────────────────────────────────────────
  const returnOnEquity = input.equityOpenMad > 0 ? input.netIncomeMad / input.equityOpenMad : null;
  const roeForScore = returnOnEquity ?? (input.netIncomeMad >= 0 ? costOfEquity : -0.2);
  const rentabilite = piecewise(roeForScore, [
    [-0.1, 0], [0, 30], [costOfEquity, 70], [0.25, 100],
  ]);

  // ── Croissance ────────────────────────────────────────────────────────────
  const revenueGrowth =
    input.previousRevenueMad !== null && input.previousRevenueMad > 0
      ? input.revenueMad / input.previousRevenueMad - 1
      : null;
  const croissance = revenueGrowth === null
    ? 50
    : piecewise(revenueGrowth, [[-0.1, 0], [0, 40], [0.15, 100]]);

  // ── Solidité ──────────────────────────────────────────────────────────────
  const gearing = input.equityEndMad > 0 ? Math.max(input.debtEndMad, 0) / input.equityEndMad : null;
  const leverageScore = gearing === null
    ? (input.debtEndMad > 0 ? 0 : 50)
    : piecewise(gearing, [[0, 100], [1, 70], [2, 40], [3, 0]]);
  const solidite =
    input.treasuryStatus === 'liquidation' ? 0
    : input.treasuryStatus === 'restructuration' ? Math.max(leverageScore - 50, 0)
    : input.treasuryStatus === 'surveillance' ? Math.max(leverageScore - 20, 0)
    : leverageScore;

  // ── Distribution ──────────────────────────────────────────────────────────
  const distributable = Math.max(input.distributableIncomeMad, 0);
  const payoutRatio = distributable > 0 ? clamp(input.dividendMad / distributable, 0, 1) : null;
  const dividendCut =
    input.previousDividendMad > 0 &&
    input.dividendMad < input.previousDividendMad * (1 - param(params, 'investors.dividend_cut_tolerance'));
  // Une entreprise qui croît vite ET rentablement est pardonnée de tout
  // réinvestir ; une entreprise mûre est attendue au guichet.
  const growthProfile =
    (revenueGrowth ?? 0) > matureGrowth && (returnOnEquity ?? 0) >= costOfEquity;
  let distribution =
    payoutRatio === null
      ? 60
      : growthProfile
        ? piecewise(payoutRatio, [[0, 100], [0.3, 100], [0.8, 45], [1, 25]])
        : piecewise(payoutRatio, [[0, 45], [0.3, 85], [0.5, 100], [0.7, 85], [1, 50]]);
  if (dividendCut) distribution = Math.max(distribution - param(params, 'investors.dividend_cut_signal'), 0);

  // ── Cohérence ─────────────────────────────────────────────────────────────
  const coherence = clamp(input.iaScore, 0, 100);

  const pct = (v: number | null, digits = 0) =>
    v === null ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')} %`;

  const components: InvestorComponent[] = [
    {
      key: 'rentabilite',
      label: 'Rentabilité',
      weight: param(params, 'investors.weight.rentabilite'),
      score: round1(rentabilite),
      reading:
        returnOnEquity === null ? 'Fonds propres nuls : le rendement ne se mesure pas.'
        : returnOnEquity >= costOfEquity ? `Rendement des capitaux de ${pct(returnOnEquity, 1)}, au-dessus des ${pct(costOfEquity)} attendus.`
        : returnOnEquity >= 0 ? `Rendement des capitaux de ${pct(returnOnEquity, 1)}, sous les ${pct(costOfEquity)} attendus.`
        : `Perte : ${pct(returnOnEquity, 1)} des capitaux propres détruits.`,
    },
    {
      key: 'croissance',
      label: 'Croissance',
      weight: param(params, 'investors.weight.croissance'),
      score: round1(croissance),
      reading:
        revenueGrowth === null ? 'Premier exercice : pas encore de trajectoire.'
        : revenueGrowth >= 0 ? `Chiffre d’affaires en hausse de ${pct(revenueGrowth, 1)}.`
        : `Chiffre d’affaires en recul de ${pct(-revenueGrowth, 1)}.`,
    },
    {
      key: 'solidite',
      label: 'Solidité',
      weight: param(params, 'investors.weight.solidite'),
      score: round1(solidite),
      reading:
        input.treasuryStatus !== 'sain' ? `Trésorerie en ${input.treasuryStatus} : le marché se méfie.`
        : gearing === null ? 'Fonds propres nuls : aucune assise.'
        : `Dette égale à ${gearing.toFixed(2).replace('.', ',')} fois les fonds propres.`,
    },
    {
      key: 'distribution',
      label: 'Politique de dividende',
      weight: param(params, 'investors.weight.distribution'),
      score: round1(distribution),
      reading:
        dividendCut ? 'Dividende en baisse : le marché y lit une inquiétude.'
        : payoutRatio === null ? 'Aucun résultat distribuable : rien n’est attendu.'
        : growthProfile ? `${pct(payoutRatio)} distribués — une entreprise en croissance rentable est attendue au réinvestissement.`
        : `${pct(payoutRatio)} distribués — une entreprise mûre est attendue au guichet.`,
    },
    {
      key: 'coherence',
      label: 'Cohérence stratégique',
      weight: param(params, 'investors.weight.coherence'),
      score: round1(coherence),
      reading: `Indice d’alignement de ${Math.round(coherence)} : un investisseur finance une histoire qu’il comprend.`,
    },
  ];

  const totalWeight = components.reduce((acc, c) => acc + c.weight, 0) || 1;
  const rawScore = clamp(
    components.reduce((acc, c) => acc + c.weight * c.score, 0) / totalWeight,
    0,
    100,
  );
  const memory = param(params, 'investors.memory');
  const score = clamp(
    input.previousScore === null ? rawScore : (1 - memory) * rawScore + memory * input.previousScore,
    0,
    100,
  );

  return {
    score: round1(score),
    rawScore: round1(rawScore),
    components,
    payoutRatio,
    returnOnEquity,
    revenueGrowth,
    gearing,
    dividendCut,
  };
}

export interface EquityIssueTerms {
  /** Frais et décote d'émission, en part du montant levé. */
  costPct: number;
  /** Ce que les investisseurs acceptent de souscrire ce tour. */
  capMad: number;
}

/**
 * Les conditions d'une levée, selon l'attractivité PUBLIÉE au tour précédent.
 *
 * Au-dessus du seuil, seuls les frais d'émission de base s'appliquent. En
 * dessous, une décote s'y ajoute et grandit plus que proportionnellement :
 * lever quand personne ne veut de vous, c'est céder une part de l'entreprise
 * au rabais. Avant la première résolution, aucune opinion n'est formée : frais
 * de base, et un plafond calé sur une attractivité neutre.
 */
export function equityIssueTerms(
  score: number | null,
  equityOpenMad: number,
  params: EngineParams,
): EquityIssueTerms {
  const base = param(params, 'finance.equity_issue_cost_pct');
  const discountMax = param(params, 'investors.issue_discount_max');
  const threshold = param(params, 'investors.issue_discount_threshold');
  const capMin = param(params, 'investors.raise_cap_min_equity_share');
  const capMax = param(params, 'investors.raise_cap_max_equity_share');

  const shortfall = score === null ? 0 : clamp((threshold - score) / threshold, 0, 1);
  const effective = score ?? 50;

  return {
    costPct: base + discountMax * shortfall ** 1.3,
    capMad: Math.max(equityOpenMad, 0) * (capMin + (capMax - capMin) * (clamp(effective, 0, 100) / 100)),
  };
}

/**
 * Ajustement de la prime de risque bancaire, en points de taux.
 *
 * La banque lit le même marché : +`rate_span` pour un groupe dont personne ne
 * veut, −`rate_span` pour un champion, zéro à l'équilibre et sans historique.
 */
export function investorRateAdjustment(score: number | null, params: EngineParams): number {
  if (score === null) return 0;
  return param(params, 'investors.rate_span') * ((50 - clamp(score, 0, 100)) / 50);
}
