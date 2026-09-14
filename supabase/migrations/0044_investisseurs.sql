-- =============================================================================
-- ATLAS — Migration 0044 : les investisseurs, et la fiche de marché des cibles
--
-- 1. ATTRACTIVITÉ POUR LES INVESTISSEURS
--
--    La levée de fonds propres et le dividende existaient (migration 0031),
--    mais sans interlocuteur : le dividende n'était qu'une sortie de trésorerie,
--    la levée un robinet à 2 % de frais quelle que soit la santé du Groupe.
--    Le moteur calcule désormais, à chaque résolution, un indice d'attractivité
--    (`src/lib/engine/investors.ts`) qui fixe au tour suivant le coût et le
--    plafond d'une levée, et la prime de risque bancaire.
--
--    Écrit par une fonction dédiée, appelée par `atlas_persist_resolution`
--    APRÈS le cœur : elle ne fait que compléter des lignes que le cœur vient
--    d'insérer, dans la même transaction.
--
-- 2. FICHE DE MARCHÉ DES CIBLES D'ACQUISITION
--
--    Une équipe ne pouvait rien savoir d'une cible sans payer une due
--    diligence. Or un acquéreur connaît AVANT d'ouvrir les livres ce que la
--    place en dit : un ordre de grandeur de chiffre d'affaires, une position de
--    marché, un effectif, une réputation de solidité. La vue les expose en
--    FOURCHETTES LARGES (± 40 %, plus larges que la note express du cabinet) et
--    en classes qualitatives. Les montants exacts, la marge, l'EBITDA et les
--    passifs non déclarés restent ce que la due diligence vend.
-- =============================================================================

set search_path = atlas, public, extensions;

-- ── 1. Investisseurs ─────────────────────────────────────────────────────────
alter table team_round_state
  add column if not exists investor_attractiveness numeric
    check (investor_attractiveness is null or investor_attractiveness between 0 and 100),
  add column if not exists investor_components jsonb;

comment on column team_round_state.investor_attractiveness is
  'Attractivité du Groupe pour les investisseurs, 0–100, mémoire du tour précédent comprise. '
  'Fixe au tour suivant le coût et le plafond d''une levée de fonds propres, et la prime de risque bancaire.';
comment on column team_round_state.investor_components is
  'Les cinq composantes de l''attractivité (rentabilité, croissance, solidité, politique de dividende, '
  'cohérence) : clé, libellé, poids, note, lecture.';

alter table pnl_statements
  add column if not exists payout_ratio numeric,
  add column if not exists equity_issue_cost_pct numeric;

comment on column pnl_statements.payout_ratio is
  'Dividende rapporté au résultat distribuable de l''exercice clos. Null sans résultat à distribuer.';
comment on column pnl_statements.equity_issue_cost_pct is
  'Frais et décote effectivement prélevés sur la levée du tour, en part du montant levé. Null sans levée.';

create or replace function atlas_persist_investors(p_payload jsonb, p_round smallint)
returns void
language plpgsql
security definer
set search_path to 'atlas', 'public', 'extensions'
as $function$
begin
  update team_round_state s set
    investor_attractiveness = (e->>'score')::numeric,
    investor_components     = e->'components'
  from jsonb_array_elements(coalesce(p_payload->'investors', '[]'::jsonb)) as e
  where s.team_id = (e->>'teamId')::uuid
    and s.round_number = p_round;

  update pnl_statements p set
    payout_ratio          = (e->>'payoutRatio')::numeric,
    equity_issue_cost_pct = (e->>'equityIssueCostPct')::numeric
  from jsonb_array_elements(coalesce(p_payload->'investors', '[]'::jsonb)) as e
  where p.team_id = (e->>'teamId')::uuid
    and p.round_number = p_round;
end;
$function$;

revoke all on function atlas_persist_investors(jsonb, smallint) from public, anon, authenticated;

