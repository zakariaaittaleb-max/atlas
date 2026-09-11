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
  STUDY_FIELDS,
  buildStudyDeliverable,
  tierProfile,
  type DisclosureContext,
  type FieldDisclosure,
  type StudyTier,
} from '@/lib/engine/consulting';
import type { SubjectHistoryPoint, SupplierRank } from '@/lib/consulting-types';
import { makeRng, median, seedFrom } from '@/lib/engine/math';
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
  /**
   * L'équipe qui a commandé l'étude. Ses chiffres sont les siens : le cabinet
   * ne les estime pas, il les met en regard — sans bruit et sans marge.
   */
  isSelf?: boolean;
  /** Le même jeu d'indicateurs, sur tous les tours joués. */
  history?: SubjectHistoryPoint[];
  /** Ses fournisseurs par rang de dépendance, sans les volumes. */
  suppliers?: SupplierRank[];
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
    // Le paramètre de session, pas la constante : c'est lui que `discloseField`
    // applique. Les lire à deux endroits différents faisait archiver une marge
    // et en livrer une autre.
    errorMargin: tierProfile(input.tier, input.params).errorMargin,
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
  // Tous les tours joués : c'est la trajectoire du marché, pas sa photo, qui
  // dit s'il faut investir ou se retirer.
  const { data: sizes } = await input.admin
    .from('pool_round_summary').select('round_number, market_size_mad')
    .eq('das_id', input.dasId!).lte('round_number', round);
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

  // La taille du marché est la seule grandeur qui bouge d'un tour à l'autre :
  // élasticité, prix de référence et exposition PESTEL sont des propriétés de
  // filière. Leur courbe sera donc plate — et c'est une information : une
  // filière dont l'exposition ne bouge pas est une filière stable.
  const sizeAt = new Map(
    ((sizes ?? []) as Row[]).map((r) => [num(r.round_number), num(r.market_size_mad)]),
  );
  const playedRounds = [...sizeAt.keys()].sort((a, b) => a - b);

  const valuesAt = (r: number) => ({
    market_size_mad: sizeAt.get(r) ?? num(summary?.market_size_mad, num(das?.base_market_size_mad)),
    // Le moteur stocke une fraction ; le livrable annonce des points.
    growth_rate: growth * 100,
    price_elasticity: num(das?.price_elasticity, 1.5),
    reference_unit_price_mad: num(das?.reference_unit_price_mad),
    next_round_shock_risk: shockRisk,
    ...exposure,
  });

  return {
    subjects: [
      subjectWithHistory(
        'pestel_sectoriel',
        { id: String(input.dasId), name: str(das?.name, 'DAS') },
        playedRounds.length > 0 ? playedRounds : [round],
        round,
        valuesAt,
        context,
        input,
      ),
    ],
    notes: [
      'Données du tour écoulé. Les bornes de croissance sont annuelles.',
      'L’exposition mesure la VOLATILITÉ de la filière sur chaque dimension — combien d’événements peuvent l’y frapper — et non la probabilité qu’un événement précis survienne.',
      'Croisée avec la part relative — étude concurrentielle — la croissance du marché place le domaine sur la matrice BCG.',
    ],
  };
}

/**
 * L'étude concurrentielle — celle qui sert les décisions.
 *
 * Trois partis pris, tous dictés par ce qu'un comité de direction fait
 * réellement d'une étude :
 *
 *   • **L'équipe figure dans son propre tableau, en premier.** Comparer sa
 *     part de marché à celle d'un rival obligeait à ouvrir un autre écran et à
 *     retenir des nombres de tête. Ses chiffres à elle ne sont pas estimés :
 *     ce sont les siens, livrés sans bruit ni marge.
 *
 *   • **Tout indicateur vient avec son HISTORIQUE.** Savoir qu'un concurrent
 *     détient 22 % du marché ne dit pas s'il vient d'en gagner huit ou d'en
 *     perdre douze. La photo ne décide rien, la trajectoire si.
 *
 *   • **Des résultats, jamais des décisions.** On observe ce qu'un concurrent
 *     produit sur le marché — sa part, son prix, son volume, sa couverture.
 *     Ses arbitrages internes restent à deviner, et c'est là tout le jeu. Ses
 *     fournisseurs font exception, mais par RANG seulement : qui le livre
 *     s'observe, combien il lui achète relève du contrat.
 */
