import 'server-only';

/**
 * ATLAS — tout ce que le tableau de bord montre.
 *
 * Assemblé avec le client ANONYME, donc soumis à la RLS : cette page ne peut
 * structurellement pas afficher les données d'une autre équipe, même si le code
 * en faisait la demande. Les chiffres des concurrents n'arrivent ici que par
 * les études achetées, dont le livrable est archivé sur la commande.
 *
 * ── TOUT EST EN SÉRIE ──────────────────────────────────────────────────────
 * Le dashboard comparait deux tours et montrait six nombres. Savoir que sa marge
 * vaut 12 % ne dit pas si l'on vient de la doubler ou de la diviser par deux ;
 * c'est pourtant la seule question qui change une décision. Chaque indicateur
 * est donc chargé sur TOUS les tours résolus.
 */

import { getRoundState, requireTeam } from '@/lib/dal';
import type {
  AlignmentVerdict, CabinetOverlay, DasPoint, DasSeries, DashboardContext, GroupPoint,
} from '@/lib/dashboard-types';
import { createServerClient } from '@/lib/supabase/server';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export async function loadDashboardContext(): Promise<DashboardContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;

  const supabase = await createServerClient();

  const [
    { data: pnls }, { data: states }, { data: alignments }, { data: scorecards },
    { data: units }, { data: metrics }, { data: dasRows }, { data: orders },
    { data: axes }, { data: actors },
  ] = await Promise.all([
    supabase.from('pnl_statements').select('*').eq('team_id', team.teamId).order('round_number'),
    supabase.from('team_round_state').select('*').eq('team_id', team.teamId).order('round_number'),
    supabase.from('alignment_scores').select('*').eq('team_id', team.teamId).order('round_number'),
    supabase.from('balanced_scorecards').select('*').eq('team_id', team.teamId).order('round_number'),
    supabase.from('team_units')
      .select('das_id, strategic_units(id, name)')
      .eq('team_id', team.teamId).in('status', ['active', 'listed_for_sale']),
    supabase.from('team_das_round_metrics').select('*')
      .eq('team_id', team.teamId).order('round_number'),
    supabase.from('strategic_units')
      .select('id, vrio_entry_barrier, substitution_pressure'),
    // Les études achetées, avec leur livrable figé. C'est la seule voie par
    // laquelle un chiffre concurrent entre sur cet écran.
    supabase.from('consulting_orders')
      .select('study_key, tier, error_margin, round_number, das_id, payload')
      .eq('team_id', team.teamId).order('round_number', { ascending: false }),
    supabase.from('alignment_axis_details').select('*')
      .eq('team_id', team.teamId).eq('round_number', roundNumber - 1),
    // Le pouvoir de l'amont et de l'aval : deux des cinq forces. L'identité
    // suffit ici, les chiffres de ces acteurs restent au cabinet.
    supabase.from('ecosystem_actors').select('das_id, actor_type, owner_team_id'),
  ]);

  // ── Le Groupe, tour par tour ───────────────────────────────────────────────
  const bscByRound = new Map(
    ((scorecards ?? []) as Row[]).map((b) => [num(b.round_number), b]),
  );
  const stateByRound = new Map(
    ((states ?? []) as Row[]).map((s) => [num(s.round_number), s]),
  );
  const alignByRound = new Map(
    ((alignments ?? []) as Row[]).map((a) => [num(a.round_number), a]),
  );

  const group: GroupPoint[] = ((pnls ?? []) as Row[]).map((p) => {
    const r = num(p.round_number);
    const state = stateByRound.get(r);
    const bsc = bscByRound.get(r);
    const revenue = num(p.revenue_mad);
    return {
      roundNumber: r,
      treasuryMad: num(p.treasury_end_mad),
      revenueMad: revenue,
      netIncomeMad: num(p.net_income_mad),
      grossMarginMad: num(p.gross_margin_mad),
      marginPct: revenue > 0 ? (num(p.gross_margin_mad) / revenue) * 100 : 0,
      climatSocial: num(state?.climat_social),
      iaScore: num(state?.ia_score),
      bsc: bsc
        ? {
            financial: num(bsc.financial_score),
            client: num(bsc.client_score),
            process: num(bsc.process_score),
            learning: num(bsc.learning_score),
            global: num(bsc.global_score),
          }
        : null,
    };
  });

  // ── Les domaines, tour par tour ────────────────────────────────────────────
  const rows = (metrics ?? []) as Row[];
  const lastRound = Math.max(...rows.map((m) => num(m.round_number)), -1);
  const lastRows = rows.filter((m) => num(m.round_number) === lastRound);
  const groupRevenue = lastRows.reduce((acc, m) => acc + num(m.revenue_mad), 0);

  const dasMeta = new Map(((dasRows ?? []) as Row[]).map((d) => [str(d.id), d]));
  const actorRows = (actors ?? []) as Row[];

  const studies = (orders ?? []) as Row[];
  const competitive = studies.find((o) => str(o.study_key) === 'concurrentielle');
  const pestel = studies.find((o) => str(o.study_key) === 'pestel_sectoriel');

  const das: DasSeries[] = (units ?? []).map((u) => {
    const unit = u.strategic_units as unknown as { id: string; name: string } | null;
    const dasId = str(u.das_id);
    const mine = rows.filter((m) => str(m.das_id) === dasId);
    const last = mine.find((m) => num(m.round_number) === lastRound);
    const meta = dasMeta.get(dasId);
    const mySuppliers = actorRows.filter(
      (a) => str(a.das_id) === dasId && str(a.actor_type) === 'fournisseur',
    );
    const myDistributors = actorRows.filter(
      (a) => str(a.das_id) === dasId && str(a.actor_type) === 'distributeur',
    );

    return {
      dasId,
      name: unit?.name ?? 'Domaine',
      revenueShareOfGroup: groupRevenue > 0 ? num(last?.revenue_mad) / groupRevenue : 0,
      grossMarginMad: num(last?.gross_margin_mad),
      history: mine.map((m): DasPoint => ({
        roundNumber: num(m.round_number),
        marketSharePct: num(m.market_share_pct) * 100,
        revenueMad: num(m.revenue_mad),
        grossMarginMad: num(m.gross_margin_mad),
        volumeSold: num(m.volume_sold),
        volumeLost: num(m.volume_lost),
        productionUnits: num(m.production_units, num(m.volume_sold)),
        competitivenessScore: num(m.competitiveness_score),
        perceivedQuality: num(m.perceived_quality),
        notoriety: num(m.notoriety),
        pricePosition: num(m.price_position),
        distributionCoverage: num(m.distribution_coverage) * 100,
        utilisationRate: num(m.utilisation_rate) * 100,
        inputStockUnits: num(m.input_stock_units),
        finishedStockUnits: num(m.finished_stock_units),
      })),
      forces: {
        entryBarrier: num(meta?.vrio_entry_barrier) * 100,
        substitution: num(meta?.substitution_pressure, 40),
        // Moins il y a d'alternatives, plus le maillon pèse. Un fournisseur
        // déjà racheté par une équipe ne compte plus comme alternative libre.
        supplierPower: concentrationPower(
          mySuppliers.filter((a) => a.owner_team_id === null).length,
        ),
        distributorPower: concentrationPower(
          myDistributors.filter((a) => a.owner_team_id === null).length,
        ),
        rivalry: num(last?.competitive_pressure, 50),
      },
      // Les deux axes de la BCG ne s'obtiennent qu'en payant : la croissance
      // par l'étude PESTEL, la part relative par l'étude concurrentielle. Le
      // code le voulait ainsi, et l'écran doit le dire plutôt que d'inventer.
      marketGrowth: pestel ? fieldValue(pestel, 'growth_rate') : null,
      relativeShare: competitive ? fieldValue(competitive, 'relative_market_share') : null,
    };
  });

  return {
    teamName: team.teamName,
    roundNumber,
    hasResults: group.length > 0,
    resolvedRounds: group.filter((p) => p.roundNumber >= 1).length,
    treasuryStatus: str(stateByRound.get(lastRound)?.treasury_status, 'sain'),
    group,
    das,
    alignment: verdictOf(alignByRound, lastRound, (axes ?? []) as Row[]),
    cabinet: studies.map((o): CabinetOverlay => ({
      studyKey: str(o.study_key),
      tier: str(o.tier),
      errorMargin: num(o.error_margin),
      roundNumber: num(o.round_number),
      dasId: o.das_id ? str(o.das_id) : null,
      subjects: ((o.payload as { subjects?: CabinetOverlay['subjects'] } | null)?.subjects ?? []),
    })),
  };
}

