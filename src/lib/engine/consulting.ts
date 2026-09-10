/**
 * ATLAS — cabinet de conseil : l'information s'achète, et sa précision se paie.
 *
 * Implémente `docs/00-specification.md` §6.
 *
 * Le principe : chaque étude existe en trois paliers. Le palier bon marché
 * livre des estimations bruitées, des bandes au lieu de valeurs, et omet
 * purement et simplement les signaux faibles. Le palier approfondi livre la
 * vérité. Entre les deux, un arbitrage budgétaire à refaire chaque tour.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS QUE L'IMPLÉMENTATION DOIT GARANTIR
 *
 * 1. DÉTERMINISME. Le bruit est dérivé de (session, équipe, étude, tour, champ).
 *    Racheter la même étude au même palier redonne EXACTEMENT les mêmes chiffres.
 *    Sans cela, une équipe achèterait cinq études express et moyennerait
 *    l'erreur — la mécanique s'effondrerait.
 *
 * 2. COHÉRENCE ENTRE PALIERS. Le palier n'entre pas dans la graine : express et
 *    approfondie tirent le même écart normalisé, seule son amplitude change.
 *    L'étude chère est donc un « zoom » sur l'étude bon marché, jamais une
 *    contradiction inexplicable.
 *
 * 3. ERREUR BORNÉE ET ANNONCÉE. `|valeur_rapportée − valeur_vraie| ≤ marge`.
 *    La marge est affichée à l'équipe. On ne triche pas : on vend une
 *    estimation en disant qu'elle en est une.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Note de conception : deux équipes achetant le même palier obtiennent des
 * tirages DIFFÉRENTS (l'identifiant d'équipe entre dans la graine). Elles
 * peuvent donc s'échanger leurs études pour réduire leur incertitude. C'est
 * voulu : la coopération entre concurrents est un comportement stratégique
 * réel, et le débriefing a de quoi en parler.
 */

import { clamp, seedFrom, uniform, makeRng } from './math';
import { paramOr, type EngineParams } from './params';

// ===========================================================================
// Paliers
// ===========================================================================

export const STUDY_TIERS = ['express', 'standard', 'approfondie'] as const;
export type StudyTier = (typeof STUDY_TIERS)[number];

export interface TierProfile {
  /** Multiplicateur appliqué au prix de base de l'étude. */
  priceMultiplier: number;
  /** Marge d'erreur relative annoncée, ±m. */
  errorMargin: number;
  /** Nombre de bandes pour les champs qualitatifs ; `null` = valeur exacte. */
  bandCount: number | null;
  /** Les signaux faibles ne sont livrés qu'au palier approfondi. */
  includesWeakSignals: boolean;
  label: string;
}

/**
 * Les trois paliers de mission.
 *
 * ── POURQUOI CES MARGES-LÀ ─────────────────────────────────────────────────
 * Elles valaient ±25 %, ±10 % et ±3 %. Le palier bon marché n'informait plus :
 * une part de marché annoncée à 25 % pouvait valoir 20 ou 30, ce qui ne
 * départage aucune décision. Une étude qu'on ne peut pas utiliser ne se vend
 * pas, et les trois paliers s'effondraient en un seul.
 *
 * ±10 / ±5 / ±2 correspond à ce qu'annonce une étude de marché réelle : une
 * note de cadrage donne l'ordre de grandeur, une étude commanditée resserre,
 * une mission approfondie avec accès aux données confine à la certitude. Le
 * rapport entre paliers reste assez large pour que monter en gamme se
 * justifie — surtout à 2,2 fois le prix.
 */
export const TIER_PROFILES: Record<StudyTier, TierProfile> = {
  express: {
    priceMultiplier: 0.35,
    errorMargin: 0.1,
    bandCount: 3,
    includesWeakSignals: false,
    label: 'Note express',
  },
  standard: {
    priceMultiplier: 1.0,
    errorMargin: 0.05,
    bandCount: 5,
    includesWeakSignals: false,
    label: 'Étude standard',
  },
  approfondie: {
    priceMultiplier: 2.2,
    errorMargin: 0.02,
    bandCount: null,
    includesWeakSignals: true,
    label: 'Étude approfondie',
  },
};

