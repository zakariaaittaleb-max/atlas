-- =============================================================================
-- ATLAS — 0018 : un domaine acquis entre avec son chiffre d'affaires
-- =============================================================================
--
-- L'état initial du domaine acheté inscrivait `revenue_mad = 0`, alors que le
-- poids réel de la cible était bien chargé côté serveur et transmis au moteur.
-- Un domaine racheté entrait donc au portefeuille SANS PASSÉ COMMERCIAL, et le
-- tour suivant en tirait quatre conséquences fausses :
--
--   • il ne pesait rien dans le SAB pondéré par le chiffre d'affaires — son
--     alignement, bon ou mauvais, n'influait pas sur l'indice du groupe ;
--   • son rôle de portefeuille devenait injugeable : `roleFit` rend 50 faute
--     de part de chiffre d'affaires, donc ni récompense ni sanction ;
--   • il ne comptait pas dans l'intégration verticale, pondérée de la même
--     façon ;
--   • un océan bleu s'y déclarait GRATUITEMENT, le ticket d'entrée étant
--     proportionnel à un chiffre d'affaires nul.
--
-- Le moteur rend désormais `revenueAcquired` — le chiffre d'affaires de la
-- cible, amputé de ce que l'intégration détruit.
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
    0, (a->>'marketShareAcquired')::numeric,
    coalesce((a->>'revenueAcquired')::numeric, 0), 0
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb)) as a
  on conflict (team_id, das_id, round_number) do update set
    capacity_units = excluded.capacity_units,
    market_share_pct = excluded.market_share_pct,
    notoriety = excluded.notoriety,
    quality = excluded.quality,
    revenue_mad = excluded.revenue_mad;

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

-- `create or replace` conserve l'ACL existante ; on la réaffirme pour que la
-- migration soit lisible seule, avec le même idiome que 0010a.
revoke execute on function atlas_persist_acquisitions(jsonb, smallint) from public;
grant execute on function atlas_persist_acquisitions(jsonb, smallint) to service_role;
