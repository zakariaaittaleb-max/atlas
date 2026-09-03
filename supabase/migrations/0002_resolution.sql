-- =============================================================================
-- ATLAS — Migration 0002 : persistance atomique d'une résolution
--
-- Le client Supabase n'expose pas de transaction multi-instructions. Écrire les
-- huit tables de résultats par appels successifs laisserait, en cas
-- d'interruption, un classement à moitié publié — et l'événement Realtime de
-- révélation partirait sur un état incohérent, sous les yeux de la salle.
--
-- Tout passe donc par UNE fonction, exécutée dans UNE transaction.
-- =============================================================================

-- =============================================================================
-- Colonnes complémentaires
-- =============================================================================

-- Atlas vit dans un schéma dédié : le projet Supabase héberge plusieurs
-- applications, et des noms aussi génériques que `teams` ou `regions`
-- entreraient en collision dans `public`. Voir 0000_namespace.sql.
set search_path = atlas, public, extensions;

-- Origine de la courbe d'expérience : le volume cumulé auquel
-- `reference_unit_cost_mad` s'applique. Fixé au provisioning à la dotation
-- initiale, de sorte que toutes les équipes démarrent au même coût.
alter table strategic_units
  add column reference_cumulative_volume_units numeric not null default 1;

-- Décision du vendeur, saisie AVANT le verrouillage du tour : céder à
-- l'acheteur non joueur, retenir la meilleure offre d'équipe, ou retirer
-- l'annonce. Elle doit être arrêtée avant que les offres ne soient dénouées,
-- sinon le vendeur choisirait en connaissant déjà le résultat.
alter table das_listings
  add column seller_choice text not null default 'npc'
    check (seller_choice in ('npc', 'best_bid', 'withdraw'));

-- Part de marché qu'aucune équipe du pool n'a su servir, faute de couverture
-- de distribution. C'est un résultat de débriefing à part entière :
-- « collectivement, vous avez laissé 12 % du marché sur la table ».
create table pool_round_summary (
  id              uuid primary key default extensions.gen_random_uuid(),
  pool_id         uuid not null references market_pools(id) on delete cascade,
  das_id          uuid not null references strategic_units(id) on delete cascade,
  round_number    smallint not null,
  market_size_mad numeric not null,
  unserved_share  numeric not null default 0 check (unserved_share between 0 and 1),
  created_at      timestamptz not null default now(),
  unique (pool_id, das_id, round_number)
);

alter table pool_round_summary enable row level security;

create policy pool_reads_own_summary on pool_round_summary
  for select using (pool_id in (select atlas_pool_ids()));

create index on pool_round_summary (pool_id, round_number);

-- =============================================================================
-- Verrouillage synchronisé d'un tour
--
-- Doc 00 §2 : toutes les équipes d'un pool doivent être figées AU MÊME INSTANT
-- SERVEUR, jamais l'une après l'autre, sans quoi le calcul à somme nulle
-- porterait sur un état qui bouge pendant qu'on le lit.
-- =============================================================================

create or replace function atlas_lock_round(p_session_id uuid)
returns table (locked_round smallint, teams_locked int)
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_round smallint;
  v_count int;
begin
  -- Verrou exclusif sur la session : deux clics simultanés du facilitateur ne
  -- doivent pas produire deux verrouillages concurrents.
  select current_round into v_round
  from game_sessions
  where id = p_session_id
  for update;

  if v_round is null then
    raise exception 'Session introuvable : %', p_session_id;
  end if;

  -- Fige toutes les équipes de la session dans la même transaction.
  perform 1 from teams where session_id = p_session_id for update;
  select count(*) into v_count from teams where session_id = p_session_id;

  update game_sessions
  set status = 'round_locked'
  where id = p_session_id
    and status = 'round_active';

  if not found then
    raise exception 'Le tour ne peut être verrouillé que depuis l''état round_active.';
  end if;

  return query select v_round, v_count;
end;
$$;

-- =============================================================================
-- Persistance d'une résolution
--
-- Reçoit la sortie complète du moteur et l'écrit intégralement, ou pas du tout.
-- La bascule de `game_sessions.status` vers `round_resolved` — qui déclenche
-- l'événement Realtime de révélation — intervient EN DERNIER, dans la même
-- transaction : aucune équipe ne peut recevoir l'événement avant que toutes
-- les lignes du pool ne soient commitées.
-- =============================================================================

