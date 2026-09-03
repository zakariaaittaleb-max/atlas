set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0010 : persister les acquisitions externes
--
-- Une acquisition fait ENTRER une équipe dans un domaine où elle n'était pas.
-- Elle crée donc trois choses en une transaction : la ligne de portefeuille,
-- l'état initial du DAS acquis, et la trace de l'opération.
--
-- Le tout dans `atlas_persist_resolution`, jamais en appels séparés : une
-- acquisition à moitié écrite laisserait une équipe propriétaire d'un domaine
-- sans capacité, ou l'inverse.
-- =============================================================================

create or replace function atlas_persist_acquisitions(
  p_payload jsonb,
  p_round smallint
) returns int
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_count int := 0;
begin
  -- Le portefeuille de l'acquéreur s'élargit.
  insert into team_units (team_id, das_id, launched_round, status, ansoff_movement,
                          ansoff_risk_coefficient)
  select
    (a->>'buyerTeamId')::uuid, (a->>'dasId')::uuid, p_round, 'active',
    -- Entrer dans un métier nouveau par acquisition reste une diversification :
    -- le coefficient de risque d'Ansoff s'applique, atténué par le fait qu'on
    -- rachète une position constituée plutôt que de partir de zéro.
    'diversification', 0.18
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb)) as a
  on conflict (team_id, das_id) do update set
    status = 'active',
    launched_round = excluded.launched_round;

  -- État initial du domaine acquis : c'est le « tour précédent » que lira la
  -- résolution suivante. Sans lui, le DAS repartirait de zéro et l'acquisition
  -- n'aurait rien acheté.
  insert into team_das_round_metrics (
    team_id, das_id, round_number,
    quality, perceived_quality, notoriety,
    capacity_units, cumulative_volume, volume_sold,
    stockout_rate, market_share_pct, revenue_mad, automation_level)
  select
    (a->>'buyerTeamId')::uuid, (a->>'dasId')::uuid, p_round,
    (a->>'qualityAcquired')::numeric, (a->>'qualityAcquired')::numeric,
    (a->>'notorietyAcquired')::numeric,
    (a->>'capacityAcquired')::numeric, (a->>'capacityAcquired')::numeric,
    (a->>'capacityAcquired')::numeric,
    0, (a->>'marketShareAcquired')::numeric, 0, 0
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb)) as a
  on conflict (team_id, das_id, round_number) do update set
    capacity_units = excluded.capacity_units,
    market_share_pct = excluded.market_share_pct,
    notoriety = excluded.notoriety,
    quality = excluded.quality;

  -- Les offres retenues et écartées sont marquées : au débriefing, une équipe
  -- doit pouvoir constater de combien elle a manqué une cible.
  update acquisition_offers o
  set status = 'won',
      resolved_price_mad = (a->>'pricePaidMad')::numeric,
      value_loss_pct = (a->>'valueLossPct')::numeric,
      market_share_acquired = (a->>'marketShareAcquired')::numeric
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb)) as a
  where o.id = (a->>'offerId')::uuid;

  update acquisition_offers
  set status = 'lost'
  where round_number = p_round and status = 'sealed';

  select count(*) into v_count
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb));

  return v_count;
end;
$$;

revoke execute on function atlas_persist_acquisitions(jsonb, smallint) from public;
grant execute on function atlas_persist_acquisitions(jsonb, smallint) to service_role;

-- Branchement dans la transaction de résolution, juste avant la bascule d'état.
create or replace function atlas_persist_resolution(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_run_id uuid;
  v_session_id uuid := (p_payload->>'session_id')::uuid;
  v_round smallint := (p_payload->>'round_number')::smallint;
begin
  -- Le corps historique est conservé tel quel ; on ne fait qu'y ajouter les
  -- acquisitions. Pour éviter de dupliquer deux cents lignes, on rétablit
  -- l'ancienne fonction sous un autre nom et on l'appelle.
  v_run_id := atlas_persist_resolution_core(p_payload);
  perform atlas_persist_acquisitions(p_payload, v_round);

  -- La bascule qui déclenche la révélation intervient APRÈS les acquisitions :
  -- aucune équipe ne doit voir les résultats avant que les portefeuilles ne
  -- soient à jour.
  update game_sessions set status = 'round_resolved' where id = v_session_id;

  return v_run_id;
end;
$$;

revoke execute on function atlas_persist_resolution(jsonb) from public;
grant execute on function atlas_persist_resolution(jsonb) to service_role;
