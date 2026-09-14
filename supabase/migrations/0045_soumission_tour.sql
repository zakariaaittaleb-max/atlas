set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0045 : soumettre son tour
--
-- Le bouton « Déclarer mon tour prêt » ne déclarait rien : il vidait la file
-- d'enregistrement et rechargeait la page. Le facilitateur déduisait « prête »
-- de la seule complétude des saisies, si bien qu'une équipe encore en plein
-- débat apparaissait prête dès que chaque champ avait été touché une fois.
--
-- Une soumission est désormais un GESTE de l'équipe, daté, qu'elle peut retirer
-- tant que le tour n'est pas verrouillé. Elle ne fige rien : les saisies restent
-- modifiables jusqu'au verrouillage du facilitateur.
--
-- Écriture par la route serveur (clé de service) seulement : c'est elle qui
-- vérifie qu'aucune décision ne manque. L'équipe lit la sienne.
-- =============================================================================

create table if not exists team_round_submissions (
  team_id      uuid not null references teams(id) on delete cascade,
  round_number smallint not null,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete set null,
  primary key (team_id, round_number)
);

alter table team_round_submissions enable row level security;

drop policy if exists team_reads_own_submission on team_round_submissions;
create policy team_reads_own_submission on team_round_submissions
  for select to authenticated
  using (team_id in (select atlas_team_ids()));

grant select on team_round_submissions to authenticated;

comment on table team_round_submissions is
  'Soumission d''un tour par une équipe : geste daté, retirable jusqu''au verrouillage. '
  'Écrite par /api/rounds/submit après contrôle des décisions manquantes.';
