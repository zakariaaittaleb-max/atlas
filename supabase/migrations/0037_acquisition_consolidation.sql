-- =============================================================================
-- ATLAS — Migration 0037 : acquérir pour CONSOLIDER un domaine qu'on exploite
--
-- Le référentiel financier demande ce levier : « acquisition d'un concurrent
-- pour consolider un DAS existant », avec pour bénéfice un pouvoir de fixation
-- des prix accru et pour risque le choc culturel ou le surpaiement.
--
-- Le jeu l'INTERDISAIT. L'écran écartait toute cible située dans un domaine
-- déjà exploité, au motif qu'il s'agirait d'une consolidation et non d'une
-- entrée — ce qui est exact, et c'est précisément le levier qui manquait.
--
-- ── CE QUE LA PERSISTANCE FAISAIT DE FAUX ───────────────────────────────────
-- Sa clause de conflit REMPLAÇAIT la position de l'acquéreur par celle de la
-- cible. Une équipe détenant 30 % d'un marché qui rachetait un concurrent à
-- 8 % se serait donc retrouvée avec 8 % : l'acquisition l'aurait ruinée. Les
-- positions s'ADDITIONNENT désormais — part de marché, capacité, volume
-- cumulé — ce qui est la définition même d'une consolidation.
--
-- La qualité et la notoriété, elles, ne s'additionnent pas : ce sont des
-- indices de 0 à 100. L'acquéreur garde les siennes, et c'est le sens du risque
-- annoncé — on absorbe une position commerciale, pas une marque ni un
-- savoir-faire. Le `greatest` ne s'applique qu'au cas d'une ENTRÉE, où
-- l'acquéreur n'avait aucune position et où la ligne est créée.
-- =============================================================================

set search_path = atlas, public, extensions;

create or replace function atlas_persist_acquisitions(
  p_payload jsonb,
  p_round smallint
) returns int
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_count int := 0;
begin
  -- Le portefeuille de l'acquéreur s'élargit. Sur un domaine déjà détenu, la
  -- ligne existe : on la garde active sans réécrire son tour d'entrée, qui
  -- porte l'ancienneté et le risque d'Ansoff.
  insert into team_units (team_id, das_id, launched_round, status, ansoff_movement,
                          ansoff_risk_coefficient)
  select
    (a->>'buyerTeamId')::uuid, (a->>'dasId')::uuid, p_round, 'active',
    'diversification', 0.18
  from jsonb_array_elements(coalesce(p_payload->'acquisitions', '[]'::jsonb)) as a
  on conflict (team_id, das_id) do update set
    status = 'active';

  -- État du domaine après l'opération : c'est le « tour précédent » que lira la
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
    -- CONSOLIDATION : les positions s'additionnent. Remplacer aurait fait
    -- perdre à l'acquéreur tout ce qu'il détenait déjà.
    capacity_units   = team_das_round_metrics.capacity_units + excluded.capacity_units,
    cumulative_volume = team_das_round_metrics.cumulative_volume + excluded.cumulative_volume,
    volume_sold      = team_das_round_metrics.volume_sold + excluded.volume_sold,
    -- Une part de marché reste une part : on borne à 100 %.
    market_share_pct = least(
      coalesce(team_das_round_metrics.market_share_pct, 0) + excluded.market_share_pct, 1),
    revenue_mad      = coalesce(team_das_round_metrics.revenue_mad, 0)
                       + coalesce(excluded.revenue_mad, 0);

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