/**
 * Le pouvoir d'un maillon, déduit du nombre d'alternatives.
 *
 * Ce n'est pas un chiffre du moteur : c'est la lecture de Porter appliquée à ce
 * que l'équipe peut observer sans rien acheter — combien de fournisseurs
 * indépendants existent sur son domaine. Un seul restant, et c'est lui qui
 * fixe le prix.
 */
function concentrationPower(alternatives: number): number {
  if (alternatives <= 0) return 100;
  return Math.max(100 - (alternatives - 1) * 18, 20);
}

/** La valeur d'un champ dans un livrable archivé, sur le sujet de l'équipe. */
function fieldValue(order: Row, key: string): number | null {
  const payload = order.payload as {
    subjects?: { isSelf?: boolean; fields?: { key: string; mode: string; value?: number }[] }[];
  } | null;
  const subjects = payload?.subjects ?? [];
  const subject = subjects.find((s) => s.isSelf) ?? subjects[0];
  const field = subject?.fields?.find((f) => f.key === key);
  if (!field || field.mode === 'withheld') return null;
  return field.value ?? null;
}

/**
 * L'alignement, mis en mots.
 *
 * Un score de 62 sur 100 ne dit rien à une équipe : ni ce qu'il vaut, ni d'où
 * il vient, ni s'il s'améliore. La phrase nomme le SENS de l'évolution et
 * l'incohérence la plus coûteuse — celle sur laquelle agir en premier.
 */
