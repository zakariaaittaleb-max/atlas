import 'server-only';

/**
 * ATLAS — exécution d'une mission de conseil.
 *
 * Rassemble les valeurs VRAIES depuis la base, puis les fait passer par
 * `lib/engine/consulting.ts`, qui les bruite selon le palier acheté et retire
 * les signaux faibles des paliers bon marché.
 *
 * Ce module est le seul endroit où les vraies valeurs et le livrable se
 * côtoient. Son résultat est figé dans `consulting_orders.payload` : une équipe
 * doit pouvoir relire au tour 5 ce qu'elle a acheté au tour 2, avec les mêmes
 * chiffres — y compris s'ils étaient faux. C'est la matière du débriefing.
 */

import {
  AUDIT_DEPTH,
  TIER_PROFILES,
  buildStudyDeliverable,
  type DisclosureContext,
  type FieldDisclosure,
  type StudyTier,
} from '@/lib/engine/consulting';
import { makeRng, seedFrom } from '@/lib/engine/math';
import type { EngineParams } from '@/lib/engine/params';

import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/** Un sujet observé : un DAS, un fournisseur, un concurrent… */
export interface DeliverableSubject {
  subjectId: string;
  subjectName: string;
  fields: FieldDisclosure[];
}

export interface Deliverable {
  studyKey: string;
  tier: StudyTier;
  roundNumber: number;
  /** Marge d'erreur annoncée : on vend une estimation en disant qu'elle en est une. */
  errorMargin: number;
  subjects: DeliverableSubject[];
  /** Rapport d'audit d'alignement — sans bruit, seule la profondeur varie. */
  auditRows?: AuditRow[];
  auditVerdict?: string;
  notes: string[];
}

export interface AuditRow {
  level: string;
  axis: string;
  observed: number;
  target: number;
  gap: number;
  weight: number;
  penaltyPts: number;
}

export interface FulfilInput {
  admin: AdminClient;
  params: EngineParams;
  sessionId: string;
  teamId: string;
  roundNumber: number;
  studyKey: string;
  tier: StudyTier;
  dasId: string | null;
  targetActorId: string | null;
}

export async function fulfilStudy(input: FulfilInput): Promise<Deliverable> {
  // Les études portent sur le tour ÉCOULÉ : commander au tour n livre les
  // données du tour n−1, comme un cabinet qui analyse un exercice clos.
  const observedRound = Math.max(input.roundNumber - 1, 0);
  // La marge d'erreur du livrable est celle du palier — SAUF pour l'audit
  // d'alignement, qui n'en a aucune : le cabinet y analyse les données que
  // l'équipe lui a elle-même transmises, il ne peut pas se tromper dessus.
  // Chaque branche peut donc la redéfinir.
  const base = {
    studyKey: input.studyKey,
    tier: input.tier,
    roundNumber: observedRound,
    errorMargin: TIER_PROFILES[input.tier].errorMargin,
    notes: [] as string[],
  };

  const context = (subjectId: string): DisclosureContext => ({
    sessionId: input.sessionId,
    teamId: input.teamId,
    studyKey: input.studyKey,
    roundNumber: observedRound,
    subjectId,
  });

  switch (input.studyKey) {
    case 'pestel_sectoriel':
      return { ...base, ...(await pestel(input, observedRound, context)) };
    case 'concurrentielle':
      return { ...base, ...(await competitive(input, observedRound, context)) };
    case 'panel_conso':
      return { ...base, ...(await panel(input, observedRound, context)) };
    case 'benchmark_fourn':
      return { ...base, ...(await ecosystem(input, observedRound, context, 'fournisseur')) };
    case 'benchmark_distri':
      return { ...base, ...(await ecosystem(input, observedRound, context, 'distributeur')) };
    case 'due_diligence':
      return { ...base, ...(await dueDiligence(input, observedRound, context)) };
    case 'audit_alignement':
      return { ...base, ...(await audit(input, observedRound)) };
    default:
      throw new Error(`Étude inconnue : « ${input.studyKey} »`);
  }
}

