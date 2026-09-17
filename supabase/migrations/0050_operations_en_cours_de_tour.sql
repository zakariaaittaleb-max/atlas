-- =============================================================================
-- ATLAS — Migration 0050 : céder et racheter EN COURS de tour
--
-- Cessions et acquisitions ne se dénouaient qu'à la résolution : le vendeur
-- arrêtait un choix en aveugle, le moteur tranchait à la fin, et l'argent ne
-- bougeait qu'en fin d'exercice. Une équipe qui vendait pour se refaire une
-- trésorerie ne pouvait donc rien en faire avant le tour suivant.
--
-- Désormais :
--   • le vendeur voit les offres reçues et en ACCEPTE une quand il veut — ou
--     l'offre de l'acheteur non joueur. La vente est conclue sur-le-champ ;
--   • le DAS change de mains immédiatement : l'acheteur le pilote pour tout le
--     tour, résultat compris, et hérite de son état, amputé de la perte
--     d'intégration ;
--   • une offre sur une entreprise non joueuse est acceptée sur-le-champ si
--     elle atteint le prix de réserve, refusée sinon — et l'équipe ne peut
--     plus retenter cette cible du tour, faute de quoi le prix de réserve se
--     trouverait par essais successifs ;
--   • le prix entre et sort des trésoreries tout de suite (`deal_cash_movements`),
--     lu par la barre d'argent, la finance du groupe et le moteur.
--
-- À la résolution, le marché ferme : une annonce sans preneur expire, sans
-- vente, et le DAS redevient simplement actif.
-- =============================================================================

set search_path = atlas, public, extensions;