create or replace function atlas_persist_resolution(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'atlas', 'public', 'extensions'
as $function$
declare
  v_run_id uuid;
  v_session_id uuid := (p_payload->>'session_id')::uuid;
  v_round smallint := (p_payload->>'round_number')::smallint;
begin
  v_run_id := atlas_persist_resolution_core(p_payload);
  perform atlas_persist_acquisitions(p_payload, v_round);
  perform atlas_persist_group_alignment(p_payload, v_round);
  perform atlas_persist_das_pnl(p_payload, v_round);
  perform atlas_persist_das_hr(p_payload, v_round);
  perform atlas_persist_blue_ocean(p_payload, v_round);
  perform atlas_persist_investors(p_payload, v_round);

  update game_sessions set status = 'round_resolved' where id = v_session_id;

  return v_run_id;
end;
$function$;

-- ── 2. Fiche de marché des cibles ────────────────────────────────────────────
--
-- `create or replace` et non `drop` : les colonnes existantes gardent leur
-- ordre, les nouvelles s'ajoutent à la fin. security definer assumé comme en
-- 0032 : la clause WHERE reste l'unique garde.
create or replace view acquisition_targets_public as
select
  a.id                        as target_actor_id,
  a.session_id,
  a.das_id,
  u.name                      as das_name,
  u.sector_key,
  a.name                      as target_name,
  a.region_key,
  case
    when u.base_market_size_mad is null or u.base_market_size_mad <= 0 then 'moyenne'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.02 then 'petite'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.08 then 'moyenne'
    else 'grande'
  end                         as size_class,
  -- Ce que la place en dit : des fourchettes à ± 40 %, arrondies à la dizaine
  -- de millions — plus larges que la note express du cabinet (± 25 %).
  round(coalesce(r.revenue_mad, 0) * 0.6, -7)  as revenue_band_min_mad,
  round(coalesce(r.revenue_mad, 0) * 1.4, -7)  as revenue_band_max_mad,
  case
    when u.base_market_size_mad is null or u.base_market_size_mad <= 0 then null
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.02 then 'moins de 2 %'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.05 then 'entre 2 et 5 %'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.08 then 'entre 5 et 8 %'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.15 then 'entre 8 et 15 %'
    else 'plus de 15 %'
  end                         as market_share_band,
  -- Un effectif à la centaine près : même règle que la due diligence
  -- (capacité ÷ 14 000), sans sa précision.
  round(coalesce(r.capacity_units, 0) / 14000.0, -2)::int as headcount_approx,
  -- Une réputation, pas une marge : trois classes.
  case
    when r.financial_health is null then null
    when r.financial_health < 40 then 'fragile'
    when r.financial_health < 70 then 'correcte'
    else 'solide'
  end                         as health_band
from ecosystem_actors a
join strategic_units u on u.id = a.das_id
left join lateral (
  select rr.revenue_mad, rr.capacity_units, rr.financial_health
  from ecosystem_actor_rounds rr
  where rr.actor_id = a.id
    -- La trajectoire d'une cible est provisionnée d'avance jusqu'au dernier
    -- tour possible : sans cette borne, la fiche publiait dès l'onboarding le
    -- chiffre d'affaires du tour 10.
    and rr.round_number <= (select g.current_round from game_sessions g where g.id = a.session_id)
  order by rr.round_number desc
  limit 1
) r on true
where a.actor_type = 'cible_acquisition'
  and a.market_open
  and a.session_id in (
    select atlas_team_session(t.t) from unnest(array(select atlas_team_ids())) t(t)
  );

grant select on acquisition_targets_public to authenticated;

comment on view acquisition_targets_public is
  'Cibles d''acquisition ouvertes par le facilitateur. security definer assumé : '
  'la clause WHERE est l''unique garde. Expose ce qu''un acquéreur sait avant d''ouvrir les livres : '
  'identité, classe de taille, et une fiche de marché en FOURCHETTES LARGES (± 40 %) et en classes. '
  'Montants exacts, marge, EBITDA et passifs non déclarés restent vendus par la due diligence : '
  'ne jamais y ajouter une colonne plus précise que la note express du cabinet.';
