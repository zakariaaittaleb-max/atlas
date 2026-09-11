set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0038 : la boucle RH se referme sur l'économie
--
-- ── LE DÉFAUT CORRIGÉ ────────────────────────────────────────────────────────
-- La chaîne RH se refermait sur elle-même. Les décisions faisaient le climat,
-- le climat faisait la rotation et la compétence, la compétence faisait la
-- charge de travail, la charge de travail refaisait le climat. RIEN n'en
-- sortait vers la production.
--
-- Conséquence mesurable : une équipe pouvait payer au minimum, ne jamais
-- former et licencier à chaque tour sans produire une unité de moins ni perdre
-- un point de part de marché. La rotation était bornée entre 0 et 1 par cette
-- même base, persistée, affichée avec la phrase « ce sont les plus qualifiés
-- qui partent » — et personne ne partait jamais.
--
-- Deux grandeurs manquaient en base pour que le moteur puisse faire subir au
-- tour suivant ce qui a été décidé au tour présent :
--
--   • `quality_loss_pts` — les points de qualité que les coupes d'effectif
--     emportent au-delà de ce que la standardisation autorisait. Le moteur les
--     calculait déjà et les jetait, faute de colonne pour les porter.
--   • `departures_count` — les départs SUBIS, distingués des licenciements.
--     Sans ce chiffre, un effectif qui fond sans licenciement passerait pour
--     une erreur de calcul aux yeux de l'équipe.
-- =============================================================================

alter table das_hr_state
  add column if not exists quality_loss_pts numeric not null default 0
    check (quality_loss_pts >= 0),
  add column if not exists departures_count int not null default 0
    check (departures_count >= 0);

comment on column das_hr_state.quality_loss_pts is
  'Points de qualité perdus par les coupes au-delà du seuil sûr. Appliqués au tour SUIVANT : un atelier ne perd pas son tour de main le jour de la notification.';
comment on column das_hr_state.departures_count is
  'Départs subis, conséquence de la rotation du tour précédent. Distincts des licenciements : l''un se décide, l''autre s''impose.';

create or replace function atlas_persist_das_hr(
  p_payload jsonb,
  p_round smallint
) returns void
language plpgsql
security definer
set search_path = atlas, public, extensions
as $$
begin
  insert into das_hr_state (
    team_id, das_id, round_number,
    headcount, climat_social, productivity, standardisation_level, automation_level,
    turnover_rate, payroll_mad, workload_index, overstaffing_pct, skill_index,
    severance_paid_mad, subsidies_mad, quality_loss_pts, departures_count
  )
  select
    (e->>'teamId')::uuid,
    (e->>'dasId')::uuid,
    p_round,
    coalesce((e->>'headcount')::int, 0),
    (e->>'climatSocial')::numeric,
    (e->>'productivity')::numeric,
    (e->>'standardisationLevel')::numeric,
    (e->>'automationLevel')::numeric,
    least(greatest((e->>'turnoverRate')::numeric, 0), 1),
    coalesce((e->>'payrollMad')::numeric, 0),
    (e->>'workloadIndex')::numeric,
    (e->>'overstaffingPct')::numeric,
    (e->>'skillIndex')::numeric,
    coalesce((e->>'severancePaidMad')::numeric, 0),
    coalesce((e->>'subsidiesMad')::numeric, 0),
    -- Le plancher à zéro protège la contrainte : `qualityLossFromCuts` ne rend
    -- jamais de négatif, mais une colonne contrainte ne doit pas dépendre de la
    -- bonne conduite de l'appelant.
    greatest(coalesce((e->>'qualityLossPts')::numeric, 0), 0),
    greatest(coalesce((e->>'departuresCount')::int, 0), 0)
  from jsonb_array_elements(coalesce(p_payload->'das_hr', '[]'::jsonb)) as e
  on conflict (team_id, das_id, round_number) do update set
    headcount             = excluded.headcount,
    climat_social         = excluded.climat_social,
    productivity          = excluded.productivity,
    standardisation_level = excluded.standardisation_level,
    automation_level      = excluded.automation_level,
    turnover_rate         = excluded.turnover_rate,
    payroll_mad           = excluded.payroll_mad,
    workload_index        = excluded.workload_index,
    overstaffing_pct      = excluded.overstaffing_pct,
    skill_index           = excluded.skill_index,
    severance_paid_mad    = excluded.severance_paid_mad,
    subsidies_mad         = excluded.subsidies_mad,
    quality_loss_pts      = excluded.quality_loss_pts,
    departures_count      = excluded.departures_count;
end;
$$;

revoke all on function atlas_persist_das_hr(jsonb, smallint) from public, anon, authenticated;

-- Les équipes lisent leur propre état RH : les deux colonnes doivent être
-- visibles, sinon l'écran affiche un effectif qui fond sans pouvoir le nommer.
-- Le grant est au niveau de la TABLE côté 0013/0015 ; on le rejoue par colonne
-- pour les installations où le grant était colonne par colonne.
do $$
begin
  execute 'grant select (quality_loss_pts, departures_count) on das_hr_state to authenticated';
exception when others then
  -- Un grant de table déjà en place rend celui-ci sans objet : ne pas échouer.
  null;
end $$;