// ---------------------------------------------------------------------------

async function pestel(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: das } = await input.admin
    .from('strategic_units').select('*').eq('id', input.dasId!).maybeSingle();
  const { data: summary } = await input.admin
    .from('pool_round_summary').select('market_size_mad')
    .eq('das_id', input.dasId!).eq('round_number', round).maybeSingle();
  const { data: shocks } = await input.admin
    .from('market_shocks').select('id')
    .eq('session_id', input.sessionId).eq('das_id', input.dasId!)
    .gte('round_number', round + 1);

  const growth = (num(das?.growth_rate_min) + num(das?.growth_rate_max)) / 2;
  // Risque de choc : réel, dérivé des chocs déjà programmés par le facilitateur.
  // C'est LE signal faible de cette étude — absent des deux paliers bon marché.
  const shockRisk = Math.min((shocks?.length ?? 0) * 60, 100);

  // ── L'exposition PESTEL, dimension par dimension ─────────────────────────
  //
  // L'étude portait le nom « PESTEL » et livrait cinq indicateurs de marché :
  // ni politique, ni écologique, ni légal. Impossible d'en tirer la grille que
  // son propre nom promettait.
  //
  // Ce qu'on vend ici n'est pas l'événement à venir — cela reste le signal
  // faible ci-dessus — mais l'EXPOSITION STRUCTURELLE de la filière : combien
  // de menaces, dans le catalogue du facilitateur, peuvent la frapper sur
  // chaque dimension. Un consultant sait qu'un secteur est exposé au risque
  // réglementaire sans savoir quel décret tombera au prochain trimestre.
  const sector = str(das?.sector_key);
  const { data: cards } = await input.admin
    .from('shock_cards')
    .select('pestel_dimension, nature, target_sectors')
    .or(`session_id.eq.${input.sessionId},session_id.is.null`);

  const DIMENSIONS = ['politique', 'economique', 'socioculturel',
                      'technologique', 'ecologique', 'legal'] as const;

  const exposure = Object.fromEntries(DIMENSIONS.map((dim) => {
    const relevant = ((cards ?? []) as Row[]).filter((c) => {
      if (str(c.pestel_dimension) !== dim) return false;
      const targets = (c.target_sectors as string[] | null) ?? [];
      // Une carte sans filière cible frappe tout le monde.
      return targets.length === 0 || targets.includes(sector);
    });
    // Une menace expose, une opportunité aussi : les deux rendent la filière
    // VOLATILE sur cette dimension, et c'est ce qu'une grille PESTEL relève.
    // La menace pèse deux fois plus — on se prépare à ce qui peut coûter.
    const weight = relevant.reduce(
      (acc, c) => acc + (str(c.nature) === 'menace' ? 2 : 1), 0);
    return [`exposure_${dim}`, Math.min(weight * 12, 100)];
  }));

  const values = {
    market_size_mad: num(summary?.market_size_mad, num(das?.base_market_size_mad)),
    growth_rate: growth,
    price_elasticity: num(das?.price_elasticity, 1.5),
    reference_unit_price_mad: num(das?.reference_unit_price_mad),
    next_round_shock_risk: shockRisk,
    ...exposure,
  };

  return {
    subjects: [{
      subjectId: String(input.dasId),
      subjectName: str(das?.name, 'DAS'),
      fields: buildStudyDeliverable(
        'pestel_sectoriel', input.tier, values, context(String(input.dasId)), input.params),
    }],
    notes: [
      'Données du tour écoulé. Les bornes de croissance sont annuelles.',
      'L’exposition mesure la VOLATILITÉ de la filière sur chaque dimension — combien d’événements peuvent l’y frapper — et non la probabilité qu’un événement précis survienne.',
      'Croisée avec la part relative — étude concurrentielle — la croissance du marché place le domaine sur la matrice BCG.',
    ],
  };
}

