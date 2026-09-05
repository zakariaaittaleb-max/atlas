-- =============================================================================
-- ATLAS — 0017 : l'océan bleu devient un ÉTAT, et non plus une case cochée
-- =============================================================================
--
-- La case « déclarer un océan bleu » était écrite dans `das_decisions` et lue
-- par personne. Rien ne la transformait en état d'unité : `team_units.blue_ocean`
-- restait à `false` pour toujours, si bien que le code de répartition qui
-- l'attend — hors somme nulle — n'était jamais atteint. Ni le ticket d'entrée,
-- ni le risque d'échec, ni la marge multipliée par 2,5 n'existaient, alors que
-- l'écran promettait les trois à l'équipe au moment de décider.
--
-- Le moteur arrête désormais la fenêtre à chaque tour et la rend dans
-- `das_metrics`. Cette fonction l'inscrit sur l'unité, seul endroit d'où le
-- tour suivant peut la relire.
-- =============================================================================

create or replace function atlas_persist_blue_ocean(p_payload jsonb, p_round smallint)
returns void
language plpgsql
security definer
set search_path = atlas, public, extensions
as $$
begin
  -- `p_round` n'est pas un filtre : l'unité porte un état courant, pas un
  -- historique. Il figure dans la signature pour rester homogène avec les
  -- autres fonctions de persistance, que l'orchestrateur appelle de la même
  -- façon.
  perform p_round;

  update team_units u
  set blue_ocean = coalesce((m->>'blueOceanActive')::boolean, false),
      blue_ocean_rounds_left = greatest(coalesce((m->>'blueOceanRoundsLeft')::int, 0), 0)
  from jsonb_array_elements(coalesce(p_payload->'das_metrics', '[]'::jsonb)) as m
  where u.team_id = (m->>'teamId')::uuid
    and u.das_id = (m->>'dasId')::uuid;
end;
$$;

revoke all on function atlas_persist_blue_ocean(jsonb, smallint) from public, anon, authenticated;

-- L'orchestrateur, augmenté d'un appel. Le corps est réécrit en entier : c'est
-- la seule façon de garder l'ordre des étapes lisible d'un seul tenant.
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
  perform atlas_persist_blue_ocean(p_payload, v_round);

  update game_sessions set status = 'round_resolved' where id = v_session_id;

  return v_run_id;
end;
$$;
