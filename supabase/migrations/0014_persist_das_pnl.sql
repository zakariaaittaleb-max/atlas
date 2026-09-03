set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0014 : persistance du compte de résultat par DAS
--
-- Fonction SÉPARÉE, appelée par composition depuis l'enveloppe. Le noyau
-- historique n'est pas touché : c'est la leçon de la migration 0010, qui l'avait
-- remplacé par une enveloppe appelant une fonction inexistante — la résolution
-- était morte le temps de s'en apercevoir. On n'ajoute plus que par composition.
-- =============================================================================

create or replace function atlas_persist_das_pnl(
  p_payload jsonb,
  p_round smallint
) returns void
language plpgsql
security definer
set search_path = atlas, public, extensions
as $$
begin
  insert into das_pnl (
    team_id, das_id, round_number,
    revenue_mad, total_costs_mad, variable_costs_mad, fixed_costs_mad,
    marketing_mad, rd_mad, channel_cost_mad,
    operating_income_mad, net_income_mad,
    capital_employed_mad, investment_mad, cash_generated_mad,
    profit_margin_pct, roi_pct, cost_per_revenue_pct, break_even_units
  )
  select
    (e->>'teamId')::uuid,
    (e->>'dasId')::uuid,
    p_round,
    coalesce((e->>'revenueMad')::numeric, 0),
    coalesce((e->>'totalCostsMad')::numeric, 0),
    coalesce((e->>'unitVariableCostMad')::numeric, 0) * coalesce((e->>'volumeSold')::numeric, 0),
    coalesce((e->>'fixedCostMad')::numeric, 0),
    0, 0,
    coalesce((e->>'revenueMad')::numeric, 0) * coalesce((e->>'avgDistributorMargin')::numeric, 0),
    coalesce((e->>'ebitdaMad')::numeric, 0),
    coalesce((e->>'ebitdaMad')::numeric, 0),
    coalesce((e->>'capitalEmployedMad')::numeric, 0),
    coalesce((e->>'investmentMad')::numeric, 0),
    coalesce((e->>'cashGeneratedMad')::numeric, 0),
    (e->>'profitMarginPct')::numeric,
    (e->>'roiPct')::numeric,
    (e->>'costPerRevenuePct')::numeric,
    (e->>'breakEvenVolume')::numeric
  from jsonb_array_elements(coalesce(p_payload->'das_metrics', '[]'::jsonb)) as e
  on conflict (team_id, das_id, round_number) do update set
    revenue_mad          = excluded.revenue_mad,
    total_costs_mad      = excluded.total_costs_mad,
    variable_costs_mad   = excluded.variable_costs_mad,
    fixed_costs_mad      = excluded.fixed_costs_mad,
    channel_cost_mad     = excluded.channel_cost_mad,
    operating_income_mad = excluded.operating_income_mad,
    net_income_mad       = excluded.net_income_mad,
    capital_employed_mad = excluded.capital_employed_mad,
    investment_mad       = excluded.investment_mad,
    cash_generated_mad   = excluded.cash_generated_mad,
    profit_margin_pct    = excluded.profit_margin_pct,
    roi_pct              = excluded.roi_pct,
    cost_per_revenue_pct = excluded.cost_per_revenue_pct,
    break_even_units     = excluded.break_even_units;
end;
$$;

revoke all on function atlas_persist_das_pnl(jsonb, smallint) from public, anon, authenticated;
