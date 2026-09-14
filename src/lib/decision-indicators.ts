/**
 * ATLAS — les indicateurs qui éclairent une décision.
 *
 * Un prix se juge à la part de marché qu'il gagne et à la marge qu'il coûte ;
 * un volume d'achat au stock et aux ventes perdues ; un investissement à
 * l'outil qu'il sature et à la trésorerie qu'il consomme. Chaque bloc de
 * décision a donc SA fiche : quelques chiffres choisis, jamais le cockpit
 * entier recopié.
 *
 * Module pur et client-safe : la route `/api/indicators` l'appelle avec le
 * contexte du cockpit, la fenêtre n'en importe que les types. Les chiffres sont
 * ceux du dernier exercice clos — une décision se prend en regardant d'où l'on
 * part, pas en devinant où l'on arrivera.
 */

import type { DashboardContext, DasPoint, GroupPoint } from '@/lib/dashboard-types';
import { delta, formatMadCompact, formatScore, formatUnits, type Delta } from '@/lib/format';

export const INDICATOR_TOPICS = [
  'das-strategie',
  'das-prix',
  'das-segments',
  'das-investissements',
  'das-ocean-bleu',
  'org-directives',
  'org-rh',
  'org-structure',
  'org-moyens',
  'marches-fournisseurs',
  'marches-distributeurs',
  'finance-decisions',
  'cession-vente',
  'cession-acquisition',
  'war-room',
] as const;

export type IndicatorTopic = (typeof INDICATOR_TOPICS)[number];

type Unit = 'DH' | '%' | 'unites' | 'score';
type Polarity = 'normal' | 'inverted' | 'neutral';

export interface IndicatorCard {
  key: string;
  label: string;
  value: string;
  delta: Delta | null;
  /** Remplace la variation quand il n'y a qu'un exercice à lire. */
  note?: string;
  trend: number[];
  hint: string;
  /** « Groupe » ou « Domaine » : à quel niveau le chiffre se lit. */
  scope: string;
  polarity: Polarity;
}

export interface IndicatorSheet {
  topic: IndicatorTopic;
  /** Pourquoi CES chiffres, en une phrase. */
  question: string;
  /** Dernier exercice clos, `null` avant la première résolution. */
  roundNumber: number | null;
  dasName: string | null;
  cards: IndicatorCard[];
  /** Ce qui manque, dit en clair, quand il n'y a pas (ou pas assez) de chiffres. */
  empty: string | null;
  /** Le verdict du moteur sur l'alignement, quand la fiche porte l'indice. */
  alignment: string | null;
}

type GroupKey = 'treasuryMad' | 'revenueMad' | 'netIncomeMad' | 'marginPct' | 'iaScore' | 'climatSocial';
type DasKey =
  | 'marketSharePct' | 'revenueMad' | 'grossMarginMad' | 'volumeSold' | 'productionUnits'
  | 'volumeLost' | 'inputStockUnits' | 'finishedStockUnits' | 'competitivenessScore'
  | 'perceivedQuality' | 'notoriety' | 'pricePosition' | 'distributionCoverage' | 'utilisationRate';

interface Metric {
  label: string;
  unit: Unit;
  polarity: Polarity;
  hint: string;
}

/** Unités et libellés identiques à ceux du cockpit : un chiffre ne change pas de nom d'un écran à l'autre. */
const GROUP_METRICS: Record<GroupKey, Metric> = {
  treasuryMad: {
    label: 'Trésorerie du Groupe', unit: 'DH', polarity: 'normal',
    hint: 'Ce qui restait en caisse à la clôture. Toute dépense décidée ce tour s’y impute, quel que soit l’écran où elle se décide.',
  },
  revenueMad: {
    label: 'Chiffre d’affaires du Groupe', unit: 'DH', polarity: 'normal',
    hint: 'Tous domaines confondus, au dernier exercice clos.',
  },
  netIncomeMad: {
    label: 'Résultat net', unit: 'DH', polarity: 'normal',
    hint: 'Après charges de siège, intérêts et impôt : ce que l’exercice a réellement rapporté.',
  },
  marginPct: {
    label: 'Taux de marge', unit: '%', polarity: 'normal',
    hint: 'La marge rapportée au chiffre d’affaires. Une croissance qui l’érode se paie aux exercices suivants.',
  },
  iaScore: {
    label: 'Indice d’alignement', unit: 'score', polarity: 'normal',
    hint: 'Sur 100 : à quel point vos décisions servent la stratégie déclarée. Il pèse sur la compétitivité de chaque domaine.',
  },
  climatSocial: {
    label: 'Climat social', unit: 'score', polarity: 'normal',
    hint: 'Sur 100. Sous 60, une part de l’outil cesse de produire et chaque unité produite coûte plus cher.',
  },
};