-- ── Les mouvements de trésorerie des opérations ─────────────────────────────
create table if not exists deal_cash_movements (
  id                   uuid primary key default extensions.gen_random_uuid(),
  session_id           uuid not null references game_sessions(id) on delete cascade,
  team_id              uuid not null references teams(id) on delete cascade,
  round_number         smallint not null,
  kind                 text not null check (kind in ('cession_das', 'rachat_das', 'acquisition')),
  -- Signé : positif pour un encaissement, négatif pour un décaissement.
  amount_mad           numeric not null,
  -- Un rachat est un investissement (il s'amortit), une cession un produit.
  is_investment        boolean not null default false,
  counterparty_team_id uuid references teams(id),
  das_id               uuid references strategic_units(id),
  target_actor_id      uuid references ecosystem_actors(id),
  created_at           timestamptz not null default now()
);

create index if not exists deal_cash_movements_team_round
  on deal_cash_movements (team_id, round_number);

alter table deal_cash_movements enable row level security;

drop policy if exists team_reads_own_deal_cash on deal_cash_movements;
create policy team_reads_own_deal_cash on deal_cash_movements
  for select to authenticated
  using (team_id in (select atlas_team_ids()));

grant select on deal_cash_movements to authenticated;

comment on table deal_cash_movements is
  'Prix encaissés et décaissés par les cessions et acquisitions conclues en '
  'cours de tour. Lus par la barre d''argent, la finance du groupe et le moteur.';

-- ── Recopier l'état d'un domaine d'une équipe à une autre ───────────────────
--
-- Recopie, pour une table donnée, les lignes du tour le plus récent au plus
-- tard `p_max_round`. Les colonnes sont lues au catalogue : une colonne ajoutée
-- demain suit sans retoucher la fonction.
create or replace function atlas_clone_das_rows(
  p_table text, p_from uuid, p_to uuid, p_das uuid, p_max_round smallint
) returns void
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into v_cols
  from information_schema.columns
  where table_schema = 'atlas' and table_name = p_table
    and column_name not in ('id', 'created_at', 'team_id')
    and is_generated = 'NEVER';

  execute format(
    'insert into atlas.%1$I (team_id, %2$s)
     select $1, %2$s from atlas.%1$I
     where team_id = $2 and das_id = $3
       and round_number = (select max(round_number) from atlas.%1$I
                           where team_id = $2 and das_id = $3 and round_number <= $4)
     on conflict do nothing',
    p_table, v_cols)
  using p_to, p_from, p_das, p_max_round;
end;
$$;

-- ── Conclure une cession ────────────────────────────────────────────────────
--
-- `p_bid_id` nul : cession à l'acheteur non joueur, au prix de son offre.
-- Les montants de perte d'intégration sont calculés par le serveur applicatif
-- avec la règle du moteur (`resolveTransfer`) ; la fonction revérifie tout ce
-- qui peut avoir changé entre la lecture et l'écriture, sous verrou.
create or replace function atlas_settle_listing(
  p_listing_id uuid,
  p_seller_team_id uuid,
  p_bid_id uuid,
  p_expected_price_mad numeric,
  p_value_loss_pct numeric,
  p_integration_ratio numeric,
  p_share_transferred numeric
) returns jsonb
language plpgsql security definer set search_path = atlas, public as $$
declare
  l record;
  b record;
  v_buyer uuid;
  v_price numeric;
  v_integration numeric := 0;
  v_keep numeric := greatest(1 - coalesce(p_value_loss_pct, 0), 0);
  v_prev smallint;
  v_table text;
begin
  select * into l from das_listings where id = p_listing_id for update;
  if not found or l.seller_team_id <> p_seller_team_id then
    raise exception 'annonce_introuvable';
  end if;
  if l.status <> 'open' then
    raise exception 'annonce_close';
  end if;
  v_prev := l.round_number - 1;

  if p_bid_id is null then
    v_price := l.npc_offer_mad;
  else
    select * into b from das_bids
    where id = p_bid_id and listing_id = p_listing_id
    for update;
    if not found or b.status <> 'sealed' then
      raise exception 'offre_introuvable';
    end if;
    v_buyer := b.bidder_team_id;
    v_price := b.offer_mad;
    v_integration := b.integration_budget_mad;

    if exists (select 1 from teams where id = v_buyer and is_liquidated) then
      raise exception 'acheteur_liquide';
    end if;
    if exists (select 1 from team_units
               where team_id = v_buyer and das_id = l.das_id
                 and status in ('active', 'listed_for_sale')) then
      raise exception 'acheteur_deja_present';
    end if;
  end if;

  -- L'offre a pu être modifiée entre l'affichage et le clic : on ne conclut
  -- jamais à un autre prix que celui que le vendeur a lu.
  if v_price is distinct from p_expected_price_mad then
    raise exception 'offre_modifiee';
  end if;

  update das_listings
  set status = case when v_buyer is null then 'sold_to_npc' else 'sold_to_team' end,
      seller_choice = case when v_buyer is null then 'npc' else 'best_bid' end
  where id = p_listing_id;

  update das_bids
  set status = case when id = p_bid_id then 'won' else 'lost' end
  where listing_id = p_listing_id and status = 'sealed';

  -- Le vendeur perd le domaine, et le cash pooling qu'il y avait prévu : sans
  -- cela, ses transferts internes ne sommeraient plus à zéro.
  update team_units set status = 'sold'
  where team_id = l.seller_team_id and das_id = l.das_id;
  delete from das_cash_allocation
  where team_id = l.seller_team_id and das_id = l.das_id and round_number = l.round_number;

  insert into das_transfers (
    listing_id, round_number, seller_team_id, buyer_team_id, das_id,
    price_mad, integration_ratio, value_loss_pct, market_share_transferred)
  values (
    p_listing_id, l.round_number, l.seller_team_id, v_buyer, l.das_id,
    v_price, p_integration_ratio, p_value_loss_pct,
    case when v_buyer is null then 0 else p_share_transferred end);

  insert into deal_cash_movements (
    session_id, team_id, round_number, kind, amount_mad, is_investment,
    counterparty_team_id, das_id)
  values (
    l.session_id, l.seller_team_id, l.round_number, 'cession_das', v_price, false,
    v_buyer, l.das_id);

  if v_buyer is not null then
    insert into team_units (team_id, das_id, launched_round, status, acquired_from_team_id,
                            ansoff_movement, ansoff_risk_coefficient)
    values (v_buyer, l.das_id, l.round_number, 'active', l.seller_team_id,
            'diversification', 0.18)
    on conflict (team_id, das_id) do update set
      status = 'active',
      launched_round = excluded.launched_round,
      acquired_from_team_id = excluded.acquired_from_team_id;

    -- L'état de départ du tour : le dernier exercice clos du vendeur, amputé
    -- de ce que l'intégration détruit — part, capacité, chiffre d'affaires et
    -- notoriété au même rythme, la qualité à demi.
    perform atlas_clone_das_rows('team_das_round_metrics', l.seller_team_id, v_buyer, l.das_id, v_prev);
    update team_das_round_metrics m
    set market_share_pct  = m.market_share_pct * v_keep,
        capacity_units    = m.capacity_units * v_keep,
        cumulative_volume = m.cumulative_volume * v_keep,
        volume_sold       = m.volume_sold * v_keep,
        revenue_mad       = m.revenue_mad * v_keep,
        notoriety         = m.notoriety * v_keep,
        quality           = m.quality * (1 - (1 - v_keep) * 0.5),
        perceived_quality = m.perceived_quality * (1 - (1 - v_keep) * 0.5)
    where m.team_id = v_buyer and m.das_id = l.das_id
      and m.round_number = (select max(round_number) from team_das_round_metrics
                            where team_id = v_buyer and das_id = l.das_id
                              and round_number <= v_prev);

    perform atlas_clone_das_rows('das_hr_state', l.seller_team_id, v_buyer, l.das_id, v_prev);

    -- Ce qui est en vigueur : l'acheteur reprend une entreprise qui tourne,
    -- avec sa stratégie, son organisation et ses contrats — à lui d'en changer.
    foreach v_table in array array[
      'das_decisions', 'das_hr_decisions', 'das_org_design', 'das_positions',
      'das_direction_budgets', 'das_direction_kpis', 'das_strategic_axes',
      'das_group_directives', 'procurement_contracts', 'distribution_contracts'
    ] loop
      perform atlas_clone_das_rows(v_table, l.seller_team_id, v_buyer, l.das_id, l.round_number);
    end loop;

    insert into deal_cash_movements (
      session_id, team_id, round_number, kind, amount_mad, is_investment,
      counterparty_team_id, das_id)
    values (
      l.session_id, v_buyer, l.round_number, 'rachat_das', -(v_price + v_integration), true,
      l.seller_team_id, l.das_id);
  end if;

  return jsonb_build_object('buyerTeamId', v_buyer, 'priceMad', v_price, 'dasId', l.das_id);
end;
$$;

-- ── Conclure — ou refuser — une acquisition ─────────────────────────────────
create or replace function atlas_settle_acquisition(
  p_session_id uuid,
  p_team_id uuid,
  p_target_actor_id uuid,
  p_round smallint,
  p_offer_mad numeric,
  p_integration_mad numeric,
  p_reserve_mad numeric,
  p_value_loss_pct numeric,
  p_share_acquired numeric,
  p_revenue_acquired numeric,
  p_capacity_acquired numeric,
  p_notoriety_acquired numeric,
  p_quality_acquired numeric
) returns text
language plpgsql security definer set search_path = atlas, public as $$
declare
  a record;
  v_operation text;
  v_prev smallint := p_round - 1;
begin
  select * into a from ecosystem_actors where id = p_target_actor_id for update;
  if not found or a.session_id <> p_session_id then
    raise exception 'cible_introuvable';
  end if;

  v_operation := case a.actor_type
    when 'fournisseur' then 'integration_amont'
    when 'distributeur' then 'integration_aval'
    else 'entree_das' end;

  if a.owner_team_id is not null then
    raise exception 'cible_deja_rachetee';
  end if;
  if v_operation = 'entree_das' and not coalesce(a.market_open, false) then
    raise exception 'cible_fermee';
  end if;
  if exists (select 1 from acquisition_offers
             where bidder_team_id = p_team_id and target_actor_id = p_target_actor_id
               and round_number = p_round and status in ('won', 'rejected')) then
    raise exception 'offre_deja_faite';
  end if;

  if p_offer_mad < p_reserve_mad then
    insert into acquisition_offers (
      session_id, bidder_team_id, target_actor_id, das_id, operation, round_number,
      offer_mad, integration_budget_mad, status)
    values (
      p_session_id, p_team_id, p_target_actor_id, a.das_id, v_operation, p_round,
      p_offer_mad, p_integration_mad, 'rejected')
    on conflict (bidder_team_id, target_actor_id, round_number) do update set
      offer_mad = excluded.offer_mad,
      integration_budget_mad = excluded.integration_budget_mad,
      status = 'rejected';
    return 'rejected';
  end if;

  insert into acquisition_offers (
    session_id, bidder_team_id, target_actor_id, das_id, operation, round_number,
    offer_mad, integration_budget_mad, status, resolved_price_mad, value_loss_pct,
    market_share_acquired)
  values (
    p_session_id, p_team_id, p_target_actor_id, a.das_id, v_operation, p_round,
    p_offer_mad, p_integration_mad, 'won', p_offer_mad, p_value_loss_pct, p_share_acquired)
  on conflict (bidder_team_id, target_actor_id, round_number) do update set
    offer_mad = excluded.offer_mad,
    integration_budget_mad = excluded.integration_budget_mad,
    status = 'won',
    resolved_price_mad = excluded.resolved_price_mad,
    value_loss_pct = excluded.value_loss_pct,
    market_share_acquired = excluded.market_share_acquired;

  -- Les offres scellées d'avant ce changement de règle perdent la cible.
  update acquisition_offers set status = 'lost'
  where target_actor_id = p_target_actor_id and round_number = p_round and status = 'sealed';

  -- La cible appartient désormais à l'équipe : elle quitte le marché et cesse
  -- d'être un concurrent indépendant. Ces deux écritures manquaient : un
  -- maillon racheté ne devenait jamais « détenu », et une entreprise rachetée
  -- restait à vendre.
  update ecosystem_actors
  set owner_team_id = p_team_id,
      acquired_round = p_round,
      integration_quality = 1 - p_value_loss_pct,
      market_open = case when v_operation = 'entree_das' then false else market_open end
  where id = p_target_actor_id;

  if v_operation = 'entree_das' then
    insert into team_units (team_id, das_id, launched_round, status, ansoff_movement,
                            ansoff_risk_coefficient)
    values (p_team_id, a.das_id, p_round, 'active', 'diversification', 0.18)
    on conflict (team_id, das_id) do update set
      status = 'active',
      launched_round = case
        when team_units.status in ('active', 'listed_for_sale') then team_units.launched_round
        else excluded.launched_round end;

    -- L'état de départ du tour (voir migration 0037) : sur un domaine déjà
    -- exploité, les positions s'additionnent — c'est une consolidation.
    insert into team_das_round_metrics (
      team_id, das_id, round_number,
      quality, perceived_quality, notoriety,
      capacity_units, cumulative_volume, volume_sold,
      stockout_rate, market_share_pct, revenue_mad, automation_level)
    values (
      p_team_id, a.das_id, v_prev,
      p_quality_acquired, p_quality_acquired, p_notoriety_acquired,
      p_capacity_acquired, p_capacity_acquired, p_capacity_acquired,
      0, p_share_acquired, p_revenue_acquired, 0)
    on conflict (team_id, das_id, round_number) do update set
      capacity_units    = coalesce(team_das_round_metrics.capacity_units, 0) + excluded.capacity_units,
      cumulative_volume = coalesce(team_das_round_metrics.cumulative_volume, 0) + excluded.cumulative_volume,
      volume_sold       = coalesce(team_das_round_metrics.volume_sold, 0) + excluded.volume_sold,
      market_share_pct  = least(coalesce(team_das_round_metrics.market_share_pct, 0) + excluded.market_share_pct, 1),
      revenue_mad       = coalesce(team_das_round_metrics.revenue_mad, 0) + coalesce(excluded.revenue_mad, 0);
  end if;

  insert into deal_cash_movements (
    session_id, team_id, round_number, kind, amount_mad, is_investment, das_id, target_actor_id)
  values (
    p_session_id, p_team_id, p_round, 'acquisition', -(p_offer_mad + p_integration_mad), true,
    a.das_id, p_target_actor_id);

  return 'won';
end;
$$;

-- ── Fermer le marché à la résolution ────────────────────────────────────────
create or replace function atlas_close_deal_market(p_session_id uuid)
returns int
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_count int;
begin
  update das_bids b set status = 'lost'
  from das_listings l
  where b.listing_id = l.id and l.session_id = p_session_id
    and l.status = 'open' and b.status = 'sealed';

  update team_units tu set status = 'active'
  from das_listings l
  where l.session_id = p_session_id and l.status = 'open'
    and tu.team_id = l.seller_team_id and tu.das_id = l.das_id
    and tu.status = 'listed_for_sale';

  update das_listings set status = 'expired'
  where session_id = p_session_id and status = 'open';
  get diagnostics v_count = row_count;

  update acquisition_offers set status = 'lost'
  where session_id = p_session_id and status = 'sealed';

  return v_count;
end;
$$;

revoke all on function atlas_clone_das_rows(text, uuid, uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function atlas_settle_listing(uuid, uuid, uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function atlas_settle_acquisition(uuid, uuid, uuid, smallint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function atlas_close_deal_market(uuid) from public, anon, authenticated;
grant execute on function atlas_clone_das_rows(text, uuid, uuid, uuid, smallint) to service_role;
grant execute on function atlas_settle_listing(uuid, uuid, uuid, numeric, numeric, numeric, numeric) to service_role;
grant execute on function atlas_settle_acquisition(uuid, uuid, uuid, smallint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;
grant execute on function atlas_close_deal_market(uuid) to service_role;