-- ⚠️ Cette fonction a été SCINDÉE par la migration 0010 : son corps vit
-- désormais dans `atlas_persist_resolution_core`, et `atlas_persist_resolution`
-- n'est plus qu'une enveloppe qui y ajoute les acquisitions externes avant de
-- basculer l'état de la session. Rejouer les migrations dans l'ordre produit
-- l'état correct ; ne pas modifier ce corps sans répercuter sur 0010b.
create or replace function atlas_persist_resolution(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_session_id uuid := (p_payload->>'session_id')::uuid;
  v_round      smallint := (p_payload->>'round_number')::smallint;
  v_run_id     uuid;
begin
  if v_session_id is null or v_round is null then
    raise exception 'Charge utile incomplète : session_id et round_number sont requis.';
  end if;

  insert into resolution_runs (session_id, round_number, status, finished_at, duration_ms, triggered_by)
  values (
    v_session_id, v_round, 'succeeded', now(),
    (p_payload->>'duration_ms')::int,
    (p_payload->>'triggered_by')::uuid
  )
  returning id into v_run_id;

  -- --- KPI par équipe et par DAS ------------------------------------------
  insert into team_das_round_metrics (
    team_id, das_id, round_number,
    quality, perceived_quality, notoriety, input_quality,
    price_position, unit_price_mad, price_competitiveness,
    competitive_pressure, competitiveness_score,
    capacity_units, effective_capacity_units,
    volume_demanded, volume_sold, volume_lost, stockout_rate,
    utilisation_rate, cumulative_volume,
    unit_variable_cost_mad, fixed_cost_mad, underabsorption_mad, automation_level,
    distribution_coverage, avg_distributor_margin, channel_control,
    market_size_mad, raw_share, market_share_pct,
    revenue_mad, gross_margin_mad, ebitda_mad,
    ia_score, sab_score, best_fit_strategy, best_fit_score
  )
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
    (m->>'utilisationRate')::numeric, (m->>'cumulativeVolume')::numeric,
    (m->>'unitVariableCostMad')::numeric, (m->>'fixedCostMad')::numeric,
    (m->>'underabsorptionMad')::numeric, (m->>'automationLevel')::numeric,
    (m->>'distributionCoverage')::numeric, (m->>'avgDistributorMargin')::numeric,
    (m->>'channelControl')::numeric,
    (m->>'marketSizeMad')::numeric, (m->>'rawShare')::numeric,
    (m->>'marketSharePct')::numeric,
    (m->>'revenueMad')::numeric, (m->>'grossMarginMad')::numeric,
    (m->>'ebitdaMad')::numeric,
    (m->>'iaScore')::numeric,
    (m->>'sabScore')::numeric, m->>'bestFitStrategy', (m->>'bestFitScore')::numeric
  from jsonb_array_elements(p_payload->'das_metrics') as m
  on conflict (team_id, das_id, round_number) do update set
    quality = excluded.quality,
    perceived_quality = excluded.perceived_quality,
    notoriety = excluded.notoriety,
    market_share_pct = excluded.market_share_pct,
    revenue_mad = excluded.revenue_mad,
    competitiveness_score = excluded.competitiveness_score,
    ia_score = excluded.ia_score;

  -- --- État agrégé de l'équipe ---------------------------------------------
  insert into team_round_state (
    team_id, round_number, climat_social, ia_score, headcount,
    centralisation_index, shared_resources_index, portfolio_relatedness,
    vertical_integration, talent_mix,
    synergy_saving_pct, coordination_cost_pct, margin_premium_pct,
    consecutive_negative_treasury_rounds, treasury_status
  )
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
    climat_social = excluded.climat_social,
    ia_score = excluded.ia_score,
    treasury_status = excluded.treasury_status;

  -- --- Compte de résultat ---------------------------------------------------
  insert into pnl_statements (
    team_id, round_number,
    revenue_mad, distributor_margin_mad, net_revenue_mad, cogs_mad, gross_margin_mad,
    payroll_mad, marketing_mad, rd_mad, overhead_mad, fixed_production_mad, consulting_mad,
    ebitda_mad, depreciation_mad, ebit_mad, interest_mad,
    pretax_income_mad, corporate_tax_mad, net_income_mad,
    working_capital_mad, working_capital_change_mad, capex_mad,
    treasury_start_mad, treasury_end_mad,
    effective_tax_rate, leverage_ratio, risk_margin
  )
  select
    (p->>'teamId')::uuid, v_round,
    (p->>'revenueMad')::numeric, (p->>'distributorMarginMad')::numeric,
    (p->>'netRevenueMad')::numeric, (p->>'cogsMad')::numeric, (p->>'grossMarginMad')::numeric,
    (p->>'payrollMad')::numeric, (p->>'marketingMad')::numeric, (p->>'rdMad')::numeric,
    (p->>'overheadMad')::numeric, (p->>'fixedProductionMad')::numeric,
    (p->>'consultingMad')::numeric,
    (p->>'ebitdaMad')::numeric, (p->>'depreciationMad')::numeric, (p->>'ebitMad')::numeric,
    (p->>'interestMad')::numeric,
    (p->>'pretaxIncomeMad')::numeric, (p->>'corporateTaxMad')::numeric,
    (p->>'netIncomeMad')::numeric,
    (p->>'workingCapitalMad')::numeric, (p->>'workingCapitalChangeMad')::numeric,
    (p->>'capexMad')::numeric,
    (p->>'treasuryStartMad')::numeric, (p->>'treasuryEndMad')::numeric,
    (p->>'effectiveTaxRate')::numeric, (p->>'leverageRatio')::numeric,
    (p->>'riskMargin')::numeric
  from jsonb_array_elements(p_payload->'pnls') as p
  on conflict (team_id, round_number) do update set
    revenue_mad = excluded.revenue_mad,
    net_income_mad = excluded.net_income_mad,
    treasury_end_mad = excluded.treasury_end_mad;

  -- --- Alignement stratégique ----------------------------------------------
  insert into alignment_scores (
    team_id, round_number, sab_global, sac_score, sat_score, ia_raw, ia_final,
    stuck_in_the_middle, strategic_drift, drift_declared, drift_actual,
    categorical_penalties
  )
  select
    (a->>'teamId')::uuid, v_round,
    (a->>'sabGlobal')::numeric, (a->>'sac')::numeric, (a->>'sat')::numeric,
    (a->>'iaRaw')::numeric, (a->>'iaFinal')::numeric,
    (a->>'stuckInTheMiddle')::boolean, (a->>'strategicDrift')::boolean,
    a->>'driftDeclared', a->>'driftActual',
    a->'penalties'
  from jsonb_array_elements(p_payload->'alignments') as a
  on conflict (team_id, round_number) do update set
    ia_final = excluded.ia_final,
    stuck_in_the_middle = excluded.stuck_in_the_middle,
    strategic_drift = excluded.strategic_drift,
    categorical_penalties = excluded.categorical_penalties;

  -- --- Détail axe par axe : matière du rapport d'audit -----------------------
  delete from alignment_axis_details
  where round_number = v_round
    and team_id in (
      select (a->>'teamId')::uuid from jsonb_array_elements(p_payload->'alignments') as a
    );

  insert into alignment_axis_details (
    team_id, das_id, round_number, level, axis_key, observed, target, gap, weight, penalty_pts
  )
  select
    (d->>'teamId')::uuid,
    nullif(d->>'dasId', '')::uuid,
    v_round,
    d->>'level', d->>'axis',
    (d->>'observed')::numeric, (d->>'target')::numeric, (d->>'gap')::numeric,
    (d->>'weight')::numeric, (d->>'penaltyPts')::numeric
  from jsonb_array_elements(p_payload->'alignment_axes') as d;

  -- --- Alertes de trésorerie ------------------------------------------------
  insert into treasury_alerts (team_id, round_number, treasury_value_mad, status)
  select
    (t->>'teamId')::uuid, v_round,
    (t->>'treasuryValueMad')::numeric, t->>'status'
  from jsonb_array_elements(coalesce(p_payload->'treasury_alerts', '[]'::jsonb)) as t;

  -- --- Synthèse par pool et par DAS -----------------------------------------
  insert into pool_round_summary (pool_id, das_id, round_number, market_size_mad, unserved_share)
  select
    (s->>'poolId')::uuid, (s->>'dasId')::uuid, v_round,
    (s->>'marketSizeMad')::numeric, (s->>'unservedShare')::numeric
  from jsonb_array_elements(p_payload->'pool_summaries') as s
  on conflict (pool_id, das_id, round_number) do update set
    market_size_mad = excluded.market_size_mad,
    unserved_share = excluded.unserved_share;

  -- --- Cessions de DAS ------------------------------------------------------
  insert into das_transfers (
    listing_id, round_number, seller_team_id, buyer_team_id, das_id,
    price_mad, integration_ratio, value_loss_pct, market_share_transferred
  )
  select
    (t->>'listingId')::uuid, v_round,
    (t->>'sellerTeamId')::uuid, nullif(t->>'buyerTeamId', '')::uuid,
    (t->>'dasId')::uuid,
    (t->>'priceMad')::numeric, (t->>'integrationRatio')::numeric,
    (t->>'valueLossPct')::numeric, (t->>'marketShareTransferred')::numeric
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t;

  -- Le DAS quitte le portefeuille du vendeur au tour même où il entre dans
  -- celui de l'acheteur : jamais dans les deux, jamais dans aucun.
  update team_units tu
  set status = 'sold'
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where tu.team_id = (t->>'sellerTeamId')::uuid
    and tu.das_id = (t->>'dasId')::uuid;

  insert into team_units (team_id, das_id, launched_round, status, acquired_from_team_id)
  select
    (t->>'buyerTeamId')::uuid, (t->>'dasId')::uuid, v_round, 'active',
    (t->>'sellerTeamId')::uuid
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where nullif(t->>'buyerTeamId', '') is not null
  on conflict (team_id, das_id) do update set
    status = 'active',
    acquired_from_team_id = excluded.acquired_from_team_id;

  update das_listings l
  set status = case
    when nullif(t->>'buyerTeamId', '') is null then 'sold_to_npc'
    else 'sold_to_team'
  end
  from jsonb_array_elements(coalesce(p_payload->'transfers', '[]'::jsonb)) as t
  where l.id = (t->>'listingId')::uuid;

  -- Une équipe en liquidation sort du pool ; ses DAS restants sont mis en vente
  -- automatiquement au tour suivant (doc 02 §10.2).
  update teams
  set is_liquidated = true
  where id in (
    select (t->>'teamId')::uuid
    from jsonb_array_elements(p_payload->'team_states') as t
    where t->>'treasuryStatus' = 'liquidation'
  );

  -- --- EN DERNIER : bascule d'état, qui déclenche la révélation --------------
  -- Toutes les lignes ci-dessus sont déjà écrites dans cette transaction :
  -- aucune équipe ne peut recevoir l'événement Realtime et lire des résultats
  -- partiels d'une concurrente.
  update game_sessions
  set status = 'round_resolved'
  where id = v_session_id;

  return v_run_id;
end;
$$;

-- =============================================================================
-- Ouverture du tour suivant (ou clôture de la session)
-- =============================================================================

create or replace function atlas_open_next_round(p_session_id uuid)
returns smallint
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_round smallint;
  v_max   smallint;
begin
  select current_round, max_rounds into v_round, v_max
  from game_sessions where id = p_session_id for update;

  if v_round is null then
    raise exception 'Session introuvable : %', p_session_id;
  end if;

  if v_round >= v_max then
    raise exception 'La session a atteint son nombre maximal de tours (%).', v_max;
  end if;

  update game_sessions
  set current_round = v_round + 1,
      status = 'round_active',
      round_started_at = now(),
      round_soft_deadline = null
  where id = p_session_id;

  return v_round + 1;
end;
$$;

-- Le facilitateur clôt la session quand la salle est prête, entre le 3e et le
-- 10e tour : ce n'est jamais le moteur qui décide de s'arrêter.
create or replace function atlas_complete_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = atlas, public as $$
begin
  update game_sessions set status = 'completed' where id = p_session_id;
end;
$$;

-- Ces fonctions sont `security definer` : elles ne doivent être appelables que
-- par le serveur, avec la clé service_role.
--
-- ⚠️ Le retrait à PUBLIC est indispensable, et c'est le piège : PostgreSQL
-- accorde EXECUTE à PUBLIC par défaut sur toute fonction nouvellement créée.
-- Ne révoquer que sur `anon, authenticated` ne retire rien — le droit revient
-- par PUBLIC. Une équipe pouvait ainsi verrouiller le tour de toute la salle.
-- Trouvé par test contre la base réelle, voir migration 0004.
revoke execute on function atlas_lock_round(uuid) from public;
revoke execute on function atlas_persist_resolution(jsonb) from public;
revoke execute on function atlas_open_next_round(uuid) from public;
revoke execute on function atlas_complete_session(uuid) from public;

grant execute on function atlas_lock_round(uuid) to service_role;
grant execute on function atlas_persist_resolution(jsonb) to service_role;
grant execute on function atlas_open_next_round(uuid) to service_role;
grant execute on function atlas_complete_session(uuid) to service_role;

alter default privileges in schema atlas revoke execute on functions from public;