function verdictOf(
  byRound: Map<number, Row>,
  lastRound: number,
  axes: Row[],
): AlignmentVerdict {
  const current = byRound.get(lastRound);
  const previous = byRound.get(lastRound - 1);

  if (!current) {
    return {
      score: null, trend: null, stuckInTheMiddle: false, drift: false, worstAxes: [],
      sentence:
        'Votre alignement sera diagnostiqué après la résolution du premier tour.',
    };
  }

  const score = num(current.ia_final);
  const trend = previous ? score - num(previous.ia_final) : null;
  const stuck = Boolean(current.stuck_in_the_middle);
  const drift = Boolean(current.strategic_drift);

  const worstAxes = axes
    .filter((a) => num(a.penalty_pts) > 0)
    .sort((a, b) => num(b.penalty_pts) - num(a.penalty_pts))
    .slice(0, 3)
    .map((a) => ({
      axisKey: str(a.axis_key),
      gap: num(a.gap),
      penalty: num(a.penalty_pts),
    }));

  return { score, trend, stuckInTheMiddle: stuck, drift, worstAxes, sentence: sentenceOf(score, trend, stuck, drift) };
}

function sentenceOf(
  score: number,
  trend: number | null,
  stuck: boolean,
  drift: boolean,
): string {
  const niveau =
    score >= 75 ? 'Votre stratégie est cohérente'
    : score >= 55 ? 'Votre stratégie tient à peu près'
    : score >= 35 ? 'Votre stratégie se contredit par endroits'
    : 'Votre stratégie se contredit sur l’essentiel';

  const sens =
    trend === null ? ''
    : trend > 4 ? ', et vous redressez nettement depuis le tour dernier'
    : trend > 1 ? ', et vous vous améliorez'
    : trend < -4 ? ', et vous vous dégradez nettement depuis le tour dernier'
    : trend < -1 ? ', et vous vous dégradez'
    : ', sans bouger depuis le tour dernier';

  // Les deux diagnostics que le moteur pose explicitement priment sur le score :
  // ils nomment une CAUSE, là où le score ne donne qu'une température.
  if (stuck) {
    return `${niveau}${sens}. Vous êtes coincé au milieu : ni le moins cher, ni le plus différencié — la position qui ne gagne sur aucun terrain.`;
  }
  if (drift) {
    return `${niveau}${sens}. Vous avez dérivé : ce que vous financez ne correspond plus à la stratégie que vous déclarez.`;
  }
  return `${niveau}${sens}.`;
}
