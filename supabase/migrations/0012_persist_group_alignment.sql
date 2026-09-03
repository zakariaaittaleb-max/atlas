set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0012 : persistance du SAG
--
-- Fonction SÉPARÉE plutôt qu'un ajout dans `atlas_persist_resolution_core` :
-- celui-ci fait 9 500 caractères, et le réécrire pour y glisser vingt lignes
-- est le meilleur moyen d'en casser une autre. La leçon est apprise — la
-- migration 0010 avait remplacé le corps par une enveloppe appelant une
-- fonction qui n'existait pas, et la résolution était morte le temps de s'en
-- apercevoir. On n'ajoute désormais que par composition.
-- =============================================================================

create or replace function atlas_persist_group_alignment(
  p_payload jsonb,
  p_round smallint
) returns void
language plpgsql
security definer
set search_path = atlas, public, extensions
as $$
begin
  insert into das_group_alignment (
    team_id, das_id, round_number,
    sag_score, role_fit, mutualisation_fit, hq_fit, identity_fit, divergence_note
  )
  select
    (e->>'teamId')::uuid,
    (e->>'dasId')::uuid,
    p_round,
    (e->>'sag')::numeric,
    (e->>'roleFit')::numeric,
    (e->>'mutualisationFit')::numeric,
    (e->>'hqFit')::numeric,
    (e->>'identityFit')::numeric,
    e->>'divergenceNote'
  from jsonb_array_elements(coalesce(p_payload->'group_alignment', '[]'::jsonb)) as e
  on conflict (team_id, das_id, round_number) do update set
    sag_score         = excluded.sag_score,
    role_fit          = excluded.role_fit,
    mutualisation_fit = excluded.mutualisation_fit,
    hq_fit            = excluded.hq_fit,
    identity_fit      = excluded.identity_fit,
    divergence_note   = excluded.divergence_note;
end;
$$;

revoke all on function atlas_persist_group_alignment(jsonb, smallint) from public, anon, authenticated;

-- L'enveloppe, réécrite à l'identique avec UNE ligne de plus.
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

  -- La bascule qui déclenche la révélation intervient APRÈS les acquisitions :
  -- aucune équipe ne doit voir les résultats avant que les portefeuilles ne
  -- soient à jour.
  update game_sessions set status = 'round_resolved' where id = v_session_id;

  return v_run_id;
end;
$$;
