-- =============================================================================
-- ATLAS — Migration 0027 : « Intégrer votre filière » ne montrait rien
--
-- La vue `integration_targets_public` renvoyait systématiquement zéro ligne,
-- alors que chaque domaine a bien ses fournisseurs et ses distributeurs. Le
-- bloc « Intégrer votre filière » de l'écran de cession était donc vide en
-- permanence, et l'intégration verticale — un des mouvements stratégiques du
-- jeu — inaccessible sans que rien ne le signale.
--
-- ── LA CAUSE ───────────────────────────────────────────────────────────────
-- La vue est `security_invoker = true` : elle lit les tables de base avec les
-- privilèges de l'APPELANT. Or le verrouillage de la migration 0003 n'accorde
-- aux équipes qu'un SELECT COLONNE PAR COLONNE sur `ecosystem_actors` —
-- l'identité seulement (id, nom, région, type, domaine, session). Capacités,
-- fiabilités et santé financière restent au cabinet, qui les vend.
--
-- La vue lisait deux colonnes hors de ce périmètre :
--
--   • `archetype`, qu'AUCUN consommateur n'utilise — il ne sert qu'au
--     provisionnement, côté serveur ;
--   • `owner_team_id`, dont elle dérive `already_owned` et `owned_by_me`.
--
-- Un `select count(*)` direct sur la table passait donc, mais la vue échouait
-- sur « permission denied for table ecosystem_actors ». PostgREST renvoyait
-- l'erreur, la page recevait `data: null`, et affichait une liste vide sans
-- rien dire — le mode d'échec le plus coûteux à diagnostiquer.
--
-- ── LE CORRECTIF ───────────────────────────────────────────────────────────
-- On retire `archetype` de la vue, puisque rien ne le lit, et on accorde la
-- seule colonne dont la fonctionnalité a besoin. Qu'un maillon de filière ait
-- été racheté, et par soi ou par un concurrent, est une information de marché :
-- l'écran l'annonce déjà en clair (« Racheté par une autre équipe. Il n'est
-- plus indépendant »). Ce n'est pas un chiffre que le cabinet vend.
--
-- `security_invoker` reste à `true` : la RLS doit rester porteuse sur ce
-- chemin. La passer en `definer` aurait aussi réglé le symptôme, en faisant
-- reposer toute la protection sur le seul WHERE de la vue.
-- =============================================================================

set search_path = atlas, public, extensions;

grant select (owner_team_id) on ecosystem_actors to authenticated;

-- `create or replace view` refuse de retirer une colonne : on la remplace.
drop view if exists integration_targets_public;

create view integration_targets_public
with (security_invoker = true) as
  select
    a.id            as target_actor_id,
    a.session_id,
    a.das_id,
    u.name          as das_name,
    u.sector_key,
    a.name          as target_name,
    a.region_key,
    a.actor_type,
    case a.actor_type
      when 'fournisseur'  then 'integration_amont'
      when 'distributeur' then 'integration_aval'
      else null
    end             as operation,
    a.owner_team_id is not null as already_owned,
    a.owner_team_id = any (array(select atlas_team_ids())) as owned_by_me
  from ecosystem_actors a
  join strategic_units u on u.id = a.das_id
  where a.actor_type in ('fournisseur', 'distributeur')
    -- Même périmètre que la RLS des tables de base : la session de l'équipe,
    -- et seulement les domaines qu'elle exploite réellement. On n'intègre pas
    -- la filière d'un métier qu'on ne fait pas.
    and a.session_id in (
      select atlas_team_session(t) from unnest(array(select atlas_team_ids())) as t
    )
    and exists (
      select 1 from team_units tu
      where tu.das_id = a.das_id
        and tu.team_id = any (array(select atlas_team_ids()))
        and tu.status in ('active', 'listed_for_sale')
    );

grant select on integration_targets_public to authenticated;