async function competitive(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: team } = await input.admin
    .from('teams').select('pool_id').eq('id', input.teamId).maybeSingle();
  const { data: rivals } = await input.admin
    .from('teams').select('id, name').eq('pool_id', str(team?.pool_id)).neq('id', input.teamId);

  const ids = (rivals ?? []).map((r) => String(r.id));
  const { data: metrics } = await input.admin
    .from('team_das_round_metrics').select('*')
    .in('team_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .eq('das_id', input.dasId!).eq('round_number', round);

  const concentration = herfindahl((metrics ?? []).map((m) => num(m.market_share_pct)));

  // Barrière à l'entrée et menace des substituts sont des propriétés de
  // FILIÈRE : elles valent pour tous les concurrents, et c'est bien ce qui en
  // fait des forces au sens de Porter plutôt que des traits d'entreprise.
  const { data: unit } = await input.admin
    .from('strategic_units').select('vrio_entry_barrier, substitution_pressure')
    .eq('id', input.dasId!).maybeSingle();
  const entryBarrier = num(unit?.vrio_entry_barrier) * 100;
  const substitution = num(unit?.substitution_pressure, 40);

  // Abscisse de la matrice BCG : la part du concurrent RAPPORTÉE au leader du
  // pool. Une part absolue ne dit rien — 20 % fait un poids mort face à un
  // leader à 60 %, et une vache à lait face à un second à 8 %.
  const { data: mine } = await input.admin
    .from('team_das_round_metrics').select('market_share_pct')
    .eq('team_id', input.teamId).eq('das_id', input.dasId!)
    .eq('round_number', round).maybeSingle();
  const allShares = [...(metrics ?? []).map((m) => num(m.market_share_pct)),
                     num(mine?.market_share_pct)];
  const leader = Math.max(...allShares, 0);

  const subjects: DeliverableSubject[] = (rivals ?? []).map((rival) => {
    const m = (metrics ?? []).find((x) => String(x.team_id) === String(rival.id)) as Row | undefined;
    return {
      subjectId: String(rival.id),
      subjectName: String(rival.name),
      fields: buildStudyDeliverable('concurrentielle', input.tier, {
        competitor_quality: num(m?.perceived_quality, 50),
        competitor_notoriety: num(m?.notoriety, 50),
        competitor_price_position: num(m?.price_position, 50),
        competitor_market_share: num(m?.market_share_pct),
        pool_concentration: concentration,
        competitor_capacity: num(m?.capacity_units),
        entry_barrier: entryBarrier,
        substitution_pressure: substitution,
        // Rapportée au leader, l'équipe incluse : c'est le leader du marché
        // qui fait la référence, pas le plus fort des autres.
        relative_market_share: leader > 0 ? num(m?.market_share_pct) / leader : 0,
      }, context(String(rival.id)), input.params),
    };
  });

  return {
    subjects,
    notes: [
      'Indicateurs reconstitués par le cabinet à partir d’observations de marché.',
      'La capacité installée des concurrents n’est couverte qu’en étude approfondie.',
      'Barrière à l’entrée et menace des substituts valent pour la filière entière : elles sont identiques pour chaque concurrent listé.',
      'La part relative se lit contre le leader du pool. Croisée avec la croissance du marché — étude PESTEL — elle place le domaine sur la matrice BCG.',
    ],
  };
}

