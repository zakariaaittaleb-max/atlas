-- =============================================================================
-- ATLAS — Migration 0031 : le bilan devient un résultat du moteur
--
-- Trois corrections liées, toutes issues de la même cause : l'écran de finance
-- DÉRIVAIT le bilan au moment de la saisie, au lieu de le lire.
--
--   1. Les CAPITAUX PROPRES ne bougeaient jamais. Le résultat net ne s'y
--      accumulait pas : un groupe qui gagnait trois milliards par tour gardait
--      la même assise financière pendant toute la partie, et sa rentabilité des
--      capitaux propres se mesurait contre un dénominateur gelé. C'est aussi ce
--      qui rendait impossible toute capacité d'endettement digne de ce nom.
--
--   2. La colonne `debt_outstanding_mad` mélangeait ouverture et clôture selon
--      qui l'écrivait. Elle porte désormais l'OUVERTURE du tour, sans exception.
--
--   3. Deux nouvelles décisions de niveau Groupe — levée de fonds propres et
--      dividende — n'avaient nulle part où se ranger.
--
-- Le moteur arrête le bilan de clôture et l'écrit comme ouverture du tour
-- suivant. L'écran ne fait plus que lire.
-- =============================================================================

set search_path = atlas, public, extensions;

-- ── Les deux nouvelles décisions ──────────────────────────────────────────
alter table financial_budgets
  add column if not exists capital_raised_mad numeric not null default 0
    check (capital_raised_mad >= 0),
  add column if not exists dividend_mad numeric not null default 0
    check (dividend_mad >= 0);

comment on column financial_budgets.capital_raised_mad is
  'Levée de fonds propres décidée ce tour, brute de frais d''émission.';
comment on column financial_budgets.dividend_mad is
  'Dividende voté sur l''exercice clos — plafonné au résultat net de cet exercice.';
comment on column financial_budgets.debt_outstanding_mad is
  'Encours de dette à l''OUVERTURE du tour. Écrit par le moteur (clôture du tour '
  'précédent) ou par le provisionnement pour le tour 0. Jamais dérivé à la saisie.';
comment on column financial_budgets.equity_mad is
  'Capitaux propres à l''OUVERTURE du tour. Résultat net accumulé, dividende '
  'déduit, levée nette de frais ajoutée.';

-- ── Les indicateurs que l'écran doit pouvoir lire sans les recalculer ──────
alter table pnl_statements
  add column if not exists self_financing_mad numeric,
  add column if not exists free_cash_flow_mad numeric,
  add column if not exists capital_raised_mad numeric not null default 0,
  add column if not exists equity_issue_cost_mad numeric not null default 0,
  add column if not exists dividend_mad numeric not null default 0,
  add column if not exists equity_end_mad numeric,
  add column if not exists debt_outstanding_end_mad numeric;

comment on column pnl_statements.self_financing_mad is
  'Capacité d''autofinancement : résultat net + amortissements.';
comment on column pnl_statements.free_cash_flow_mad is
  'Flux de trésorerie libre : CAF − variation du besoin en fonds de roulement − capex.';