const DAS_METRICS: Record<DasKey, Metric> = {
  marketSharePct: {
    label: 'Part de marché', unit: '%', polarity: 'normal',
    hint: 'Votre part du marché de ce domaine, entreprises installées comprises.',
  },
  revenueMad: {
    label: 'Chiffre d’affaires du domaine', unit: 'DH', polarity: 'normal',
    hint: 'Ce que ce domaine a vendu au dernier exercice.',
  },
  grossMarginMad: {
    label: 'Marge brute du domaine', unit: 'DH', polarity: 'normal',
    hint: 'Chiffre d’affaires moins le coût des ventes, avant les charges de siège : ce que le domaine apporte pour payer le reste.',
  },
  volumeSold: {
    label: 'Volume vendu', unit: 'unites', polarity: 'normal',
    hint: 'Les unités effectivement vendues.',
  },
  productionUnits: {
    label: 'Production', unit: 'unites', polarity: 'neutral',
    hint: 'Les unités sorties de l’atelier. Au-delà des ventes, le surplus part en stock.',
  },
  volumeLost: {
    label: 'Demande non servie', unit: 'unites', polarity: 'inverted',
    hint: 'Des clients voulaient acheter et n’ont pas été servis — faute de matière, de capacité ou de distribution.',
  },
  inputStockUnits: {
    label: 'Matière en magasin', unit: 'unites', polarity: 'neutral',
    hint: 'Reportée sur l’exercice suivant. Trop peu bride l’atelier ; trop immobilise de la trésorerie.',
  },
  finishedStockUnits: {
    label: 'Produits finis en stock', unit: 'unites', polarity: 'neutral',
    hint: 'Produits mais pas vendus : de la trésorerie immobilisée.',
  },
  competitivenessScore: {
    label: 'Compétitivité', unit: 'score', polarity: 'normal',
    hint: 'Le score qui redistribue le marché : qualité, notoriété, prix et alignement, moins la pression concurrentielle.',
  },
  perceivedQuality: {
    label: 'Qualité perçue', unit: 'score', polarity: 'normal',
    hint: 'Ce que les clients reconnaissent à votre offre. Elle se construit par l’investissement et la R&D, avec un tour de retard.',
  },
  notoriety: {
    label: 'Notoriété', unit: 'score', polarity: 'normal',
    hint: 'Portée par le marketing ; elle s’érode dès qu’on cesse d’investir.',
  },
  pricePosition: {
    label: 'Positionnement prix', unit: 'score', polarity: 'neutral',
    hint: '0 = agressif (60 % du prix marché), 50 = prix marché, 100 = premium (140 %).',
  },
  distributionCoverage: {
    label: 'Couverture de distribution', unit: '%', polarity: 'normal',
    hint: 'La part du marché que vos canaux atteignent. Votre part de marché ne peut pas la dépasser.',
  },
  utilisationRate: {
    label: 'Taux d’utilisation', unit: '%', polarity: 'normal',
    hint: 'La production rapportée à la capacité. Proche de 100 %, un surcroît de demande ne sera pas servi ; bas, l’outil coûte sans produire.',
  },
};

interface SheetSpec {
  question: string;
  /** Chiffres du domaine piloté, lus en premier : ce sont eux que la décision touche. */
  das: DasKey[];
  group: GroupKey[];
  /** Une carte par domaine du portefeuille — pour décider lequel céder. */
  portfolio?: boolean;
}

