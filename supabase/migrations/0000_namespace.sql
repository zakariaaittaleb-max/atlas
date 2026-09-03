-- =============================================================================
-- ATLAS — Migration 0000 : espace de noms
--
-- Le projet Supabase « Apps » a vocation à héberger plusieurs applications.
-- Atlas vit donc dans un schéma dédié, jamais dans `public` : sans cela, la
-- prochaine application déposée dans ce projet entrerait en collision avec des
-- tables aussi génériques que `teams`, `regions` ou `market_segments`.
--
-- Le schéma doit être déclaré auprès de PostgREST pour être joignable par
-- l'API — c'est l'objet de la migration 0005. Sans elle, chaque requête reçoit
-- « Invalid schema: atlas » (PGRST106).
-- =============================================================================

create schema if not exists atlas;

-- Les rôles porteurs d'un JWT doivent pouvoir traverser le schéma ; ce qu'ils
-- peuvent y lire reste entièrement décidé par les politiques RLS.
grant usage on schema atlas to anon, authenticated, service_role;

alter default privileges in schema atlas
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema atlas
  grant all on sequences to anon, authenticated, service_role;

-- pgcrypto fournit gen_random_uuid(). On l'installe dans `extensions`, schéma
-- que Supabase prévoit à cet effet, plutôt que dans `public`.
create extension if not exists "pgcrypto" with schema extensions;