async function panel(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: segments } = await input.admin
    .from('market_segments').select('*').eq('das_id', input.dasId!);
  const { data: own } = await input.admin
    .from('team_das_round_metrics').select('perceived_quality, notoriety')
    .eq('team_id', input.teamId).eq('das_id', input.dasId!).eq('round_number', round).maybeSingle();

  const subjects: DeliverableSubject[] = (segments ?? []).map((s) => ({
    subjectId: String(s.id),
    subjectName: str(s.name, str(s.segment_key)),
    fields: buildStudyDeliverable('panel_conso', input.tier, {
      perceived_quality: num(own?.perceived_quality, 50),
      aided_awareness: num(own?.notoriety, 50),
      price_sensitivity: num(s.price_sensitivity, 1),
      quality_requirement: num(s.quality_requirement),
      segment_growth: num(s.relative_growth, 1) - 1,
    }, context(String(s.id)), input.params),
  }));

  return {
    subjects,
    notes: ['Qualité perçue et notoriété mesurées sur votre propre offre.'],
  };
}

async function ecosystem(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
  actorType: 'fournisseur' | 'distributeur',
) {
  const studyKey = actorType === 'fournisseur' ? 'benchmark_fourn' : 'benchmark_distri';

  const { data: actors } = await input.admin
    .from('ecosystem_actors')
    .select('id, name, region_key, ecosystem_actor_rounds(*)')
    .eq('session_id', input.sessionId).eq('das_id', input.dasId!).eq('actor_type', actorType);

  const subjects: DeliverableSubject[] = (actors ?? []).map((actor) => {
    const rounds = ((actor.ecosystem_actor_rounds ?? []) as Row[])
      .filter((r) => num(r.round_number) <= round)
      .sort((a, b) => num(b.round_number) - num(a.round_number));
    const state = rounds[0] ?? {};

    const values: Record<string, number> =
      actorType === 'fournisseur'
        ? {
            price_index: num(state.price_index, 1),
            capacity_units: num(state.capacity_units),
            reliability: num(state.reliability, 70),
            quality_contribution: num(state.quality_contribution, 60),
            switching_cost: num(state.switching_cost),
            financial_health: num(state.financial_health, 70),
          }
        : {
            coverage_pct: num(state.coverage_pct, 0.3),
            required_margin_pct: num(state.required_margin_pct, 0.2),
            negotiating_strength: num(state.negotiating_strength, 50),
            service_level: num(state.service_level, 60),
            minimum_volume: num(state.minimum_volume),
          };

    return {
      subjectId: String(actor.id),
      subjectName: `${String(actor.name)}${actor.region_key ? ` — ${String(actor.region_key)}` : ''}`,
      fields: buildStudyDeliverable(studyKey, input.tier, values, context(String(actor.id)), input.params),
    };
  });

  const notes = actorType === 'fournisseur'
    ? [
        'La santé financière d’un fournisseur est le seul indicateur qui anticipe une rupture d’approvisionnement.',
        'Elle n’est couverte qu’en étude approfondie.',
      ]
    : ['Les couvertures régionales se recoupent : leur somme n’est jamais leur union.'];

  return { subjects, notes };
}

async function dueDiligence(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: actor } = await input.admin
    .from('ecosystem_actors')
    .select('id, name, ecosystem_actor_rounds(*)')
    .eq('id', input.targetActorId!).maybeSingle();

  const rounds = ((actor?.ecosystem_actor_rounds ?? []) as Row[])
    .filter((r) => num(r.round_number) <= round)
    .sort((a, b) => num(b.round_number) - num(a.round_number));
  const state = rounds[0] ?? {};

  const revenue = num(state.revenue_mad);
  // Passifs non déclarés : d'autant plus lourds que la cible va mal. C'est le
  // signal faible — racheter sans due diligence approfondie, c'est hériter
  // d'une ardoise qu'on ne découvre qu'après.
  const health = num(state.financial_health, 70);
  const rng = makeRng(seedFrom(input.sessionId, String(input.targetActorId), 'liabilities'));
  const hiddenLiabilities = revenue * (0.05 + 0.25 * (1 - health / 100)) * (0.6 + rng() * 0.8);

  return {
    subjects: [{
      subjectId: String(input.targetActorId),
      subjectName: str(actor?.name, 'Cible'),
      fields: buildStudyDeliverable('due_diligence', input.tier, {
        ebitda_mad: revenue * 0.14,
        revenue_mad: revenue,
        capacity_units: num(state.capacity_units),
        headcount: Math.round(num(state.capacity_units) / 14_000),
        divest_appetite: num(state.divest_appetite, 30),
        hidden_liabilities_mad: hiddenLiabilities,
      }, context(String(input.targetActorId)), input.params),
    }],
    notes: ['Les passifs non déclarés ne sont couverts qu’en due diligence approfondie.'],
  };
}