/**
 * Le palier tel qu'il s'applique VRAIMENT : la valeur de session gagne sur la
 * constante. Exporté parce que la marge inscrite sur une commande doit être
 * celle que le moteur applique — les lire à deux endroits différents faisait
 * archiver « ±5 % » sur une étude livrée à ±10 %.
 */
export function tierProfile(tier: StudyTier, params: EngineParams): TierProfile {
  const base = TIER_PROFILES[tier];
  return {
    ...base,
    priceMultiplier: paramOr(params, `consulting.tier.${tier}.price_multiplier`, base.priceMultiplier),
    errorMargin: paramOr(params, `consulting.tier.${tier}.error_margin`, base.errorMargin),
  };
}

export function studyPrice(basePriceMad: number, tier: StudyTier, params: EngineParams): number {
  return Math.round(basePriceMad * tierProfile(tier, params).priceMultiplier);
}

// ===========================================================================
// Spécification d'un champ livrable
// ===========================================================================

export interface NumericFieldSpec {
  key: string;
  label: string;
  /**
   * `relative` : l'erreur est un pourcentage de la valeur (taille de marché, CA).
   * `absolute` : l'erreur est un pourcentage de `range` (taux de croissance,
   *   indices 0–100 — un taux qui vaut 0,5 % ne peut pas porter d'erreur
   *   relative significative).
   */
  errorMode: 'relative' | 'absolute';
  /** Amplitude de référence, requise en mode `absolute`. */
  range?: number;
  /**
   * Domaine du champ, quand il en a un.
   *
   * Le bruit en mode absolu déplace la valeur de quelques points, sans savoir
   * ce qu'elle représente : une couverture de distribution nulle ressortait à
   * −1,3 %, un indice de qualité pouvait dépasser 100. Le cabinet se trompe,
   * il ne délire pas — une estimation reste dans le domaine du possible.
   */
  min?: number;
  max?: number;
  /** Champ qualitatif : livré en bandes aux paliers bon marché. */
  bandable?: boolean;
  bandMin?: number;
  bandMax?: number;
  /**
   * Signal faible : seul le palier approfondi le livre. C'est ce qui rend le
   * choix du palier réellement stratégique — la note express ne PEUT PAS
   * prévenir qu'un fournisseur s'effondre.
   */
  weakSignal?: boolean;
  unit?: string;
}

// La forme des livrables vit dans `consulting-types.ts`, client-safe : les
// écrans qui affichent une étude ne doivent pas faire entrer le moteur dans
// leur graphe. On la réexporte pour ne rien casser côté serveur.
import type { FieldDisclosure } from '../consulting-types';

export type { FieldDisclosure } from '../consulting-types';

// ===========================================================================
// Bruit
// ===========================================================================

const BAND_LABELS: Record<number, string[]> = {
  3: ['faible', 'moyen', 'élevé'],
  5: ['très faible', 'faible', 'moyen', 'élevé', 'très élevé'],
};

/**
 * Écart normalisé dans [−1, 1], déterministe pour un contexte donné.
 * Le palier n'entre PAS dans la graine — voir propriété 2 en tête de fichier.
 */
export function normalizedError(context: {
  sessionId: string;
  teamId: string;
  studyKey: string;
  roundNumber: number;
  subjectId: string;
  fieldKey: string;
}): number {
  const rng = makeRng(
    seedFrom(
      context.sessionId,
      context.teamId,
      context.studyKey,
      context.roundNumber,
      context.subjectId,
      context.fieldKey,
    ),
  );
  return uniform(rng, -1, 1);
}

