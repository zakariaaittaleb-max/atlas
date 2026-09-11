set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0039 : l'orientation de formation atteint enfin la qualité
--
-- ── LE DÉFAUT CORRIGÉ ────────────────────────────────────────────────────────
-- `TRAINING_FOCUS_EFFECTS` déclare quatre coefficients de rendement QUALITÉ —
-- 1,15 pour le geste métier, 1,40 pour « normes et contrôle », 0,90 pour
-- l'encadrement, 0,95 pour la polyvalence — et aucun n'était lu. Les trois
-- autres colonnes du même tableau (compétence, climat, standardisation)
-- étaient branchées ; celle-là avait été oubliée.
--
-- C'est la pire configuration possible : l'écran annonce « normes et contrôle,
-- la montée en gamme » et le moteur applique le rendement du geste métier. Une
-- équipe qui oriente sa formation vers la qualité pour tenir une stratégie de
-- différenciation obtenait exactement le même produit que sa voisine.
--
-- Le facteur est PERSISTÉ, et non l'orientation : l'effet s'applique au tour
-- suivant, et l'état RH doit porter ce que le moteur a réellement calculé —
-- budget compris, car cocher une orientation sans budget ne forme personne.
-- =============================================================================

alter table das_hr_state
  add column if not exists quality_focus_factor numeric not null default 1
    check (quality_focus_factor between 0 and 3);

comment on column das_hr_state.quality_focus_factor is
  'Rendement qualité de l''orientation de formation, pondéré par le budget engagé. 1 = neutre, y compris quand rien n''a été formé. Appliqué au gain de qualité du tour suivant.';

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
    severance_paid_mad, subsidies_mad, quality_loss_pts, departures_count,
    quality_focus_factor
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
    greatest(coalesce((e->>'qualityLossPts')::numeric, 0), 0),
    greatest(coalesce((e->>'departuresCount')::int, 0), 0),
    -- Borné comme la contrainte de colonne : un facteur hors barème serait le
    -- signe d'un tableau de coefficients édité sans relire la contrainte, et
    -- refuser l'écriture vaut mieux qu'annuler toute la résolution.
    least(greatest(coalesce((e->>'qualityFocusFactor')::numeric, 1), 0), 3)
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
    departures_count      = excluded.departures_count,
    quality_focus_factor  = excluded.quality_focus_factor;
end;
$$;

revoke all on function atlas_persist_das_hr(jsonb, smallint) from public, anon, authenticated;