/**
 * Audit d'alignement — le seul livrable SANS bruit.
 *
 * Le cabinet analyse les données que l'équipe lui a elle-même transmises : il
 * ne peut pas se tromper dessus. Ce que le palier change ici, c'est la
 * PROFONDEUR — combien d'axes sont décomposés, et si la comparaison au pool est
 * fournie.
 */
async function audit(input: FulfilInput, round: number) {
  const depth = AUDIT_DEPTH[input.tier];

  const [{ data: scores }, { data: details }] = await Promise.all([
    input.admin.from('alignment_scores').select('*')
      .eq('team_id', input.teamId).eq('round_number', round).maybeSingle(),
    input.admin.from('alignment_axis_details').select('*')
      .eq('team_id', input.teamId).eq('round_number', round)
      .order('penalty_pts', { ascending: false }),
  ]);

  if (!scores) {
    throw new Error('Aucun tour résolu à auditer : commandez cette étude après une révélation.');
  }

  // Les axes les plus coûteux d'abord : un palier réduit coupe la queue, jamais
  // le diagnostic principal.
  const rows: AuditRow[] = (details ?? []).slice(0, depth.axesDetailed).map((d) => ({
    level: str(d.level),
    axis: str(d.axis_key),
    observed: num(d.observed),
    target: num(d.target),
    gap: num(d.gap),
    weight: num(d.weight),
    penaltyPts: num(d.penalty_pts),
  }));

  const verdict = scores.stuck_in_the_middle
    ? `Diagnostic : MILIEU DE GUÉ. Vos décisions ne correspondent à aucune stratégie cohérente — ni assez bon marché pour gagner sur les coûts, ni assez distinctives pour justifier un premium. Indice d'alignement : ${num(scores.ia_final).toFixed(1)}/100.`
    : scores.strategic_drift
      ? `Diagnostic : DÉRIVE STRATÉGIQUE. Vous déclarez « ${str(scores.drift_declared)} » et vos décisions exécutent « ${str(scores.drift_actual)} ». Re-déclarer au tour prochain efface le malus, sans coût de transition. Indice d'alignement : ${num(scores.ia_final).toFixed(1)}/100.`
      : `Aucune incohérence majeure relevée. Indice d'alignement : ${num(scores.ia_final).toFixed(1)}/100 (business ${num(scores.sab_global).toFixed(1)} · corporate ${num(scores.sac_score).toFixed(1)} · temporel ${num(scores.sat_score).toFixed(1)}).`;

  const notes = [
    'Cet audit ne comporte AUCUNE marge d’erreur : le cabinet analyse les données que vous lui avez transmises.',
    `Ce palier décompose ${depth.axesDetailed} axes.`,
  ];
  if (!depth.quantifiedRecommendations) {
    notes.push('Les recommandations chiffrées sont réservées aux paliers supérieurs.');
  }
  if (!depth.poolComparison) {
    notes.push('La comparaison anonymisée au pool est réservée à l’étude approfondie.');
  }

  // Zéro : c'est ce qui distingue l'audit de toutes les autres missions.
  return { subjects: [], auditRows: rows, auditVerdict: verdict, notes, errorMargin: 0 };
}

/** Indice de Herfindahl, ramené sur 0–100 : mesure de concentration du pool. */
function herfindahl(shares: number[]): number {
  return Math.min(shares.reduce((acc, s) => acc + s * s, 0) * 100, 100);
}