/**
 * Applique le bruit d'un palier à une valeur vraie.
 *
 * Garantit `|rapportée − vraie| ≤ marge × référence`, où la référence est la
 * valeur elle-même (mode relatif) ou l'amplitude du champ (mode absolu).
 */
export function perturb(
  trueValue: number,
  spec: NumericFieldSpec,
  errorMargin: number,
  normalized: number,
): number {
  if (errorMargin <= 0) return trueValue;

  if (spec.errorMode === 'absolute') {
    const range = spec.range ?? 100;
    return trueValue + normalized * errorMargin * range;
  }

  return trueValue * (1 + normalized * errorMargin);
}

/** Ramène une estimation dans le domaine du champ, quand il en a un. */
export function clampToDomain(value: number, spec: NumericFieldSpec): number {
  const floored = spec.min === undefined ? value : Math.max(value, spec.min);
  return spec.max === undefined ? floored : Math.min(floored, spec.max);
}

/** Range une valeur dans l'une des bandes du palier. */
export function quantize(
  trueValue: number,
  min: number,
  max: number,
  bandCount: number,
): { band: string; bandIndex: number; lower: number; upper: number } {
  const labels = BAND_LABELS[bandCount] ?? BAND_LABELS[3];
  const span = max - min;
  const width = span / bandCount;

  const rawIndex = span > 0 ? Math.floor((trueValue - min) / width) : 0;
  const bandIndex = clamp(rawIndex, 0, bandCount - 1);

  return {
    band: labels[bandIndex],
    bandIndex,
    lower: min + bandIndex * width,
    upper: min + (bandIndex + 1) * width,
  };
}

// ===========================================================================
// Divulgation d'un champ
// ===========================================================================

export interface DisclosureContext {
  sessionId: string;
  teamId: string;
  studyKey: string;
  roundNumber: number;
  /** Le sujet observé : un DAS, un fournisseur, un concurrent… */
  subjectId: string;
}

export function discloseField(
  trueValue: number,
  spec: NumericFieldSpec,
  tier: StudyTier,
  context: DisclosureContext,
  params: EngineParams,
): FieldDisclosure {
  const profile = tierProfile(tier, params);

  if (spec.weakSignal && !profile.includesWeakSignals) {
    return {
      mode: 'withheld',
      key: spec.key,
      label: spec.label,
      reason: "Non couvert par ce niveau de mission — disponible en étude approfondie.",
    };
  }

  // Champ qualitatif sur un palier à bandes : on livre une appréciation, pas
  // un chiffre. Pas de bruit à ajouter — la bande EST l'imprécision.
  if (spec.bandable && profile.bandCount !== null) {
    const q = quantize(trueValue, spec.bandMin ?? 0, spec.bandMax ?? 100, profile.bandCount);
    return { mode: 'band', key: spec.key, label: spec.label, unit: spec.unit, ...q };
  }

  if (profile.errorMargin <= 0) {
    return { mode: 'exact', key: spec.key, label: spec.label, value: trueValue, unit: spec.unit };
  }

  const normalized = normalizedError({ ...context, fieldKey: spec.key });
  const value = clampToDomain(
    perturb(trueValue, spec, profile.errorMargin, normalized),
    spec,
  );

  // Intervalle annoncé, centré sur l'estimation. Par construction du tirage,
  // il contient toujours la valeur vraie.
  const halfWidth =
    spec.errorMode === 'absolute'
      ? profile.errorMargin * (spec.range ?? 100)
      : Math.abs(trueValue) * profile.errorMargin;

  return {
    mode: 'estimate',
    key: spec.key,
    label: spec.label,
    value,
    errorMargin: profile.errorMargin,
    lower: value - halfWidth,
    upper: value + halfWidth,
    unit: spec.unit,
  };
}

// ===========================================================================
// Catalogue des champs par étude
// ===========================================================================

