set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0016 : la réserve mise sur le marché par le facilitateur
--
-- Jusqu'ici, toutes les cibles d'acquisition d'une session étaient visibles en
-- permanence, dès le tour 1. Le facilitateur n'avait aucune prise sur le
-- rythme : il ne pouvait ni ouvrir la diversification au bon moment
-- pédagogique, ni la fermer pour forcer une équipe à régler son métier
-- historique avant d'en ouvrir un second.
--
-- `market_open` lui rend ce levier. La cession ENTRE ÉQUIPES n'est pas touchée
-- — une équipe reste libre de mettre son propre domaine en vente ; c'est la
-- RÉSERVE, celle qui n'appartient à personne, qui devient un geste du
-- facilitateur.
--
-- Défaut à `false` : une session nouvellement provisionnée ouvre sans réserve,
-- et le facilitateur l'ouvre quand il le décide. Les cibles DÉJÀ créées sont
-- rétro-remplies à `true` — une session en cours ne doit pas voir son marché
-- disparaître sous elle au déploiement de cette migration.
-- =============================================================================

alter table ecosystem_actors
  add column if not exists market_open boolean not null default false;

-- Rétro-remplissage : ce qui existait avant cette migration restait ouvert.
update ecosystem_actors
set market_open = true
where actor_type = 'cible_acquisition';

comment on column ecosystem_actors.market_open is
  'Cibles d''acquisition uniquement : la cible est-elle proposée aux équipes ? '
  'Pilotée par le facilitateur, qui ouvre la diversification au moment '
  'pédagogique qu''il choisit. Sans effet sur les autres types d''acteurs.';

-- --- La vue publique filtre désormais sur ce drapeau -------------------------
--
-- Le filtre vit DANS la vue, et non dans la requête de l'écran : une cible
-- fermée ne doit pas être seulement masquée, elle doit être hors de portée.
-- Un appel direct au Route Handler d'acquisition ne doit rien pouvoir viser
-- que le facilitateur n'ait pas ouvert.
create or replace view acquisition_targets_public as
select
  a.id            as target_actor_id,
  a.session_id,
  a.das_id,
  u.name          as das_name,
  u.sector_key,
  a.name          as target_name,
  a.region_key
from ecosystem_actors a
join strategic_units u on u.id = a.das_id
where a.actor_type = 'cible_acquisition'
  and a.market_open
  and a.session_id in (
    select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t
  );

grant select on acquisition_targets_public to authenticated;

comment on view acquisition_targets_public is
  'Cibles acquérables OUVERTES par le facilitateur, identité seulement. Les '
  'chiffres (EBITDA, capacité, passifs non déclarés) s''achètent en due '
  'diligence : acquérir à l''aveugle est un choix, pas un oubli.';