async function competitive(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: team } = await input.admin
    .from('teams').select('pool_id, name').eq('id', input.teamId).maybeSingle();
  const { data: rivals } = await input.admin
    .from('teams').select('id, name').eq('pool_id', str(team?.pool_id)).neq('id', input.teamId);

  // L'équipe d'abord : c'est la ligne de référence de tout le tableau.
  const players = [
    { id: input.teamId, name: str(team?.name, 'Vous'), isSelf: true },
    ...(rivals ?? []).map((r) => ({ id: String(r.id), name: String(r.name), isSelf: false })),
  ];
  const ids = players.map((p) => p.id);

  // Tous les tours joués, pas seulement le dernier.
  const { data: allMetrics } = await input.admin
    .from('team_das_round_metrics').select('*')
    .in('team_id', ids)
    .eq('das_id', input.dasId!).lte('round_number', round);

  const rows = (allMetrics ?? []) as Row[];
  const roundsPlayed = [...new Set(rows.map((r) => num(r.round_number)))].sort((a, b) => a - b);
  const at = (teamId: string, r: number) =>
    rows.find((x) => str(x.team_id) === teamId && num(x.round_number) === r);

  const current = rows.filter((r) => num(r.round_number) === round);
  const concentration = herfindahl(current.map((m) => num(m.market_share_pct)));
  const leader = Math.max(...current.map((m) => num(m.market_share_pct)), 0);

  // Barrière à l'entrée et menace des substituts sont des propriétés de
  // FILIÈRE : elles valent pour tous les concurrents, et c'est bien ce qui en
  // fait des forces au sens de Porter plutôt que des traits d'entreprise.
  const { data: unit } = await input.admin
    .from('strategic_units')
    .select('vrio_entry_barrier, substitution_pressure, growth_rate_min, growth_rate_max')
    .eq('id', input.dasId!).maybeSingle();
  const entryBarrier = num(unit?.vrio_entry_barrier) * 100;
  const substitution = num(unit?.substitution_pressure, 40);
  // Projection à stratégie inchangée : le marché croît, les positions tiennent.
  const growth = (num(unit?.growth_rate_min) + num(unit?.growth_rate_max)) / 2;

  // ── Les fournisseurs, par rang ────────────────────────────────────────────
  const { data: contracts } = await input.admin
    .from('procurement_contracts')
    .select('team_id, supplier_id, committed_volume')
    .in('team_id', ids).eq('das_id', input.dasId!).eq('round_number', round);

  const { data: suppliers } = await input.admin
    .from('ecosystem_actors').select('id, name').eq('das_id', input.dasId!);
  const supplierName = new Map((suppliers ?? []).map((a) => [String(a.id), String(a.name)]));

  const mySupplierIds = new Set(
    ((contracts ?? []) as Row[])
      .filter((c) => str(c.team_id) === input.teamId)
      .map((c) => str(c.supplier_id)),
  );

  const ranksFor = (teamId: string): SupplierRank[] =>
    ((contracts ?? []) as Row[])
      .filter((c) => str(c.team_id) === teamId && num(c.committed_volume) > 0)
      .sort((a, b) => num(b.committed_volume) - num(a.committed_volume))
      .map((c, i) => ({
        rank: i + 1,
        name: supplierName.get(str(c.supplier_id)) ?? 'Fournisseur',
        sharedWithYou: teamId !== input.teamId && mySupplierIds.has(str(c.supplier_id)),
      }));

  // ── Le taux de marge médian du pool ──────────────────────────────────────
  const marginOf = (m: Row | undefined) => {
    const revenue = num(m?.revenue_mad);
    return revenue > 0 ? (num(m?.gross_margin_mad) / revenue) * 100 : 0;
  };
  const medianMargin = median(current.map((m) => marginOf(m)));

  /**
   * Les valeurs vraies d'un joueur à un tour donné.
   *
   * Les propriétés de FILIÈRE — concentration du pool, barrière à l'entrée,
   * menace des substituts — ne sont jointes qu'à la ligne de l'équipe. Elles
   * valent pour tout le monde par définition ; les répéter sur chaque
   * concurrent les faisait bruiter séparément, si bien que la même barrière à
   * l'entrée s'affichait à 22 % sur un rival et 30 % sur un autre. Une note
   * affirmait pourtant qu'elles étaient identiques.
   */
  const valuesAt = (teamId: string, r: number, isSelf: boolean): Record<string, number> => {
    const m = at(teamId, r);
    const revenue = num(m?.revenue_mad);
    return {
      ...(isSelf
        ? {
            pool_concentration: concentration,
            entry_barrier: entryBarrier,
            substitution_pressure: substitution,
          }
        : {}),
      competitor_quality: num(m?.perceived_quality, 50),
      competitor_notoriety: num(m?.notoriety, 50),
      competitor_price_position: num(m?.price_position, 50),
      // Stockée en FRACTION (contrainte `between 0 and 1`) : sans ce facteur,
      // une équipe à la moitié du marché s'affichait « 0,5 % ».
      competitor_market_share: num(m?.market_share_pct) * 100,
      competitor_capacity: num(m?.capacity_units),
      volume_sold: num(m?.volume_sold),
      volume_lost: num(m?.volume_lost),
      // Ce qui est sorti de l'atelier. Persisté depuis les stocks ; à défaut,
      // le vendu en tient lieu — on ne peut pas vendre ce qu'on n'a pas fait.
      production_estimate: num(m?.production_units, num(m?.volume_sold)),
      revenue_mad: revenue,
      revenue_forecast_mad: revenue * (1 + growth),
      gross_margin_mad: num(m?.gross_margin_mad),
      margin_pct: marginOf(m),
      pool_median_margin_pct: medianMargin,
      distribution_coverage: num(m?.distribution_coverage) * 100,
      // Rapportée au leader, l'équipe incluse : c'est le leader du marché
      // qui fait la référence, pas le plus fort des autres.
      relative_market_share: leader > 0 ? num(m?.market_share_pct) / leader : 0,
    };
  };

  const subjects: DeliverableSubject[] = players.map((player) => {
    // Ses propres chiffres ne s'estiment pas : le palier ne s'applique qu'aux
    // autres. Un cabinet ne vend pas à une équipe une approximation de ce
    // qu'elle sait déjà.
    const disclose = (r: number) =>
      player.isSelf
        ? exactFields('concurrentielle', valuesAt(player.id, r, true))
        : buildStudyDeliverable(
            'concurrentielle', input.tier, valuesAt(player.id, r, false),
            { ...context(player.id), roundNumber: r }, input.params,
          );

    return {
      subjectId: player.id,
      subjectName: player.isSelf ? `${player.name} (vous)` : player.name,
      isSelf: player.isSelf,
      fields: disclose(round),
      history: roundsPlayed.map((r): SubjectHistoryPoint => ({
        roundNumber: r,
        values: Object.fromEntries(
          disclose(r).map((f) => [f.key, f.mode === 'withheld' ? null : valueOf(f)]),
        ),
      })),
      suppliers: ranksFor(player.id),
    };
  });

  return {
    subjects,
    notes: [
      'Vos propres chiffres sont exacts : le cabinet les met en regard, il ne les estime pas.',
      'Indicateurs des concurrents reconstitués par le cabinet à partir d’observations de marché.',
      'Le chiffre d’affaires prévisionnel projette le tour suivant à stratégie inchangée : il dit qui décroche si personne ne bouge, pas ce qui va arriver.',
      'Les fournisseurs d’un concurrent sont donnés par rang de dépendance. Les volumes qu’il leur achète relèvent du contrat et ne s’observent pas.',
      'Concentration du pool, barrière à l’entrée et menace des substituts caractérisent la filière entière : elles ne sont données qu’une fois, sur votre ligne.',
      'La part relative se lit contre le leader du pool. Croisée avec la croissance du marché — étude PESTEL — elle place le domaine sur la matrice BCG.',
    ],
  };
}


