import 'server-only';

/**
 * Chargement de la lecture de gestion du dernier tour publié.
 *
 * Ne calcule rien que le moteur n'ait déjà calculé : les ratios par DAS sont
 * persistés par la résolution (`das_pnl`), et les notions de groupe se
 * dérivent du compte de résultat par les fonctions PURES de `indicators.ts`.
 * Refaire ici une arithmétique parallèle ferait diverger l'écran de l'export.
 */

import { computeIndicators, leverageView, readLeverage, readProfitMargin } from '@/lib/engine/indicators';
import { requireTeam, getRoundState } from '@/lib/dal';
import type { DasResult, GroupResult, ResultsContext } from '@/lib/results-types';
import { createServerClient } from '@/lib/supabase/server';

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export async function loadResultsContext(): Promise<ResultsContext> {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const currentRound = (round?.current_round as number) ?? 0;

  // Le dernier tour PUBLIÉ, pas le tour en cours : pendant la saisie, une
  // équipe lit les résultats de l'exercice clos, jamais ceux qu'elle est en
  // train de décider.
  const published =
    round?.status === 'round_resolved' || round?.status === 'completed'
      ? currentRound
      : currentRound - 1;

  if (published < 0) return { roundNumber: null, das: [], group: null };

  const supabase = await createServerClient();

  const [{ data: dasRows }, { data: units }, { data: pnl }, { data: budget }, { data: metrics }] =
    await Promise.all([
      supabase.from('das_pnl').select('*')
        .eq('team_id', team.teamId).eq('round_number', published),
      supabase.from('team_units')
        .select('das_id, strategic_units(id, name)')
        .eq('team_id', team.teamId),
      supabase.from('pnl_statements').select('*')
        .eq('team_id', team.teamId).eq('round_number', published).maybeSingle(),
      supabase.from('financial_budgets').select('*')
        .eq('team_id', team.teamId).lte('round_number', published)
        .order('round_number', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('team_das_round_metrics').select('das_id, volume_sold')
        .eq('team_id', team.teamId).eq('round_number', published),
    ]);

  const nameByDas = new Map(
    (units ?? []).map((u) => {
      const unit = u.strategic_units as unknown as { id: string; name: string } | null;
      return [str(u.das_id), unit?.name ?? 'DAS'];
    }),
  );
  const volumeByDas = new Map(
    (metrics ?? []).map((m) => [str(m.das_id), num(m.volume_sold)]),
  );

  const das: DasResult[] = ((dasRows ?? []) as Row[]).map((r) => ({
    dasId: str(r.das_id),
    dasName: nameByDas.get(str(r.das_id)) ?? 'DAS',
    revenueMad: num(r.revenue_mad),
    totalCostsMad: num(r.total_costs_mad),
    operatingIncomeMad: num(r.operating_income_mad),
    profitMarginPct: num(r.profit_margin_pct),
    roiPct: num(r.roi_pct),
    costPerRevenuePct: num(r.cost_per_revenue_pct),
    cashGeneratedMad: num(r.cash_generated_mad),
    capitalEmployedMad: num(r.capital_employed_mad),
    investmentMad: num(r.investment_mad),
    breakEvenUnits: r.break_even_units === null ? null : num(r.break_even_units),
    volumeSold: volumeByDas.get(str(r.das_id)) ?? 0,
  }));

  let group: GroupResult | null = null;

  if (pnl) {
    const equityMad = num(budget?.equity_mad);
    const debtMad = num(budget?.debt_outstanding_mad);
    const interestMad = num(pnl.interest_mad);

    const indicators = computeIndicators({
      revenueMad: num(pnl.revenue_mad),
      variableCostsMad: num(pnl.cogs_mad),
      fixedCostsMad: num(pnl.fixed_production_mad),
      payrollMad: num(pnl.payroll_mad),
      marketingMad: num(pnl.marketing_mad),
      rdMad: num(pnl.rd_mad),
      channelCostMad: num(pnl.distributor_margin_mad),
      otherCostsMad:
        num(pnl.overhead_mad) + num(pnl.consulting_mad) +
        num(pnl.depreciation_mad) + interestMad + num(pnl.corporate_tax_mad),
      netIncomeMad: num(pnl.net_income_mad),
      capitalEmployedMad: equityMad + debtMad,
      investmentMad: num(pnl.capex_mad),
    });

    const lev = leverageView(
      num(pnl.net_income_mad), num(pnl.ebit_mad), equityMad, debtMad, interestMad,
    );

    group = {
      revenueMad: num(pnl.revenue_mad),
      totalCostsMad: indicators.totalCostsMad,
      netIncomeMad: num(pnl.net_income_mad),
      profitMarginPct: indicators.profitMarginPct,
      roiPct: indicators.roiPct,
      cashGeneratedMad: indicators.cashGeneratedMad,
      debtOutstandingMad: debtMad,
      debtRatioPct: lev.debtRatioPct,
      costOfDebtPct: lev.costOfDebtPct,
      returnOnAssetsPct: lev.returnOnAssetsPct,
      returnOnEquityPct: lev.returnOnEquityPct,
      leverageEffectPts: lev.leverageEffectPts,
      leverageFavourable: lev.favourable,
      leverageNote: readLeverage(lev),
      marginNote: readProfitMargin(indicators.profitMarginPct),
      taxPaidMad: num(pnl.corporate_tax_mad),
      treasuryEndMad: num(pnl.treasury_end_mad),
    };
  }

  return { roundNumber: published, das, group };
}
