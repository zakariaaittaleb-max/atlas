set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0015 : persistance de l'état RH par DAS
--
-- Climat social, charge de travail, rotation, compétence, masse salariale,
-- indemnités versées et aides publiques perçues — domaine par domaine.
--
-- L'enveloppe est réécrite ici dans son état FINAL : noyau, acquisitions,
-- conformité au groupe, compte de résultat par DAS, état RH par DAS, puis la
-- bascule de statut. Cette bascule reste en dernier : aucune équipe ne doit
-- voir les résultats avant que les portefeuilles ne soient à jour.
-- =============================================================================

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
    severance_paid_mad, subsidies_mad
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
    coalesce((e->>'subsidiesMad')::numeric, 0)
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
    subsidies_mad         = excluded.subsidies_mad;
end;
$$;

revoke all on function atlas_persist_das_hr(jsonb, smallint) from public, anon, authenticated;

create or replace function atlas_persist_resolution(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = atlas, public, extensions
as $$
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

  update game_sessions set status = 'round_resolved' where id = v_session_id;

  return v_run_id;
end;
$$;