/**
 * Un sujet livré AVEC son historique.
 *
 * Une étude ne valait qu'en photo : elle disait où en était un fournisseur, un
 * segment ou une cible, jamais s'il s'améliorait. Or c'est la trajectoire qui
 * décide — un fournisseur dont la fiabilité s'effrite depuis trois tours ne se
 * traite pas comme un fournisseur qui vient de trébucher.
 *
 * Le bruit reste déterministe ET PROPRE À CHAQUE TOUR : le contexte de
 * divulgation porte le numéro de tour, si bien que relire l'étude au tour 5
 * redonne exactement les chiffres du tour 2. Deux études du même palier
 * achetées à deux tours différents s'emboîtent au lieu de se contredire.
 */
function subjectWithHistory(
  studyKey: string,
  subject: { id: string; name: string; isSelf?: boolean },
  rounds: number[],
  observedRound: number,
  valuesAt: (round: number) => Record<string, number>,
  context: (id: string) => DisclosureContext,
  input: FulfilInput,
): DeliverableSubject {
  const disclose = (round: number) =>
    subject.isSelf
      ? exactFields(studyKey, valuesAt(round))
      : buildStudyDeliverable(
          studyKey, input.tier, valuesAt(round),
          { ...context(subject.id), roundNumber: round }, input.params,
        );

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    ...(subject.isSelf ? { isSelf: true } : {}),
    fields: disclose(observedRound),
    history: rounds.map((round): SubjectHistoryPoint => ({
      roundNumber: round,
      values: Object.fromEntries(
        disclose(round).map((f) => [f.key, f.mode === 'withheld' ? null : valueOf(f)]),
      ),
    })),
  };
}