CREATE OR REPLACE FUNCTION atlas.atlas_persist_resolution_core(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'atlas', 'public'
AS $function$
declare
  v_session_id uuid := (p_payload->>'session_id')::uuid;
  v_round      smallint := (p_payload->>'round_number')::smallint;
  v_run_id     uuid;
begin
  if v_session_id is null or v_round is null then
    raise exception 'Charge utile incomplète : session_id et round_number sont requis.';
  end if;

  insert into resolution_runs (session_id, round_number, status, finished_at, duration_ms, triggered_by)
  values (v_session_id, v_round, 'succeeded', now(),
          (p_payload->>'duration_ms')::int, (p_payload->>'triggered_by')::uuid)
  returning id into v_run_id;

  insert into team_das_round_metrics (
    team_id, das_id, round_number,
    quality, perceived_quality, notoriety, input_quality,
    price_position, unit_price_mad, price_competitiveness,
    competitive_pressure, competitiveness_score,
    capacity_units, effective_capacity_units,
    volume_demanded, volume_sold, volume_lost, stockout_rate,
    production_units, input_stock_units, finished_stock_units,
    inventory_holding_cost_mad,
    utilisation_rate, cumulative_volume,
    unit_variable_cost_mad, fixed_cost_mad, underabsorption_mad, automation_level,
    distribution_coverage, avg_distributor_margin, channel_control,
    market_size_mad, raw_share, market_share_pct,
    revenue_mad, gross_margin_mad, ebitda_mad,
    ia_score, sab_score, best_fit_strategy, best_fit_score)
  select
    (m->>'teamId')::uuid, (m->>'dasId')::uuid, v_round,
    (m->>'quality')::numeric, (m->>'perceivedQuality')::numeric,
    (m->>'notoriety')::numeric, (m->>'inputQuality')::numeric,
    (m->>'pricePosition')::numeric, (m->>'unitPriceMad')::numeric,
    (m->>'priceCompetitiveness')::numeric,
    (m->>'competitivePressure')::numeric, (m->>'competitivenessScore')::numeric,
    (m->>'capacityUnits')::numeric, (m->>'effectiveCapacityUnits')::numeric,
    (m->>'volumeDemanded')::numeric, (m->>'volumeSold')::numeric,
    (m->>'volumeLost')::numeric, (m->>'stockoutRate')::numeric,
    (m->>'productionUnits')::numeric,
    (m->>'inputStockUnits')::numeric, (m->>'finishedStockUnits')::numeric,
    (m->>'inventoryHoldingCostMad')::numeric,
    (m->>'utilisationRate')::numeric, (m->>'cumulativeVolume')::numeric,
    (m->>'unitVariableCostMad')::numeric, (m->>'fixedCostMad')::numeric,
    (m->>'underabsorptionMad')::numeric, (m->>'automationLevel')::numeric,
    (m->>'distributionCoverage')::numeric, (m->>'avgDistributorMargin')::numeric,
    (m->>'channelControl')::numeric,
    (m->>'marketSizeMad')::numeric, (m->>'rawShare')::numeric, (m->>'marketSharePct')::numeric,
    (m->>'revenueMad')::numeric, (m->>'grossMarginMad')::numeric, (m->>'ebitdaMad')::numeric,
    (m->>'iaScore')::numeric, (m->>'sabScore')::numeric,
    m->>'bestFitStrategy', (m->>'bestFitScore')::numeric
  from jsonb_array_elements(p_payload->'das_metrics') as m
  on conflict (team_id, das_id, round_number) do update set
    quality = excluded.quality, perceived_quality = excluded.perceived_quality,
    notoriety = excluded.notoriety, market_share_pct = excluded.market_share_pct,
    revenue_mad = excluded.revenue_mad,
    competitiveness_score = excluded.competitiveness_score,
    production_units = excluded.production_units,
    input_stock_units = excluded.input_stock_units,
    finished_stock_units = excluded.finished_stock_units,
    inventory_holding_cost_mad = excluded.inventory_holding_cost_mad,
    ia_score = excluded.ia_score;

  insert into team_round_state (
    team_id, round_number, climat_social, ia_score, headcount,
    centralisation_index, shared_resources_index, portfolio_relatedness,
    vertical_integration, talent_mix,
    synergy_saving_pct, coordination_cost_pct, margin_premium_pct,
    consecutive_negative_treasury_rounds, treasury_status)
  select
    (t->>'teamId')::uuid, v_round,
    (t->>'climatSocial')::numeric, (t->>'iaScore')::numeric, (t->>'headcount')::int,
    (t->>'centralisationIndex')::numeric, (t->>'sharedResourcesIndex')::numeric,
    (t->>'portfolioRelatedness')::numeric,
    (t->>'verticalIntegration')::numeric, (t->>'talentMix')::numeric,
    (t->>'synergySavingPct')::numeric, (t->>'coordinationCostPct')::numeric,
    (t->>'marginPremiumPct')::numeric,
    (t->>'consecutiveNegativeTreasuryRounds')::smallint, t->>'treasuryStatus'
  from jsonb_array_elements(p_payload->'team_states') as t
  on conflict (team_id, round_number) do update set
    climat_social = excluded.climat_social, ia_score = excluded.ia_score,
    treasury_status = excluded.treasury_status;

  insert into pnl_statements (
    team_id, round_number,
    revenue_mad, distributor_margin_mad, net_revenue_mad, cogs_mad, gross_margin_mad,
    payroll_mad, marketing_mad, rd_mad, overhead_mad, fixed_production_mad, consulting_mad,
    ebitda_mad, depreciation_mad, ebit_mad, interest_mad,
    pretax_income_mad, corporate_tax_mad, net_income_mad,
    working_capital_mad, working_capital_change_mad, capex_mad,
    treasury_start_mad, treasury_end_mad,
    effective_tax_rate, leverage_ratio, risk_margin,
    self_financing_mad, free_cash_flow_mad,
    capital_raised_mad, equity_issue_cost_mad, dividend_mad,
    equity_end_mad, debt_outstanding_end_mad)
  select
    (p->>'teamId')::uuid, v_round,
    (p->>'revenueMad')::numeric, (p->>'distributorMarginMad')::numeric,
    (p->>'netRevenueMad')::numeric, (p->>'cogsMad')::numeric, (p->>'grossMarginMad')::numeric,
    (p->>'payrollMad')::numeric, (p->>'marketingMad')::numeric, (p->>'rdMad')::numeric,
    (p->>'overheadMad')::numeric, (p->>'fixedProductionMad')::numeric, (p->>'consultingMad')::numeric,
    (p->>'ebitdaMad')::numeric, (p->>'depreciationMad')::numeric, (p->>'ebitMad')::numeric,
    (p->>'interestMad')::numeric,
    (p->>'pretaxIncomeMad')::numeric, (p->>'corporateTaxMad')::numeric, (p->>'netIncomeMad')::numeric,
    (p->>'workingCapitalMad')::numeric, (p->>'workingCapitalChangeMad')::numeric, (p->>'capexMad')::numeric,
    (p->>'treasuryStartMad')::numeric, (p->>'treasuryEndMad')::numeric,
    (p->>'effectiveTaxRate')::numeric, (p->>'leverageRatio')::numeric, (p->>'riskMargin')::numeric,
    (p->>'selfFinancingMad')::numeric, (p->>'freeCashFlowMad')::numeric,
    coalesce((p->>'capitalRaisedMad')::numeric, 0),
    coalesce((p->>'equityIssueCostMad')::numeric, 0),
    coalesce((p->>'dividendMad')::numeric, 0),
    (p->>'equityEndMad')::numeric, (p->>'debtOutstandingEndMad')::numeric
  from jsonb_array_elements(p_payload->'pnls') as p
  on conflict (team_id, round_number) do update set
    revenue_mad = excluded.revenue_mad, net_income_mad = excluded.net_income_mad,
    treasury_end_mad = excluded.treasury_end_mad, capex_mad = excluded.capex_mad,
    self_financing_mad = excluded.self_financing_mad,
    free_cash_flow_mad = excluded.free_cash_flow_mad,
    equity_end_mad = excluded.equity_end_mad,
    debt_outstanding_end_mad = excluded.debt_outstanding_end_mad;

  -- ── Le bilan d'OUVERTURE du tour suivant ────────────────────────────────
  --
  -- Il était dérivé à la saisie, par l'écran de finance : les capitaux propres
  -- ne bougeaient donc jamais — le résultat ne s'y accumulait pas — et la dette
  -- se recalculait à partir d'une ligne qui pouvait manquer. C'est le moteur
  -- qui arrête un bilan, pas le formulaire qui le lit.
  --
  -- La clause de conflit ne touche QUE les trois colonnes de bilan : si l'équipe
  -- a déjà saisi des décisions pour le tour suivant, elles sont conservées.
  insert into financial_budgets (
    team_id, round_number, treasury_start_mad, equity_mad, debt_outstanding_mad)
  select
    (p->>'teamId')::uuid, (v_round + 1)::smallint,
    (p->>'treasuryEndMad')::numeric,
    (p->>'equityEndMad')::numeric,
    (p->>'debtOutstandingEndMad')::numeric
  from jsonb_array_elements(p_payload->'pnls') as p
  on conflict (team_id, round_number) do update set
    treasury_start_mad = excluded.treasury_start_mad,
    equity_mad = excluded.equity_mad,
    debt_outstanding_mad = excluded.debt_outstanding_mad;

  insert into alignment_scores (
    team_id, round_number, sab_global, sac_score, sat_score, ia_raw, ia_final,
    stuck_in_the_middle, strategic_drift, drift_declared, drift_actual, categorical_penalties)
  select
    (a->>'teamId')::uuid, v_round,
    (a->>'sabGlobal')::numeric, (a->>'sac')::numeric, (a->>'sat')::numeric,
    (a->>'iaRaw')::numeric, (a->>'iaFinal')::numeric,
    (a->>'stuckInTheMiddle')::boolean, (a->>'strategicDrift')::boolean,
    a->>'driftDeclared', a->>'driftActual', a->'penalties'
  from jsonb_array_elements(p_payload->'alignments') as a
  on conflict (team_id, round_number) do update set
    ia_final = excluded.ia_final, stuck_in_the_middle = excluded.stuck_in_the_middle,
    strategic_drift = excluded.strategic_drift,
    categorical_penalties = excluded.categorical_penalties;

  delete from alignment_axis_details
  where round_number = v_round
    and team_id in (select (a->>'teamId')::uuid from jsonb_array_elements(p_payload->'alignments') as a);

  insert into alignment_axis_details (
    team_id, das_id, round_number, level, axis_key, observed, target, gap, weight, penalty_pts)
  select
    (d->>'teamId')::uuid, nullif(d->>'dasId', '')::uuid, v_round,
    d->>'level', d->>'axis',
    (d->>'observed')::numeric, (d->>'target')::numeric, (d->>'gap')::numeric,
    (d->>'weight')::numeric, (d->>'penaltyPts')::numeric
  from jsonb_array_elements(p_payload->'alignment_axes') as d;

  insert into treasury_alerts (team_id, round_number, treasury_value_mad, status)
  select (t->>'teamId')::uuid, v_round, (t->>'treasuryValueMad')::numeric, t->>'status'
  from jsonb_array_elements(coalesce(p_payload->'treasury_alerts', '[]'::jsonb)) as t;

  -- `installed_share` : la part prélevée par les entreprises installées, hors
  -- jeu. Sans elle en base, aucun écran ne peut nommer le trou entre la somme
  -- des parts des équipes et 100 % du marché.
  insert into pool_round_summary (
    pool_id, das_id, round_number, market_size_mad, unserved_share, installed_share)
  select (s->>'poolId')::uuid, (s->>'dasId')::uuid, v_round,
         (s->>'marketSizeMad')::numeric, (s->>'unservedShare')::numeric,
         coalesce((s->>'installedShare')::numeric, 0)
  from jsonb_array_elements(p_payload->'pool_summaries') as s
  on conflict (pool_id, das_id, round_number) do update set
    market_size_mad = excluded.market_size_mad,
    unserved_share = excluded.unserved_share,
    installed_share = excluded.installed_share;

  insert into das_transfers (
    listing_id, round_number, seller_team_id, buyer_team_id, das_id,
    price_mad, integration_ratio, value_loss_pct, market_share_transferred)
  select (t->>'listingId')::uuid, v_round,
    (t->>'sellerTeamId')::uuid, nullif(t->>'buyerTeamId', '')::uuid, (t->>'dasId')::uuid,
    (t->>'priceMad')::numeric, (t->>'integrationRatio')::numeric,
    (t->>'valueLossPct')::numeric, (t->>'marketShareTransferred')::numeric
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t;

  update team_units tu set status = 'sold'
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where tu.team_id = (t->>'sellerTeamId')::uuid and tu.das_id = (t->>'dasId')::uuid;

  insert into team_units (team_id, das_id, launched_round, status, acquired_from_team_id)
  select (t->>'buyerTeamId')::uuid, (t->>'dasId')::uuid, v_round, 'active', (t->>'sellerTeamId')::uuid
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where nullif(t->>'buyerTeamId', '') is not null
  on conflict (team_id, das_id) do update set
    status = 'active', acquired_from_team_id = excluded.acquired_from_team_id;

  update das_listings l
  set status = case when nullif(t->>'buyerTeamId', '') is null then 'sold_to_npc' else 'sold_to_team' end
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where l.id = (t->>'listingId')::uuid;

  update teams set is_liquidated = true
  where id in (select (t->>'teamId')::uuid
               from jsonb_array_elements(p_payload->'team_states') as t
               where t->>'treasuryStatus' = 'liquidation');

  return v_run_id;
end;
$function$


