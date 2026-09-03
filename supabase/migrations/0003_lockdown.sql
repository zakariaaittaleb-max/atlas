-- =============================================================================
-- ATLAS — Migration 0003 : durcissement, refus par défaut
--
-- Écrite APRÈS avoir appliqué le schéma sur une vraie base et constaté que
-- 17 tables restaient sans RLS. Elles auraient été lisibles par tout porteur
-- de la clé anonyme dès l'exposition du schéma — dont :
--
--   • `ecosystem_actor_rounds` : la donnée même que les équipes achètent au
--     cabinet 42 000 à 264 000 DH. Une requête suffisait à l'obtenir gratuitement,
--     et toute la mécanique des paliers de précision s'effondrait ;
--   • `game_sessions`          : les codes d'accès de toutes les équipes ;
--   • `strategic_units`        : `bcg_stage`, que le cahier interdit d'exposer,
--     et les coûts de référence ;
--   • `engine_parameters`      : les profils-cibles d'alignement — les lire
--     donne le vecteur optimal exact et vide le jeu de son sens.
--
-- Deux mécanismes complémentaires, parce que la RLS est ROW-level et ne sait
-- pas masquer une colonne :
--   • RLS       → quelles LIGNES sont visibles ;
--   • GRANT par colonne → quelles COLONNES le sont.
-- =============================================================================

set search_path = atlas, public, extensions;

alter table regions                enable row level security;
alter table consulting_studies     enable row level security;
alter table shock_cards            enable row level security;
alter table strategic_units        enable row level security;
alter table market_segments        enable row level security;
alter table das_region_weights     enable row level security;
alter table sector_proximity       enable row level security;
alter table market_pools           enable row level security;
alter table game_sessions          enable row level security;
alter table session_spectators     enable row level security;
alter table ecosystem_actors       enable row level security;
alter table ecosystem_actor_rounds enable row level security;
alter table market_shocks          enable row level security;
alter table engine_parameters      enable row level security;
alter table resolution_runs        enable row level security;
alter table das_transfers          enable row level security;
alter table ma_operations          enable row level security;

-- Rien n'est lisible sans être authentifié : Atlas n'a aucune page publique.
revoke all on all tables in schema atlas from anon;
alter default privileges in schema atlas revoke all on tables from anon;

-- --- Référentiel inoffensif ------------------------------------------------

create policy read_regions on regions
  for select to authenticated using (true);

create policy read_studies on consulting_studies
  for select to authenticated using (true);

-- --- Cartes de crise : le NOM oui, les EFFETS non --------------------------
--
-- Qu'un industriel de l'agro sache qu'une sécheresse peut survenir est réaliste
-- et sain : il doit pouvoir s'y préparer. Connaître d'avance l'amplitude exacte
-- de chaque carte serait un gâchis pédagogique.

revoke select on shock_cards from authenticated;
grant select (key, pestel_dimension, name, description, nature, source_reference)
  on shock_cards to authenticated;

create policy read_shock_cards on shock_cards
  for select to authenticated using (true);

-- --- DAS et segments : l'identité oui, les paramètres non ------------------

revoke select on strategic_units from authenticated;
grant select (id, session_id, name, sector_key) on strategic_units to authenticated;

create policy read_own_session_das on strategic_units
  for select to authenticated using (
    session_id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
  );

revoke select on market_segments from authenticated;
grant select (id, das_id, segment_key, name) on market_segments to authenticated;

create policy read_own_session_segments on market_segments
  for select to authenticated using (
    das_id in (
      select su.id from strategic_units su
      where su.session_id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
    )
  );

-- --- Session : l'état du tour oui, les codes d'accès non -------------------

revoke select on game_sessions from authenticated;
grant select (id, name, status, current_round, planned_rounds, max_rounds,
              round_started_at, round_soft_deadline, currency)
  on game_sessions to authenticated;

create policy read_own_session on game_sessions
  for select to authenticated using (
    id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
    or facilitator_id = auth.uid()
  );

create policy read_own_pool on market_pools
  for select to authenticated using (id in (select atlas_pool_ids()));

-- --- Écosystème : le carnet d'adresses oui, les chiffres non ---------------
--
-- Une équipe sait quels fournisseurs existent dans son secteur : c'est de la
-- connaissance de marché ordinaire. Leurs capacités, fiabilités, indices de prix
-- et santé financière sont EXACTEMENT ce que vend le benchmark fournisseurs.
-- `ecosystem_actor_rounds` n'est donc lisible que par le serveur : le livrable
-- est construit côté moteur, bruité selon le palier acheté, puis figé dans
-- `consulting_orders.payload`.

revoke select on ecosystem_actors from authenticated;
grant select (id, session_id, das_id, actor_type, name, region_key)
  on ecosystem_actors to authenticated;

create policy read_own_session_actors on ecosystem_actors
  for select to authenticated using (
    session_id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
  );

revoke all on ecosystem_actor_rounds from authenticated;

-- --- Chocs : visibles une fois survenus, jamais avant ----------------------

create policy read_triggered_shocks on market_shocks
  for select to authenticated using (
    session_id in (select atlas_team_session(t) from unnest(array(select atlas_team_ids())) t)
    and round_number <= (
      select s.current_round from game_sessions s where s.id = market_shocks.session_id
    )
  );

-- --- Internes du moteur : aucun accès client ------------------------------
-- RLS activée SANS politique de lecture = tout refusé. Seule la clé
-- `service_role` atteint ces tables.

revoke all on engine_parameters  from authenticated;
revoke all on sector_proximity   from authenticated;
revoke all on das_region_weights from authenticated;
revoke all on resolution_runs    from authenticated;
revoke all on das_transfers      from authenticated;
revoke all on ma_operations      from authenticated;
revoke all on session_spectators from authenticated;