/** La valeur numérique d'un champ divulgué, quel que soit son régime. */
function valueOf(field: FieldDisclosure): number | null {
  if (field.mode === 'exact' || field.mode === 'estimate') return field.value;
  if (field.mode === 'band') return (field.lower + field.upper) / 2;
  return null;
}

/** Les champs d'une étude livrés sans bruit — le cas de sa propre équipe. */
function exactFields(studyKey: string, values: Record<string, number>): FieldDisclosure[] {
  return (STUDY_FIELDS[studyKey] ?? [])
    .filter((spec) => values[spec.key] !== undefined)
    .map((spec): FieldDisclosure => ({
      mode: 'exact',
      key: spec.key,
      label: spec.label,
      value: values[spec.key],
      unit: spec.unit,
    }));
}

async function panel(
  input: FulfilInput, round: number, context: (id: string) => DisclosureContext,
) {
  const { data: segments } = await input.admin
    .from('market_segments').select('*').eq('das_id', input.dasId!);
  // Tous les tours : ce que le panel mesure sur VOTRE offre bouge d'un tour à
  // l'autre. Les caractéristiques du segment, elles, sont structurelles — leur
  // courbe sera plate, et c'est une information en soi.
  const { data: ownRounds } = await input.admin
    .from('team_das_round_metrics').select('round_number, perceived_quality, notoriety')
    .eq('team_id', input.teamId).eq('das_id', input.dasId!).lte('round_number', round)
    .order('round_number');

  const own = (ownRounds ?? []) as Row[];
  const ownAt = new Map(own.map((r) => [num(r.round_number), r]));
  const playedRounds = own.map((r) => num(r.round_number));

  const subjects: DeliverableSubject[] = (segments ?? []).map((s) => {
    const valuesAt = (r: number) => {
      const mine = ownAt.get(r);
      return {
        perceived_quality: num(mine?.perceived_quality, 50),
        aided_awareness: num(mine?.notoriety, 50),
        price_sensitivity: num(s.price_sensitivity, 1),
        quality_requirement: num(s.quality_requirement),
        segment_growth: (num(s.relative_growth, 1) - 1) * 100,
      };
    };

    return subjectWithHistory(
      'panel_conso',
      { id: String(s.id), name: str(s.name, str(s.segment_key)) },
      playedRounds.length > 0 ? playedRounds : [round],
      round,
      valuesAt,
      context,
      input,
    );
  });

  return {
    subjects,
    notes: [
      'Qualité perçue et notoriété mesurées sur votre propre offre : elles évoluent avec vos décisions.',
      'Sensibilité au prix, exigence de qualité et croissance sont des caractéristiques du segment. Elles ne bougent pas — et c’est précisément pourquoi une offre qui ne leur correspond pas ne s’en sortira pas en attendant.',
    ],
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
    const history = ((actor.ecosystem_actor_rounds ?? []) as Row[])
      .filter((r) => num(r.round_number) <= round)
      .sort((a, b) => num(a.round_number) - num(b.round_number));

    const stateAt = (r: number) =>
      // Le dernier état connu À CETTE DATE : un acteur dont l'écosystème n'a
      // pas été réécrit ce tour garde celui du tour d'avant.
      history.filter((row) => num(row.round_number) <= r).slice(-1)[0] ?? {};

    const valuesAt = (r: number): Record<string, number> => {
      const state = stateAt(r);
      return actorType === 'fournisseur'
        ? {
            price_index: num(state.price_index, 1),
            capacity_units: num(state.capacity_units),
            reliability: num(state.reliability, 70),
            quality_contribution: num(state.quality_contribution, 60),
            switching_cost: num(state.switching_cost),
            financial_health: num(state.financial_health, 70),
          }
        : {
            coverage_pct: num(state.coverage_pct, 0.3) * 100,
            required_margin_pct: num(state.required_margin_pct, 0.2) * 100,
            negotiating_strength: num(state.negotiating_strength, 50),
            service_level: num(state.service_level, 60),
            minimum_volume: num(state.minimum_volume),
          };
    };

    return subjectWithHistory(
      studyKey,
      {
        id: String(actor.id),
        name: `${String(actor.name)}${actor.region_key ? ` — ${String(actor.region_key)}` : ''}`,
      },
      history.map((r) => num(r.round_number)),
      round,
      valuesAt,
      context,
      input,
    );
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
    .select('id, name, das_id, ecosystem_actor_rounds(*)')
    .eq('id', input.targetActorId!).maybeSingle();

  const rounds = ((actor?.ecosystem_actor_rounds ?? []) as Row[])
    .filter((r) => num(r.round_number) <= round)
    .sort((a, b) => num(b.round_number) - num(a.round_number));

  // Passifs non déclarés : d'autant plus lourds que la cible va mal. C'est le
  // signal faible — racheter sans due diligence approfondie, c'est hériter
  // d'une ardoise qu'on ne découvre qu'après.
  //
  // Un tirage par tour : le même passif ne peut pas valoir deux montants dans
  // la même étude, ni changer quand on relit l'étude plus tard.
  const rng2 = (r: number) =>
    makeRng(seedFrom(input.sessionId, String(input.targetActorId), 'liabilities', r))();

  /**
   * La marge d'exploitation de la cible, dérivée de sa SANTÉ FINANCIÈRE.
   *
   * Elle valait 14 % pour toute cible, quelle qu'elle soit. C'était une
   * constante déguisée en information : deux cibles se comparaient sur leur
   * taille et jamais sur leur rentabilité, alors que c'est précisément ce qu'on
   * achète dans une acquisition. L'amplitude — de 4 % pour une entreprise au
   * bord du dépôt de bilan à 22 % pour une affaire saine — reste dans ce qu'on
   * observe en industrie.
   */

  // La part de marché de la cible sur son domaine. Le chiffre d'affaires seul
  // ne dit pas si c'est une position dominante ou résiduelle.
  //
  // Le récapitulatif de pool n'existe qu'APRÈS une résolution : s'y fier seul
  // privait la due diligence de sa part de marché pendant tout l'onboarding,
  // c'est-à-dire précisément quand les équipes préparent leurs acquisitions.
  // On retombe sur la taille de marché de base, écrite au provisionnement.
  const [{ data: summary }, { data: unit }] = await Promise.all([
    input.admin
      .from('pool_round_summary')
      .select('market_size_mad')
      .eq('das_id', String(actor?.das_id ?? ''))
      .eq('round_number', round)
      .maybeSingle(),
    input.admin
      .from('strategic_units')
      .select('base_market_size_mad')
      .eq('id', String(actor?.das_id ?? ''))
      .maybeSingle(),
  ]);
  const marketSize = num(summary?.market_size_mad) || num(unit?.base_market_size_mad);

  // La trajectoire d'une cible vaut son état : une entreprise dont le chiffre
  // d'affaires s'effrite depuis trois tours ne se paie pas le prix d'une
  // entreprise qui vient de trébucher.
  const chronological = [...rounds].sort((a, b) => num(a.round_number) - num(b.round_number));
  const stateAt = (r: number) =>
    chronological.filter((row) => num(row.round_number) <= r).slice(-1)[0] ?? {};

  const valuesAt = (r: number): Record<string, number> => {
    const at = stateAt(r);
    const rev = num(at.revenue_mad);
    const health = num(at.financial_health, 70);
    const margin = 0.04 + 0.18 * (health / 100);
    return {
      revenue_mad: rev,
      ...(marketSize > 0 ? { market_share_pct: (rev / marketSize) * 100 } : {}),
      ebitda_mad: rev * margin,
      margin_pct: margin * 100,
      capacity_units: num(at.capacity_units),
      headcount: Math.round(num(at.capacity_units) / 14_000),
      divest_appetite: num(at.divest_appetite, 30),
      hidden_liabilities_mad:
        rev * (0.05 + 0.25 * (1 - health / 100)) * (0.6 + rng2(r) * 0.8),
    };
  };

  return {
    subjects: [
      subjectWithHistory(
        'due_diligence',
        { id: String(input.targetActorId), name: str(actor?.name, 'Cible') },
        chronological.map((r) => num(r.round_number)),
        round,
        valuesAt,
        context,
        input,
      ),
    ],
    notes: [
      'Les passifs non déclarés ne sont couverts qu’en due diligence approfondie.',
      'La trajectoire vaut l’état : une cible qui s’effrite depuis trois tours ne se paie pas le prix d’une cible qui vient de trébucher.',
    ],
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

  const [{ data: scores }, { data: details }, { data: allScores }] = await Promise.all([
    input.admin.from('alignment_scores').select('*')
      .eq('team_id', input.teamId).eq('round_number', round).maybeSingle(),
    input.admin.from('alignment_axis_details').select('*')
      .eq('team_id', input.teamId).eq('round_number', round)
      .order('penalty_pts', { ascending: false }),
    // La trajectoire de la cohérence : un verdict de « milieu de gué » ne se
    // lit pas pareil selon qu'on y tombe ou qu'on en sort.
    input.admin.from('alignment_scores').select('round_number, sab_global, sac_score, ia_final')
      .eq('team_id', input.teamId).lte('round_number', round).order('round_number'),
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
  // Le seul livrable SANS bruit : le cabinet analyse les données que l'équipe
  // lui a elle-même transmises, il ne peut pas se tromper dessus. Les valeurs
  // sont donc exactes, y compris dans l'historique.
  const chronological = (allScores ?? []) as Row[];
  const scoreAt = new Map(chronological.map((r) => [num(r.round_number), r]));

  const subject: DeliverableSubject = {
    subjectId: input.teamId,
    subjectName: 'Votre alignement',
    isSelf: true,
    fields: exactFields('audit_alignement', {
      sab_global: num(scores.sab_global),
      sac_score: num(scores.sac_score),
      ia_final: num(scores.ia_final),
    }),
    history: chronological.map((r) => ({
      roundNumber: num(r.round_number),
      values: {
        sab_global: num(scoreAt.get(num(r.round_number))?.sab_global),
        sac_score: num(scoreAt.get(num(r.round_number))?.sac_score),
        ia_final: num(scoreAt.get(num(r.round_number))?.ia_final),
      },
    })),
  };

  return {
    subjects: [subject],
    auditRows: rows,
    auditVerdict: verdict,
    notes,
    errorMargin: 0,
  };
}

/** Indice de Herfindahl, ramené sur 0–100 : mesure de concentration du pool. */
function herfindahl(shares: number[]): number {
  return Math.min(shares.reduce((acc, s) => acc + s * s, 0) * 100, 100);
}