export const STUDY_FIELDS: Record<string, NumericFieldSpec[]> = {
  pestel_sectoriel: [
    { key: 'market_size_mad', label: 'Taille du marché', errorMode: 'relative', unit: 'DH' },
    { key: 'growth_rate', label: 'Taux de croissance', errorMode: 'absolute', range: 0.25, unit: '%' },
    { key: 'price_elasticity', label: 'Élasticité prix', errorMode: 'relative' },
    { key: 'reference_unit_price_mad', label: 'Prix moyen du marché', errorMode: 'relative', unit: 'DH' },
    // Le choc à venir : réservé au palier approfondi. C'est ce qui distingue
    // une équipe qui anticipe d'une équipe qui subit.
    { key: 'next_round_shock_risk', label: 'Risque de choc au prochain tour', errorMode: 'absolute', range: 100, weakSignal: true, unit: '%' },

    // ── La grille PESTEL, dimension par dimension ──────────────────────────
    //
    // L'étude s'appelait « PESTEL » et livrait cinq indicateurs de marché : ni
    // politique, ni écologique, ni légal. Une équipe ne pouvait pas construire
    // la grille que le nom de l'étude lui promettait.
    //
    // Ce qui est vendu n'est PAS l'événement à venir — cela reste le signal
    // faible ci-dessus — mais l'EXPOSITION STRUCTURELLE de la filière : quelles
    // dimensions la menacent, et avec quelle intensité. C'est exactement ce
    // qu'un consultant sait d'un secteur sans rien savoir du trimestre
    // prochain. L'équipe construit la grille ; le cabinet fournit la matière.
    { key: 'exposure_politique', label: 'Exposition politique', errorMode: 'absolute', range: 100 },
    { key: 'exposure_economique', label: 'Exposition économique', errorMode: 'absolute', range: 100 },
    { key: 'exposure_socioculturel', label: 'Exposition socioculturelle', errorMode: 'absolute', range: 100 },
    { key: 'exposure_technologique', label: 'Exposition technologique', errorMode: 'absolute', range: 100 },
    { key: 'exposure_ecologique', label: 'Exposition écologique', errorMode: 'absolute', range: 100 },
    { key: 'exposure_legal', label: 'Exposition légale et réglementaire', errorMode: 'absolute', range: 100 },
  ],

  /**
   * L'étude qui sert vraiment les décisions.
   *
   * Elle ne livrait que des traits de positionnement — qualité, notoriété,
   * prix — sans jamais dire ce que le concurrent en TIRAIT. Une équipe voyait
   * qu'un rival se positionnait haut de gamme sans savoir s'il y gagnait de
   * l'argent, ni combien il produisait, ni s'il vendait tout ce qu'on lui
   * demandait. Les indicateurs ajoutés ici sont ceux sur lesquels un comité de
   * direction tranche : part, volume, chiffre d'affaires, marge, couverture.
   */
  concurrentielle: [
    { min: 0, max: 100, key: 'competitor_quality', label: 'Qualité perçue', errorMode: 'absolute', range: 100, bandable: true },
    { min: 0, max: 100, key: 'competitor_notoriety', label: 'Notoriété', errorMode: 'absolute', range: 100, bandable: true },
    { min: 0, max: 100, key: 'competitor_price_position', label: 'Positionnement prix', errorMode: 'absolute', range: 100, bandable: true },
    { min: 0, key: 'competitor_market_share', label: 'Part de marché', errorMode: 'relative', unit: '%' },
    { min: 0, max: 100, key: 'pool_concentration', label: 'Concentration du pool', errorMode: 'absolute', range: 100 },
    { min: 0, key: 'competitor_capacity', label: 'Capacité installée', errorMode: 'relative', weakSignal: true },

    // ── Les deux forces de Porter qui manquaient ───────────────────────────
    //
    // Le pouvoir des fournisseurs, celui des distributeurs et la rivalité
    // étaient tous trois achetables. Les DEUX AUTRES ne l'étaient pas :
    //
    //   • la menace des ENTRANTS reposait sur `vrio_entry_barrier`, qui
    //     existait dans le moteur depuis le début et n'était divulgué nulle
    //     part — une donnée calculée, utilisée, et invisible ;
    //   • la menace des SUBSTITUTS n'avait aucune donnée du tout.
    //
    // Avec ces deux-là, la grille des cinq forces devient constructible.
    { min: 0, max: 100, key: 'entry_barrier', label: 'Barrière à l’entrée du métier', errorMode: 'absolute', range: 100 },
    { min: 0, max: 100, key: 'substitution_pressure', label: 'Menace des substituts', errorMode: 'absolute', range: 100 },

    // Abscisse de la matrice BCG. L'ordonnée — la croissance du marché —
    // s'achète avec l'étude PESTEL : construire un BCG demande deux missions,
    // et c'est une leçon de coût de l'information, pas une lacune.
    { min: 0, key: 'volume_sold', label: 'Volume vendu', errorMode: 'relative' },
    { min: 0, key: 'production_estimate', label: 'Production estimée', errorMode: 'relative' },
    { min: 0, key: 'revenue_mad', label: "Chiffre d'affaires", errorMode: 'relative', unit: 'DH' },
    // Projection à stratégie inchangée : où chacun atterrit si personne ne
    // bouge. C'est le chiffre qui dit qui décroche sans rien faire.
    { min: 0, key: 'revenue_forecast_mad', label: "Chiffre d'affaires prévisionnel", errorMode: 'relative', unit: 'DH' },
    { key: 'gross_margin_mad', label: 'Marge brute', errorMode: 'relative', unit: 'DH' },
    // Le taux se compare entre entreprises de tailles différentes ; la médiane
    // du pool dit enfin à quel point cette marge est bonne.
    { key: 'margin_pct', label: 'Taux de marge', errorMode: 'absolute', range: 30, unit: '%' },
    { key: 'pool_median_margin_pct', label: 'Taux de marge médian du pool', errorMode: 'absolute', range: 30, unit: '%' },
    { min: 0, max: 100, key: 'distribution_coverage', label: 'Couverture de distribution', errorMode: 'absolute', range: 100 },
    { min: 0, key: 'volume_lost', label: 'Demande non servie', errorMode: 'relative' },
    { key: 'relative_market_share', label: 'Part de marché relative au leader', errorMode: 'relative' },
  ],

  panel_conso: [
    { key: 'perceived_quality', label: 'Qualité perçue', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'aided_awareness', label: 'Notoriété assistée', errorMode: 'absolute', range: 100 },
    { key: 'price_sensitivity', label: 'Sensibilité prix du segment', errorMode: 'relative' },
    { key: 'quality_requirement', label: 'Exigence de qualité du segment', errorMode: 'absolute', range: 100 },
    { key: 'segment_growth', label: 'Croissance du segment', errorMode: 'absolute', range: 0.25, unit: '%', weakSignal: true },
  ],

  benchmark_fourn: [
    { key: 'price_index', label: 'Indice prix', errorMode: 'relative' },
    { min: 0, key: 'capacity_units', label: 'Capacité', errorMode: 'relative' },
    { key: 'reliability', label: 'Fiabilité', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'quality_contribution', label: 'Contribution qualité', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'switching_cost', label: 'Coût de changement', errorMode: 'absolute', range: 100 },
    // LE signal faible du jeu : la santé financière est ce qui révèle la
    // trajectoire `declin_silencieux`. Une note express ne la livre pas —
    // l'équipe subira la rupture d'approvisionnement sans l'avoir vue venir.
    { key: 'financial_health', label: 'Santé financière', errorMode: 'absolute', range: 100, weakSignal: true },
  ],

  benchmark_distri: [
    { key: 'coverage_pct', label: 'Couverture régionale', errorMode: 'relative', unit: '%' },
    { key: 'required_margin_pct', label: 'Marge exigée', errorMode: 'relative', unit: '%' },
    { key: 'negotiating_strength', label: 'Force de négociation', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'service_level', label: 'Niveau de service', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'minimum_volume', label: 'Volume minimal exigé', errorMode: 'relative' },
  ],

  audit_alignement: [
    // L'audit porte sur les données de l'équipe elle-même : le cabinet ne peut
    // pas se tromper sur ce qu'elle lui a transmis. Aucun bruit, quel que soit
    // le palier — seule la PROFONDEUR de l'analyse varie (cf. §6.1 ci-dessous).
    { key: 'sab_global', label: 'Alignement business', errorMode: 'absolute', range: 100 },
    { key: 'sac_score', label: 'Alignement corporate', errorMode: 'absolute', range: 100 },
    { key: 'ia_final', label: "Indice d'alignement", errorMode: 'absolute', range: 100 },
  ],

  due_diligence: [
    { min: 0, key: 'revenue_mad', label: "Chiffre d'affaires", errorMode: 'relative', unit: 'DH' },
    // La part de marché situe la cible dans son marché, ce que le chiffre
    // d'affaires seul ne fait pas : 400 M DH est une position dominante sur un
    // marché de niche et une part résiduelle sur un marché de masse.
    { min: 0, key: 'market_share_pct', label: 'Part de marché', errorMode: 'relative', unit: '%' },
    { key: 'ebitda_mad', label: 'EBITDA', errorMode: 'relative', unit: 'DH' },
    { key: 'margin_pct', label: "Marge d'exploitation", errorMode: 'absolute', range: 30, unit: '%' },
    { min: 0, key: 'capacity_units', label: 'Capacité installée', errorMode: 'relative' },
    { min: 0, key: 'headcount', label: 'Effectif', errorMode: 'relative' },
    { key: 'divest_appetite', label: 'Appétence à la cession', errorMode: 'absolute', range: 100, bandable: true },
    { key: 'hidden_liabilities_mad', label: 'Passifs non déclarés', errorMode: 'relative', unit: 'DH', weakSignal: true },
  ],
};