const SHEETS: Record<IndicatorTopic, SheetSpec> = {
  'das-strategie': {
    question: 'Une stratégie générique se juge à la position qu’elle tient face aux concurrents et à la cohérence qu’elle obtient de vos autres décisions.',
    das: ['competitivenessScore', 'perceivedQuality', 'pricePosition', 'marketSharePct'],
    group: ['iaScore'],
  },
  'das-prix': {
    question: 'Un prix se juge à ce qu’il fait gagner en volume et perdre en marge.',
    das: ['marketSharePct', 'volumeSold', 'grossMarginMad', 'pricePosition', 'competitivenessScore', 'volumeLost'],
    group: [],
  },
  'das-segments': {
    question: 'Servir un segment de plus élargit le marché adressable, au risque de diluer la position acquise.',
    das: ['marketSharePct', 'revenueMad', 'volumeLost', 'distributionCoverage'],
    group: [],
  },
  'das-investissements': {
    question: 'Un investissement se juge à l’outil qu’il sature, à l’image qu’il construit et à la trésorerie qu’il consomme.',
    das: ['utilisationRate', 'perceivedQuality', 'notoriety', 'grossMarginMad'],
    group: ['treasuryMad'],
  },
  'das-ocean-bleu': {
    question: 'Quitter le marché disputé ne se justifie que si la position actuelle s’use, ou ne rapporte plus assez.',
    das: ['marketSharePct', 'competitivenessScore', 'grossMarginMad'],
    group: ['treasuryMad'],
  },
  'org-directives': {
    question: 'Suivre ou non les directives du Groupe se lit dans l’alignement, et dans ce que rapporte ce domaine.',
    das: ['grossMarginMad', 'marketSharePct'],
    group: ['iaScore'],
  },
  'org-rh': {
    question: 'Un effectif se juge à l’outil qu’il fait tourner, au climat qu’il supporte et à la marge qu’il laisse.',
    das: ['productionUnits', 'utilisationRate', 'grossMarginMad'],
    group: ['climatSocial'],
  },
  'org-structure': {
    question: 'Axes, délégation, organigramme et pilotage pèsent sur l’alignement — et donc sur la compétitivité.',
    das: ['competitivenessScore'],
    group: ['iaScore', 'climatSocial'],
  },
  'org-moyens': {
    question: 'Répartir des moyens n’a de sens que rapporté à ce que le domaine génère.',
    das: ['grossMarginMad', 'revenueMad'],
    group: ['treasuryMad'],
  },
  'marches-fournisseurs': {
    question: 'Un volume d’achat se juge à ce que l’atelier a produit et vendu, et à ce qui dort en magasin.',
    das: ['volumeSold', 'productionUnits', 'inputStockUnits', 'finishedStockUnits', 'volumeLost', 'utilisationRate'],
    group: [],
  },
  'marches-distributeurs': {
    question: 'On ne vend pas là où l’on n’est pas distribué : la couverture plafonne la part de marché.',
    das: ['distributionCoverage', 'marketSharePct', 'volumeSold', 'volumeLost'],
    group: [],
  },
  'finance-decisions': {
    question: 'S’endetter, lever des fonds ou distribuer se décide au vu de la caisse et de ce que rapporte l’activité.',
    das: [],
    group: ['treasuryMad', 'netIncomeMad', 'revenueMad', 'marginPct'],
  },
  'cession-vente': {
    question: 'Céder un domaine, c’est renoncer à son chiffre d’affaires et à sa marge pour de la trésorerie et du recentrage.',
    das: [],
    group: ['treasuryMad'],
    portfolio: true,
  },
  'cession-acquisition': {
    question: 'Une offre se chiffre à la mesure de ce que le Groupe peut financer, et de la cohérence qu’il peut garder.',
    das: [],
    group: ['treasuryMad', 'netIncomeMad', 'revenueMad', 'iaScore'],
  },
  'war-room': {
    question: 'Ce qu’un plan de réponse peut coûter se rapporte à la caisse, à l’activité et au climat social.',
    das: [],
    group: ['treasuryMad', 'revenueMad', 'netIncomeMad', 'climatSocial'],
  },
};

const NO_RESULTS =
  'Aucun exercice n’est encore clos : ces chiffres apparaîtront après la première résolution. D’ici là, le dossier initial et les études du cabinet sont vos seules données.';
const NO_DAS_RESULTS =
  'Ce domaine n’a pas encore d’exercice clos : ses propres chiffres apparaîtront après sa première résolution.';
