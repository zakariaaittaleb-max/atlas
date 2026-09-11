import 'server-only';

/**
 * Assemblage de l'historique d'une session pour le Balanced Scorecard.
 *
 * Appelé une seule fois, à la clôture. Le tableau de bord prospectif ne pilote
 * pas les tours : il les relit. C'est un instrument de débriefing.
 */

import { computeScorecards, type Scorecard, type TeamHistory } from '@/lib/engine/scorecard';
import { mean } from '@/lib/engine/math';

import type { createAdminClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/**
 * Part de marché moyenne d'un groupe sur toute la session.
 *
 * Pondérée par la taille du marché de chaque domaine et de chaque tour : la
 * question posée est « quelle fraction des marchés que vous avez joués avez-vous
 * prise », et une fraction ne se moyenne pas sans tenir compte de sa base.
 * Sans taille de marché en base — cas des tours anciens — on retombe sur la
 * moyenne simple plutôt que de rendre zéro.
 */
export function weightedShare(metrics: Row[]): number {
  if (metrics.length === 0) return 0;
  const weight = metrics.reduce((acc, m) => acc + Math.max(num(m.market_size_mad), 0), 0);
  if (weight <= 0) return mean(metrics.map((m) => num(m.market_share_pct)));
  return (
    metrics.reduce(
      (acc, m) => acc + num(m.market_share_pct) * Math.max(num(m.market_size_mad), 0),
      0,
    ) / weight
  );
}

export async function buildScorecards(
  admin: Admin,
  sessionId: string,
): Promise<Scorecard[]> {
  const { data: teams } = await admin
    .from('teams').select('id, is_liquidated').eq('session_id', sessionId);

  const teamIds = (teams ?? []).map((t) => str(t.id));
  if (teamIds.length === 0) return [];

  const [{ data: pnls }, { data: metrics }, { data: states }, { data: alignments }, { data: budgets }, { data: decisions }] =
    await Promise.all([
      admin.from('pnl_statements').select('*').in('team_id', teamIds).order('round_number'),
      admin.from('team_das_round_metrics').select('*').in('team_id', teamIds).order('round_number'),
      admin.from('team_round_state').select('*').in('team_id', teamIds).order('round_number'),
      admin.from('alignment_scores').select('*').in('team_id', teamIds).order('round_number'),
      admin.from('financial_budgets').select('*').in('team_id', teamIds).order('round_number'),
      admin.from('das_decisions').select('team_id, round_number, rd_budget_mad').in('team_id', teamIds),
    ]);

  const forTeam = <T extends Row>(rows: T[] | null, teamId: string) =>
    (rows ?? []).filter((r) => str(r.team_id) === teamId);

  /** Le tour 0 est la dotation : il n'est jamais le résultat d'une décision. */
  const played = <T extends Row>(rows: T[]) => rows.filter((r) => num(r.round_number) > 0);
  const last = <T extends Row>(rows: T[]): T | undefined => rows[rows.length - 1];

  const histories: TeamHistory[] = teamIds.map((teamId) => {
    const teamPnls = played(forTeam(pnls, teamId));
    const teamMetrics = played(forTeam(metrics, teamId));
    const teamStates = played(forTeam(states, teamId));
    const teamAlignments = played(forTeam(alignments, teamId));
    const teamDecisions = forTeam(decisions, teamId);

    // Le tour 0 porte la qualité de dotation : c'est le point de départ dont on
    // mesure la progression.
    const initialMetric = forTeam(metrics, teamId).find((m) => num(m.round_number) === 0);
    const finalMetrics = teamMetrics.filter(
      (m) => num(m.round_number) === num(last(teamMetrics)?.round_number ?? 0),
    );

    const cumulativeRevenue = teamPnls.reduce((acc, p) => acc + num(p.revenue_mad), 0);
    const cumulativeRd = teamDecisions.reduce((acc, d) => acc + num(d.rd_budget_mad), 0);

    return {
      teamId,
      finalTreasuryMad: num(last(teamPnls)?.treasury_end_mad),
      cumulativeRevenueMad: cumulativeRevenue,
      cumulativeNetIncomeMad: teamPnls.reduce((acc, p) => acc + num(p.net_income_mad), 0),
      equityMad: num(last(forTeam(budgets, teamId))?.equity_mad),
      // Moyenne PONDÉRÉE par la taille des marchés. La moyenne arithmétique
      // mettait sur le même plan 50 % d'un marché de 50 Md et 10 % d'un marché
      // de 190 Md : un groupe pouvait paraître dominant en régnant sur le plus
      // petit domaine de son portefeuille. Le palmarès s'en nourrissait.
      averageMarketShare: weightedShare(teamMetrics),
      // Sur un portefeuille multi-DAS, on retient la moyenne du dernier tour :
      // c'est l'image de l'entreprise à l'arrivée, pas celle d'un seul métier.
      finalNotoriety: finalMetrics.length ? mean(finalMetrics.map((m) => num(m.notoriety))) : 0,
      finalPerceivedQuality: finalMetrics.length
        ? mean(finalMetrics.map((m) => num(m.perceived_quality)))
        : 0,
      initialQuality: num(initialMetric?.quality, 50),
      finalQuality: finalMetrics.length ? mean(finalMetrics.map((m) => num(m.quality))) : 0,
      averageIaScore: teamAlignments.length
        ? mean(teamAlignments.map((a) => num(a.ia_final)))
        : 0,
      finalSacScore: num(last(teamAlignments)?.sac_score),
      averageStockoutRate: teamMetrics.length
        ? mean(teamMetrics.map((m) => num(m.stockout_rate)))
        : 0,
      finalClimatSocial: num(last(teamStates)?.climat_social),
      rdIntensity: cumulativeRevenue > 0 ? cumulativeRd / cumulativeRevenue : 0,
      isLiquidated: Boolean((teams ?? []).find((t) => str(t.id) === teamId)?.is_liquidated),
    };
  });

  return computeScorecards(histories);
}

/** Persiste les scorecards au tour de clôture. */
export async function persistScorecards(
  admin: Admin,
  cards: Scorecard[],
  roundNumber: number,
): Promise<void> {
  if (cards.length === 0) return;

  const { error } = await admin.from('balanced_scorecards').upsert(
    cards.map((c) => ({
      team_id: c.teamId,
      round_number: roundNumber,
      financial_score: c.financialScore,
      client_score: c.clientScore,
      process_score: c.processScore,
      learning_score: c.learningScore,
      global_score: c.globalScore,
    })),
    { onConflict: 'team_id,round_number' },
  );

  if (error) throw new Error(error.message);
}