/**
 * L'audit d'alignement est le seul livrable sans bruit : le cabinet analyse les
 * données que l'équipe lui a elle-même transmises. Ce que le palier change ici,
 * c'est la PROFONDEUR — combien d'axes sont décomposés, et si les
 * recommandations sont chiffrées.
 */
export const AUDIT_DEPTH: Record<StudyTier, { axesDetailed: number; quantifiedRecommendations: boolean; poolComparison: boolean }> = {
  express: { axesDetailed: 3, quantifiedRecommendations: false, poolComparison: false },
  standard: { axesDetailed: 10, quantifiedRecommendations: true, poolComparison: false },
  approfondie: { axesDetailed: 17, quantifiedRecommendations: true, poolComparison: true },
};

export const STUDY_BASE_PRICES: Record<string, number> = {
  pestel_sectoriel: 150_000,
  concurrentielle: 250_000,
  panel_conso: 200_000,
  benchmark_fourn: 120_000,
  benchmark_distri: 120_000,
  audit_alignement: 180_000,
  due_diligence: 300_000,
};

/**
 * Produit le livrable d'une étude : un ensemble de champs divulgués selon le
 * palier acheté. Le résultat est figé à la commande et archivé — une équipe
 * doit pouvoir relire au tour 5 ce qu'elle a acheté au tour 2, avec les mêmes
 * chiffres, y compris s'ils étaient faux.
 */
export function buildStudyDeliverable(
  studyKey: string,
  tier: StudyTier,
  trueValues: Record<string, number>,
  context: DisclosureContext,
  params: EngineParams,
): FieldDisclosure[] {
  const fields = STUDY_FIELDS[studyKey];
  if (!fields) throw new Error(`Étude inconnue : « ${studyKey} »`);

  return fields
    .filter((spec) => trueValues[spec.key] !== undefined)
    .map((spec) => discloseField(trueValues[spec.key], spec, tier, context, params));
}