const FIRST_ROUND = 'Premier exercice clos — pas de comparaison';
const NOT_MEASURED = 'Mesuré à partir de la première résolution';

export function buildIndicatorSheet(
  context: DashboardContext,
  topic: IndicatorTopic,
  dasId: string | null,
): IndicatorSheet {
  const spec = SHEETS[topic];
  const das = dasId ? context.das.find((d) => d.dasId === dasId) ?? null : null;

  const sheet: IndicatorSheet = {
    topic,
    question: spec.question,
    roundNumber: context.group.at(-1)?.roundNumber ?? null,
    dasName: das?.name ?? null,
    cards: [],
    empty: null,
    alignment: null,
  };

  if (!context.hasResults || context.group.length === 0) {
    return { ...sheet, roundNumber: null, empty: NO_RESULTS };
  }

  const dasHistory = das?.history ?? [];
  if (spec.das.length > 0 && dasHistory.length === 0) sheet.empty = NO_DAS_RESULTS;

  sheet.cards = [
    ...(dasHistory.length > 0
      ? spec.das.map((key) => metricCard(`domaine:${key}`, DAS_METRICS[key], 'Domaine', series(dasHistory, key)))
      : []),
    ...spec.group.map((key) => metricCard(`groupe:${key}`, GROUP_METRICS[key], 'Groupe', series(context.group, key))),
    ...(spec.portfolio ? portfolioCards(context) : []),
  ];

  if (spec.group.includes('iaScore') && context.alignment.sentence) {
    sheet.alignment = context.alignment.sentence;
  }

  return sheet;
}

/**
 * La trajectoire d'un chiffre, exercice par exercice.
 *
 * Jusqu'au tour 0, seuls le dossier initial et son historique existent :
 * chiffre d'affaires et trésorerie y figurent, mais compétitivité, marge ou
 * positionnement ne sont calculés qu'à la première résolution, et ces lignes
 * portent un zéro. Le lire comme une valeur affichait « Compétitivité 0,0 » —
 * un verdict là où il n'y a pas encore de mesure. Un zéro d'avant la première
 * résolution est donc traité comme une absence.
 */
function series<P extends GroupPoint | DasPoint>(points: P[], key: keyof P): number[] {
  return points
    .filter((point) => !(point.roundNumber <= 0 && Number(point[key]) === 0))
    .map((point) => Number(point[key]))
    .filter((value) => Number.isFinite(value));
}

function metricCard(key: string, metric: Metric, scope: string, values: number[]): IndicatorCard {
  const last = values.at(-1);
  const previous = values.length > 1 ? values.at(-2) : undefined;
  // Une part ou un taux varie en POINTS : « +2 % » sur une part de 20 % se
  // lirait comme 20,4 %.
  const step = (v: number) => (metric.unit === '%' ? `${formatScore(v, 1)} pts` : show(v, metric.unit));

  return {
    key,
    label: metric.label,
    value: last === undefined ? '—' : show(last, metric.unit),
    delta: last !== undefined && previous !== undefined ? delta(last, previous, step) : null,
    note: last === undefined ? NOT_MEASURED : previous === undefined ? FIRST_ROUND : undefined,
    trend: values,
    hint: metric.hint,
    scope,
    polarity: metric.polarity,
  };
}

function portfolioCards(context: DashboardContext): IndicatorCard[] {
  return context.das.map((d) => ({
    key: `portefeuille:${d.dasId}`,
    label: `Poids de ${d.name}`,
    value: `${formatScore(d.revenueShareOfGroup * 100, 1)} %`,
    delta: null,
    note: `Marge brute ${formatMadCompact(d.grossMarginMad)}`,
    trend: series(d.history, 'revenueMad'),
    hint: 'Part du chiffre d’affaires du Groupe au dernier exercice clos, et marge brute du domaine : ce que vous céderiez. La courbe suit son chiffre d’affaires.',
    scope: 'Domaine',
    polarity: 'neutral' as const,
  }));
}

function show(value: number, unit: Unit): string {
  if (unit === 'DH') return formatMadCompact(value);
  if (unit === '%') return `${formatScore(value, 1)} %`;
  if (unit === 'unites') return formatUnits(Math.round(value));
  return formatScore(value, 1);
}
