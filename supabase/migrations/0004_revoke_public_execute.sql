-- =============================================================================
-- ATLAS — Migration 0004 : retrait du droit d'exécution à PUBLIC
--
-- La migration 0002 révoquait EXECUTE sur `anon, authenticated`. C'était
-- inopérant : PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute
-- fonction nouvellement créée, et les rôles en héritent par ce chemin.
--
-- Conséquence constatée par test contre la base réelle : une équipe pouvait
-- appeler `atlas_lock_round` et verrouiller le tour de toute la salle.
--
-- Les quatre fonctions d'aide à la RLS restent exécutables : elles sont
-- appelées DEPUIS les politiques et ne rendent que le périmètre de l'appelant,
-- dérivé de `auth.uid()`.
-- =============================================================================

revoke execute on function atlas.atlas_lock_round(uuid) from public;
revoke execute on function atlas.atlas_persist_resolution(jsonb) from public;
revoke execute on function atlas.atlas_open_next_round(uuid) from public;
revoke execute on function atlas.atlas_complete_session(uuid) from public;

grant execute on function atlas.atlas_lock_round(uuid) to service_role;
grant execute on function atlas.atlas_persist_resolution(jsonb) to service_role;
grant execute on function atlas.atlas_open_next_round(uuid) to service_role;
grant execute on function atlas.atlas_complete_session(uuid) to service_role;

-- Toute fonction future de ce schéma part sans droit d'exécution public :
-- il faudra l'accorder explicitement, jamais l'oublier par défaut.
alter default privileges in schema atlas revoke execute on functions from public;
